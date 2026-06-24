// One-shot patch: sets qdb_column_field_type = 'status' for any grid column config
// where qdb_column_attribute = 'qdb_status' and the type is currently 'text'.
// Fixes Dataverse 400 FormatException when LIKE search is applied to an Int32 field.

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;

const tokenBody = new URLSearchParams({
  grant_type: 'client_credentials', client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
});
const token = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenBody },
).then(r => r.json()).then(j => j.access_token);
console.log('✓ Token acquired');

const hdrs = {
  Authorization: `Bearer ${token}`,
  'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
  Accept: 'application/json', 'Content-Type': 'application/json',
};

const res = await fetch(
  `${API_BASE}/qdb_grid_column_configs?$filter=qdb_column_attribute eq 'qdb_status' and qdb_column_field_type eq 'text'` +
  `&$select=qdb_grid_column_configid,qdb_column_field_type,qdb_column_attribute`,
  { headers: hdrs },
).then(r => r.json());

const records = res.value ?? [];
console.log(`Found ${records.length} record(s) to patch`);

for (const rec of records) {
  const id = rec.qdb_grid_column_configid;
  const patch = await fetch(`${API_BASE}/qdb_grid_column_configs(${id})`, {
    method: 'PATCH',
    headers: { ...hdrs, 'If-Match': '*' },
    body: JSON.stringify({ qdb_column_field_type: 'status' }),
  });
  if (patch.ok || patch.status === 204) {
    console.log(`  ✓ Patched ${id} → qdb_column_field_type = 'status'`);
  } else {
    const err = await patch.text().catch(() => '');
    console.error(`  ✗ Failed to patch ${id}: ${patch.status} ${err}`);
  }
}

console.log('\nDone. Restart the backend to clear the LRU metadata cache.');
