// Seeds a report that proves parameter binding end to end from the Account ribbon.
//
// It carries one parameter of each kind:
//   AccountId  — bound to the CURRENT RECORD, filled by the launch context, shown read-only
//   NamePrefix — typed by the user
//
// Both are consumed by real filters, so the binding is provable by a CHANGE in result rather than
// by a screen that merely looks populated:
//   opened from an account form  -> exactly that one account
//   opened from the account grid -> refuses to auto-run, because a required bound parameter has no
//                                   record to bind to, and says so instead of running unscoped
//   NamePrefix that matches      -> 1 row;  a prefix that does not -> 0 rows
//
// A runtime-prompt filter stores the PARAMETER NAME in qdb_value — that is how the query builder
// resolves it (ReportQueryBuilder.ResolveValue). It is not a separate lookup column.
//
// Idempotent: the report is rebuilt from scratch each run.
//
// Usage: node create-context-sample.mjs <path-to-.env>
import { readFileSync } from 'node:fs';

const REPORT_CODE = 'RPT-CTX-001';
const REPORT_NAME = 'Test — Account in context';
const TARGET_ENTITY = 'account';

// Verified against the org's own option sets.
const DEFAULT_SOURCE_CURRENT_RECORD_ID = 100000003;
const OPERATOR = { equals: 100000000, beginsWith: 100000003 };
const PLACEMENT_TYPE_ENTITY_FORM = 100000000;

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

async function getToken(tenant, clientId, secret, url) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: clientId, client_secret: secret, scope: `${url}/.default`
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: 'POST', body });
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

let baseUrl, token;
const headers = () => ({
  Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json',
  'OData-MaxVersion': '4.0', 'OData-Version': '4.0'
});

async function api(method, path, body) {
  const res = await fetch(`${baseUrl}/api/data/v9.2/${path}`, {
    method, headers: headers(), body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.status === 204 ? null : res.json();
}

async function create(entitySet, record) {
  const res = await fetch(`${baseUrl}/api/data/v9.2/${entitySet}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(record)
  });
  if (!res.ok) throw new Error(`POST ${entitySet} ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const match = (res.headers.get('OData-EntityId') || '').match(/\(([0-9a-fA-F-]{36})\)/);
  return match ? match[1] : null;
}

/* Navigation property names are not the lookup attribute names and are not guessable — the one on
   the placement table is "Qdb_reportdefinitionid", capital Q and nothing else. Ask the metadata. */
async function reportLookupProperty(entityLogicalName) {
  const relationships = await api('GET',
    `EntityDefinitions(LogicalName='${entityLogicalName}')/ManyToOneRelationships`
    + '?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName');
  const match = (relationships.value || []).find(r => r.ReferencingAttribute === 'qdb_reportdefinitionid');
  if (!match) throw new Error(`${entityLogicalName} has no report lookup`);
  return match.ReferencingEntityNavigationPropertyName;
}

async function deleteExistingReport() {
  const found = await api('GET',
    `qdb_reportdefinitions?$select=qdb_reportdefinitionid&$filter=qdb_reportcode eq '${REPORT_CODE}'`);
  for (const report of (found.value || [])) {
    const id = report.qdb_reportdefinitionid;
    for (const set of ['qdb_reportfilters', 'qdb_reportparameters', 'qdb_reportdatasources', 'qdb_reportribbonplacements']) {
      const children = await api('GET', `${set}?$select=${set.slice(0, -1)}id&$filter=_qdb_reportdefinitionid_value eq ${id}`);
      for (const child of (children.value || [])) {
        await api('DELETE', `${set}(${child[set.slice(0, -1) + 'id']})`);
      }
    }
    await api('DELETE', `qdb_reportdefinitions(${id})`);
    console.log(`  - removed previous ${REPORT_CODE}`);
  }
}

const env = loadEnv(process.argv[2]);
baseUrl = (env.DV_DATAVERSE_URL || env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
token = await getToken(
  env.DV_TENANT_ID || env.AZURE_TENANT_ID, env.DV_CLIENT_ID || env.AZURE_CLIENT_ID,
  env.DV_CLIENT_SECRET || env.AZURE_CLIENT_SECRET, baseUrl);

console.log(`\n== Seed "${REPORT_NAME}" → ${baseUrl} ==\n`);
await deleteExistingReport();

const reportId = await create('qdb_reportdefinitions', {
  qdb_name: REPORT_NAME,
  qdb_reportcode: REPORT_CODE,
  qdb_description: 'Proves parameter binding: one parameter from the launch context, one typed.',
  qdb_mainentitylogicalname: TARGET_ENTITY,
  qdb_rowlimit: 100,
  qdb_isgoverned: false,
  qdb_ispublished: true
});
console.log(`  + report ${REPORT_CODE} (${reportId})`);

const bind = async (entityLogicalName, entitySet, record) => {
  const property = await reportLookupProperty(entityLogicalName);
  return create(entitySet, { ...record, [`${property}@odata.bind`]: `/qdb_reportdefinitions(${reportId})` });
};

await bind('qdb_reportdatasource', 'qdb_reportdatasources', {
  qdb_name: 'Accounts', qdb_isprimary: true, qdb_executionorder: 1
});
console.log('  + data source');

await bind('qdb_reportparameter', 'qdb_reportparameters', {
  qdb_name: 'AccountId', qdb_parametername: 'AccountId', qdb_label: 'Account (from the record)',
  qdb_isrequired: true, qdb_displayorder: 1, qdb_defaultsource: DEFAULT_SOURCE_CURRENT_RECORD_ID
});
console.log('  + parameter AccountId  (bound to the current record, required)');

await bind('qdb_reportparameter', 'qdb_reportparameters', {
  qdb_name: 'NamePrefix', qdb_parametername: 'NamePrefix', qdb_label: 'Name begins with',
  qdb_isrequired: false, qdb_displayorder: 2, qdb_defaultvalue: ''
});
console.log('  + parameter NamePrefix (typed by the user)');

// qdb_value holds the PARAMETER NAME on a runtime-prompt filter, not a literal.
await bind('qdb_reportfilter', 'qdb_reportfilters', {
  qdb_name: 'Account is the current record', qdb_fieldalias: 'accountid',
  qdb_operator: OPERATOR.equals, qdb_isruntimeprompt: true, qdb_value: 'AccountId', qdb_sequence: 1
});
console.log('  + filter accountid Equals @AccountId');

await bind('qdb_reportfilter', 'qdb_reportfilters', {
  qdb_name: 'Name begins with', qdb_fieldalias: 'name',
  qdb_operator: OPERATOR.beginsWith, qdb_isruntimeprompt: true, qdb_value: 'NamePrefix', qdb_sequence: 2
});
console.log('  + filter name BeginsWith @NamePrefix');

await bind('qdb_reportribbonplacement', 'qdb_reportribbonplacements', {
  qdb_name: REPORT_NAME, qdb_entitylogicalname: TARGET_ENTITY,
  qdb_placementtype: PLACEMENT_TYPE_ENTITY_FORM, qdb_isenabled: true
});
console.log(`  + placement on the ${TARGET_ENTITY} form ribbon`);

console.log(`\n✓ ${REPORT_CODE} seeded — run deploy-modern-command.mjs to put it on the ribbon\n`);
