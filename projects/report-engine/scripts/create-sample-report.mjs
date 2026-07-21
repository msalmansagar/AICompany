// Seeds one minimal sample report definition (definition + data source + entity mapping + 2
// columns + filter + parameter + layout) so the report-definition loader can be verified end to
// end. Picklists are left null (no option-set values needed). Prints the created definition id.
// Usage: node create-sample-report.mjs <path-to-.env>
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
  qdb_name: 'Sample — Overdue Facilities', qdb_reportcode: 'RPT-SAMPLE-001',
  qdb_description: 'Loader verification sample.', qdb_mainentitylogicalname: 'qdb_loan_application',
  qdb_isgoverned: true, qdb_rowlimit: 5000, qdb_timeoutms: 30000
});
const defId = def.qdb_reportdefinitionid;
console.log(`definition ${defId}`);

const ds = await create(url, token, 'qdb_reportdatasources', {
  qdb_name: 'Primary source', qdb_executionorder: 1, qdb_isprimary: true, qdb_sourcealias: 'la',
  'Qdb_reportdefinitionid@odata.bind': `/qdb_reportdefinitions(${defId})`
});
const dsId = ds.qdb_reportdatasourceid;

const map = await create(url, token, 'qdb_reportentitymappings', {
  qdb_name: 'Loan application', qdb_entitylogicalname: 'qdb_loan_application', qdb_entityalias: 'la', qdb_depth: 0,
  'Qdb_reportdatasourceid@odata.bind': `/qdb_reportdatasources(${dsId})`
});
const mapId = map.qdb_reportentitymappingid;

for (const [name, logical, sort] of [['Name', 'qdb_name', 1], ['Amount', 'qdb_amount', 2]]) {
  await create(url, token, 'qdb_reportcolumns', {
    qdb_name: name, qdb_columnlogicalname: logical, qdb_outputalias: logical, qdb_sortorder: sort, qdb_isvisible: true,
    'Qdb_reportentitymappingid@odata.bind': `/qdb_reportentitymappings(${mapId})`
  });
}

await create(url, token, 'qdb_reportfilters', {
  qdb_name: 'Overdue only', qdb_fieldalias: 'qdb_isoverdue', qdb_value: 'true', qdb_sequence: 1, qdb_isruntimeprompt: false,
  'Qdb_reportdefinitionid@odata.bind': `/qdb_reportdefinitions(${defId})`
});
await create(url, token, 'qdb_reportparameters', {
  qdb_name: 'Branch', qdb_parametername: 'branch', qdb_label: 'Branch', qdb_isrequired: false, qdb_displayorder: 1,
  'Qdb_reportdefinitionid@odata.bind': `/qdb_reportdefinitions(${defId})`
});
await create(url, token, 'qdb_reportlayouts', {
  qdb_name: 'Default layout', qdb_themecolor: '#0078d4', qdb_layoutjson: '{"type":"table"}',
  'Qdb_reportdefinitionid@odata.bind': `/qdb_reportdefinitions(${defId})`
});

console.log(`\nSeeded RPT-SAMPLE-001 with 1 source, 1 mapping, 2 columns, 1 filter, 1 parameter, 1 layout.`);
console.log(`REPORT_ID=${defId}`);
