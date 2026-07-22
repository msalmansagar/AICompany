// Registers the qdb_RunReport Custom API + its request parameters and response properties into the
// qdb_reportengine solution (arch §5.2/5.3). Idempotent: skips records that already exist.
//
// The Custom API is created UNBOUND (no plugin type) so it can be registered before the plugin
// assembly is imported. After importing Qdb.ReportEngine.CrmPlugin, bind the plugin by setting the
// Custom API's PluginTypeId to Qdb.ReportEngine.CrmPlugin.RunReportPlugin (pac / Plugin Registration
// Tool, or re-run with BIND=1 once the plugin type exists).
//
// Usage: node register-customapi.mjs <path-to-.env>
import { readFileSync } from 'node:fs';

const SOLUTION = 'qdb_reportengine';
const API_UNIQUE_NAME = 'qdb_RunReport';
const PLUGIN_TYPE_NAME = 'Qdb.ReportEngine.CrmPlugin.RunReportPlugin';

// customapifieldtype: 0 Boolean, 10 String (only the two this contract uses).
const STRING = 10;
const BOOLEAN = 0;
const REQUEST_PARAMS = [
  { name: 'reportId', display: 'Report Id', type: STRING, optional: false },
  { name: 'contextJson', display: 'Context (JSON)', type: STRING, optional: true },
  { name: 'parametersJson', display: 'Parameters (JSON)', type: STRING, optional: true },
  { name: 'format', display: 'Format', type: STRING, optional: true },
  { name: 'async', display: 'Async', type: BOOLEAN, optional: true }
];
const RESPONSE_PROPS = [
  { name: 'executionId', display: 'Execution Id', type: STRING },
  { name: 'mode', display: 'Mode', type: STRING },
  { name: 'resultJson', display: 'Result (JSON)', type: STRING },
  { name: 'jobId', display: 'Job Id', type: STRING },
  { name: 'statusPollUrl', display: 'Status Poll Url', type: STRING },
  { name: 'errorCode', display: 'Error Code', type: STRING },
  { name: 'errorMessage', display: 'Error Message', type: STRING }
];

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}
async function getToken(tenant, clientId, secret, url) {
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: secret, scope: `${url}/.default` });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: 'POST', body });
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

let baseUrl, token;
function headers(extra = {}) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', ...extra };
}
async function api(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${baseUrl}/api/data/v9.2/${path}`, {
    method, headers: headers(extraHeaders), body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : await res.json();
}
async function findId(entitySet, filter, idField) {
  const res = await api('GET', `${entitySet}?$filter=${encodeURIComponent(filter)}&$select=${idField}`);
  return res.value?.[0]?.[idField] ?? null;
}

async function ensureCustomApi() {
  const existing = await findId('customapis', `uniquename eq '${API_UNIQUE_NAME}'`, 'customapiid');
  if (existing) {
    console.log(`  = customapi ${API_UNIQUE_NAME} exists`);
    return existing;
  }
  const created = await api('POST', 'customapis?$select=customapiid', {
    uniquename: API_UNIQUE_NAME,
    name: API_UNIQUE_NAME,
    displayname: 'Run Report',
    description: 'Thin CRM entry point: relays a report run to the Report Engine middle tier as the caller.',
    bindingtype: 0,        // Global
    isfunction: false,
    isprivate: false,
    allowedcustomprocessingsteptype: 0,
    executeprivilegename: null
  }, { 'MSCRM.SolutionUniqueName': SOLUTION, Prefer: 'return=representation' });
  console.log(`  + created customapi ${API_UNIQUE_NAME}`);
  return created.customapiid;
}

async function ensureRequestParam(customApiId, param) {
  const filter = `uniquename eq '${param.name}' and _customapiid_value eq ${customApiId}`;
  if (await findId('customapirequestparameters', filter, 'customapirequestparameterid')) {
    console.log(`  = request '${param.name}'`);
    return;
  }
  await api('POST', 'customapirequestparameters', {
    uniquename: param.name, name: param.name, displayname: param.display,
    type: param.type, isoptional: param.optional, logicalentityname: null,
    'CustomAPIId@odata.bind': `/customapis(${customApiId})`
  }, { 'MSCRM.SolutionUniqueName': SOLUTION });
  console.log(`  + request '${param.name}'`);
}

async function ensureResponseProperty(customApiId, prop) {
  const filter = `uniquename eq '${prop.name}' and _customapiid_value eq ${customApiId}`;
  if (await findId('customapiresponseproperties', filter, 'customapiresponsepropertyid')) {
    console.log(`  = response '${prop.name}'`);
    return;
  }
  await api('POST', 'customapiresponseproperties', {
    uniquename: prop.name, name: prop.name, displayname: prop.display,
    type: prop.type, logicalentityname: null,
    'CustomAPIId@odata.bind': `/customapis(${customApiId})`
  }, { 'MSCRM.SolutionUniqueName': SOLUTION });
  console.log(`  + response '${prop.name}'`);
}

async function tryBindPlugin(customApiId) {
  const pluginTypeId = await findId('plugintypes', `typename eq '${PLUGIN_TYPE_NAME}'`, 'plugintypeid');
  if (!pluginTypeId) {
    console.log(`\n  ! plugin type '${PLUGIN_TYPE_NAME}' not found — import the assembly, then re-run to bind.`);
    return;
  }
  await api('PATCH', `customapis(${customApiId})`, { 'PluginTypeId@odata.bind': `/plugintypes(${pluginTypeId})` });
  console.log(`\n  ✓ bound plugin type ${PLUGIN_TYPE_NAME}`);
}

const env = loadEnv(process.argv[2]);
baseUrl = (env.DV_DATAVERSE_URL || env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
token = await getToken(env.DV_TENANT_ID || env.AZURE_TENANT_ID, env.DV_CLIENT_ID || env.AZURE_CLIENT_ID, env.DV_CLIENT_SECRET || env.AZURE_CLIENT_SECRET, baseUrl);
console.log(`\n== Register ${API_UNIQUE_NAME} Custom API → ${SOLUTION} ==\n`);

const customApiId = await ensureCustomApi();
for (const param of REQUEST_PARAMS) await ensureRequestParam(customApiId, param);
for (const prop of RESPONSE_PROPS) await ensureResponseProperty(customApiId, prop);
await tryBindPlugin(customApiId);

const publish = await api('POST', 'PublishAllXml', {});
console.log('\n✓ published\n✓ Custom API registration done.\n');
