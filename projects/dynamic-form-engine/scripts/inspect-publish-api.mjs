/** Prints the declared parameter contract of the qdb_PublishForm / qdb_GetPublishedFormJson APIs. */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;

const { access_token: accessToken } = await (await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID,
      client_secret: process.env.DV_CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default` }) })).json();
const h = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };

for (const uniqueName of ['qdb_PublishForm', 'qdb_GetPublishedFormJson']) {
  const api = (await (await fetch(
    `${API_BASE}/customapis?$filter=uniquename eq '${uniqueName}'&$select=customapiid,uniquename`,
    { headers: h })).json()).value[0];
  if (!api) { console.log(`${uniqueName}: NOT FOUND`); continue; }

  const params = (await (await fetch(
    `${API_BASE}/customapirequestparameters?$filter=_customapiid_value eq ${api.customapiid}`
    + '&$select=uniquename,type,isoptional&$orderby=uniquename asc', { headers: h })).json()).value;
  console.log(`\n${uniqueName}:`);
  for (const p of params) console.log(`   ${p.uniquename.padEnd(16)} type=${p.type} optional=${p.isoptional}`);
}
