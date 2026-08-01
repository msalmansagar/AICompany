// Puts the Report Engine "Reports" flyout on an entity's ribbon.
//
// There is no supported Web API for RibbonDiffXml — `ribboncustomization` has no ribbondiffxml
// column, and the underlying `ribbondiff` rows are not safely writable. The only reliable route is
// solution export -> edit customizations.xml -> import -> publish, which is what this does.
//
// It uses a SMALL DEDICATED solution holding just the target entity rather than round-tripping the
// main qdb_reportengine solution: the export/import is seconds instead of minutes, and a bad import
// cannot damage the engine's own components.
//
// What lands on the ribbon is ONE FlyoutAnchor per location, populated at click time from
// qdb_reportribbonplacement (see report-ribbon.js). Adding a report to a table is then a data
// change; the ribbon itself is touched once per table, never per report.
//
// Usage: node deploy-ribbon.mjs <path-to-.env> [entityLogicalName]
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const RIBBON_SOLUTION = 'qdb_reportengineribbon';
const RIBBON_SOLUTION_DISPLAY = 'QDB Report Engine — Ribbon';
const PUBLISHER_UNIQUE_NAME = 'qdb';
const RIBBON_WEB_RESOURCE = 'qdb_reportengine_ribbon.js';
const SOLUTION_COMPONENT_TYPE_ENTITY = 1;

const workDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../.ribbon-build');

const targetEntity = process.argv[3] || 'account';

/* Ribbon locations. Form and home grid differ in what context they can supply, which is why they
   use different populate commands — a form knows its record, a grid knows the ticked rows. */
const RIBBON_LOCATIONS = [
  { key: 'Form', location: `Mscrm.Form.${targetEntity}.MainTab.Actions.Controls._children`, populateCommand: 'PopulateForm' },
  { key: 'HomeGrid', location: `Mscrm.HomepageGrid.${targetEntity}.MainTab.Workflow.Controls._children`, populateCommand: 'PopulateGrid' }
];

const commandId = name => `qdb.ReportEngine.Command.${name}`;

function flyoutCustomAction({ key, location, populateCommand }) {
  const anchorId = `qdb.${targetEntity}.${key}.ReportsFlyout`;
  return `<CustomAction Id="${anchorId}.CustomAction" Location="${location}" Sequence="41">`
    + '<CommandUIDefinition>'
    + `<FlyoutAnchor Id="${anchorId}" Command="${commandId('Flyout')}" Sequence="41"`
    + ' LabelText="Reports" ToolTipTitle="Reports"'
    + ' ToolTipDescription="Run a Report Engine report" TemplateAlias="o1"'
    + ` PopulateDynamically="true" PopulateQueryCommand="${commandId(populateCommand)}">`
    + `<Menu Id="${anchorId}.Menu" />`
    + '</FlyoutAnchor></CommandUIDefinition></CustomAction>';
}

/** A JavaScriptFunction action wired to the ribbon web resource, with the given CrmParameters. */
function javaScriptAction(functionName, crmParameters) {
  return `<JavaScriptFunction FunctionName="QdbReportEngine.${functionName}" Library="$webresource:${RIBBON_WEB_RESOURCE}">`
    + crmParameters.map(parameter => `<CrmParameter Value="${parameter}" />`).join('')
    + '</JavaScriptFunction>';
}

function commandDefinition(name, actionsXml) {
  return `<CommandDefinition Id="${commandId(name)}"><EnableRules /><DisplayRules />`
    + `<Actions>${actionsXml}</Actions></CommandDefinition>`;
}

/* The anchor's own Command has no actions, so it is always enabled; PopulateQueryCommand is what
   actually builds the menu when the user clicks. */
function ribbonDiffXml() {
  const commands = [
    commandDefinition('Flyout', ''),
    commandDefinition('PopulateForm', javaScriptAction('populateFormFlyout', ['CommandProperties', 'PrimaryControl'])),
    commandDefinition('PopulateGrid', javaScriptAction('populateGridFlyout', ['CommandProperties', 'SelectedEntityTypeName'])),
    commandDefinition('OpenReport',
      javaScriptAction('openReport', ['CommandProperties', 'PrimaryControl', 'SelectedControlSelectedItemIds']))
  ].join('');

  return '<RibbonDiffXml><CustomActions>'
    + RIBBON_LOCATIONS.map(flyoutCustomAction).join('')
    + '</CustomActions>'
    + '<Templates><RibbonTemplates Id="Mscrm.Templates"></RibbonTemplates></Templates>'
    + `<CommandDefinitions>${commands}</CommandDefinitions>`
    + '<RuleDefinitions><TabDisplayRules /><DisplayRules /><EnableRules /></RuleDefinitions>'
    + '<LocLabels /></RibbonDiffXml>';
}

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
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${(await res.text()).slice(0, 600)}`);
  return res.status === 204 ? null : res.json();
}

async function findOne(entitySet, query) {
  const found = await api('GET', `${entitySet}?${query}&$top=1`);
  return (found.value || [])[0] || null;
}

async function ensureRibbonSolution() {
  const existing = await findOne('solutions', `$select=solutionid&$filter=uniquename eq '${RIBBON_SOLUTION}'`);
  if (existing) {
    console.log(`  = solution ${RIBBON_SOLUTION} reused`);
    return;
  }
  const publisher = await findOne('publishers', `$select=publisherid&$filter=uniquename eq '${PUBLISHER_UNIQUE_NAME}'`);
  if (!publisher) throw new Error(`publisher "${PUBLISHER_UNIQUE_NAME}" not found`);
  await api('POST', 'solutions', {
    uniquename: RIBBON_SOLUTION, friendlyname: RIBBON_SOLUTION_DISPLAY, version: '1.0.0.0',
    'publisherid@odata.bind': `/publishers(${publisher.publisherid})`
  });
  console.log(`  + solution ${RIBBON_SOLUTION} created`);
}

/** DoNotIncludeSubcomponents keeps the entity's forms and views out, so the export stays small. */
async function addEntityToRibbonSolution() {
  const metadata = await api('GET', `EntityDefinitions(LogicalName='${targetEntity}')?$select=MetadataId`);
  await api('POST', 'AddSolutionComponent', {
    ComponentId: metadata.MetadataId, ComponentType: SOLUTION_COMPONENT_TYPE_ENTITY,
    SolutionUniqueName: RIBBON_SOLUTION, AddRequiredComponents: false, DoNotIncludeSubcomponents: true
  });
  console.log(`  + ${targetEntity} added to ${RIBBON_SOLUTION}`);
}

async function exportSolution() {
  const result = await api('POST', 'ExportSolution', { SolutionName: RIBBON_SOLUTION, Managed: false });
  return Buffer.from(result.ExportSolutionFile, 'base64');
}

const powershell = script => execFileSync('powershell.exe',
  ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'pipe' }).toString();

function unzip(zipPath, destination) {
  powershell(`Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destination}' -Force`);
}

function rezip(sourceDirectory, zipPath) {
  if (existsSync(zipPath)) rmSync(zipPath);
  powershell(`Compress-Archive -Path '${join(sourceDirectory, '*')}' -DestinationPath '${zipPath}' -Force`);
}

/* The exported entity carries an empty <RibbonDiffXml /> placeholder (or a populated one on a
   re-run); either form is replaced wholesale so the script stays idempotent. */
function injectRibbonDiff(customizationsXml) {
  const diff = ribbonDiffXml();
  const selfClosing = /<RibbonDiffXml\s*\/>/;
  const populated = /<RibbonDiffXml>[\s\S]*?<\/RibbonDiffXml>/;
  if (selfClosing.test(customizationsXml)) return customizationsXml.replace(selfClosing, diff);
  if (populated.test(customizationsXml)) return customizationsXml.replace(populated, diff);
  throw new Error('no <RibbonDiffXml> element found in the exported customizations.xml');
}

const ASYNC_OPERATION_COMPLETED = 3;
const ASYNC_OPERATION_SUCCEEDED = 30;
const IMPORT_POLL_INTERVAL_MS = 5000;
const IMPORT_TIMEOUT_MS = 10 * 60 * 1000;

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

/* ImportSolutionAsync rather than ImportSolution: the synchronous message holds the HTTP connection
   open for the whole import, which reliably exceeds Node's default header timeout and fails the
   client while the server carries on regardless — leaving no way to tell success from failure. */
async function importSolution(zipBuffer) {
  const started = await api('POST', 'ImportSolutionAsync', {
    OverwriteUnmanagedCustomizations: true, PublishWorkflows: false,
    CustomizationFile: zipBuffer.toString('base64'), ImportJobId: crypto.randomUUID()
  });
  console.log(`  … import job started (${started.AsyncOperationId})`);
  await waitForAsyncOperation(started.AsyncOperationId);
}

async function waitForAsyncOperation(asyncOperationId) {
  const deadline = Date.now() + IMPORT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const operation = await api('GET',
      `asyncoperations(${asyncOperationId})?$select=statecode,statuscode,friendlymessage,message`);
    if (operation.statecode === ASYNC_OPERATION_COMPLETED) {
      if (operation.statuscode !== ASYNC_OPERATION_SUCCEEDED) {
        throw new Error(`solution import failed (statuscode ${operation.statuscode}): `
          + (operation.friendlymessage || operation.message || 'no message'));
      }
      console.log('  ✓ solution imported');
      return;
    }
    await wait(IMPORT_POLL_INTERVAL_MS);
  }
  throw new Error(`solution import did not complete within ${IMPORT_TIMEOUT_MS / 1000}s`);
}

const env = loadEnv(process.argv[2]);
baseUrl = (env.DV_DATAVERSE_URL || env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
token = await getToken(
  env.DV_TENANT_ID || env.AZURE_TENANT_ID, env.DV_CLIENT_ID || env.AZURE_CLIENT_ID,
  env.DV_CLIENT_SECRET || env.AZURE_CLIENT_SECRET, baseUrl);

console.log(`\n== Deploy Report Engine ribbon on "${targetEntity}" → ${baseUrl} ==\n`);

await ensureRibbonSolution();
await addEntityToRibbonSolution();

rmSync(workDirectory, { recursive: true, force: true });
mkdirSync(workDirectory, { recursive: true });
const zipPath = join(workDirectory, 'ribbon.zip');
const extractDirectory = join(workDirectory, 'extracted');

writeFileSync(zipPath, await exportSolution());
console.log('  ✓ solution exported');
unzip(zipPath, extractDirectory);

const customizationsPath = join(extractDirectory, 'customizations.xml');
writeFileSync(customizationsPath, injectRibbonDiff(readFileSync(customizationsPath, 'utf8')), 'utf8');
console.log(`  ✓ RibbonDiffXml injected (${RIBBON_LOCATIONS.length} location(s))`);

rezip(extractDirectory, zipPath);
await importSolution(readFileSync(zipPath));
await api('POST', 'PublishAllXml', {});
console.log('  ✓ published');

console.log(`\n✓ "Reports" flyout deployed on ${targetEntity} at: `
  + RIBBON_LOCATIONS.map(l => l.key).join(', ') + '\n');
