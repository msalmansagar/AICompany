// Live verification of qdb_edp_GetRuleAnalytics — asserts the aggregate is internally consistent
// against the real execution-log telemetry in the org (read-only, creates nothing).
const fs = require('fs'), https = require('https');
const ENV_PATH = process.env.EDP_ENV_PATH || 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env';
const env = (() => { const o = {}; for (const l of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';

function get(path, t) {
  return new Promise((res, rej) => {
    const req = https.request({ host: HOST, path: `${API}/${path}`, method: 'GET', headers: { Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${t}` } },
      r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b })); });
    req.on('error', rej); req.end();
  });
}
async function token() { const f = `client_id=${env.AZURE_CLIENT_ID}&client_secret=${encodeURIComponent(env.AZURE_CLIENT_SECRET)}&grant_type=client_credentials&scope=${encodeURIComponent(ORG + '/.default')}`; const r = await new Promise((res, rej) => { const q = https.request({ host: 'login.microsoftonline.com', path: `/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(f) } }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res(b)); }); q.on('error', rej); q.write(f); q.end(); }); return JSON.parse(r).access_token; }

let pass = true;
const check = (label, ok, detail) => { pass = pass && ok; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); };

(async () => {
  const t = await token();
  const r = await get('qdb_edp_GetRuleAnalytics(PeriodDays=@p)?@p=%2730%27', t);
  check('GetRuleAnalytics returns 200', r.status === 200, `HTTP ${r.status}`);
  const d = JSON.parse(JSON.parse(r.body).ResultJson);
  console.log(`\nwindow ${d.from?.slice(0, 10)} → ${d.to?.slice(0, 10)} · total=${d.total} matched=${d.matched} noMatch=${d.noMatch} error=${d.error}\n`);

  check('outcome counts sum to total', d.matched + d.noMatch + d.error === d.total, `${d.matched}+${d.noMatch}+${d.error} vs ${d.total}`);
  const expMatch = d.total === 0 ? 0 : Math.round((d.matched / d.total) * 10000) / 10000;
  check('matchRate matches counts', Math.abs(d.matchRate - expMatch) < 1e-6, `api=${d.matchRate} calc=${expMatch}`);
  check('latency percentiles are ordered', d.latency.p50Ms <= d.latency.p95Ms && d.latency.p95Ms <= d.latency.maxMs, `p50=${d.latency.p50Ms} p95=${d.latency.p95Ms} max=${d.latency.maxMs}`);
  check('byDay is a continuous window series', d.byDay.length >= 30 && d.byDay.length <= 31, `${d.byDay.length} buckets`);
  check('byDay counts sum to total', d.byDay.reduce((s, b) => s + b.count, 0) === d.total, `${d.byDay.reduce((s, b) => s + b.count, 0)} vs ${d.total}`);
  check('topRules counts do not exceed total', d.topRules.reduce((s, v) => s + v.count, 0) <= d.total, `sum=${d.topRules.reduce((s, v) => s + v.count, 0)}`);
  if (d.topRules.length) console.log(`  busiest: ${d.topRules[0].label} (${d.topRules[0].count})`);

  console.log(`\n${pass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);
  process.exit(pass ? 0 : 1);
})();
