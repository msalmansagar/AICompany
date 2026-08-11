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
  { name: 'qdb_reportengine_jspdf_autotable.js', display: 'Report Engine — jsPDF AutoTable (MIT)', file: 'vendor/jspdf.plugin.autotable.min.js', type: SCRIPT },
  { name: 'qdb_reportengine_arabicfont.js', display: 'Report Engine — Amiri Arabic font (OFL-1.1)', file: 'vendor/amiri-arabic-font.js', type: SCRIPT }
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
/* Content comes back too, so an unchanged file can be left alone entirely. Dataverse exposes no
   hash, so comparing means fetching — a megabyte or so per run, against writes and a publish that
   would otherwise happen for nothing. */
async function findWebResource(name) {
  const filter = encodeURIComponent(`name eq '${name}'`);
  const res = await fetch(`${baseUrl}/api/data/v9.2/webresourceset?$filter=${filter}&$select=webresourceid,content`, { headers: headers() });
  if (!res.ok) throw new Error(`lookup ${name} ${res.status}: ${await res.text()}`);
  return (await res.json()).value?.[0] ?? null;
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
  const existing = await findWebResource(name);
  const body = JSON.stringify({ name, displayname: display, description: display, webresourcetype: type ?? 1, content });

  if (existing && existing.content === content) {
    console.log(`  · unchanged ${name}`);
    return { id: existing.webresourceid, changed: false, type };
  }
  if (existing) {
    const res = await fetch(`${baseUrl}/api/data/v9.2/webresourceset(${existing.webresourceid})`, { method: 'PATCH', headers: headers(), body });
    if (!res.ok) throw new Error(`update ${name} ${res.status}: ${await res.text()}`);
    console.log(`  ✓ updated ${name} (${(content.length / 1024).toFixed(0)} KB)`);
    return { id: existing.webresourceid, changed: true, type };
  }
  // MSCRM.SolutionUniqueName adds the new component to the target solution.
  const res = await fetch(`${baseUrl}/api/data/v9.2/webresourceset`, { method: 'POST', headers: headers({ 'MSCRM.SolutionUniqueName': SOLUTION_UNIQUE_NAME }), body });
  if (!res.ok) throw new Error(`create ${name} ${res.status}: ${await res.text()}`);
  console.log(`  ✓ created ${name} in ${SOLUTION_UNIQUE_NAME} (${(content.length / 1024).toFixed(0)} KB)`);
  const created = (res.headers.get('OData-EntityId') || '').match(/\(([0-9a-fA-F-]{36})\)/);
  const id = created ? created[1] : (await findWebResource(name)).webresourceid;
  return { id, changed: true, type };
}

const env = loadEnv(process.argv[2]);
baseUrl = (env.DV_DATAVERSE_URL || env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
token = await getToken(env.DV_TENANT_ID || env.AZURE_TENANT_ID, env.DV_CLIENT_ID || env.AZURE_CLIENT_ID, env.DV_CLIENT_SECRET || env.AZURE_CLIENT_SECRET, baseUrl);
console.log(`\n== Deploy Report Engine web resources → ${SOLUTION_UNIQUE_NAME} ==\n`);

const results = [];
for (const resource of WEB_RESOURCES) {
  results.push(await upsertWebResource(resource));
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/* A full publish takes minutes, and Dataverse refuses a second one while the first is still running
   — so two deploys in a row now collide where the old always-scoped publish never did. That is a
   queueing problem, not a failure: the content is already uploaded and only the publish is pending,
   so waiting is the correct response rather than exiting and leaving the org serving stale shells. */
const PUBLISH_RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 120_000];

async function publish(path, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${baseUrl}/api/data/v9.2/${path}`, { method: 'POST', headers: headers(), body });
    if (res.ok) return;
    const detail = await res.text();
    const isBusy = res.status === 429 || detail.includes('because there is another');
    if (!isBusy || attempt >= PUBLISH_RETRY_DELAYS_MS.length) {
      throw new Error(`publish ${res.status}: ${detail}`);
    }
    const wait = PUBLISH_RETRY_DELAYS_MS[attempt];
    console.log(`  · another publish or import is running — retrying in ${wait / 1000}s`);
    await sleep(wait);
  }
}

/* How much to publish is decided by WHAT changed.
   A component-scoped publish is seconds and disturbs nobody, but it does not rotate the version
   token CRM puts in the iframe URL — so a changed HTML shell stays cached in every open client and
   the update appears not to have happened. Scripts and styles are exempt: the shells reference them
   with a hash of their own bytes, so a new engine already arrives under a new URL.
   PublishAllXml is therefore reserved for a changed shell, where nothing else will do, and skipped
   entirely when nothing changed — which is most runs. */
const changed = results.filter(r => r.changed);
const changedShells = changed.filter(r => r.type === HTML);

if (!changed.length) {
  console.log('\n· nothing changed — no publish needed\n');
} else if (changedShells.length) {
  await publish('PublishAllXml', '{}');
  console.log(`\n✓ full publish — ${changedShells.length} shell(s) changed, which a scoped publish leaves cached`);
  console.log('  the organisation will be slow to load for a few minutes while it recomposes\n');
} else {
  const parameterXml = '<importexportxml><webresources>'
    + changed.map(r => `<webresource>${r.id}</webresource>`).join('')
    + '</webresources></importexportxml>';
  await publish('PublishXml', JSON.stringify({ ParameterXml: parameterXml }));
  console.log(`\n✓ published ${changed.length} changed web resource(s) — scoped, no org-wide impact\n`);
}
