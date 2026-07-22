/**
 * Grid view mode on qdb_form_field (additive):
 *   qdb_grid_view_mode   String(20)   'both' (default) | 'table' | 'card'
 *
 * Controls which grid views are available and whether the Table/Cards toggle
 * shows: 'both' = toggle shown, 'table' = list only (toggle hidden),
 * 'card' = cards only (toggle hidden). When unset, the runtime falls back to 'both'.
 *
 * Run: node --env-file=scripts/.env scripts/provision-grid-view-mode-schema.mjs
 * Safe: checks for existence before creating — re-running is a no-op.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION_NAME = 'QdbDynamicFormEngine';
const ENTITY = 'qdb_form_field';

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
async function addAttribute(token, schema, body) {
  if (await attributeExists(token, schema)) { console.log(`  ↷ ${schema} already exists — skipping`); return; }
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`, { method: 'POST', headers: headers(token), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`add ${schema}: ${(await r.json()).error?.message}`);
  console.log(`  ✓ ${schema}`);
}
const stringAttr = (schema, display, maxLength) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', SchemaName: schema, LogicalName: schema, MaxLength: maxLength, FormatName: { Value: 'Text' }, RequiredLevel: { Value: 'None' }, DisplayName: label(display) });

async function run() {
  console.log(`Grid view-mode schema provisioning\nOrg: ${DATAVERSE_URL}  Solution: ${SOLUTION_NAME}\n${'─'.repeat(56)}`);
  const token = await acquireToken();
  await addAttribute(token, 'qdb_grid_view_mode', stringAttr('qdb_grid_view_mode', 'Grid View Mode', 20));
  console.log(`${'─'.repeat(56)}\nqdb_form_field.qdb_grid_view_mode ensured.`);
}

run().catch((e) => { console.error('\nPROVISIONING FAILED:', e.message); process.exit(1); });
