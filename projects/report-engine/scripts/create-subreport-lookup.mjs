// Additively creates a qdb_subreportid lookup on qdb_reportrelationship -> qdb_reportdefinition,
// so a relationship can embed another report as a sub-report. Idempotent. Adds to the solution.
// Usage: node create-subreport-lookup.mjs <path-to-.env>
import { readFileSync } from 'node:fs';

const SOLUTION = 'qdb_reportengine';

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
async function exists(url, token) {
  const r = await fetch(`${url}/api/data/v9.2/EntityDefinitions(LogicalName='qdb_reportrelationship')/Attributes(LogicalName='qdb_subreportid')?$select=LogicalName`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  return r.status === 200;
}

const env = loadEnv(process.argv[2]);
const url = (env.DV_DATAVERSE_URL || env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
const token = await getToken(env.DV_TENANT_ID || env.AZURE_TENANT_ID, env.DV_CLIENT_ID || env.AZURE_CLIENT_ID, env.DV_CLIENT_SECRET || env.AZURE_CLIENT_SECRET, url);

if (await exists(url, token)) {
  console.log('SKIP — qdb_subreportid already exists.');
  process.exit(0);
}

const label = (text) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }] });
const body = {
  '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
  SchemaName: 'qdb_reportdefinition_subreport_reportrelationship',
  ReferencedEntity: 'qdb_reportdefinition',
  ReferencingEntity: 'qdb_reportrelationship',
  AssociatedMenuConfiguration: { Behavior: 'DoNotDisplay', Group: 'Details', Order: 10000, MenuId: null, Icon: null, ViewId: '00000000-0000-0000-0000-000000000000', AvailableOffline: false },
  CascadeConfiguration: { Assign: 'NoCascade', Delete: 'RemoveLink', Merge: 'NoCascade', Reparent: 'NoCascade', Share: 'NoCascade', Unshare: 'NoCascade' },
  Lookup: {
    '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
    SchemaName: 'qdb_SubReportId',
    DisplayName: label('Sub-report'),
    Description: label('Report embedded as a sub-report for this relationship.'),
    RequiredLevel: { Value: 'None' }
  }
};

const r = await fetch(`${url}/api/data/v9.2/RelationshipDefinitions`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', 'MSCRM.SolutionUniqueName': SOLUTION },
  body: JSON.stringify(body)
});
if (!r.ok) throw new Error(`create lookup ${r.status}: ${await r.text()}`);
console.log('CREATED qdb_subreportid (Lookup -> qdb_reportdefinition) on qdb_reportrelationship.');
