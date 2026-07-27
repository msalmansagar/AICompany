'use strict';
// Deploy the 4 in-app authoring guides as HTML web resources. Idempotent.
//
// These back the in-CRM node-docs side pane (PR #31): the designer intercepts a node's
// "Documentation" menu item and renders one of these guides in a right-docked iframe instead
// of opening gorules.io. Without them a fresh org shows four empty panes, so they are part of
// the deployable product, not developer notes.
//
//   node deploy/bre-guides.js            # deploy
//   node deploy/bre-guides.js --verify   # compare org content against the repo, write nothing
const fs = require('fs'), path = require('path'), https = require('https');
const env = (() => { const o = {}; for (const l of fs.readFileSync((process.env.EDP_ENV_PATH || 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';
const SOLUTION = 'BusinessRuleEngine';
const GUIDE_DIR = process.env.EDP_GUIDE_PATH || path.join(__dirname, 'guides');
const HTML_WEBRESOURCE = 1;
const VERIFY_ONLY = process.argv.includes('--verify');

// Display names are what an admin sees in the solution; keep them stable.
const DISPLAY_NAMES = {
  qdb_gorulesdecisiontablesmodernguide: 'Decision Tables Guide',
  qdb_gorulesexpressionsmodernguide: 'Expressions Guide',
  qdb_gorulesfunctionnodesmodernguide: 'Function Nodes Guide',
  qdb_gorulesdecisiongraphsmodernguide: 'Decision Graphs Guide',
};

function raw(method, p, token, body, extra) {
  return new Promise((res, rej) => {
    const data = body == null ? null : JSON.stringify(body);
    const h = { Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Prefer: 'return=representation', ...(extra || {}) };
    if (token) h.Authorization = `Bearer ${token}`;
    if (data) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(data); }
    const req = https.request({ host: HOST, path: p, method, headers: h }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b })); });
    req.on('error', rej); if (data) req.write(data); req.end();
  });
}
async function token() { const form = `client_id=${env.AZURE_CLIENT_ID}&client_secret=${encodeURIComponent(env.AZURE_CLIENT_SECRET)}&grant_type=client_credentials&scope=${encodeURIComponent(ORG + '/.default')}`; const r = await new Promise((res, rej) => { const req = https.request({ host: 'login.microsoftonline.com', path: `/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form) } }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res({ status: x.statusCode, body: b })); }); req.on('error', rej); req.write(form); req.end(); }); return JSON.parse(r.body).access_token; }
const sol = { 'MSCRM.SolutionUniqueName': SOLUTION };
const j = (r) => { try { return JSON.parse(r.body); } catch { return {}; } };

function guideFiles() {
  if (!fs.existsSync(GUIDE_DIR)) throw new Error(`Guide directory not found: ${GUIDE_DIR}`);
  return fs.readdirSync(GUIDE_DIR)
    .filter(f => f.toLowerCase().endsWith('.html'))
    .map(f => ({ name: path.basename(f, path.extname(f)), full: path.join(GUIDE_DIR, f) }));
}

/**
 * The designer addresses these web resources by name. If a guide is renamed, or a node type
 * gains a guide with no source file, the side pane still opens and renders an empty iframe —
 * a silent failure. Fail the deploy instead.
 *
 * The check lives here rather than in a designer unit test because the designer is typed for
 * the browser only (no Node types by design), and this is where the filesystem is native.
 */
function assertDesignerNamesHaveFiles(files) {
  const source = path.join(__dirname, '..', 'designer', 'src', 'gorules', 'docRedirect.ts');
  if (!fs.existsSync(source)) return; // deploy bundle without designer sources — nothing to check
  const referenced = [...fs.readFileSync(source, 'utf8').matchAll(/guide\(\s*'([^']+)'/g)].map(m => m[1]);
  const present = new Set(files.map(f => f.name));
  const missing = referenced.filter(name => !present.has(name));
  if (missing.length > 0) {
    throw new Error(
      `docRedirect.ts references guide web resource(s) with no source file in ${GUIDE_DIR}:\n` +
      missing.map(n => `  - ${n}.html`).join('\n'),
    );
  }
  console.log(`coupling ok: all ${referenced.length} guide(s) referenced by the designer have source files`);
}

async function findWebResource(name, t) {
  const res = await raw('GET', `${API}/webresourceset?$filter=${encodeURIComponent(`name eq '${name}'`)}&$select=webresourceid,content`, t);
  return (j(res).value || [])[0];
}

(async () => {
  const t = await token();
  const files = guideFiles();
  if (files.length === 0) throw new Error(`No .html guides in ${GUIDE_DIR}`);
  assertDesignerNamesHaveFiles(files);
  console.log(`${VERIFY_ONLY ? 'verifying' : 'deploying'} ${files.length} guide(s) from ${GUIDE_DIR}\n`);

  const ids = [];
  let drift = 0;

  for (const f of files) {
    const local = fs.readFileSync(f.full).toString('base64');
    const existing = await findWebResource(f.name, t);

    if (VERIFY_ONLY) {
      if (!existing) { console.log(`  MISSING  ${f.name}`); drift++; }
      else if (existing.content !== local) { console.log(`  DRIFTED  ${f.name}`); drift++; }
      else console.log(`  match    ${f.name}`);
      continue;
    }

    if (existing) {
      const r = await raw('PATCH', `${API}/webresourceset(${existing.webresourceid})`, t, { content: local });
      if (r.status >= 300) { console.log('  ! FAIL', f.name, r.status, r.body.slice(0, 150)); continue; }
      console.log('  = updated', f.name);
      ids.push(existing.webresourceid);
    } else {
      const r = await raw('POST', `${API}/webresourceset`, t, {
        name: f.name,
        displayname: DISPLAY_NAMES[f.name] || f.name,
        webresourcetype: HTML_WEBRESOURCE,
        content: local,
      }, sol);
      if (r.status >= 300) { console.log('  ! FAIL', f.name, r.status, r.body.slice(0, 150)); continue; }
      console.log('  + created', f.name);
      ids.push(j(r).webresourceid);
    }
  }

  if (VERIFY_ONLY) {
    console.log(`\n${drift === 0 ? 'ALL GUIDES MATCH THE REPO' : `${drift} guide(s) differ from the repo`}`);
    process.exit(drift === 0 ? 0 : 1);
  }

  if (ids.length > 0) {
    const xml = ids.map(id => `<webresource>${id}</webresource>`).join('');
    const pub = await raw('POST', `${API}/PublishXml`, t, { ParameterXml: `<importexportxml><webresources>${xml}</webresources></importexportxml>` });
    console.log('\npublish:', pub.status === 204 ? 'ok' : `${pub.status} ${pub.body.slice(0, 200)}`);
  }
  console.log(`DONE — ${ids.length}/${files.length} guide(s) live on ${ORG}`);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
