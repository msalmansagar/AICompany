// Extracts the authoritative as-built schema for the 18 Report Engine tables into
// schema-manifest.json: entity-set name, primary id/name, every qdb_ field with type,
// and lookup targets (for relationship mapping). Read-only.
// Usage: node extract-manifest.mjs <path-to-.env>
import { readFileSync, writeFileSync } from 'node:fs';

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
async function get(url, token, path) {
  const r = await fetch(`${url}/api/data/v9.2/${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${path} ${r.status}: ${await r.text()}`);
  return await r.json();
}

const env = loadEnv(process.argv[2]);
const url = (env.DV_DATAVERSE_URL || env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
const token = await getToken(env.DV_TENANT_ID || env.AZURE_TENANT_ID, env.DV_CLIENT_ID || env.AZURE_CLIENT_ID, env.DV_CLIENT_SECRET || env.AZURE_CLIENT_SECRET, url);

const manifest = {};
for (const t of TABLES) {
  const def = await get(url, token, `EntityDefinitions(LogicalName='${t}')?$select=EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,SchemaName&$expand=Attributes($select=LogicalName,AttributeType)`);
  const lookups = await get(url, token, `EntityDefinitions(LogicalName='${t}')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,Targets`);
  const targetMap = new Map(lookups.value.map(l => [l.LogicalName, l.Targets]));
  const fields = (def.Attributes || [])
    .filter(a => a.LogicalName.startsWith('qdb_') && !a.LogicalName.endsWith('name')) // skip virtual *name mirrors
    .map(a => ({ name: a.LogicalName, type: a.AttributeType, ...(targetMap.has(a.LogicalName) ? { targets: targetMap.get(a.LogicalName) } : {}) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  manifest[t] = { schemaName: def.SchemaName, entitySet: def.EntitySetName, primaryId: def.PrimaryIdAttribute, primaryName: def.PrimaryNameAttribute, fields };
  console.log(`${t}: ${fields.length} fields, ${targetMap.size} lookups`);
}

const out = 'D:/AI Projects/AICompany/projects/report-engine/schema-manifest.json';
writeFileSync(out, JSON.stringify(manifest, null, 2));
console.log(`\nWrote ${out}`);
