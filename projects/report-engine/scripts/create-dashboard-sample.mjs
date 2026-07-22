// Seeds a persisted sample dashboard (Accounts Overview) into qdb_dashboard/section/widget.
// Usage: node create-dashboard-sample.mjs <path-to-.env>
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
let URL_, TOKEN;
async function api(method, path, body) {
  const r = await fetch(`${URL_}/api/data/v9.2/${path}`, {
    method, headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json', 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) throw new Error(`${path} ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : await r.json();
}
async function navProp(entity, attr) {
  const j = await api('GET', `EntityDefinitions(LogicalName='${entity}')/ManyToOneRelationships?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName`);
  return j.value.find(x => x.ReferencingAttribute === attr).ReferencingEntityNavigationPropertyName;
}

const env = loadEnv(process.argv[2]);
URL_ = (env.DV_DATAVERSE_URL || env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
TOKEN = await getToken(env.DV_TENANT_ID || env.AZURE_TENANT_ID, env.DV_CLIENT_ID || env.AZURE_CLIENT_ID, env.DV_CLIENT_SECRET || env.AZURE_CLIENT_SECRET, URL_);

const secNav = await navProp('qdb_dashboardsection', 'qdb_dashboardid');
const wNav = await navProp('qdb_dashboardwidget', 'qdb_dashboardsectionid');
console.log(`nav props: section->${secNav}, widget->${wNav}`);

const dash = await api('POST', 'qdb_dashboards', { qdb_dashboardname: 'Accounts Overview', qdb_dashboardcode: 'DSH-ACCT-001', qdb_description: 'Fan-out over the account table (ADR-RPT-008).', qdb_isgoverned: false });
const dashId = dash.qdb_dashboardid;

async function section(name, cols, seq, widgets) {
  const s = await api('POST', 'qdb_dashboardsections', { qdb_dashboardsectionname: name, qdb_columns: cols, qdb_sequence: seq, [`${secNav}@odata.bind`]: `/qdb_dashboards(${dashId})` });
  const sid = s.qdb_dashboardsectionid;
  for (const w of widgets) {
    await api('POST', 'qdb_dashboardwidgets', Object.assign({ [`${wNav}@odata.bind`]: `/qdb_dashboardsections(${sid})` }, w));
  }
}

await section('Key metrics', 3, 1, [
  { qdb_dashboardwidgetname: 'Total Accounts', qdb_kind: 'Metric', qdb_entity: 'account', qdb_aggregation: 'Count', qdb_sequence: 1 },
  { qdb_dashboardwidgetname: 'By Status', qdb_kind: 'Chart', qdb_charttype: 'donut', qdb_entity: 'account', qdb_groupby: 'statecode', qdb_aggregation: 'Count', qdb_sequence: 2 },
  { qdb_dashboardwidgetname: 'By Owner', qdb_kind: 'Chart', qdb_charttype: 'bar', qdb_entity: 'account', qdb_groupby: 'ownerid', qdb_aggregation: 'Count', qdb_sequence: 3 }
]);
await section('Breakdown', 2, 2, [
  { qdb_dashboardwidgetname: 'Accounts per owner', qdb_kind: 'InfoCards', qdb_entity: 'account', qdb_groupby: 'ownerid', qdb_aggregation: 'Count', qdb_sequence: 1 },
  { qdb_dashboardwidgetname: 'Owner detail', qdb_kind: 'Table', qdb_entity: 'account', qdb_groupby: 'ownerid', qdb_aggregation: 'Count', qdb_sequence: 2 }
]);

console.log(`Seeded dashboard "Accounts Overview".`);
console.log(`DASHBOARD_ID=${dashId}`);
