/**
 * DFE-LKPCOL-001 — multi-column + language-aware lookup display.
 * Adds one Memo column to qdb_form_lookup_config:
 *   qdb_display_columns_json  Memo(4000)  JSON array of { attribute, arabicAttribute?, header? }
 *
 * Run: node --env-file=scripts/.env scripts/provision-lookup-columns-schema.mjs
 * Safe/idempotent: checks existence before creating.
 */
const TENANT_ID = process.env.DV_TENANT_ID, CLIENT_ID = process.env.DV_CLIENT_ID;
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET, DATAVERSE_URL = process.env.DV_DATAVERSE_URL;
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION_NAME = 'QdbDynamicFormEngine';
const ENTITY = 'qdb_form_lookup_config';

async function acquireToken() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default` });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json(); if (!r.ok) throw new Error(j.error_description ?? 'Token request failed'); return j.access_token;
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
  console.log(`DFE-LKPCOL-001 schema provisioning\nOrg: ${DATAVERSE_URL}  Solution: ${SOLUTION_NAME}\n${'─'.repeat(56)}`);
  const token = await acquireToken();
  const schema = 'qdb_display_columns_json';
  if (await attributeExists(token, schema)) { console.log(`  ↷ ${schema} already exists — skipping`); }
  else {
    const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`, {
      method: 'POST', headers: headers(token),
      body: JSON.stringify({ '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', SchemaName: schema, LogicalName: schema, MaxLength: 4000, RequiredLevel: { Value: 'None' }, DisplayName: label('Display Columns JSON') }),
    });
    if (!r.ok) throw new Error(`add ${schema}: ${(await r.json()).error?.message}`);
    console.log(`  ✓ ${schema}`);
  }
  console.log(`${'─'.repeat(56)}\nqdb_form_lookup_config display-columns column ensured.`);
}
run().catch((e) => { console.error('\nPROVISIONING FAILED:', e.message); process.exit(1); });
