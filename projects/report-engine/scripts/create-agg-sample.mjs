// Seeds an aggregate sample report over `account`: group by statecode, count records — to verify
// aggregate execution end to end. Usage: node create-agg-sample.mjs <path-to-.env>
import { readFileSync } from 'node:fs';

const AGG_NONE = 100000000;
const AGG_COUNT = 100000002;

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
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`${set} ${r.status}: ${await r.text()}`);
  return await r.json();
}

const env = loadEnv(process.argv[2]);
const url = (env.DV_DATAVERSE_URL || env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
const token = await getToken(env.DV_TENANT_ID || env.AZURE_TENANT_ID, env.DV_CLIENT_ID || env.AZURE_CLIENT_ID, env.DV_CLIENT_SECRET || env.AZURE_CLIENT_SECRET, url);

const def = await create(url, token, 'qdb_reportdefinitions', {
  qdb_name: 'Sample — Accounts by Status', qdb_reportcode: 'RPT-AGG-001',
  qdb_description: 'Aggregate verification sample.', qdb_mainentitylogicalname: 'account'
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

await create(url, token, 'qdb_reportcolumns', {
  qdb_name: 'Status', qdb_columnlogicalname: 'statecode', qdb_outputalias: 'statecode',
  qdb_grouporder: 1, qdb_aggregatefunction: AGG_NONE, qdb_sortorder: 1, qdb_isvisible: true,
  'Qdb_reportentitymappingid@odata.bind': `/qdb_reportentitymappings(${mapId})`
});
await create(url, token, 'qdb_reportcolumns', {
  qdb_name: 'Count', qdb_columnlogicalname: 'accountid', qdb_outputalias: 'total',
  qdb_aggregatefunction: AGG_COUNT, qdb_sortorder: 2, qdb_isvisible: true,
  'Qdb_reportentitymappingid@odata.bind': `/qdb_reportentitymappings(${mapId})`
});

console.log(`Seeded RPT-AGG-001 (account, group by statecode, count).`);
console.log(`REPORT_ID=${defId}`);
