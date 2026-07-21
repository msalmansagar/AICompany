// Additively creates the 4 approved gap fields on the deployed schema and adds them to the
// qdb_reportengine solution. Idempotent: skips a field that already exists.
// Usage: node create-fields.mjs <path-to-.env>
import { readFileSync } from 'node:fs';

const SOLUTION = 'qdb_reportengine';
const LCID = 1033;

const label = (text) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: LCID }]
});
const boolOption = (value, text) => ({ Value: value, Label: label(text) });

const stringAttr = (schema, display, desc, maxLength = 100) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
  AttributeType: 'String', AttributeTypeName: { Value: 'StringType' },
  SchemaName: schema, MaxLength: maxLength, FormatName: { Value: 'Text' },
  RequiredLevel: { Value: 'None' }, DisplayName: label(display), Description: label(desc)
});
const intAttr = (schema, display, desc) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
  AttributeType: 'Integer', AttributeTypeName: { Value: 'IntegerType' },
  SchemaName: schema, MinValue: 0, MaxValue: 2000000000, Format: 'None',
  RequiredLevel: { Value: 'None' }, DisplayName: label(display), Description: label(desc)
});
const boolAttr = (schema, display, desc) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
  AttributeType: 'Boolean', AttributeTypeName: { Value: 'BooleanType' },
  SchemaName: schema, RequiredLevel: { Value: 'None' },
  DisplayName: label(display), Description: label(desc),
  DefaultValue: false,
  OptionSet: {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
    TrueOption: boolOption(1, 'Yes'), FalseOption: boolOption(0, 'No')
  }
});

const PLAN = [
  { entity: 'qdb_externalconnector', logical: 'qdb_residencyregion',
    body: stringAttr('qdb_ResidencyRegion', 'Residency Region', 'Data-residency region for this connector (PDPPL / QDB residency gate).') },
  { entity: 'qdb_reportdefinition', logical: 'qdb_rowlimit',
    body: intAttr('qdb_RowLimit', 'Row Limit', 'Per-report result-row safety cap enforced at execution time.') },
  { entity: 'qdb_reportdefinition', logical: 'qdb_isgoverned',
    body: boolAttr('qdb_IsGoverned', 'Is Governed', 'Whether this report is subject to governance controls.') },
  { entity: 'qdb_reportversion', logical: 'qdb_iscurrent',
    body: boolAttr('qdb_IsCurrent', 'Is Current', 'Marks the active/current published version.') }
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
async function exists(url, token, entity, logical) {
  const r = await fetch(`${url}/api/data/v9.2/EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${logical}')?$select=LogicalName`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  return r.status === 200;
}
async function createAttr(url, token, entity, body) {
  const r = await fetch(`${url}/api/data/v9.2/EntityDefinitions(LogicalName='${entity}')/Attributes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', 'MSCRM.SolutionUniqueName': SOLUTION },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`${entity}/${body.SchemaName} ${r.status}: ${await r.text()}`);
}

const env = loadEnv(process.argv[2]);
const url = (env.DV_DATAVERSE_URL || env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
const token = await getToken(env.DV_TENANT_ID || env.AZURE_TENANT_ID, env.DV_CLIENT_ID || env.AZURE_CLIENT_ID, env.DV_CLIENT_SECRET || env.AZURE_CLIENT_SECRET, url);
console.log(`Connected: ${url}\nSolution:  ${SOLUTION}\n`);

for (const p of PLAN) {
  if (await exists(url, token, p.entity, p.logical)) {
    console.log(`   SKIP (exists)  ${p.entity}.${p.logical}`);
    continue;
  }
  await createAttr(url, token, p.entity, p.body);
  console.log(`   CREATED        ${p.entity}.${p.logical}  [${p.body.AttributeType}]`);
}
console.log('\nDone.');
