// Live proof of the Unpublish transition (Published → Draft). Creates a throwaway Published
// version, unpublishes it, checks it landed in Draft, and cleans up.
const fs = require('fs'), https = require('https');
const ENV_PATH = process.env.EDP_ENV_PATH || 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env';
const env = (() => { const o = {}; for (const l of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';
const PUBLISHED = 100000003, DRAFT = 100000000;

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
  let ruleId, vid;
  try {
    ruleId = body(await raw('POST', `${API}/qdb_edp_rules`, t, { qdb_edp_rulename: 'ZZ Unpublish Probe' })).qdb_edp_ruleid;
    vid = body(await raw('POST', `${API}/qdb_edp_ruleversions`, t, {
      qdb_edp_ruleversionname: 'ZZ Unpublish v1', qdb_edp_versionnumber: 1, qdb_edp_lifecyclestate: PUBLISHED,
      'qdb_edp_ruleid@odata.bind': `/qdb_edp_rules(${ruleId})`,
    })).qdb_edp_ruleversionid;
    console.log(`setup: version ${vid?.slice(0, 8)} @ Published\n`);

    const un = await raw('POST', `${API}/qdb_edp_RuleGovernanceAction`, t, { RuleVersionId: vid, Action: 'Unpublish', Comments: 'pulling from prod' });
    check('Unpublish returns Success + NewState Draft', un.status === 200 && body(un).Success === true && body(un).NewState === 'Draft', body(un).Message || body(un)?.error?.message);

    const after = body(await raw('GET', `${API}/qdb_edp_ruleversions(${vid})?$select=qdb_edp_lifecyclestate`, t)).qdb_edp_lifecyclestate;
    check('version lifecycle is now Draft', after === DRAFT, `state=${after}`);

    const again = await raw('POST', `${API}/qdb_edp_RuleGovernanceAction`, t, { RuleVersionId: vid, Action: 'Unpublish' });
    check('Unpublish again is rejected (no longer Published)', again.status >= 400, `HTTP ${again.status}`);
  } finally {
    if (vid) await raw('DELETE', `${API}/qdb_edp_ruleversions(${vid})`, t).catch(() => {});
    if (ruleId) await raw('DELETE', `${API}/qdb_edp_rules(${ruleId})`, t).catch(() => {});
    console.log('\ncleanup: temp rule + version deleted.');
  }
  console.log(`\n${pass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);
  process.exit(pass ? 0 : 1);
})();
