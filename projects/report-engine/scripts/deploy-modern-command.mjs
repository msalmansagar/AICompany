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
const ICON_WEB_RESOURCE = 'qdb_reportengine_appicon.svg';
const HANDLER_FUNCTION = 'QdbReportEngine.openReportFromCommand';

const targetEntity = process.argv[3] || 'account';

// appaction option-set values, read from the org's own metadata.
const LOCATION = { form: 0, mainGrid: 1, subGrid: 2 };
/* A working menu is THREE levels, not two:
     Dropdown (type 1)  — the button on the command bar, opens the menu
       └ Group (type 3) — a section inside that menu
           └ Standard buttons (type 0) — the report items
   The platform states the constraint as "Flyout and standard can only be child of group parent
   button", i.e. buttons parent to a group. Building only Group → buttons renders the group as a
   flat inert label on the command bar with its children nowhere. */
const TYPE_STANDARD_BUTTON = 0;
const TYPE_DROPDOWN = 1;
const TYPE_GROUP = 3;
const CONTEXT_ENTITY = 1;
const ONCLICK_JAVASCRIPT = 2;
const VISIBILITY_ALWAYS = 0;

/* JavaScript parameter type codes. 21 is a LITERAL STRING — confirmed by the platform's own
   Deactivate command, which passes "deactivate" as type 21; no shipped command passes a string as
   type 4. 7 is PrimaryControl.

   Type 4 was the first guess and it is a CONTEXTUAL parameter, not a literal. That failed in two
   different ways depending on where you clicked: on a form it resolved to the record's own id — a
   guid, so it looked like a valid report id and the viewer fell back to showing the whole
   catalogue — and on a grid with nothing selected it resolved to null. Same defect, two symptoms
   that appear unrelated. */
const PARAMETER_TYPE = { primaryRecordId: 4, literalString: 21 };

/* Type 4 is the CURRENT RECORD'S ID, established by observation rather than documentation: when the
   report id was mistakenly declared as type 4, a form delivered a guid that was not the report id —
   it was the record's own — and a grid with no selection delivered null. That is precisely the
   contextual value needed here.

   Nothing is passed as PrimaryControl. Deriving the record id and table from a control meant relying
   on a type code whose meaning could only be guessed, and when the guess was wrong the parameter
   silently arrived empty — which is how the record id came through as "not available in this
   context". The table is a literal because the deploy already knows which table it is writing for. */
const reportParameters = (reportId, entityLogicalName) => JSON.stringify([
  { type: PARAMETER_TYPE.literalString, value: reportId },
  { type: PARAMETER_TYPE.primaryRecordId, value: null },
  { type: PARAMETER_TYPE.literalString, value: entityLogicalName }
]);

const COMMAND_LOCATIONS = [
  { key: 'Form', location: LOCATION.form },
  { key: 'MainGrid', location: LOCATION.mainGrid },
  { key: 'SubGrid', location: LOCATION.subGrid }
];

// qdb_placementtype values that correspond to each ribbon location.
const PLACEMENT_TYPE_FOR_LOCATION = { Form: 100000000, MainGrid: 100000001, SubGrid: 100000002 };

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

const dropdownUniqueName = key => `qdb_ReportEngine.Reports.${targetEntity}.${key}`;
const groupUniqueName = key => `qdb_ReportEngine.ReportsGroup.${targetEntity}.${key}`;
const childUniqueName = (key, reportId) => `qdb_ReportEngine.Report.${targetEntity}.${key}.${reportId}`;

/** Fields shared by the dropdown and its items — context binding, handler library, visibility. */
function commonFields(location, context) {
  return {
    location,
    context: CONTEXT_ENTITY,
    contextvalue: targetEntity,
    // Navigation properties are PascalCase here and differ from the attribute names — resolved from
    // ManyToOneRelationships rather than guessed, since a wrong key yields only "undeclared property".
    'ContextEntity@odata.bind': `/entities(${context.entityMetadataId})`,
    hidden: false,
    isdisabled: false,
    visibilitytype: VISIBILITY_ALWAYS
  };
}

/* The dropdown itself runs nothing — it only opens the menu, so it has no onclick handler.
   The icon comes from our own SVG web resource: the $clientsvg: glyph names are not a documented,
   stable list and an invalid one renders as no icon at all, which is what happened first time. */
function dropdownRecord({ key, location }, context) {
  return Object.assign(commonFields(location, context), {
    name: `qdb.ReportEngine.Reports.${targetEntity}.${key}`,
    uniquename: dropdownUniqueName(key),
    type: TYPE_DROPDOWN,
    buttonlabeltext: 'Reports',
    buttontooltiptitle: 'Reports',
    buttontooltipdescription: 'Run a Report Engine report',
    'IconWebResourceId@odata.bind': `/webresourceset(${context.iconWebResourceId})`,
    sequence: 100100050
  });
}

/** The section inside the dropdown that the report items hang from. */
function groupRecord({ key, location }, context) {
  return Object.assign(commonFields(location, context), {
    name: `qdb.ReportEngine.ReportsGroup.${targetEntity}.${key}`,
    uniquename: groupUniqueName(key),
    type: TYPE_GROUP,
    buttonlabeltext: 'Reports',
    grouptitle: 'Reports',
    sequence: 100100051,
    'ParentAppActionId@odata.bind': `/appactions(${context.dropdownId})`
  });
}

/** One menu item per placed report. Clicking it opens that report and nothing else. */
function reportItemRecord({ key, location }, placement, sequence, context) {
  const reportId = placement._qdb_reportdefinitionid_value;
  return Object.assign(commonFields(location, context), {
    name: `qdb.ReportEngine.Report.${targetEntity}.${key}.${reportId}`,
    uniquename: childUniqueName(key, reportId),
    type: TYPE_STANDARD_BUTTON,
    buttonlabeltext: placement.qdb_name || 'Report',
    buttontooltiptitle: placement.qdb_name || 'Report',
    buttontooltipdescription: 'Run this report',
    'IconWebResourceId@odata.bind': `/webresourceset(${context.iconWebResourceId})`,
    sequence,
    onclickeventtype: ONCLICK_JAVASCRIPT,
    onclickeventjavascriptfunctionname: HANDLER_FUNCTION,
    onclickeventjavascriptparameters: reportParameters(reportId, targetEntity),
    'OnClickEventJavaScriptWebResourceId@odata.bind': `/webresourceset(${context.webResourceId})`,
    'ParentAppActionId@odata.bind': `/appactions(${context.parentId})`
  });
}

async function upsert(uniqueName, record, mutableFields, label) {
  const existing = await findOne('appactions', `$select=appactionid&$filter=uniquename eq '${uniqueName}'`);
  if (existing) {
    await api('PATCH', `appactions(${existing.appactionid})`, mutableFields);
    console.log(`  = ${label}`);
    return existing.appactionid;
  }
  const id = await createReturningId('appactions', record, { 'MSCRM.SolutionUniqueName': SOLUTION });
  console.log(`  + ${label}`);
  return id;
}

/** Reports placed on this entity for this ribbon location, in the order they should appear. */
async function placementsFor(key) {
  const placementType = PLACEMENT_TYPE_FOR_LOCATION[key];
  const found = await api('GET', 'qdb_reportribbonplacements'
    + `?$select=qdb_name,_qdb_reportdefinitionid_value&$filter=qdb_entitylogicalname eq '${targetEntity}'`
    + ` and qdb_isenabled eq true and qdb_placementtype eq ${placementType}`
    + ' and _qdb_reportdefinitionid_value ne null&$orderby=qdb_name asc');
  return found.value || [];
}

/* A location with no placements must have nothing left behind. Without this, a command from an
   earlier run survives as an orphan — which is exactly how a stale button wired to a superseded
   handler stayed on the subgrid, still opening the whole catalogue. */
async function removeCommandsFor(key) {
  const stale = await api('GET', 'appactions?$select=appactionid,buttonlabeltext'
    + `&$filter=startswith(uniquename,'qdb_ReportEngine.Report') and contains(uniquename,'.${targetEntity}.${key}')`);
  for (const row of (stale.value || [])) {
    await api('DELETE', `appactions(${row.appactionid})`);
    console.log(`  - ${key} · removed "${row.buttonlabeltext}"`);
  }
}

async function ensureCommandGroup(definition, context) {
  const placements = await placementsFor(definition.key);
  if (!placements.length) {
    console.log(`  ! ${definition.key}: no enabled placements`);
    await removeCommandsFor(definition.key);
    return;
  }
  const dropdownId = await upsert(
    dropdownUniqueName(definition.key),
    dropdownRecord(definition, context),
    // Clearing the handler matters on an upgrade: these rows were standard buttons that opened the
    // catalogue, and a dropdown that also runs an onclick would still do so.
    {
      buttonlabeltext: 'Reports', hidden: false, isdisabled: false, type: TYPE_DROPDOWN,
      // The icon has to be re-applied on update too — an existing row keeps whatever it had, and a
      // command created before the icon was wired up stays icon-less otherwise.
      'IconWebResourceId@odata.bind': `/webresourceset(${context.iconWebResourceId})`,
      onclickeventtype: 0, onclickeventjavascriptfunctionname: null, onclickeventjavascriptparameters: null
    },
    `${definition.key} · Reports (dropdown)`);

  const parentId = await upsert(
    groupUniqueName(definition.key),
    groupRecord(definition, { ...context, dropdownId }),
    { grouptitle: 'Reports', hidden: false, isdisabled: false, type: TYPE_GROUP },
    `${definition.key} ·   (group)`);

  let sequence = 100100052;
  for (const placement of placements) {
    const record = reportItemRecord(definition, placement, sequence++, { ...context, parentId });
    await upsert(childUniqueName(definition.key, placement._qdb_reportdefinitionid_value), record, {
      buttonlabeltext: record.buttonlabeltext, buttontooltiptitle: record.buttontooltiptitle,
      hidden: false, isdisabled: false, sequence: record.sequence,
      // Re-parenting must be part of the update, not just the create: an item written against an
      // earlier shape otherwise stays attached to the old parent and never appears in the menu.
      'ParentAppActionId@odata.bind': `/appactions(${parentId})`,
      onclickeventjavascriptfunctionname: record.onclickeventjavascriptfunctionname,
      onclickeventjavascriptparameters: record.onclickeventjavascriptparameters
    }, `${definition.key} ·   ${placement.qdb_name}`);
  }
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
const icon = await findOne('webresourceset', `$select=webresourceid&$filter=name eq '${ICON_WEB_RESOURCE}'`);
if (!icon) throw new Error(`${ICON_WEB_RESOURCE} is not deployed — run provision-report-app.mjs first`);

const context = {
  entityMetadataId: entityMetadata.MetadataId,
  webResourceId: webResource.webresourceid,
  iconWebResourceId: icon.webresourceid
};
for (const definition of COMMAND_LOCATIONS) await ensureCommandGroup(definition, context);

await api('POST', 'PublishAllXml', {});
console.log('  ✓ published');

const all = await api('GET',
  `appactions?$select=appactionid,uniquename,location,buttonlabeltext,type&$filter=contains(uniquename,'qdb_ReportEngine.Report')&$orderby=sequence asc`);
console.log(`\n✓ ${(all.value || []).length} modern command(s) on ${targetEntity}:`);
for (const row of (all.value || [])) {
  console.log(`    ${row.type === TYPE_GROUP ? '▾' : ' •'} ${String(row.buttonlabeltext).padEnd(32)} location ${row.location}`);
}
console.log();
