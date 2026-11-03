/* Provisions the schema ADD-002 Phase A needs on qdb_reportdatasource (MDS-FR-002, 003, 007, 008).
 *
 * 🔴 RUN THIS BEFORE DEPLOYING THE BUILD. FetchXML fails outright on an attribute the organisation
 * does not have, and ReportDefinitionFetch now selects qdb_compositionmode — so deploying the code
 * first breaks EVERY report run, not just multi-dataset ones.
 *
 * Idempotent: an attribute that already exists is left alone and reported as skipped, so a partial
 * run can simply be repeated.
 *
 * Usage: node provision-multi-dataset-schema.mjs <path-to-.env>
 */
import { connect } from './lib/dataverse.mjs';

const SOLUTION = 'qdb_reportengine';
const ENTITY = 'qdb_reportdatasource';
const LCID = 1033;
const PREFIX = 'qdb';

const label = text => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: LCID }]
});

/* Composition is an option set rather than a string so the designer can bind a picker to it and the
   values cannot drift. Joined is 100000000 and is also what an ABSENT value means, so a row created
   before this column existed behaves exactly as it always did. */
const COMPOSITION_OPTIONS = [
  { value: 100000000, text: 'Joined', description: 'Merged into the root result set on a key.' },
  { value: 100000001, text: 'Standalone', description: 'Rendered as its own block, with its own columns and rows.' }
];

const ATTRIBUTES = [
  {
    name: `${PREFIX}_compositionmode`,
    display: 'Composition',
    description: 'Whether this source merges into the root result set or renders as its own block (MDS-FR-002).',
    build: () => ({
      '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
      SchemaName: `${PREFIX}_CompositionMode`,
      RequiredLevel: { Value: 'None' },
      OptionSet: {
        '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
        IsGlobal: false,
        OptionSetType: 'Picklist',
        Options: COMPOSITION_OPTIONS.map(option => ({
          Value: option.value,
          Label: label(option.text),
          Description: label(option.description)
        }))
      }
    })
  },
  {
    name: `${PREFIX}_joinfromkey`,
    display: 'Join from key',
    description: 'Attribute on this dataset that matches the root (MDS-FR-003).',
    build: () => stringAttribute(`${PREFIX}_JoinFromKey`, 128)
  },
  {
    name: `${PREFIX}_jointokey`,
    display: 'Join to key',
    description: 'Attribute on the root that this dataset matches (MDS-FR-003).',
    build: () => stringAttribute(`${PREFIX}_JoinToKey`, 128)
  },
  {
    name: `${PREFIX}_isenabled`,
    display: 'Enabled',
    description: 'A disabled dataset is kept but not executed, so a slow source can be isolated (MDS-FR-007).',
    build: () => ({
      '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
      SchemaName: `${PREFIX}_IsEnabled`,
      RequiredLevel: { Value: 'None' },
      DefaultValue: true,
      OptionSet: {
        '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
        TrueOption: { Value: 1, Label: label('Yes') },
        FalseOption: { Value: 0, Label: label('No') }
      }
    })
  },
  {
    name: `${PREFIX}_rowlimit`,
    display: 'Row limit',
    description: 'This dataset’s own row limit (MDS-FR-008).',
    build: () => ({
      '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
      SchemaName: `${PREFIX}_RowLimit`,
      RequiredLevel: { Value: 'None' },
      MinValue: 1,
      MaxValue: 5000,
      Format: 'None'
    })
  }
];

function stringAttribute(schemaName, maxLength) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    SchemaName: schemaName,
    RequiredLevel: { Value: 'None' },
    MaxLength: maxLength,
    FormatName: { Value: 'Text' }
  };
}

async function attributeExists(dv, logicalName) {
  try {
    await dv.fetchJson(
      `EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${logicalName}')?$select=LogicalName`);
    return true;
  } catch {
    return false;
  }
}

async function createAttribute(dv, attribute) {
  const body = { ...attribute.build(), DisplayName: label(attribute.display), Description: label(attribute.description) };
  await dv.fetchJson(`EntityDefinitions(LogicalName='${ENTITY}')/Attributes`, {
    method: 'POST',
    headers: { 'MSCRM.SolutionUniqueName': SOLUTION },
    body: JSON.stringify(body)
  });
}

/* Six of the eleven stored rows have a null qdb_sourcetype (C-8). That is not this feature's bug,
   but the engine is about to switch on a sibling column, so the state is reported rather than left
   to be discovered later. It is NOT auto-corrected: choosing a type for someone else's data source
   is the author's call. */
async function reportNullSourceTypes(dv) {
  const rows = await dv.fetchJson(
    `${ENTITY}s?$select=${ENTITY}id,qdb_name&$filter=qdb_sourcetype eq null`);
  const count = (rows && rows.value && rows.value.length) || 0;
  if (!count) return;

  console.log(`\n  ${count} data source(s) still have no source type (C-8). They fall back and work,`);
  console.log('  but a null in a required-by-design choice column is its own audit finding:');
  for (const row of rows.value) console.log(`    - ${row.qdb_name || row[`${ENTITY}id`]}`);
}

async function main() {
  const dv = await connect(process.argv[2]);
  console.log(`Provisioning ADD-002 Phase A schema on ${dv.baseUrl} (API v${dv.apiVersion}, auth ${dv.authMode})\n`);

  for (const attribute of ATTRIBUTES) {
    if (await attributeExists(dv, attribute.name)) {
      console.log(`  skip    ${attribute.name} (already present)`);
      continue;
    }

    await createAttribute(dv, attribute);
    console.log(`  created ${attribute.name}`);
  }

  await reportNullSourceTypes(dv);
  console.log('\nDone. Publish customisations, then deploy the build — not the other way round.');
}

main().catch(error => {
  console.error(`\nFailed: ${error.message}`);
  process.exit(1);
});
