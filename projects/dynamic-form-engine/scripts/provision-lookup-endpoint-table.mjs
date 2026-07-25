/**
 * DFE-APILOOKUP-001 — creates the endpoint registry as a proper Dataverse table
 * (resolves OQ-001 in favour of a Dataverse table over an env-var JSON).
 *
 * Table: qdb_lookupendpoint  (admin-managed; restrict via security roles — makers
 * must NOT have write access). Columns:
 *   qdb_endpoint_key      String(100)  PRIMARY NAME — the opaque key referenced by a lookup
 *   qdb_target_url        String(500)  HTTPS endpoint URL          (Restricted)
 *   qdb_http_method       String(10)   'GET'
 *   qdb_auth_header_name  String(100)  e.g. X-Api-Key / Authorization
 *   qdb_auth_header_value String(500)  credential                  (Restricted — field-secure in prod)
 *   qdb_timeout_ms        Integer      per-endpoint timeout (default 5000)
 *   qdb_is_active         Boolean      inactive keys reject all calls
 *
 * Run: node --env-file=scripts/.env scripts/provision-lookup-endpoint-table.mjs
 * Safe: checks for existence before creating — re-running is a no-op.
 */
const TENANT_ID = process.env.DV_TENANT_ID;
const CLIENT_ID = process.env.DV_CLIENT_ID;
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = process.env.DV_DATAVERSE_URL;
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION_NAME = 'QdbDynamicFormEngine';
const ENTITY_SCHEMA = 'qdb_LookupEndpoint';
const ENTITY_LOGICAL = 'qdb_lookupendpoint';

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
const stringAttr = (schema, display, maxLength) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', SchemaName: schema, MaxLength: maxLength, FormatName: { Value: 'Text' }, RequiredLevel: { Value: 'None' }, DisplayName: label(display) });
const intAttr = (schema, display) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata', SchemaName: schema, Format: 'None', MinValue: 100, MaxValue: 30000, RequiredLevel: { Value: 'None' }, DisplayName: label(display) });
const boolAttr = (schema, display) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata', SchemaName: schema, DefaultValue: true, RequiredLevel: { Value: 'None' }, DisplayName: label(display), OptionSet: { '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata', TrueOption: { Value: 1, Label: label('Active') }, FalseOption: { Value: 0, Label: label('Inactive') } } });

async function entityExists(token) {
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${ENTITY_LOGICAL}')?$select=LogicalName`, { headers: headers(token) });
  return r.ok;
}
async function attributeExists(token, logicalName) {
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${ENTITY_LOGICAL}')/Attributes(LogicalName='${logicalName}')?$select=LogicalName`, { headers: headers(token) });
  return r.ok;
}
async function addAttribute(token, schema, body) {
  const logical = schema.toLowerCase();
  if (await attributeExists(token, logical)) { console.log(`  ↷ ${logical} already exists — skipping`); return; }
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${ENTITY_LOGICAL}')/Attributes`, { method: 'POST', headers: headers(token), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`add ${logical}: ${(await r.json()).error?.message}`);
  console.log(`  ✓ ${logical}`);
}

async function createEntity(token) {
  const entity = {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: ENTITY_SCHEMA,
    DisplayName: label('Lookup Endpoint'),
    DisplayCollectionName: label('Lookup Endpoints'),
    Description: label('Registered external API endpoints for API-sourced lookups (DFE-APILOOKUP-001). Admin-managed.'),
    OwnershipType: 'OrganizationOwned',
    IsActivity: false,
    HasNotes: false,
    HasActivities: false,
    Attributes: [
      {
        '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
        SchemaName: 'qdb_endpoint_key',
        IsPrimaryName: true,
        MaxLength: 100,
        FormatName: { Value: 'Text' },
        RequiredLevel: { Value: 'ApplicationRequired' },
        DisplayName: label('Endpoint Key'),
      },
    ],
  };
  const r = await fetch(`${API_BASE}/EntityDefinitions`, { method: 'POST', headers: headers(token), body: JSON.stringify(entity) });
  if (!r.ok) throw new Error(`create entity: ${(await r.json()).error?.message}`);
  console.log(`  ✓ entity ${ENTITY_LOGICAL} (primary name: qdb_endpoint_key)`);
}

async function run() {
  console.log(`DFE-APILOOKUP-001 — endpoint registry table\nOrg: ${DATAVERSE_URL}  Solution: ${SOLUTION_NAME}\n${'─'.repeat(56)}`);
  const token = await acquireToken();

  if (await entityExists(token)) {
    console.log(`  ↷ entity ${ENTITY_LOGICAL} already exists — ensuring columns`);
  } else {
    await createEntity(token);
  }

  await addAttribute(token, 'qdb_target_url', stringAttr('qdb_target_url', 'Target URL', 500));
  await addAttribute(token, 'qdb_http_method', stringAttr('qdb_http_method', 'HTTP Method', 10));
  await addAttribute(token, 'qdb_auth_header_name', stringAttr('qdb_auth_header_name', 'Auth Header Name', 100));
  await addAttribute(token, 'qdb_auth_header_value', stringAttr('qdb_auth_header_value', 'Auth Header Value', 500));
  await addAttribute(token, 'qdb_timeout_ms', intAttr('qdb_timeout_ms', 'Timeout (ms)'));
  await addAttribute(token, 'qdb_is_active', boolAttr('qdb_is_active', 'Is Active'));

  console.log(`${'─'.repeat(56)}\nqdb_lookupendpoint table ensured. Restrict write access to administrators via security roles.`);
}

run().catch((e) => { console.error('\nPROVISIONING FAILED:', e.message); process.exit(1); });
