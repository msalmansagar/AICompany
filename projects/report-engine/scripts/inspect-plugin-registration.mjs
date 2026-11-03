// Read-only. Maps everything that hangs off the Report Engine plugin assembly, so the re-key plan
// names real records instead of assumed ones. Nothing here writes.
// Usage: node inspect-plugin-registration.mjs <path-to-.env>
import { readFileSync } from 'node:fs';

const ASSEMBLY_NAME = 'Qdb.ReportEngine.CrmPlugin';
const STAGE = { 10: 'PreValidation', 20: 'PreOperation', 40: 'PostOperation' };

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

async function getToken(tenant, clientId, secret, url) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: clientId, client_secret: secret, scope: `${url}/.default`
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: 'POST', body });
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

let baseUrl, token;
async function get(path) {
  const res = await fetch(`${baseUrl}/api/data/v9.2/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json',
      'OData-MaxVersion': '4.0', 'OData-Version': '4.0' }
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const envPath = process.argv[2];
if (!envPath) throw new Error('Usage: node inspect-plugin-registration.mjs <path-to-.env>');
const env = loadEnv(envPath);
baseUrl = env.DV_DATAVERSE_URL.replace(/\/$/, '');
token = await getToken(env.DV_TENANT_ID, env.DV_CLIENT_ID, env.DV_CLIENT_SECRET, baseUrl);

const assemblies = (await get(
  `pluginassemblies?$select=pluginassemblyid,name,version,publickeytoken,isolationmode,sourcetype,modifiedon` +
  `&$filter=name eq '${ASSEMBLY_NAME}'`)).value;

if (!assemblies.length) { console.log(`No assembly named ${ASSEMBLY_NAME}.`); process.exit(0); }

for (const asm of assemblies) {
  console.log(`ASSEMBLY ${asm.name}`);
  console.log(`  id             : ${asm.pluginassemblyid}`);
  console.log(`  version        : ${asm.version}`);
  console.log(`  publickeytoken : ${asm.publickeytoken}   <== the identity a new .snk changes`);
  console.log(`  isolationmode  : ${asm.isolationmode} (2 = sandbox)`);
  console.log(`  modifiedon     : ${asm.modifiedon}`);

  const types = (await get(`plugintypes?$select=plugintypeid,typename,friendlyname` +
    `&$filter=_pluginassemblyid_value eq ${asm.pluginassemblyid}`)).value;
  console.log(`\n  PLUGIN TYPES (${types.length})`);

  for (const type of types) {
    console.log(`    ${type.typename}`);
    console.log(`      id: ${type.plugintypeid}`);

    const steps = (await get(`sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name,stage,mode,statecode` +
      `&$filter=_plugintypeid_value eq ${type.plugintypeid}`)).value;
    if (steps.length) {
      console.log(`      steps (${steps.length}):`);
      for (const s of steps) {
        console.log(`        - ${s.name}`);
        console.log(`          stage=${STAGE[s.stage] || s.stage} mode=${s.mode === 0 ? 'sync' : 'async'} state=${s.statecode === 0 ? 'enabled' : 'disabled'} id=${s.sdkmessageprocessingstepid}`);
      }
    } else {
      console.log(`      steps: none`);
    }

    const apis = (await get(`customapis?$select=customapiid,uniquename,name&$filter=_plugintypeid_value eq ${type.plugintypeid}`)).value;
    if (apis.length) {
      console.log(`      custom APIs (${apis.length}):`);
      for (const a of apis) console.log(`        - ${a.uniquename}  id=${a.customapiid}`);
    }
  }
}

// Custom APIs are the part most likely to be missed: they are bound to the plugin TYPE, and the
// binding is what breaks when the type is recreated under a new assembly identity.
const allApis = (await get(`customapis?$select=customapiid,uniquename,name,_plugintypeid_value&$filter=startswith(uniquename,'qdb_')`)).value;
console.log(`\nALL qdb_ CUSTOM APIS (${allApis.length}) — each needs its plugintypeid re-pointed`);
for (const a of allApis) {
  console.log(`  ${a.uniquename.padEnd(28)} plugintype=${a._plugintypeid_value || '(none)'}`);
  const params = (await get(`customapirequestparameters?$select=uniquename&$filter=_customapiid_value eq ${a.customapiid}`)).value;
  const responses = (await get(`customapiresponseproperties?$select=uniquename&$filter=_customapiid_value eq ${a.customapiid}`)).value;
  console.log(`    request params: ${params.map(p => p.uniquename).join(', ') || 'none'}`);
  console.log(`    response props: ${responses.map(p => p.uniquename).join(', ') || 'none'}`);
}
