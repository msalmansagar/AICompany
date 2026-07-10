'use strict';
// Deploy the multi-file designer build as web resources under qdb_edp_designer/. Idempotent.
const fs = require('fs'), path = require('path'), https = require('https');
const env = (() => { const o = {}; for (const l of fs.readFileSync((process.env.EDP_ENV_PATH || 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';
const SOLUTION = 'BusinessRuleEngine';
const DIST = 'D:/AI Projects/AICompany/projects/enterprise-decision-platform/designer/dist';
const PREFIX = 'qdb_edp_designer/';

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

const TYPE = { '.html': 1, '.htm': 1, '.css': 2, '.js': 3, '.mjs': 3, '.xml': 4, '.png': 5, '.gif': 6, '.jpg': 7, '.jpeg': 7, '.ico': 10, '.svg': 11, '.map': 3 };

function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, base));
    else out.push({ full, rel: path.relative(base, full).split(path.sep).join('/') });
  }
  return out;
}

(async () => {
  const t = await token();
  const files = walk(DIST);
  console.log('files to deploy:', files.length);
  const ids = [];
  let ok = 0, skipped = 0;
  for (const f of files) {
    const ext = path.extname(f.full).toLowerCase();
    const wrType = TYPE[ext];
    if (!wrType) { console.log('  ~ skip (unsupported type)', f.rel); skipped++; continue; }
    const name = PREFIX + f.rel;
    const b64 = fs.readFileSync(f.full).toString('base64');

    const ex = await raw('GET', `${API}/webresourceset?$filter=${encodeURIComponent(`name eq '${name}'`)}&$select=webresourceid`, t);
    let id = (j(ex).value || [])[0]?.webresourceid;
    if (id) {
      const r = await raw('PATCH', `${API}/webresourceset(${id})`, t, { content: b64 });
      if (r.status < 300) { ok++; } else { console.log('  ! FAIL', name, r.status, r.body.slice(0, 120)); continue; }
    } else {
      const r = await raw('POST', `${API}/webresourceset`, t, { name, displayname: name, webresourcetype: wrType, content: b64 }, sol);
      if (r.status >= 300) { console.log('  ! FAIL', name, r.status, r.body.slice(0, 150)); continue; }
      id = j(r).webresourceid; ok++;
    }
    ids.push(id);
  }
  console.log(`deployed ok: ${ok}/${files.length} (skipped ${skipped})`);

  // publish all in batches
  for (let i = 0; i < ids.length; i += 25) {
    const batch = ids.slice(i, i + 25).map(id => `<webresource>${id}</webresource>`).join('');
    const pub = await raw('POST', `${API}/PublishXml`, t, { ParameterXml: `<importexportxml><webresources>${batch}</webresources></importexportxml>` });
    console.log('publish batch', i / 25 + 1, pub.status);
  }
  console.log(`DONE — designer URL: ${ORG}/WebResources/${PREFIX}index.html`);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
