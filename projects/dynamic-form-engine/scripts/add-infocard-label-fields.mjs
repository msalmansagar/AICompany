/**
 * Adds 3 optional label override fields to qdb_form_definition.
 * Run: node scripts/add-infocard-label-fields.mjs
 */
const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = 'zMp8Q~~kJW3l3h_HOKbkYdH56c5ALU-Pxc3X_ct6';
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;

async function token() {
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default` });
  const j = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }).then(r => r.json());
  return j.access_token;
}

function hdrs(t) { return { Authorization: `Bearer ${t}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json' }; }
function lbl(text) { return { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }] }; }

async function exists(t, attr) {
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='qdb_form_definition')/Attributes(LogicalName='${attr}')?$select=LogicalName`, { headers: hdrs(t) });
  return r.ok;
}

async function addStr(t, schemaName, label) {
  if (await exists(t, schemaName.toLowerCase())) { console.log(`  ↷ ${schemaName} already exists`); return; }
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='qdb_form_definition')/Attributes`, {
    method: 'POST', headers: hdrs(t),
    body: JSON.stringify({ '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', SchemaName: schemaName, LogicalName: schemaName.toLowerCase(), MaxLength: 100, RequiredLevel: { Value: 'None' }, DisplayName: lbl(label) }),
  });
  if (!r.ok) throw new Error(`Failed ${schemaName}: ${await r.text()}`);
  console.log(`  ✓ Created ${schemaName}`);
}

async function publish(t) {
  const xml = `<importexportxml><entities><entity>qdb_form_definition</entity></entities></importexportxml>`;
  await fetch(`${API_BASE}/PublishXml`, { method: 'POST', headers: hdrs(t), body: JSON.stringify({ ParameterXml: xml }) });
  console.log('  ✓ Published');
}

const t = await token();
console.log('✓ Token acquired');
await addStr(t, 'qdb_infocard_continue_label', 'Info Card Continue Label');
await addStr(t, 'qdb_infocard_start_label',    'Info Card Start Label');
await addStr(t, 'qdb_infocard_skip_label',      'Info Card Skip Label');
await publish(t);
console.log('\nDone. Set these fields on any form definition to override button labels.');
