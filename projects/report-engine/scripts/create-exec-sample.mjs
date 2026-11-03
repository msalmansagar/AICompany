// Seeds an executable sample report over the standard `account` entity (which has data) so report
// EXECUTION can be verified end to end: 3 real columns + one static statecode=Equals=0 filter.
// Usage: node create-exec-sample.mjs <path-to-.env>
import { readFileSync } from 'node:fs';

const OP_EQUALS = 100000000; // qdb_operator option-set value for "Equals"

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}
async function getToken(t, c, s, u) {
  const b = new URLSearchParams({ grant_type: 'client_credentials', client_id: c, client_secret: s, scope: `${u}/.default` });
  const r = await fetch(`https://login.microsoftonline.com/${t}/oauth2/v2.0/token`, { method: 'POST', body: b });
  if (!r.ok) throw new Error(`token ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
}
async function create(url, token, set, body) {
  const r = await fetch(`${url}/api/data/v9.2/${set}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: 'return=representation' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`${set} ${r.status}: ${await r.text()}`);
  return await r.json();
}

const env = loadEnv(process.argv[2]);
const url = (env.DV_DATAVERSE_URL || env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
const token = await getToken(env.DV_TENANT_ID || env.AZURE_TENANT_ID, env.DV_CLIENT_ID || env.AZURE_CLIENT_ID, env.DV_CLIENT_SECRET || env.AZURE_CLIENT_SECRET, url);

const def = await create(url, token, 'qdb_reportdefinitions', {
  qdb_name: 'Sample — Active Accounts', qdb_reportcode: 'RPT-EXEC-001',
  qdb_description: 'Execution verification sample (account).', qdb_mainentitylogicalname: 'account',
  qdb_rowlimit: 100
});
const defId = def.qdb_reportdefinitionid;

const ds = await create(url, token, 'qdb_reportdatasources', {
  qdb_name: 'Accounts', qdb_executionorder: 1, qdb_isprimary: true,
  'Qdb_reportdefinitionid@odata.bind': `/qdb_reportdefinitions(${defId})`
});
const map = await create(url, token, 'qdb_reportentitymappings', {
  qdb_name: 'Account', qdb_entitylogicalname: 'account', qdb_entityalias: 'acc', qdb_depth: 0,
  'Qdb_reportdatasourceid@odata.bind': `/qdb_reportdatasources(${ds.qdb_reportdatasourceid})`
});
const mapId = map.qdb_reportentitymappingid;

for (const [name, logical, sort] of [['Name', 'name', 1], ['Account Number', 'accountnumber', 2], ['Phone', 'telephone1', 3]]) {
  await create(url, token, 'qdb_reportcolumns', {
    qdb_name: name, qdb_columnlogicalname: logical, qdb_outputalias: logical, qdb_sortorder: sort, qdb_isvisible: true,
    'Qdb_reportentitymappingid@odata.bind': `/qdb_reportentitymappings(${mapId})`
  });
}

await create(url, token, 'qdb_reportfilters', {
  qdb_name: 'Active only', qdb_fieldalias: 'statecode', qdb_operator: OP_EQUALS, qdb_value: '0',
  qdb_sequence: 1, qdb_isruntimeprompt: false,
  'Qdb_reportdefinitionid@odata.bind': `/qdb_reportdefinitions(${defId})`
});

console.log(`Seeded RPT-EXEC-001 (account, 3 columns, statecode=0 filter).`);
console.log(`REPORT_ID=${defId}`);
