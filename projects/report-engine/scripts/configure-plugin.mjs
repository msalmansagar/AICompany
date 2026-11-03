// Configures the qdb_RunReport plugin: the middle-tier URL as a Dataverse Environment Variable, and
// the middle-tier service token as the plugin step's SECURE configuration.
//
// The split is deliberate. The URL is ordinary deployment configuration any admin may read. The
// token authorises naming the acting user (ADR-RPT-010), so it goes in secure configuration, which
// the platform withholds from everyone but a registration administrator — an environment variable
// would be a queryable row.
//
// NOTE: the step this writes to is created by the platform when the Custom API is bound to the
// plugin type. Re-binding can regenerate it, so re-run this after any change to the binding and
// confirm the secure configuration survived.
//
// Usage: node configure-plugin.mjs <path-to-.env> <middle-tier-url> <service-token>
import { readFileSync } from 'node:fs';

const URL_VARIABLE = 'qdb_rpt_middle_tier_url';
const TOKEN_VARIABLE = 'qdb_rpt_service_token';
const SOLUTION = 'qdb_reportengine';
const STRING_VARIABLE = 100000000;

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
function headers(extra = {}) {
  return {
    Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json',
    'OData-MaxVersion': '4.0', 'OData-Version': '4.0', ...extra
  };
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

async function post(path, body, extraHeaders = {}) {
  const res = await fetch(`${baseUrl}/api/data/v9.2/${path}`, {
    method: 'POST', headers: headers(extraHeaders), body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST ${path} ${res.status}: ${await res.text()}`);
  const match = /\(([0-9a-f-]{36})\)/i.exec(res.headers.get('OData-EntityId') ?? '');
  return match?.[1] ?? null;
}

async function setMiddleTierUrl(middleTierUrl) {
  let definitionId = await findId(
    'environmentvariabledefinitions', `schemaname eq '${URL_VARIABLE}'`, 'environmentvariabledefinitionid');

  if (!definitionId) {
    definitionId = await post('environmentvariabledefinitions', {
      schemaname: URL_VARIABLE,
      displayname: 'Report Engine middle-tier URL',
      description: 'Base URL of the Report Engine middle tier the qdb_RunReport plugin relays to.',
      type: STRING_VARIABLE
    }, { 'MSCRM.SolutionUniqueName': SOLUTION });
    console.log(`  + environment variable ${URL_VARIABLE} created`);
  }

  const valueId = await findId(
    'environmentvariablevalues',
    `_environmentvariabledefinitionid_value eq ${definitionId}`,
    'environmentvariablevalueid');

  if (valueId) {
    await api('PATCH', `environmentvariablevalues(${valueId})`, { value: middleTierUrl });
    console.log(`  ~ URL updated -> ${middleTierUrl}`);
    return;
  }

  await post('environmentvariablevalues', {
    value: middleTierUrl,
    'EnvironmentVariableDefinitionId@odata.bind': `/environmentvariabledefinitions(${definitionId})`
  }, { 'MSCRM.SolutionUniqueName': SOLUTION });
  console.log(`  + URL set -> ${middleTierUrl}`);
}

// Cloud only. The Custom API's implementation step is platform-managed and pinned to the
// MainOperation stage, which Dataverse refuses to modify, so it has no secure configuration to
// write to — see TODO(RPT-B1-CLOUD) in PluginConfiguration. On-premise uses a Custom Action backed
// by an ordinary step, where the token belongs in secure configuration instead.
async function setServiceToken(serviceToken) {
  let definitionId = await findId(
    'environmentvariabledefinitions', `schemaname eq '${TOKEN_VARIABLE}'`, 'environmentvariabledefinitionid');

  if (!definitionId) {
    definitionId = await post('environmentvariabledefinitions', {
      schemaname: TOKEN_VARIABLE,
      displayname: 'Report Engine service token (INTERIM)',
      description: 'Shared secret the qdb_RunReport plugin presents to the middle tier. '
        + 'Interim: replace with a plugin managed identity so no secret is stored in Dataverse.',
      type: STRING_VARIABLE
    }, { 'MSCRM.SolutionUniqueName': SOLUTION });
    console.log(`  + environment variable ${TOKEN_VARIABLE} created`);
  }

  const valueId = await findId(
    'environmentvariablevalues',
    `_environmentvariabledefinitionid_value eq ${definitionId}`,
    'environmentvariablevalueid');

  if (valueId) {
    await api('PATCH', `environmentvariablevalues(${valueId})`, { value: serviceToken });
    console.log('  ~ service token updated');
    return;
  }

  await post('environmentvariablevalues', {
    value: serviceToken,
    'EnvironmentVariableDefinitionId@odata.bind': `/environmentvariabledefinitions(${definitionId})`
  }, { 'MSCRM.SolutionUniqueName': SOLUTION });
  console.log('  + service token set');
  console.warn('    ! readable by any user with access to environmentvariablevalue — see TODO(RPT-B1-CLOUD)');
}

async function main() {
  const [envPath, middleTierUrl, serviceToken] = process.argv.slice(2);
  if (!envPath || !middleTierUrl || !serviceToken) {
    throw new Error('Usage: node configure-plugin.mjs <path-to-.env> <middle-tier-url> <service-token>');
  }

  const env = loadEnv(envPath);
  baseUrl = env.DV_DATAVERSE_URL.replace(/\/$/, '');
  token = await getToken(env.DV_TENANT_ID, env.DV_CLIENT_ID, env.DV_CLIENT_SECRET, baseUrl);

  console.log(`Configuring qdb_RunReport on ${baseUrl}`);
  await setMiddleTierUrl(middleTierUrl);
  await setServiceToken(serviceToken);
  console.log('\nDone. Verify with: node invoke-runreport.mjs <env>');
}

main().catch(error => {
  console.error(`FAILED: ${error.message}`);
  process.exit(1);
});
