/**
 * Grid → child records, on qdb_form_submission_mapping (additive):
 *   qdb_grid_column_attribute   String(100)   which grid COLUMN feeds this target attribute
 *
 * A child mapping today creates exactly ONE child record per (target entity + relationship)
 * group. Setting this column changes that for the mapping's group: the source field is an
 * entry grid, and the engine creates ONE CHILD RECORD PER ROW, taking each row's value for
 * the named column.
 *
 * BLANK — which is what every existing mapping has — keeps the current behaviour exactly.
 *
 * Authoring shape (one mapping row per grid column):
 *   qdb_form_field_id                  = the GRID field
 *   qdb_grid_column_attribute          = 'amount'              (the grid column)
 *   qdb_target_entity_logical_name     = qdb_loan_item         (the child table)
 *   qdb_target_attribute_logical_name  = qdb_amount            (the child column)
 *   qdb_is_child_entity                = true
 *   qdb_child_entity_relationship_name = qdb_ApplicationId     (NAVIGATION PROPERTY)
 *
 * Run: node --env-file=scripts/.env scripts/provision-grid-child-mapping-schema.mjs
 * Safe: checks for existence before creating — re-running is a no-op.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION_NAME = 'QdbDynamicFormEngine';
const ENTITY = 'qdb_form_submission_mapping';

async function acquireToken() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default` });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description ?? 'Token request failed');
  return j.access_token;
}

function headers(token) {
  return { Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json', 'MSCRM.SolutionUniqueName': SOLUTION_NAME };
}

function label(text) {
  return { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }] };
}

async function attributeExists(token, logicalName) {
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${logicalName}')?$select=LogicalName`, { headers: headers(token) });
  return r.ok;
}

async function run() {
  console.log(`Grid child-mapping column\nOrg: ${DATAVERSE_URL}\n${'─'.repeat(60)}`);
  const token = await acquireToken();

  const schema = 'qdb_grid_column_attribute';
  if (await attributeExists(token, schema)) {
    console.log(`  already exists — skipping ${schema}`);
  } else {
    const body = {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: schema,
      LogicalName: schema,
      MaxLength: 100,
      FormatName: { Value: 'Text' },
      RequiredLevel: { Value: 'None' },
      DisplayName: label('Grid Column Attribute'),
      Description: label(
        'Optional. The entry-grid column whose value feeds this target attribute. When set on '
        + 'a child mapping, the engine creates one child record PER GRID ROW instead of one per '
        + 'mapping group. Leave blank for a normal field mapping.',
      ),
    };
    const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`, { method: 'POST', headers: headers(token), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`add ${schema}: ${(await r.json()).error?.message}`);
    console.log(`  created ${schema}`);
  }

  const publish = await fetch(`${API_BASE}/PublishXml`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ ParameterXml: `<importexportxml><entities><entity>${ENTITY}</entity></entities></importexportxml>` }),
  });
  console.log(`  publish → ${publish.status}`);
  console.log(`${'─'.repeat(60)}\nBlank = one child per mapping group (unchanged). Set = one child per grid row.`);
}

run().catch((e) => { console.error('\nPROVISIONING FAILED:', e.message); process.exit(1); });
