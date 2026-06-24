/**
 * Provisions file-upload config attributes on qdb_form_field.
 * Adds: qdb_allowed_mime_types (Memo), qdb_max_file_size_mb (Integer), qdb_max_files (Integer)
 * Run: node scripts/provision-file-upload-config.mjs
 */
const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;

async function acquireToken() {
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default` });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json(); if (!r.ok) throw new Error(j.error_description); return j.access_token;
}

const lbl = (text) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }] });
const h = (t) => ({ Authorization: `Bearer ${t}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json' });

async function attrExists(t, entity, attr) {
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${attr}')?$select=LogicalName`, { headers: h(t) });
  return r.ok;
}

async function addMemoAttr(t, entity, schema, display, maxLen = 2000) {
  if (await attrExists(t, entity, schema)) { console.log(`  ↷ ${schema} already exists`); return; }
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${entity}')/Attributes`, {
    method: 'POST', headers: h(t),
    body: JSON.stringify({ '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', SchemaName: schema, LogicalName: schema, MaxLength: maxLen, RequiredLevel: { Value: 'None' }, DisplayName: lbl(display) }),
  });
  if (!r.ok) { const j = await r.json(); throw new Error(`addMemo ${schema}: ${j.error?.message}`); }
  console.log(`  ✓ ${schema}`);
}

async function addIntAttr(t, entity, schema, display, min = 0, max = 2147483647) {
  if (await attrExists(t, entity, schema)) { console.log(`  ↷ ${schema} already exists`); return; }
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${entity}')/Attributes`, {
    method: 'POST', headers: h(t),
    body: JSON.stringify({ '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata', SchemaName: schema, LogicalName: schema, RequiredLevel: { Value: 'None' }, DisplayName: lbl(display), MinValue: min, MaxValue: max }),
  });
  if (!r.ok) { const j = await r.json(); throw new Error(`addInt ${schema}: ${j.error?.message}`); }
  console.log(`  ✓ ${schema}`);
}

async function publish(t, entities) {
  const xml = `<importexportxml><entities>${entities.map(e => `<entity>${e}</entity>`).join('')}</entities></importexportxml>`;
  await fetch(`${API_BASE}/PublishXml`, { method: 'POST', headers: h(t), body: JSON.stringify({ ParameterXml: xml }) });
  console.log(`  ✓ Published: ${entities.join(', ')}`);
}

async function main() {
  console.log('\n=== Provisioning file-upload config attributes on qdb_form_field ===\n');
  const t = await acquireToken(); console.log('✓ Token\n');

  console.log('[1] Adding file-upload config attributes to qdb_form_field…');
  // JSON array of MIME types, e.g. ["application/pdf","image/jpeg","image/png"]
  await addMemoAttr(t, 'qdb_form_field', 'qdb_allowed_mime_types', 'Allowed MIME Types (JSON)', 2000);
  // Max file size in MB (integer) — default enforced in backend when null
  await addIntAttr(t, 'qdb_form_field', 'qdb_max_file_size_mb', 'Max File Size (MB)', 0, 500);
  // Max number of files allowed
  await addIntAttr(t, 'qdb_form_field', 'qdb_max_files', 'Max Files', 0, 100);

  console.log('\n[2] Publishing qdb_form_field…');
  await publish(t, ['qdb_form_field']);

  console.log('\n✓ Done. All file-upload config attributes provisioned.\n');
  console.log('Usage in seed scripts:');
  console.log('  qdb_allowed_mime_types: JSON.stringify(["application/pdf","image/jpeg","image/png"])');
  console.log('  qdb_max_file_size_mb: 5');
  console.log('  qdb_max_files: 1\n');
}

main().catch(e => { console.error('\n✗', e.message); process.exit(1); });
