'use strict';

const TENANT_ID     = process.env.AZURE_TENANT_ID     ?? 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = process.env.AZURE_CLIENT_ID     ?? '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const ORG_URL       = process.env.CRM_ORG_URL         ?? 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${ORG_URL}/api/data/v9.2`;

async function getToken() {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${ORG_URL}/.default` }).toString(),
  });
  if (!res.ok) throw new Error(`Token error ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

function hdrs(token) {
  return { Authorization: `Bearer ${token}`, 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Accept: 'application/json' };
}

async function get(token, path) {
  const res = await fetch(`${API_BASE}/${path}`, { headers: hdrs(token) });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const token = await getToken();

  const asm = await get(token, `pluginassemblies?$select=name,version,pluginassemblyid&$filter=contains(name,'Qdb')&$top=20`);
  console.log('\n=== Plugin Assemblies (Qdb) ===');
  (asm.value ?? []).forEach(a => console.log(`  ${a.name}  v${a.version}  [${a.pluginassemblyid}]`));
  if (!(asm.value ?? []).length) console.log('  (none)');

  const types = await get(token, `plugintypes?$select=name,typename,plugintypeid,_pluginassemblyid_value&$filter=contains(typename,'Qdb')&$top=20`);
  console.log('\n=== Plugin Types (Qdb) ===');
  (types.value ?? []).forEach(t => console.log(`  ${t.typename}  [${t.plugintypeid}]`));
  if (!(types.value ?? []).length) console.log('  (none)');

  const steps = await get(token, `sdkmessageprocessingsteps?$select=name,stage,mode,sdkmessageprocessingstepid&$filter=contains(name,'Qdb')&$top=20`);
  console.log('\n=== Plugin Steps (Qdb) ===');
  (steps.value ?? []).forEach(s => console.log(`  ${s.name}  stage=${s.stage}  mode=${s.mode}  [${s.sdkmessageprocessingstepid}]`));
  if (!(steps.value ?? []).length) console.log('  (none)');

  const apis = await get(token, `customapis?$select=uniquename,name,customapiid&$filter=contains(uniquename,'qdb')&$top=20`);
  console.log('\n=== Custom APIs (qdb) ===');
  (apis.value ?? []).forEach(a => console.log(`  ${a.uniquename}  [${a.customapiid}]`));
  if (!(apis.value ?? []).length) console.log('  (none)');

  console.log('');
}

main().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
