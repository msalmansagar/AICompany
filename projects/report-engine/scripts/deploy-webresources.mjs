// Deploys the Report Engine designer + runtime viewer HTML into the qdb_reportengine solution
// as CRM web resources (webresourcetype 1 = HTML), then publishes. Additive/idempotent: updates
// the content of an existing web resource in place; adds new ones to the solution on create.
//
// NOTE: the web resources call the ASP.NET Core middle-tier via fetch. They resolve its base URL
// from a ?api=<url> query-string parameter (a CRM ribbon/site-map passes it) and fall back to
// localhost for standalone use — so they are only functional once the middle-tier is HOSTED and
// the launch URL points at it. Deploying registers them; hosting makes them work.
//
// Usage: node deploy-webresources.mjs <path-to-.env>
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SOLUTION_UNIQUE_NAME = 'qdb_reportengine';
const PROTOTYPE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../prototype');
// webresourcetype: 1 = HTML, 2 = CSS, 3 = JScript.
const HTML = 1;
const CSS = 2;
const SCRIPT = 3;

/* The export libraries ship as script web resources rather than from a CDN. A Dataverse org — and a
   bank's in particular — should not depend on an outbound request to render a report, on-premise may
   have no internet at all, and content-security policy would block it regardless. Served from the
   same origin they are also cached by the browser and reviewable in the customer's own solution.
   They are fetched on demand by the viewer, so opening a report downloads none of them. */
const WEB_RESOURCES = [
  { name: 'qdb_reportengine_core.css', display: 'Report Engine — Shared styles', file: 'report-engine-core.css', type: CSS },
  { name: 'qdb_reportengine_core.js', display: 'Report Engine — Shared rendering engine', file: 'report-engine-core.js', type: SCRIPT },
  /* The display name is what CRM puts in the dialog title bar when this opens as a popup — the HTML
     <title> is not used there. Anything appended to it shows up as chrome above the report. */
  { name: 'qdb_reportengine_report.html', display: 'Report Engine', file: 'report-single.html', type: HTML },
  { name: 'qdb_reportengine_designer.html', display: 'Report Engine — Designer', file: 'report-designer.html', type: HTML },
  { name: 'qdb_reportengine_runtime.html', display: 'Report Engine — Runtime Viewer', file: 'report-runtime.html', type: HTML },
  { name: 'qdb_reportengine_ribbon.js', display: 'Report Engine — Ribbon handlers', file: 'report-ribbon.js', type: SCRIPT },
  { name: 'qdb_reportengine_xlsx.js', display: 'Report Engine — SheetJS (Apache-2.0)', file: 'vendor/xlsx.mini.min.js', type: SCRIPT },
  { name: 'qdb_reportengine_jspdf.js', display: 'Report Engine — jsPDF (MIT)', file: 'vendor/jspdf.umd.min.js', type: SCRIPT },
  { name: 'qdb_reportengine_jspdf_autotable.js', display: 'Report Engine — jsPDF AutoTable (MIT)', file: 'vendor/jspdf.plugin.autotable.min.js', type: SCRIPT }
];

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}
async function getToken(tenant, clientId, secret, url) {
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: secret, scope: `${url}/.default` });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: 'POST', body });
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

let baseUrl, token;
function headers(extra = {}) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', ...extra };
}
async function findWebResourceId(name) {
  const filter = encodeURIComponent(`name eq '${name}'`);
  const res = await fetch(`${baseUrl}/api/data/v9.2/webresourceset?$filter=${filter}&$select=webresourceid`, { headers: headers() });
  if (!res.ok) throw new Error(`lookup ${name} ${res.status}: ${await res.text()}`);
  return (await res.json()).value?.[0]?.webresourceid ?? null;
}
/* The shells load the shared engine by a plain relative name, and CRM serves web resources with a
   long cache lifetime — so a browser that has once fetched qdb_reportengine_core.js keeps handing
   back that copy however many times the file is redeployed. The page then runs old code against new
   data and looks simply broken: correct on the server, stale on the screen.
   Stamping the reference with a hash of the engine's own bytes makes the URL change whenever the
   engine changes, and stay identical when it does not. */
function stampSharedAssetVersions(html) {
  const versionOf = file => createHash('sha256')
    .update(readFileSync(resolve(PROTOTYPE_DIR, file))).digest('hex').slice(0, 10);
  return html
    .replace(/qdb_reportengine_core\.js(\?v=[0-9a-f]+)?/g, `qdb_reportengine_core.js?v=${versionOf('report-engine-core.js')}`)
    .replace(/qdb_reportengine_core\.css(\?v=[0-9a-f]+)?/g, `qdb_reportengine_core.css?v=${versionOf('report-engine-core.css')}`);
}

async function upsertWebResource({ name, display, file, type }) {
  const raw = readFileSync(resolve(PROTOTYPE_DIR, file));
  const stamped = type === HTML ? Buffer.from(stampSharedAssetVersions(raw.toString('utf8')), 'utf8') : raw;
  const content = stamped.toString('base64');
  const id = await findWebResourceId(name);
  const body = JSON.stringify({ name, displayname: display, description: display, webresourcetype: type ?? 1, content });
  if (id) {
    const res = await fetch(`${baseUrl}/api/data/v9.2/webresourceset(${id})`, { method: 'PATCH', headers: headers(), body });
    if (!res.ok) throw new Error(`update ${name} ${res.status}: ${await res.text()}`);
    console.log(`  ✓ updated ${name} (${(content.length / 1024).toFixed(0)} KB)`);
    return id;
  }
  // MSCRM.SolutionUniqueName adds the new component to the target solution.
  const res = await fetch(`${baseUrl}/api/data/v9.2/webresourceset`, { method: 'POST', headers: headers({ 'MSCRM.SolutionUniqueName': SOLUTION_UNIQUE_NAME }), body });
  if (!res.ok) throw new Error(`create ${name} ${res.status}: ${await res.text()}`);
  console.log(`  ✓ created ${name} in ${SOLUTION_UNIQUE_NAME} (${(content.length / 1024).toFixed(0)} KB)`);
  const created = (res.headers.get('OData-EntityId') || '').match(/\(([0-9a-fA-F-]{36})\)/);
  return created ? created[1] : await findWebResourceId(name);
}

const env = loadEnv(process.argv[2]);
baseUrl = (env.DV_DATAVERSE_URL || env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
token = await getToken(env.DV_TENANT_ID || env.AZURE_TENANT_ID, env.DV_CLIENT_ID || env.AZURE_CLIENT_ID, env.DV_CLIENT_SECRET || env.AZURE_CLIENT_SECRET, baseUrl);
console.log(`\n== Deploy Report Engine web resources → ${SOLUTION_UNIQUE_NAME} ==\n`);

const publishedIds = [];
for (const resource of WEB_RESOURCES) {
  publishedIds.push(await upsertWebResource(resource));
}

/* Publish ONLY the web resources this run touched, not the whole organisation.
   PublishAllXml invalidates every published customisation, and main.aspx then has to recompose
   itself on the next request. On an org with a few thousand tables that takes minutes, and running
   it once per deploy attempt — as happened repeatedly while chasing a ribbon caching problem — left
   the web client hanging on its own shell document while the Dataverse API stayed perfectly fast.
   A component-scoped publish is seconds and touches nothing else. */
const parameterXml = '<importexportxml><webresources>'
  + publishedIds.filter(Boolean).map(id => `<webresource>${id}</webresource>`).join('')
  + '</webresources></importexportxml>';
const publish = await fetch(`${baseUrl}/api/data/v9.2/PublishXml`, {
  method: 'POST', headers: headers(), body: JSON.stringify({ ParameterXml: parameterXml })
});
if (!publish.ok) throw new Error(`publish ${publish.status}: ${await publish.text()}`);
console.log(`\n✓ published ${publishedIds.filter(Boolean).length} web resource(s)\n✓ web-resource deploy done.\n`);
