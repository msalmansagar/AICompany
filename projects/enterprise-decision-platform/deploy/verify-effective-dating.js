// Live proof of effective dating: two Published versions of one rule — v1 always-effective,
// v2 future-dated — and qdb_edp_ResolveEffectiveVersion picks the right one by date. Cleans up.
const fs = require('fs'), https = require('https');
const ENV_PATH = process.env.EDP_ENV_PATH || 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env';
const env = (() => { const o = {}; for (const l of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';
const PUBLISHED = 100000003, FUTURE_FROM = '2099-01-01T00:00:00Z', ASOF_FUTURE = '2099-06-01T00:00:00Z';

function raw(method, p, t, body) {
  return new Promise((res, rej) => {
    const data = body == null ? null : JSON.stringify(body);
    const h = { Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Prefer: 'return=representation', Authorization: `Bearer ${t}` };
    if (data) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(data); }
    const req = https.request({ host: HOST, path: p, method, headers: h }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b })); });
    req.on('error', rej); if (data) req.write(data); req.end();
  });
}
async function token() { const f = `client_id=${env.AZURE_CLIENT_ID}&client_secret=${encodeURIComponent(env.AZURE_CLIENT_SECRET)}&grant_type=client_credentials&scope=${encodeURIComponent(ORG + '/.default')}`; const r = await new Promise((res, rej) => { const q = https.request({ host: 'login.microsoftonline.com', path: `/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(f) } }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res(b)); }); q.on('error', rej); q.write(f); q.end(); }); return JSON.parse(r).access_token; }
const body = (r) => { try { return JSON.parse(r.body); } catch { return {}; } };

let pass = true;
const check = (label, ok, detail) => { pass = pass && ok; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); };

(async () => {
  const t = await token();
  let ruleId, v1, v2;
  try {
    ruleId = body(await raw('POST', `${API}/qdb_edp_rules`, t, { qdb_edp_rulename: 'ZZ Effective Dating Probe' })).qdb_edp_ruleid;
    // v1: always effective (no window). v2: effective only from the far future.
    v1 = body(await raw('POST', `${API}/qdb_edp_ruleversions`, t, {
      qdb_edp_ruleversionname: 'ZZ Probe v1', qdb_edp_versionnumber: 1, qdb_edp_lifecyclestate: PUBLISHED,
      'qdb_edp_ruleid@odata.bind': `/qdb_edp_rules(${ruleId})`,
    })).qdb_edp_ruleversionid;
    v2 = body(await raw('POST', `${API}/qdb_edp_ruleversions`, t, {
      qdb_edp_ruleversionname: 'ZZ Probe v2', qdb_edp_versionnumber: 2, qdb_edp_lifecyclestate: PUBLISHED,
      qdb_edp_effectivefrom: FUTURE_FROM, 'qdb_edp_ruleid@odata.bind': `/qdb_edp_rules(${ruleId})`,
    })).qdb_edp_ruleversionid;
    console.log(`setup: rule ${ruleId?.slice(0, 8)} · v1 ${v1?.slice(0, 8)} (always) · v2 ${v2?.slice(0, 8)} (from ${FUTURE_FROM})\n`);

    const resolve = async (asOf) => {
      const args = asOf ? `(RuleId=@r,AsOf=@a)?@r=%27${ruleId}%27&@a=%27${encodeURIComponent(asOf)}%27` : `(RuleId=@r)?@r=%27${ruleId}%27`;
      const r = await raw('GET', `${API}/qdb_edp_ResolveEffectiveVersion${args}`, t);
      return JSON.parse(body(r).ResultJson);
    };

    const now = await resolve(null);
    check('as of now → v1 (v2 not yet effective)', now.resolved?.ruleVersionId === v1, `resolved v${now.resolved?.versionNumber}`);
    check('publishedCount is 2', now.publishedCount === 2, `${now.publishedCount}`);

    const future = await resolve(ASOF_FUTURE);
    check('as of 2099 → v2 (future window now open, later start wins)', future.resolved?.ruleVersionId === v2, `resolved v${future.resolved?.versionNumber}`);
  } finally {
    if (v1) await raw('DELETE', `${API}/qdb_edp_ruleversions(${v1})`, t).catch(() => {});
    if (v2) await raw('DELETE', `${API}/qdb_edp_ruleversions(${v2})`, t).catch(() => {});
    if (ruleId) await raw('DELETE', `${API}/qdb_edp_rules(${ruleId})`, t).catch(() => {});
    console.log('\ncleanup: temp rule + versions deleted.');
  }
  console.log(`\n${pass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);
  process.exit(pass ? 0 : 1);
})();
