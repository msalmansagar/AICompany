const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE = DATAVERSE_URL + '/api/data/v9.2';
const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: '08e80e93-0bab-45ef-8372-2e554fa9af9b', client_secret: 'zMp8Q~~kJW3l3h_HOKbkYdH56c5ALU-Pxc3X_ct6', scope: DATAVERSE_URL + '/.default' });
const t = await fetch('https://login.microsoftonline.com/d79e793c-f6de-4204-8508-7980a63df957/oauth2/v2.0/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }).then(r=>r.json()).then(j=>j.access_token);
const hdrs = { Authorization: `Bearer ${t}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json' };
// List all qdb_ entities
const res = await fetch(`${API_BASE}/EntityDefinitions?$select=LogicalName,EntitySetName`, { headers: hdrs });
const j = await res.json();
if (j.error) { console.error(j.error); process.exit(1); }
(j.value||[]).forEach(e => console.log(e.LogicalName, '->', e.EntitySetName));
