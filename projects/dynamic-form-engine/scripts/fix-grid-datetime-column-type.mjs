// One-shot patch: sets qdb_column_field_type = 'datetime' for any grid column config
// where qdb_column_attribute = 'modifiedon' (or 'createdon') and the type is 'text'.
// Fixes Dataverse 400 "date-time format invalid" when LIKE search hits a datetime field.

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = 'zMp8Q~~kJW3l3h_HOKbkYdH56c5ALU-Pxc3X_ct6';
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

// Patch datetime columns typed as 'text'
const datetimeAttrs = ['modifiedon', 'createdon', 'overriddencreatedon'];
for (const attr of datetimeAttrs) {
  const res = await fetch(
    `${API_BASE}/qdb_grid_column_configs?$filter=qdb_column_attribute eq '${attr}' and qdb_column_field_type eq 'text'` +
    `&$select=qdb_grid_column_configid,qdb_column_field_type,qdb_column_attribute`,
    { headers: hdrs },
  ).then(r => r.json());

  const records = res.value ?? [];
  if (records.length === 0) {
    console.log(`No records to patch for '${attr}'`);
    continue;
  }
  console.log(`Found ${records.length} record(s) to patch for '${attr}'`);

  for (const rec of records) {
    const id = rec.qdb_grid_column_configid;
    const patch = await fetch(`${API_BASE}/qdb_grid_column_configs(${id})`, {
      method: 'PATCH',
      headers: { ...hdrs, 'If-Match': '*' },
      body: JSON.stringify({ qdb_column_field_type: 'datetime' }),
    });
    if (patch.ok || patch.status === 204) {
      console.log(`  ✓ Patched ${id} (${attr}) → qdb_column_field_type = 'datetime'`);
    } else {
      const err = await patch.text().catch(() => '');
      console.error(`  ✗ Failed to patch ${id}: ${patch.status} ${err}`);
    }
  }
}

console.log('\nDone. Restart the backend to clear the LRU metadata cache.');
