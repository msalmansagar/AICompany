/**
 * Document action toggles on qdb_form_field (additive):
 *   qdb_show_document_view      Boolean  offer "View" on a read-only document field
 *   qdb_show_document_download  Boolean  offer "Download" on a read-only document field
 *
 * Both default to true, and every reader treats an unset value as true, so fields that
 * existed before these columns keep showing both actions without a backfill.
 *
 * Run: node --env-file=scripts/.env scripts/provision-document-actions-schema.mjs
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
  if (await attributeExists(token, schema)) { console.log(`  already exists — skipping ${schema}`); return; }
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`, { method: 'POST', headers: headers(token), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`add ${schema}: ${(await r.json()).error?.message}`);
  console.log(`  created ${schema}`);
}

const boolAttr = (schema, display, description) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
  SchemaName: schema,
  LogicalName: schema,
  DefaultValue: true,
  RequiredLevel: { Value: 'None' },
  DisplayName: label(display),
  Description: label(description),
  OptionSet: {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
    TrueOption: { Value: 1, Label: label('Yes') },
    FalseOption: { Value: 0, Label: label('No') },
  },
});

async function run() {
  console.log(`Document action toggles\nOrg: ${DATAVERSE_URL}  Solution: ${SOLUTION_NAME}\n${'─'.repeat(56)}`);
  const token = await acquireToken();

  await addAttribute(token, 'qdb_show_document_view', boolAttr(
    'qdb_show_document_view',
    'Show Document View',
    'When the file field is read-only, offer a View action that opens the document in a new tab. Unset counts as Yes.',
  ));
  await addAttribute(token, 'qdb_show_document_download', boolAttr(
    'qdb_show_document_download',
    'Show Document Download',
    'When the file field is read-only, offer a Download action. Unset counts as Yes.',
  ));

  const publish = await fetch(`${API_BASE}/PublishXml`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ ParameterXml: `<importexportxml><entities><entity>${ENTITY}</entity></entities></importexportxml>` }),
  });
  console.log(`  publish → ${publish.status}`);
  console.log(`${'─'.repeat(56)}\nqdb_form_field document action columns ensured.`);
}

run().catch((e) => { console.error('\nPROVISIONING FAILED:', e.message); process.exit(1); });
