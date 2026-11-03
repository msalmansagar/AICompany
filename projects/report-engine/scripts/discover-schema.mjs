// Discovers what report-related tables/solutions actually exist in the org.
// Usage: node discover-schema.mjs <path-to-.env>
import { readFileSync } from 'node:fs';

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
async function get(url, token, path) {
  const r = await fetch(`${url}/api/data/v9.2/${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' } });
  if (!r.ok) throw new Error(`${path} ${r.status}: ${await r.text()}`);
  return await r.json();
}

const env = loadEnv(process.argv[2]);
const url = (env.DV_DATAVERSE_URL || env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
const token = await getToken(env.DV_TENANT_ID || env.AZURE_TENANT_ID, env.DV_CLIENT_ID || env.AZURE_CLIENT_ID, env.DV_CLIENT_SECRET || env.AZURE_CLIENT_SECRET, url);
console.log(`Connected: ${url}\n`);

// 1) Solutions matching 'report' only.
const sols = await get(url, token, `solutions?$select=friendlyname,uniquename,ismanaged&$expand=publisherid($select=friendlyname,customizationprefix)&$filter=isvisible eq true&$orderby=friendlyname`);
const repSols = sols.value.filter(s => /report/i.test(s.friendlyname) || /report/i.test(s.uniquename));
console.log(`=== SOLUTIONS MATCHING "report" (${repSols.length} of ${sols.value.length} total) ===`);
for (const s of repSols) console.log(`  "${s.friendlyname}" [${s.uniquename}] prefix=${s.publisherid?.customizationprefix} managed=${s.ismanaged}`);
if (!repSols.length) console.log('  (none)');

// Metadata entities reject contains/startswith — fetch all and filter in JS.
const all = await get(url, token, `EntityDefinitions?$select=LogicalName,SchemaName,DisplayName`);
const qdbAll = all.value.filter(e => e.LogicalName.startsWith('qdb_')).map(e => e.LogicalName).sort();
const reportTables = all.value.filter(e => /report/i.test(e.LogicalName));

console.log(`\n=== TABLES WITH "report" IN LOGICAL NAME (${reportTables.length}) ===`);
for (const e of reportTables) console.log(`  ${e.LogicalName}  "${e.DisplayName?.UserLocalizedLabel?.Label || ''}"`);
if (!reportTables.length) console.log('  (none)');

console.log(`\n=== ALL qdb_ CUSTOM TABLES (${qdbAll.length}) ===`);
console.log('  ' + qdbAll.join('\n  '));
