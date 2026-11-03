// Seeds a parent/child report (account -> contact, 1:N) plus a relationship, and a test contact
// linked to a real account, to verify drilldown execution end to end.
// Usage: node create-drill-sample.mjs <path-to-.env>
import { readFileSync } from 'node:fs';

const REL_1N = 100000000, OPEN_SUBREPORT = 100000001;

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
async function api(url, token, method, set, body) {
  const r = await fetch(`${url}/api/data/v9.2/${set}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) throw new Error(`${set} ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : await r.json();
}

const env = loadEnv(process.argv[2]);
const url = (env.DV_DATAVERSE_URL || env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
const token = await getToken(env.DV_TENANT_ID || env.AZURE_TENANT_ID, env.DV_CLIENT_ID || env.AZURE_CLIENT_ID, env.DV_CLIENT_SECRET || env.AZURE_CLIENT_SECRET, url);

// Pick a real account to be the drilldown parent.
const accounts = await api(url, token, 'GET', 'accounts?$select=accountid,name&$top=1');
const account = accounts.value[0];

const def = await api(url, token, 'POST', 'qdb_reportdefinitions', {
  qdb_name: 'Sample — Accounts with Contacts', qdb_reportcode: 'RPT-DRILL-001',
  qdb_description: 'Drilldown verification sample.', qdb_mainentitylogicalname: 'account', qdb_rowlimit: 100
});
const defId = def.qdb_reportdefinitionid;
const defBind = { 'Qdb_reportdefinitionid@odata.bind': `/qdb_reportdefinitions(${defId})` };

const ds = await api(url, token, 'POST', 'qdb_reportdatasources', { qdb_name: 'Primary', qdb_executionorder: 1, qdb_isprimary: true, ...defBind });
const dsBind = { 'Qdb_reportdatasourceid@odata.bind': `/qdb_reportdatasources(${ds.qdb_reportdatasourceid})` };

const accMap = await api(url, token, 'POST', 'qdb_reportentitymappings', { qdb_name: 'Account', qdb_entitylogicalname: 'account', qdb_entityalias: 'acc', qdb_depth: 0, ...dsBind });
const conMap = await api(url, token, 'POST', 'qdb_reportentitymappings', { qdb_name: 'Contact', qdb_entitylogicalname: 'contact', qdb_entityalias: 'con', qdb_depth: 1, ...dsBind });

await api(url, token, 'POST', 'qdb_reportcolumns', { qdb_name: 'Account Name', qdb_columnlogicalname: 'name', qdb_outputalias: 'name', qdb_sortorder: 1, qdb_isvisible: true, 'Qdb_reportentitymappingid@odata.bind': `/qdb_reportentitymappings(${accMap.qdb_reportentitymappingid})` });
for (const [label, logical, sort] of [['Full Name', 'fullname', 1], ['Email', 'emailaddress1', 2]]) {
  await api(url, token, 'POST', 'qdb_reportcolumns', { qdb_name: label, qdb_columnlogicalname: logical, qdb_outputalias: logical, qdb_sortorder: sort, qdb_isvisible: true, 'Qdb_reportentitymappingid@odata.bind': `/qdb_reportentitymappings(${conMap.qdb_reportentitymappingid})` });
}

const rel = await api(url, token, 'POST', 'qdb_reportrelationships', {
  qdb_name: 'Account to Contacts', qdb_relationshiptype: REL_1N, qdb_opentype: OPEN_SUBREPORT,
  qdb_parentalias: 'acc', qdb_parentkey: 'accountid', qdb_childalias: 'con', qdb_childkey: 'parentcustomerid', qdb_depth: 1, ...defBind
});

// A contact linked to the chosen account, so the drilldown returns a row.
await api(url, token, 'POST', 'contacts', {
  firstname: 'Drilldown', lastname: 'Test Contact', emailaddress1: 'drilldown.test@example.com',
  'parentcustomerid_account@odata.bind': `/accounts(${account.accountid})`
});

console.log(`Seeded RPT-DRILL-001.`);
console.log(`REPORT_ID=${defId}`);
console.log(`RELATIONSHIP_ID=${rel.qdb_reportrelationshipid}`);
console.log(`PARENT_KEY=${account.accountid}  (account: ${account.name})`);
