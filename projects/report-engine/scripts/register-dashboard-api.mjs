// Registers the qdb_RunDashboard Custom API and binds it to RunDashboardPlugin.
//
// Separate from register-customapi.mjs because it is a separate contract with its own plugin type;
// folding both into one script would make either one hard to re-run on its own. Idempotent.
//
// Usage: node register-dashboard-api.mjs <path-to-.env>
import { readFileSync } from 'node:fs';

const SOLUTION = 'qdb_reportengine';
const API_UNIQUE_NAME = 'qdb_RunDashboard';
const PLUGIN_TYPE_NAME = 'Qdb.ReportEngine.CrmPlugin.RunDashboardPlugin';

const STRING = 10;   // customapifieldtype
const REQUEST_PARAMS = [
  { name: 'dashboardId', display: 'Dashboard Id', type: STRING, optional: false }
];
const RESPONSE_PROPS = [
  { name: 'executionId', display: 'Execution Id', type: STRING },
  { name: 'resultJson', display: 'Result (JSON)', type: STRING },
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
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: clientId, client_secret: secret, scope: `${url}/.default`
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: 'POST', body });
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

let baseUrl, token;
const headers = (extra = {}) => ({
  Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json',
  'OData-MaxVersion': '4.0', 'OData-Version': '4.0', ...extra
});

async function api(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${baseUrl}/api/data/v9.2/${path}`, {
    method, headers: headers(extraHeaders), body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? null : res.json();
}

async function post(path, body, extraHeaders = {}) {
  const res = await fetch(`${baseUrl}/api/data/v9.2/${path}`, {
    method: 'POST', headers: headers(extraHeaders), body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return /\(([0-9a-f-]{36})\)/i.exec(res.headers.get('OData-EntityId'))?.[1] ?? null;
}

const findId = async (set, filter, idField) =>
  (await api('GET', `${set}?$filter=${encodeURIComponent(filter)}&$select=${idField}`)).value?.[0]?.[idField] ?? null;

async function ensureCustomApi() {
  const existing = await findId('customapis', `uniquename eq '${API_UNIQUE_NAME}'`, 'customapiid');
  if (existing) {
    console.log(`  = customapi ${API_UNIQUE_NAME} exists`);
    return existing;
  }

  const id = await post('customapis', {
    uniquename: API_UNIQUE_NAME,
    name: API_UNIQUE_NAME,
    displayname: 'Run Dashboard',
    description: 'Executes a stored Report Engine dashboard and returns each widget’s data.',
    bindingtype: 0,        // Global — a dashboard is not bound to a record
    boundentitylogicalname: null,
    isfunction: false,
    allowedcustomprocessingsteptype: 0,
    executeprivilegename: null,
    isprivate: false
  }, { 'MSCRM.SolutionUniqueName': SOLUTION });
  console.log(`  + customapi ${API_UNIQUE_NAME} created`);
  return id;
}

async function ensureParams(customApiId) {
  for (const param of REQUEST_PARAMS) {
    if (await findId('customapirequestparameters', `uniquename eq '${param.name}' and _customapiid_value eq ${customApiId}`, 'customapirequestparameterid')) {
      console.log(`  = request '${param.name}'`); continue;
    }
    await post('customapirequestparameters', {
      uniquename: param.name, name: `${API_UNIQUE_NAME}.${param.name}`, displayname: param.display,
      type: param.type, isoptional: param.optional,
      'CustomAPIId@odata.bind': `/customapis(${customApiId})`
    }, { 'MSCRM.SolutionUniqueName': SOLUTION });
    console.log(`  + request '${param.name}'`);
  }

  for (const prop of RESPONSE_PROPS) {
    if (await findId('customapiresponseproperties', `uniquename eq '${prop.name}' and _customapiid_value eq ${customApiId}`, 'customapiresponsepropertyid')) {
      console.log(`  = response '${prop.name}'`); continue;
    }
    await post('customapiresponseproperties', {
      uniquename: prop.name, name: `${API_UNIQUE_NAME}.${prop.name}`, displayname: prop.display, type: prop.type,
      'CustomAPIId@odata.bind': `/customapis(${customApiId})`
    }, { 'MSCRM.SolutionUniqueName': SOLUTION });
    console.log(`  + response '${prop.name}'`);
  }
}

async function main() {
  const envPath = process.argv[2];
  if (!envPath) throw new Error('Usage: node register-dashboard-api.mjs <path-to-.env>');

  const env = loadEnv(envPath);
  baseUrl = env.DV_DATAVERSE_URL.replace(/\/$/, '');
  token = await getToken(env.DV_TENANT_ID, env.DV_CLIENT_ID, env.DV_CLIENT_SECRET, baseUrl);

  console.log(`Registering ${API_UNIQUE_NAME} on ${baseUrl}`);
  const customApiId = await ensureCustomApi();
  await ensureParams(customApiId);

  const pluginTypeId = await findId('plugintypes', `typename eq '${PLUGIN_TYPE_NAME}'`, 'plugintypeid');
  if (!pluginTypeId) {
    console.log(`\n  ! plugin type '${PLUGIN_TYPE_NAME}' not found — import the assembly first, then re-run to bind.`);
    return;
  }

  await api('PATCH', `customapis(${customApiId})`, { 'PluginTypeId@odata.bind': `/plugintypes(${pluginTypeId})` });
  console.log(`\n  ✓ bound plugin type ${PLUGIN_TYPE_NAME}`);

  await api('POST', 'PublishAllXml', {});
  console.log('✓ published');
}

main().catch(error => {
  console.error(`FAILED: ${error.message}`);
  process.exit(1);
});
