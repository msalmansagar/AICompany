/**
 * Bar Config — a child table of qdb_form_field, mirroring qdb_form_lookup_config.
 *
 * Until now a number/currency/decimal bar took its maximum and value from OTHER FIELDS ON
 * THE FORM (qdb_bar_max_field_schema / qdb_bar_value_field_schema), so the numbers had to
 * be on the form already. This lets the bar read them from a CRM RECORD instead: the user
 * picks a record through a lookup field, and the bar reads that record's columns.
 *
 *   qdb_form_bar_config
 *     qdb_form_field_id        Lookup  → the bar field this configures
 *     qdb_source_field_id      Lookup  → the form lookup whose selection supplies the record
 *     qdb_entity_logical_name  String  → table the values are read from, e.g. qdb_creditline
 *     qdb_min_attribute        String  → column holding the minimum (optional; absent = 0)
 *     qdb_max_attribute        String  → column holding the maximum
 *     qdb_value_attribute      String  → column holding the current value
 *
 * Min, max and value are columns on ONE record — one selection, one read.
 * The existing field-based bar keeps working; a bar with no config row is unaffected.
 *
 * Run: node --env-file=scripts/.env scripts/provision-bar-config-entity.mjs
 * Safe: checks for existence at every step — re-running is a no-op.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION = 'QdbDynamicFormEngine';
const PUBLISHER_PREFIX = 'qdb';
const ENTITY = 'qdb_form_bar_config';

async function acquireToken() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default` });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description ?? 'token request failed');
  return j.access_token;
}

let H;
const label = (text) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }] });

async function entityExists() {
  const r = await fetch(`${API}/EntityDefinitions(LogicalName='${ENTITY}')?$select=LogicalName`, { headers: H });
  return r.ok;
}

async function attributeExists(logicalName) {
  const r = await fetch(`${API}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${logicalName}')?$select=LogicalName`, { headers: H });
  return r.ok;
}

async function createEntity() {
  const body = {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: 'qdb_form_bar_config',
    LogicalName: ENTITY,
    DisplayName: label('Form Bar Config'),
    DisplayCollectionName: label('Form Bar Configs'),
    Description: label('Where a utilization bar reads its minimum, maximum and current value from.'),
    OwnershipType: 'UserOwned',
    IsActivity: false,
    HasNotes: false,
    HasActivities: false,
    Attributes: [{
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_name',
      LogicalName: 'qdb_name',
      MaxLength: 100,
      FormatName: { Value: 'Text' },
      RequiredLevel: { Value: 'None' },
      DisplayName: label('Name'),
      IsPrimaryName: true,
    }],
  };
  const r = await fetch(`${API}/EntityDefinitions`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`create entity: ${(await r.text()).slice(0, 400)}`);
  console.log(`  created table ${ENTITY}`);
}

async function addString(schema, display, description, maxLength = 100) {
  if (await attributeExists(schema)) { console.log(`  exists — ${schema}`); return; }
  const body = {
    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    SchemaName: schema,
    LogicalName: schema,
    MaxLength: maxLength,
    FormatName: { Value: 'Text' },
    RequiredLevel: { Value: 'None' },
    DisplayName: label(display),
    Description: label(description),
  };
  const r = await fetch(`${API}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`add ${schema}: ${(await r.text()).slice(0, 300)}`);
  console.log(`  created ${schema}`);
}

/** N:1 from the bar config to a form field. */
async function addLookup(schemaName, referencedEntity, display, description) {
  if (await attributeExists(schemaName)) { console.log(`  exists — ${schemaName}`); return; }
  const body = {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: `${PUBLISHER_PREFIX}_${referencedEntity}_${ENTITY}_${schemaName}`,
    ReferencedEntity: referencedEntity,
    ReferencingEntity: ENTITY,
    Lookup: {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      SchemaName: schemaName,
      LogicalName: schemaName,
      RequiredLevel: { Value: 'None' },
      DisplayName: label(display),
      Description: label(description),
    },
    AssociatedMenuConfiguration: { Behavior: 'DoNotDisplay', Group: 'Details', Order: 10000 },
    CascadeConfiguration: { Assign: 'NoCascade', Delete: 'RemoveLink', Merge: 'NoCascade', Reparent: 'NoCascade', Share: 'NoCascade', Unshare: 'NoCascade' },
  };
  const r = await fetch(`${API}/RelationshipDefinitions`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`add lookup ${schemaName}: ${(await r.text()).slice(0, 400)}`);
  console.log(`  created lookup ${schemaName} → ${referencedEntity}`);
}

async function run() {
  console.log(`Bar Config table\nOrg: ${DATAVERSE_URL}\n${'─'.repeat(64)}`);
  const token = await acquireToken();
  H = { Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json', 'MSCRM.SolutionUniqueName': SOLUTION };

  if (await entityExists()) console.log(`  table ${ENTITY} already exists`);
  else await createEntity();

  await addLookup('qdb_form_field_id', 'qdb_form_field', 'Form Field',
    'The bar field this configuration belongs to.');
  await addLookup('qdb_source_field_id', 'qdb_form_field', 'Source Lookup Field',
    'The lookup field on the form whose selected record supplies the bar values.');

  await addString('qdb_entity_logical_name', 'Entity Logical Name',
    'Table the bar reads from, e.g. qdb_creditline. Must match what the source lookup returns.');
  await addString('qdb_min_attribute', 'Minimum Attribute',
    'Column holding the minimum. Leave blank for a bar that starts at zero.');
  await addString('qdb_max_attribute', 'Maximum Attribute',
    'Column holding the maximum — the value the bar fills towards.');
  await addString('qdb_value_attribute', 'Value Attribute',
    'Column holding the current value that fills the bar.');

  const publish = await fetch(`${API}/PublishXml`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ ParameterXml: `<importexportxml><entities><entity>${ENTITY}</entity><entity>qdb_form_field</entity></entities></importexportxml>` }),
  });
  console.log(`  publish → ${publish.status}`);
  console.log(`${'─'.repeat(64)}\nNo config row = the bar keeps reading form fields, exactly as before.`);
}

run().catch((e) => { console.error('\nPROVISIONING FAILED:', e.message); process.exit(1); });
