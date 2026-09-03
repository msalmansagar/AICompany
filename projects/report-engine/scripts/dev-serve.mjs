/* Local dev server for the Report Engine web resources.
 *
 * Serves prototype/ as static files and proxies /api/data/* to the organisation with the service
 * principal's token, so the SHIPPED designer and runtime run in a plain browser on real org data —
 * no CRM session, no code changes to the web resources.
 *
 * The pages require window.Xrm, which only CRM provides; every served HTML page gets
 * dev-xrm-shim.js injected ahead of its own script (see that file). The injection happens at serve
 * time precisely so no dev-only code ever lives in the deployed files.
 *
 * Usage: node dev-serve.mjs <path-to-.env> [port]     (default port 8788)
 */
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { connect } from './lib/dataverse.mjs';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const PROTOTYPE_DIR = join(SCRIPTS_DIR, '..', 'prototype');
const PORT = parseInt(process.argv[3], 10) || 8788;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.map': 'application/json'
};

let dv = await connect(process.argv[2]);
const whoAmI = await dv.fetchJson('WhoAmI');
const orgVersion = (await dv.fetchJson('RetrieveVersion()')).Version || `${dv.apiVersion}.0.0`;
console.log(`Report Engine dev server — org ${dv.baseUrl} (v${orgVersion}), running as ${whoAmI.UserId}`);

/** The shim with its serve-time facts filled in: the org's API version and who the proxy runs as. */
function shimSource() {
  return readFileSync(join(SCRIPTS_DIR, 'dev-xrm-shim.js'), 'utf8')
    .replace('__API_VERSION__', dv.apiVersion)
    .replace('__ORG_VERSION__', orgVersion)
    .replace('__USER_ID__', whoAmI.UserId)
    .replace('__USER_NAME__', 'Local dev (service principal)');
}

/** Injected before the page's FIRST script tag, so window.Xrm exists by the time the page looks. */
function withShim(html) {
  return html.replace(/<script/, '<script src="/dev-xrm-shim.js"></script>\n<script');
}

/* The SP token expires after about an hour; a dev server outlives it. One reconnect-and-retry on
   401 keeps a long session working without the user restarting the server. */
async function proxyRequest(path, init) {
  const response = await dv.request(path, init);
  if (response.status !== 401) return response;
  dv = await connect(process.argv[2]);
  return dv.request(path, init);
}

async function handleApi(req, res) {
  const body = await readBody(req);
  const init = {
    method: req.method,
    headers: passthroughHeaders(req),
    body: body.length ? body : undefined
  };
  const upstream = await proxyRequest(req.url, init);
  const text = await upstream.text();
  res.writeHead(upstream.status, {
    'Content-Type': upstream.headers.get('content-type') || 'application/json',
    ...(upstream.headers.get('odata-entityid') ? { 'OData-EntityId': upstream.headers.get('odata-entityid') } : {})
  });
  res.end(text);
}

/** Only the headers Dataverse cares about cross; auth is the proxy's own and never the browser's.
    Canonical casing matters: the connection adds its own 'Content-Type', and a lowercase duplicate
    from the browser made fetch send BOTH — OData refuses "application/json, application/json". */
const PASSTHROUGH_HEADERS = {
  'content-type': 'Content-Type', prefer: 'Prefer',
  'if-match': 'If-Match', 'if-none-match': 'If-None-Match', accept: 'Accept'
};

function passthroughHeaders(req) {
  const kept = {};
  for (const [incoming, canonical] of Object.entries(PASSTHROUGH_HEADERS)) {
    if (req.headers[incoming]) kept[canonical] = req.headers[incoming];
  }
  return kept;
}

function readBody(req) {
  return new Promise(resolve => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

/* The shells reference their siblings by CRM web-resource NAME (qdb_reportengine_core.js), which
   is what a deployed page resolves; locally those names map back to the files they deploy from —
   the same table deploy-webresources.mjs uses. Without this the runtime viewer loads an empty
   shell: its engine script 404s and nothing on the page ever runs. */
const WEB_RESOURCE_ALIASES = {
  '/qdb_reportengine_core.css': '/report-engine-core.css',
  '/qdb_reportengine_core.js': '/report-engine-core.js',
  '/qdb_reportengine_report.html': '/report-single.html',
  '/qdb_reportengine_designer.html': '/report-designer.html',
  '/qdb_reportengine_runtime.html': '/report-runtime.html',
  '/qdb_reportengine_ribbon.js': '/report-ribbon.js',
  '/qdb_reportengine_xlsx.js': '/vendor/xlsx.mini.min.js',
  '/qdb_reportengine_jspdf.js': '/vendor/jspdf.umd.min.js',
  '/qdb_reportengine_jspdf_autotable.js': '/vendor/jspdf.plugin.autotable.min.js',
  '/qdb_reportengine_arabicfont.js': '/vendor/amiri-arabic-font.js'
};

function serveStatic(res, urlPath) {
  const aliased = WEB_RESOURCE_ALIASES[urlPath] || urlPath;
  const relative = aliased === '/' ? '/report-designer.html' : aliased;
  const file = normalize(join(PROTOTYPE_DIR, relative));
  if (!file.startsWith(normalize(PROTOTYPE_DIR)) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end(`Not found: ${urlPath}`);
  }
  const type = CONTENT_TYPES[extname(file)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  if (extname(file) === '.html') return res.end(withShim(readFileSync(file, 'utf8')));
  res.end(readFileSync(file));
}

http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  try {
    if (urlPath.startsWith('/api/data/')) return await handleApi(req, res);
    if (urlPath === '/dev-xrm-shim.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(shimSource());
    }
    serveStatic(res, urlPath);
  } catch (error) {
    console.error(`  ! ${req.method} ${urlPath} — ${error.message}`);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: error.message } }));
  }
}).listen(PORT, () => {
  console.log(`\n  Designer  http://localhost:${PORT}/report-designer.html`);
  console.log(`  Runtime   http://localhost:${PORT}/report-runtime.html\n`);
});
