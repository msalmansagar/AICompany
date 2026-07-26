/**
 * Optional binding overrides on qdb_form_submission_mapping (additive):
 *   qdb_target_navigation_property  String(100)  nav property used for @odata.bind
 *   qdb_target_entity_set_name      String(100)  entity set of the target record
 *
 * Both are ESCAPE HATCHES, not the normal path. Left blank — which is the default and
 * what every existing mapping has — the engine resolves them from metadata. Fill one in
 * only where metadata cannot be read (restricted metadata privileges, an environment that
 * blocks EntityDefinitions) or where a specific value must be pinned for review.
 *
 * Run: node --env-file=scripts/.env scripts/provision-mapping-binding-overrides.mjs
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

async function addAttribute(token, schema, body) {
  if (await attributeExists(token, schema)) { console.log(`  already exists — skipping ${schema}`); return; }
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`, { method: 'POST', headers: headers(token), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`add ${schema}: ${(await r.json()).error?.message}`);
  console.log(`  created ${schema}`);
}

const stringAttr = (schema, display, description) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
  SchemaName: schema,
  LogicalName: schema,
  MaxLength: 100,
  FormatName: { Value: 'Text' },
  RequiredLevel: { Value: 'None' },
  DisplayName: label(display),
  Description: label(description),
});

async function run() {
  console.log(`Submission-mapping binding overrides\nOrg: ${DATAVERSE_URL}\n${'─'.repeat(60)}`);
  const token = await acquireToken();

  await addAttribute(token, 'qdb_target_navigation_property', stringAttr(
    'qdb_target_navigation_property',
    'Target Navigation Property (override)',
    'Optional. Navigation property used to bind a lookup target, e.g. qdb_CustomerId or '
    + 'parentcustomerid_account. Leave blank to resolve it from metadata, which is the normal case.',
  ));
  await addAttribute(token, 'qdb_target_entity_set_name', stringAttr(
    'qdb_target_entity_set_name',
    'Target Entity Set Name (override)',
    'Optional. Entity set of the record being pointed at, e.g. opportunities. Leave blank to '
    + 'resolve it from metadata — it is rarely the logical name plus "s".',
  ));

  const publish = await fetch(`${API_BASE}/PublishXml`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ ParameterXml: `<importexportxml><entities><entity>${ENTITY}</entity></entities></importexportxml>` }),
  });
  console.log(`  publish → ${publish.status}`);
  console.log(`${'─'.repeat(60)}\nOverride columns ensured (blank = resolve from metadata).`);
}

run().catch((e) => { console.error('\nPROVISIONING FAILED:', e.message); process.exit(1); });
