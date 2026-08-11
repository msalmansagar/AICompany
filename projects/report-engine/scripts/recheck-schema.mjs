// Authoritative re-check: confirms WHICH org/app, lists report solutions (no isvisible
// filter), and does direct per-table metadata lookups for all 18 spec tables.
// Usage: node recheck-schema.mjs <path-to-.env>
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
async function raw(url, token, path) {
  const r = await fetch(`${url}/api/data/v9.2/${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  return { status: r.status, body: r.ok ? await r.json() : await r.text() };
}

const env = loadEnv(process.argv[2]);
const url = (env.DV_DATAVERSE_URL || env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
const clientId = env.DV_CLIENT_ID || env.AZURE_CLIENT_ID;
const token = await getToken(env.DV_TENANT_ID || env.AZURE_TENANT_ID, clientId, env.DV_CLIENT_SECRET || env.AZURE_CLIENT_SECRET, url);

console.log(`URL:       ${url}`);
console.log(`App (SP):  ${clientId}`);
const who = await raw(url, token, 'WhoAmI');
console.log(`WhoAmI:    ${JSON.stringify(who.body)}`);

const sol = await raw(url, token, `solutions?$select=friendlyname,uniquename,ismanaged,isvisible&$expand=publisherid($select=customizationprefix)`);
const reps = (sol.body.value || []).filter(s => /report/i.test(s.friendlyname) || /report/i.test(s.uniquename));
console.log(`\nSolutions matching "report" (no isvisible filter): ${reps.length}`);
for (const s of reps) console.log(`   "${s.friendlyname}" [${s.uniquename}] prefix=${s.publisherid?.customizationprefix} managed=${s.ismanaged} visible=${s.isvisible}`);

console.log(`\nDirect per-table lookups:`);
let present = 0;
for (const t of TABLES) {
  const r = await raw(url, token, `EntityDefinitions(LogicalName='${t}')?$select=LogicalName,MetadataId`);
  const ok = r.status === 200;
  if (ok) present++;
  console.log(`   ${ok ? 'FOUND  ' : `MISSING(${r.status})`} ${t}${ok ? `  id=${r.body.MetadataId}` : ''}`);
}
console.log(`\n${present}/18 tables present.`);
