// Smoke-tests the qdb_RunReport Custom API end to end: CRM → plugin → middle tier.
//
// Exists because the plugin is only reachable through the platform — a green unit test says nothing
// about whether the assembly loaded, the Custom API bound, or the sandbox let the callout out.
//
// Usage: node invoke-runreport.mjs <path-to-.env> [reportId] [format]
import { readFileSync } from 'node:fs';

const DEFAULT_REPORT_ID = 'a83827a6-f684-f111-ab0f-000d3abd8313'; // RPT-EXEC-001 (Active Accounts)

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

function summarise(body) {
  // A plugin that throws surfaces as an OData error; a plugin that ran returns the response props.
  if (body.error) {
    console.log('PLUGIN THREW:');
    console.log(`  ${body.error.message}`);
    return;
  }

  console.log('PLUGIN RETURNED:');
  for (const key of ['mode', 'executionId', 'errorCode', 'errorMessage']) {
    if (body[key]) console.log(`  ${key}: ${body[key]}`);
  }

  const result = body.resultJson ?? '';
  console.log(`  resultJson: ${result.length} chars${result ? ` — ${result.slice(0, 160)}` : ' (empty)'}`);
}

async function main() {
  const [envPath, reportId = DEFAULT_REPORT_ID, format = 'RUN'] = process.argv.slice(2);
  if (!envPath) throw new Error('Usage: node invoke-runreport.mjs <path-to-.env> [reportId] [format]');

  const env = loadEnv(envPath);
  const baseUrl = env.DV_DATAVERSE_URL.replace(/\/$/, '');
  const token = await getToken(env.DV_TENANT_ID, env.DV_CLIENT_ID, env.DV_CLIENT_SECRET, baseUrl);

  console.log(`Calling qdb_RunReport (reportId=${reportId}, format=${format})\n`);

  const res = await fetch(`${baseUrl}/api/data/v9.2/qdb_RunReport`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json',
      'OData-MaxVersion': '4.0', 'OData-Version': '4.0'
    },
    body: JSON.stringify({ reportId, format, parametersJson: '{}', async: false })
  });

  console.log(`HTTP ${res.status}\n`);
  summarise(await res.json());
}

main().catch(error => {
  console.error(`FAILED: ${error.message}`);
  process.exit(1);
});
