/* Provisions the per-dataset filter binding (D2): a lookup qdb_reportdatasourceid on
 * qdb_reportfilter, pointing at the dataset a filter belongs to. Absent = the report's root query,
 * so every filter stored before this column behaves exactly as it always did.
 *
 * 🔴 RUN THIS BEFORE DEPLOYING THE D2 BUILD. FetchXML fails outright on an attribute the
 * organisation does not have, and ReportDefinitionFetch now selects qdb_reportdatasourceid —
 * so deploying the plugin first breaks EVERY report run, not just filtered ones. The same hard
 * order qdb_compositionmode established.
 *
 * Idempotent: if the lookup already exists it is reported and left alone.
 *
 * Usage: node provision-dataset-filter-schema.mjs <path-to-.env>
 */
import { connect } from './lib/dataverse.mjs';

const SOLUTION = 'qdb_reportengine';
const LCID = 1033;

const label = text => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: LCID }]
});

const RELATIONSHIP = {
  '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
  SchemaName: 'qdb_reportdatasource_reportfilter',
  ReferencedEntity: 'qdb_reportdatasource',
  ReferencingEntity: 'qdb_reportfilter',
  AssociatedMenuConfiguration: {
    Behavior: 'DoNotDisplay', Group: 'Details', Order: 10000,
    MenuId: null, Icon: null, ViewId: '00000000-0000-0000-0000-000000000000', AvailableOffline: false
  },
  // Deleting a dataset unbinds its filters rather than deleting them: an unbound filter falls back
  // to the root query, which is visible and fixable; a silently deleted one is neither.
  CascadeConfiguration: {
    Assign: 'NoCascade', Delete: 'RemoveLink', Merge: 'NoCascade',
    Reparent: 'NoCascade', Share: 'NoCascade', Unshare: 'NoCascade'
  },
  Lookup: {
    '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
    // Capital-Q schema name matches every existing lookup in this solution, so the @odata.bind
    // navigation property is Qdb_reportdatasourceid like its siblings — the binding name trap
    // qdb_reportsecurity already taught us.
    SchemaName: 'Qdb_reportdatasourceid',
    DisplayName: label('Dataset'),
    Description: label('The dataset this filter belongs to; empty means the report’s root query (D2).'),
    RequiredLevel: { Value: 'None' }
  }
};

async function alreadyProvisioned(dv) {
  const found = await dv.fetchJson(
    "EntityDefinitions(LogicalName='qdb_reportfilter')/Attributes?$select=LogicalName&$filter=LogicalName eq 'qdb_reportdatasourceid'");
  return found.value.length > 0;
}

async function main() {
  const dv = await connect(process.argv[2]);
  console.log(`Per-dataset filter schema on ${dv.baseUrl}\n`);

  if (await alreadyProvisioned(dv)) {
    console.log('  skip    qdb_reportdatasourceid already exists on qdb_reportfilter');
  } else {
    await dv.fetchJson('RelationshipDefinitions', {
      method: 'POST',
      headers: { 'MSCRM.SolutionUniqueName': SOLUTION },
      body: JSON.stringify(RELATIONSHIP)
    });
    console.log('  created qdb_reportdatasourceid (Lookup → qdb_reportdatasource) on qdb_reportfilter');
  }

  await dv.fetchJson('PublishXml', {
    method: 'POST',
    body: JSON.stringify({ ParameterXml: '<importexportxml><entities><entity>qdb_reportfilter</entity></entities></importexportxml>' })
  });
  console.log('  published qdb_reportfilter\n\nDone. The D2 plugin build may now be deployed.');
}

await main();
