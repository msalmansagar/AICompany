// Row counts + entity-set names for the 18 Report Engine tables, to decide whether a
// from-scratch recreate would lose data. Read-only.
// Usage: node count-rows.mjs <path-to-.env>
import { readFileSync } from 'node:fs';

const TABLES = [
  'qdb_reportdefinition', 'qdb_reportversion', 'qdb_reportdatasource', 'qdb_reportentitymapping',
  'qdb_reportcolumn', 'qdb_reportfilter', 'qdb_reportparameter', 'qdb_reportrelationship',
  'qdb_reporttransformation', 'qdb_reportformula', 'qdb_reportlayout', 'qdb_reportexportsetting',
  'qdb_reportribbonplacement', 'qdb_reportsecurity', 'qdb_reportexecutionlog', 'qdb_reportauditlog',
  'qdb_externalconnector', 'qdb_reportcache'
];

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
async function get(url, token, path, extraHeaders = {}) {
  const r = await fetch(`${url}/api/data/v9.2/${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', ...extraHeaders } });
  if (!r.ok) throw new Error(`${path} ${r.status}: ${await r.text()}`);
  return await r.json();
}

const env = loadEnv(process.argv[2]);
const url = (env.DV_DATAVERSE_URL || env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
const token = await getToken(env.DV_TENANT_ID || env.AZURE_TENANT_ID, env.DV_CLIENT_ID || env.AZURE_CLIENT_ID, env.DV_CLIENT_SECRET || env.AZURE_CLIENT_SECRET, url);
console.log(`Connected: ${url}\n`);

let total = 0;
for (const t of TABLES) {
  const def = await get(url, token, `EntityDefinitions(LogicalName='${t}')?$select=EntitySetName`);
  const set = def.EntitySetName;
  // Count via a page of up to 5000 ids; report exact count.
  const res = await get(url, token, `${set}?$select=${t}id&$top=5000`, { Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' });
  const n = res.value.length;
  const more = res['@odata.nextLink'] ? '+' : '';
  total += n;
  console.log(`   ${String(n).padStart(5)}${more}  ${t}`);
}
console.log(`\n   Total rows across 18 tables: ${total}`);
