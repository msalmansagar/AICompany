// Puts a "Reports" button on an entity's command bar using MODERN COMMANDS (appaction rows).
//
// WHY THIS EXISTS INSTEAD OF deploy-ribbon.mjs:
// This org runs the modern command bar — the appaction/appactionrule tables are present and
// appactionmigration holds a migration row. Classic RibbonDiffXml custom actions still compile into
// the entity ribbon (RetrieveEntityRibbon shows them, correctly placed beside the platform's own
// Run Report flyout) and are then simply never drawn. Both a dynamic FlyoutAnchor and a plain static
// Button were equally invisible, which is what ruled out the ribbon XML itself as the cause.
//
// A modern command cannot populate a menu at click time the way a classic flyout could, so this is
// one button that opens the runtime viewer scoped to the table. The property the design cared about
// survives: which reports appear is still driven by qdb_reportribbonplacement rows, so adding a
// report to a table stays a data change and the command bar is touched once per table.
//
// Idempotent, and fast — no solution export/import round trip.
//
// Usage: node deploy-modern-command.mjs <path-to-.env> [entityLogicalName]
import { readFileSync } from 'node:fs';

const SOLUTION = 'qdb_reportengine';
const RIBBON_WEB_RESOURCE = 'qdb_reportengine_ribbon.js';
const HANDLER_FUNCTION = 'QdbReportEngine.openReportPicker';

const targetEntity = process.argv[3] || 'account';

// appaction option-set values, read from the org's own metadata.
const LOCATION = { form: 0, mainGrid: 1, subGrid: 2 };
const TYPE_STANDARD_BUTTON = 0;
const CONTEXT_ENTITY = 1;
const ONCLICK_JAVASCRIPT = 2;
const VISIBILITY_ALWAYS = 0;

// Matches the shape used by the platform's own commands: a single PrimaryControl parameter.
const PRIMARY_CONTROL_PARAMETER = JSON.stringify([{ type: 7, value: null }]);

const COMMAND_LOCATIONS = [
  { key: 'Form', location: LOCATION.form },
  { key: 'MainGrid', location: LOCATION.mainGrid },
  { key: 'SubGrid', location: LOCATION.subGrid }
];

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
const headers = (extra = {}) => ({
  Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json',
  'OData-MaxVersion': '4.0', 'OData-Version': '4.0', ...extra
});

async function api(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${baseUrl}/api/data/v9.2/${path}`, {
    method, headers: headers(extraHeaders), body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return res.status === 204 ? null : res.json();
}

async function createReturningId(entitySet, record, extraHeaders = {}) {
  const res = await fetch(`${baseUrl}/api/data/v9.2/${entitySet}`, {
    method: 'POST', headers: headers(extraHeaders), body: JSON.stringify(record)
  });
  if (!res.ok) throw new Error(`POST ${entitySet} ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const match = (res.headers.get('OData-EntityId') || '').match(/\(([0-9a-fA-F-]{36})\)/);
  return match ? match[1] : null;
}

async function findOne(entitySet, query) {
  const found = await api('GET', `${entitySet}?${query}&$top=1`);
  return (found.value || [])[0] || null;
}

const uniqueNameFor = key => `qdb_ReportEngine.Reports.${targetEntity}.${key}`;

function commandRecord({ key, location }, context) {
  return {
    name: `qdb.ReportEngine.Reports.${targetEntity}.${key}`,
    uniquename: uniqueNameFor(key),
    type: TYPE_STANDARD_BUTTON,
    location,
    context: CONTEXT_ENTITY,
    contextvalue: targetEntity,
    // Navigation properties are PascalCase here and differ from the attribute names — resolved from
    // ManyToOneRelationships rather than guessed, since a wrong key yields only "undeclared property".
    'ContextEntity@odata.bind': `/entities(${context.entityMetadataId})`,
    buttonlabeltext: 'Reports',
    buttontooltiptitle: 'Reports',
    buttontooltipdescription: 'Run a Report Engine report for this table',
    fonticon: '$clientsvg:Report',
    sequence: 100100050,
    hidden: false,
    isdisabled: false,
    visibilitytype: VISIBILITY_ALWAYS,
    onclickeventtype: ONCLICK_JAVASCRIPT,
    onclickeventjavascriptfunctionname: HANDLER_FUNCTION,
    onclickeventjavascriptparameters: PRIMARY_CONTROL_PARAMETER,
    'OnClickEventJavaScriptWebResourceId@odata.bind': `/webresourceset(${context.webResourceId})`
  };
}

async function ensureCommand(definition, context) {
  const uniqueName = uniqueNameFor(definition.key);
  const existing = await findOne('appactions', `$select=appactionid&$filter=uniquename eq '${uniqueName}'`);
  const record = commandRecord(definition, context);
  if (existing) {
    // uniquename and the context binding are immutable in practice; re-apply only the mutable face.
    await api('PATCH', `appactions(${existing.appactionid})`, {
      buttonlabeltext: record.buttonlabeltext, buttontooltiptitle: record.buttontooltiptitle,
      buttontooltipdescription: record.buttontooltipdescription, fonticon: record.fonticon,
      hidden: false, isdisabled: false,
      onclickeventjavascriptfunctionname: record.onclickeventjavascriptfunctionname,
      onclickeventjavascriptparameters: record.onclickeventjavascriptparameters
    });
    console.log(`  = ${definition.key.padEnd(9)} updated (${existing.appactionid})`);
    return;
  }
  const id = await createReturningId('appactions', record, { 'MSCRM.SolutionUniqueName': SOLUTION });
  console.log(`  + ${definition.key.padEnd(9)} created (${id})`);
}

const env = loadEnv(process.argv[2]);
baseUrl = (env.DV_DATAVERSE_URL || env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
token = await getToken(
  env.DV_TENANT_ID || env.AZURE_TENANT_ID, env.DV_CLIENT_ID || env.AZURE_CLIENT_ID,
  env.DV_CLIENT_SECRET || env.AZURE_CLIENT_SECRET, baseUrl);

console.log(`\n== Deploy modern "Reports" command on "${targetEntity}" → ${baseUrl} ==\n`);

const entityMetadata = await api('GET', `EntityDefinitions(LogicalName='${targetEntity}')?$select=MetadataId`);
const webResource = await findOne('webresourceset', `$select=webresourceid&$filter=name eq '${RIBBON_WEB_RESOURCE}'`);
if (!webResource) throw new Error(`${RIBBON_WEB_RESOURCE} is not deployed — run deploy-webresources.mjs first`);

const context = { entityMetadataId: entityMetadata.MetadataId, webResourceId: webResource.webresourceid };
for (const definition of COMMAND_LOCATIONS) await ensureCommand(definition, context);

await api('POST', 'PublishAllXml', {});
console.log('  ✓ published');

const all = await api('GET',
  `appactions?$select=appactionid,uniquename,location,buttonlabeltext&$filter=contains(uniquename,'qdb_ReportEngine.Reports.${targetEntity}')`);
console.log(`\n✓ ${(all.value || []).length} modern command(s) on ${targetEntity}:`);
for (const row of (all.value || [])) console.log(`    ${row.buttonlabeltext} @ location ${row.location}  (${row.uniquename})`);
console.log();
