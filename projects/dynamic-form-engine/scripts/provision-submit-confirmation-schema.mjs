/**
 * DFE-SUBMITCONFIRM-001 — adds the submit-confirmation gate columns to
 * qdb_form_definition (additive, non-destructive):
 *   qdb_submit_confirmation_label    String(200) — acknowledgement checkbox label
 *                                     (presence activates the gate)
 *   qdb_submit_confirmation_message  Memo(2000)  — confirmation dialog body
 *
 * Run: node scripts/provision-submit-confirmation-schema.mjs   (requires DV_CLIENT_SECRET)
 * Safe: checks for existence before creating — re-running is a no-op.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION_NAME = 'QdbDynamicFormEngine';
const ENTITY = 'qdb_form_definition';

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
async function addStringAttribute(token, schema, display, maxLength, memo) {
  if (await attributeExists(token, schema)) { console.log(`  ↷ ${schema} already exists — skipping`); return; }
  const body = {
    '@odata.type': memo ? 'Microsoft.Dynamics.CRM.MemoAttributeMetadata' : 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    SchemaName: schema, LogicalName: schema, MaxLength: maxLength,
    RequiredLevel: { Value: 'None' }, DisplayName: label(display),
    ...(memo ? {} : { FormatName: { Value: 'Text' } }),
  };
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`, { method: 'POST', headers: headers(token), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`add ${schema}: ${(await r.json()).error?.message}`);
  console.log(`  ✓ ${schema}`);
}

async function run() {
  console.log(`DFE-SUBMITCONFIRM-001 schema provisioning\nOrg: ${DATAVERSE_URL}  Solution: ${SOLUTION_NAME}\n${'─'.repeat(56)}`);
  const token = await acquireToken();
  await addStringAttribute(token, 'qdb_submit_confirmation_label', 'Submit Confirmation Label', 200, false);
  await addStringAttribute(token, 'qdb_submit_confirmation_message', 'Submit Confirmation Message', 2000, true);
  console.log(`${'─'.repeat(56)}\nqdb_form_definition submit-confirmation columns ensured.`);
}

run().catch((e) => { console.error('\nPROVISIONING FAILED:', e.message); process.exit(1); });
