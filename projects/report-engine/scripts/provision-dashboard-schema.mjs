// Provisions the dashboard persistence schema (qdb_dashboard -> qdb_dashboardsection ->
// qdb_dashboardwidget) in the qdb_reportengine solution. Idempotent: skips existing tables/fields.
// Enum-like values (kind/aggregation/charttype) are stored as strings to avoid option-set churn.
// Usage: node provision-dashboard-schema.mjs <path-to-.env>
import { readFileSync } from 'node:fs';

const SOLUTION = 'qdb_reportengine';
const LCID = 1033;

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
const label = (text) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: LCID }] });

let URL_, TOKEN;
async function meta(method, path, body) {
  const r = await fetch(`${URL_}/api/data/v9.2/${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', 'MSCRM.SolutionUniqueName': SOLUTION },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) throw new Error(`${method} ${path} ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : await r.json();
}
async function entityExists(logical) {
  const r = await fetch(`${URL_}/api/data/v9.2/EntityDefinitions(LogicalName='${logical}')?$select=LogicalName`, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } });
  return r.status === 200;
}
async function attrExists(entity, attr) {
  const r = await fetch(`${URL_}/api/data/v9.2/EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${attr}')?$select=LogicalName`, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } });
  return r.status === 200;
}

const stringAttr = (schema, disp, len = 200) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', AttributeType: 'String', AttributeTypeName: { Value: 'StringType' }, SchemaName: schema, MaxLength: len, FormatName: { Value: 'Text' }, RequiredLevel: { Value: 'None' }, DisplayName: label(disp) });
const memoAttr = (schema, disp) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', AttributeType: 'Memo', AttributeTypeName: { Value: 'MemoType' }, SchemaName: schema, MaxLength: 4000, RequiredLevel: { Value: 'None' }, DisplayName: label(disp) });
const intAttr = (schema, disp) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata', AttributeType: 'Integer', AttributeTypeName: { Value: 'IntegerType' }, SchemaName: schema, MinValue: 0, MaxValue: 1000000, Format: 'None', RequiredLevel: { Value: 'None' }, DisplayName: label(disp) });
const boolAttr = (schema, disp) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata', AttributeType: 'Boolean', AttributeTypeName: { Value: 'BooleanType' }, SchemaName: schema, RequiredLevel: { Value: 'None' }, DisplayName: label(disp), DefaultValue: false, OptionSet: { '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata', TrueOption: { Value: 1, Label: label('Yes') }, FalseOption: { Value: 0, Label: label('No') } } });

async function ensureEntity(schema, logical, disp, dispPlural) {
  if (await entityExists(logical)) { console.log(`  SKIP entity ${logical}`); return; }
  await meta('POST', 'EntityDefinitions', {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: schema, DisplayName: label(disp), DisplayCollectionName: label(dispPlural),
    OwnershipType: 'UserOwned', HasActivities: false, HasNotes: false, IsActivity: false,
    Attributes: [{ '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', AttributeType: 'String', AttributeTypeName: { Value: 'StringType' }, SchemaName: schema.replace(/^qdb_/, 'qdb_') + 'Name', IsPrimaryName: true, MaxLength: 200, RequiredLevel: { Value: 'None' }, FormatName: { Value: 'Text' }, DisplayName: label('Name') }]
  });
  console.log(`  CREATED entity ${logical}`);
}
async function ensureAttr(entity, logical, body) {
  if (await attrExists(entity, logical)) { console.log(`    skip ${entity}.${logical}`); return; }
  await meta('POST', `EntityDefinitions(LogicalName='${entity}')/Attributes`, body);
  console.log(`    + ${entity}.${logical}`);
}
async function ensureLookup(schemaName, referenced, referencing, lookupSchema, lookupDisp) {
  const lookupLogical = lookupSchema.toLowerCase();
  if (await attrExists(referencing, lookupLogical)) { console.log(`    skip lookup ${referencing}.${lookupLogical}`); return; }
  await meta('POST', 'RelationshipDefinitions', {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: schemaName, ReferencedEntity: referenced, ReferencingEntity: referencing,
    AssociatedMenuConfiguration: { Behavior: 'UseCollectionName', Group: 'Details', Order: 10000, MenuId: null, Icon: null, ViewId: '00000000-0000-0000-0000-000000000000', AvailableOffline: false },
    CascadeConfiguration: { Assign: 'NoCascade', Delete: 'Cascade', Merge: 'NoCascade', Reparent: 'NoCascade', Share: 'NoCascade', Unshare: 'NoCascade' },
    Lookup: { '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata', SchemaName: lookupSchema, DisplayName: label(lookupDisp), RequiredLevel: { Value: 'None' } }
  });
  console.log(`    + lookup ${referencing}.${lookupLogical} -> ${referenced}`);
}

const env = loadEnv(process.argv[2]);
URL_ = (env.DV_DATAVERSE_URL || env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
TOKEN = await getToken(env.DV_TENANT_ID || env.AZURE_TENANT_ID, env.DV_CLIENT_ID || env.AZURE_CLIENT_ID, env.DV_CLIENT_SECRET || env.AZURE_CLIENT_SECRET, URL_);
console.log(`Connected: ${URL_}\nSolution:  ${SOLUTION}\n`);

console.log('Entities:');
await ensureEntity('qdb_Dashboard', 'qdb_dashboard', 'Dashboard', 'Dashboards');
await ensureEntity('qdb_DashboardSection', 'qdb_dashboardsection', 'Dashboard Section', 'Dashboard Sections');
await ensureEntity('qdb_DashboardWidget', 'qdb_dashboardwidget', 'Dashboard Widget', 'Dashboard Widgets');

console.log('\nqdb_dashboard fields:');
await ensureAttr('qdb_dashboard', 'qdb_dashboardcode', stringAttr('qdb_DashboardCode', 'Dashboard Code', 100));
await ensureAttr('qdb_dashboard', 'qdb_description', memoAttr('qdb_Description', 'Description'));
await ensureAttr('qdb_dashboard', 'qdb_isgoverned', boolAttr('qdb_IsGoverned', 'Is Governed'));

console.log('\nqdb_dashboardsection fields:');
await ensureAttr('qdb_dashboardsection', 'qdb_columns', intAttr('qdb_Columns', 'Columns'));
await ensureAttr('qdb_dashboardsection', 'qdb_sequence', intAttr('qdb_Sequence', 'Sequence'));
await ensureLookup('qdb_dashboard_dashboardsection', 'qdb_dashboard', 'qdb_dashboardsection', 'qdb_DashboardId', 'Dashboard');

console.log('\nqdb_dashboardwidget fields:');
for (const [logical, schema, disp] of [
  ['qdb_kind', 'qdb_Kind', 'Kind'], ['qdb_entity', 'qdb_Entity', 'Entity'], ['qdb_groupby', 'qdb_GroupBy', 'Group By'],
  ['qdb_measure', 'qdb_Measure', 'Measure'], ['qdb_aggregation', 'qdb_Aggregation', 'Aggregation'], ['qdb_charttype', 'qdb_ChartType', 'Chart Type']
]) {
  await ensureAttr('qdb_dashboardwidget', logical, stringAttr(schema, disp, 100));
}
await ensureAttr('qdb_dashboardwidget', 'qdb_sequence', intAttr('qdb_Sequence', 'Sequence'));
await ensureLookup('qdb_dashboardsection_dashboardwidget', 'qdb_dashboardsection', 'qdb_dashboardwidget', 'qdb_DashboardSectionId', 'Dashboard Section');

console.log('\nDone.');
