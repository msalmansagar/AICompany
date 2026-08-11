// Creates a standalone contact sub-report (RPT-SUBCONTACT-001) with its own columns + a marker
// formula, then points RPT-DRILL-001's relationship qdb_subreportid at it, so drilldown runs the
// SEPARATE report scoped to the parent. Usage: node create-subreport-sample.mjs <path-to-.env>
import { readFileSync } from 'node:fs';

const DRILL_REPORT = '38f1f479-3a85-f111-ab0f-000d3abcf32d';
const DRILL_RELATIONSHIP = 'c1abf47f-3a85-f111-ab0f-000d3abcf32d';

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
async function api(url, token, method, path, body) {
  const r = await fetch(`${url}/api/data/v9.2/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) throw new Error(`${path} ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : await r.json();
}

const env = loadEnv(process.argv[2]);
const url = (env.DV_DATAVERSE_URL || env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
const token = await getToken(env.DV_TENANT_ID || env.AZURE_TENANT_ID, env.DV_CLIENT_ID || env.AZURE_CLIENT_ID, env.DV_CLIENT_SECRET || env.AZURE_CLIENT_SECRET, url);

// Discover the nav-property name for the new qdb_subreportid lookup.
const rels = await api(url, token, 'GET', "EntityDefinitions(LogicalName='qdb_reportrelationship')/ManyToOneRelationships?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName");
const navProp = rels.value.find(r => r.ReferencingAttribute === 'qdb_subreportid').ReferencingEntityNavigationPropertyName;
console.log(`sub-report nav property: ${navProp}`);

// Standalone contact sub-report with its own columns + a marker formula.
const sub = await api(url, token, 'POST', 'qdb_reportdefinitions', {
  qdb_name: 'Sample — Contact Sub-report', qdb_reportcode: 'RPT-SUBCONTACT-001',
  qdb_description: 'Embedded sub-report over contact.', qdb_mainentitylogicalname: 'contact', qdb_rowlimit: 100
});
const subId = sub.qdb_reportdefinitionid;
const subBind = { 'Qdb_reportdefinitionid@odata.bind': `/qdb_reportdefinitions(${subId})` };
const ds = await api(url, token, 'POST', 'qdb_reportdatasources', { qdb_name: 'Contacts', qdb_executionorder: 1, qdb_isprimary: true, ...subBind });
const map = await api(url, token, 'POST', 'qdb_reportentitymappings', { qdb_name: 'Contact', qdb_entitylogicalname: 'contact', qdb_entityalias: 'con', qdb_depth: 0, 'Qdb_reportdatasourceid@odata.bind': `/qdb_reportdatasources(${ds.qdb_reportdatasourceid})` });
const mapBind = { 'Qdb_reportentitymappingid@odata.bind': `/qdb_reportentitymappings(${map.qdb_reportentitymappingid})` };
for (const [label, logical, sort] of [['Full Name', 'fullname', 1], ['Email', 'emailaddress1', 2], ['Job Title', 'jobtitle', 3]]) {
  await api(url, token, 'POST', 'qdb_reportcolumns', { qdb_name: label, qdb_columnlogicalname: logical, qdb_outputalias: logical, qdb_sortorder: sort, qdb_isvisible: true, ...mapBind });
}
await api(url, token, 'POST', 'qdb_reportformulas', { qdb_name: 'Source marker', qdb_formulaalias: 'source', qdb_expression: "'SUBREPORT'", qdb_evaluationorder: 1, ...subBind });

// Point the drill relationship at this sub-report.
await api(url, token, 'PATCH', `qdb_reportrelationships(${DRILL_RELATIONSHIP})`, { [`${navProp}@odata.bind`]: `/qdb_reportdefinitions(${subId})` });

console.log(`Created RPT-SUBCONTACT-001 (${subId}) and set it as sub-report on RPT-DRILL-001's relationship.`);
console.log(`DRILL_REPORT=${DRILL_REPORT}  RELATIONSHIP=${DRILL_RELATIONSHIP}  SUBREPORT=${subId}`);
