'use strict';
/* Seed a governed qdb_edp_ruleset and exercise qdb_edp_ExecuteRuleSet by RuleSetId:
   member resolution (ruleVersionId pin + ruleId->published), Collect vs FirstMatch policy. */
const fs = require('fs'), https = require('https');
const env = (() => { const o = {}; for (const l of fs.readFileSync((process.env.EDP_ENV_PATH || 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL).replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';
const SOLUTION = 'BusinessRuleEngine';
const SEED_VERSION = '1a4a23bd-4f77-f111-ab0e-000d3abcff60'; // Loan Approval — Sample v1 (pinned by version)

function raw(m, p, t, b, extra) {
  return new Promise((res, rej) => { const d = b == null ? null : JSON.stringify(b); const h = { Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Prefer: 'return=representation', ...(extra || {}) }; if (t) h.Authorization = 'Bearer ' + t; if (d) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(d); } const q = https.request({ host: HOST, path: p, method: m, headers: h }, r => { let x = ''; r.on('data', c => x += c); r.on('end', () => res({ status: r.statusCode, body: x })); }); q.on('error', rej); if (d) q.write(d); q.end(); });
}
async function token() { const form = `client_id=${env.AZURE_CLIENT_ID}&client_secret=${encodeURIComponent(env.AZURE_CLIENT_SECRET)}&grant_type=client_credentials&scope=${encodeURIComponent(ORG + '/.default')}`; const r = await new Promise((res, rej) => { const q = https.request({ host: 'login.microsoftonline.com', path: `/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form) } }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res({ status: x.statusCode, body: b })); }); q.on('error', rej); q.write(form); q.end(); }); return JSON.parse(r.body).access_token; }
const sol = { 'MSCRM.SolutionUniqueName': SOLUTION };
const j = (r) => { try { return JSON.parse(r.body); } catch { return {}; } };

(async () => {
  const t = await token();
  // Published rule to reference by ruleId (resolves to its published version).
  const cr = j(await raw('GET', `${API}/qdb_edp_rules?$filter=${encodeURIComponent("qdb_edp_rulename eq 'Credit vs Revenue'")}&$select=qdb_edp_ruleid&$top=1`, t)).value?.[0];
  const creditRuleId = cr?.qdb_edp_ruleid;
  console.log('Credit vs Revenue ruleId:', creditRuleId);

  const members = [
    { key: 'loan', ruleVersionId: SEED_VERSION, order: 1 },   // pinned version
    { key: 'credit', ruleId: creditRuleId, order: 2 },         // governed: run whatever is Published
  ];

  // Create the governed set (idempotent-ish: reuse if present).
  let set = j(await raw('GET', `${API}/qdb_edp_rulesets?$filter=${encodeURIComponent("qdb_edp_rulesetname eq 'Underwriting Set'")}&$select=qdb_edp_rulesetid&$top=1`, t)).value?.[0];
  if (!set) {
    set = j(await raw('POST', `${API}/qdb_edp_rulesets`, t, {
      qdb_edp_rulesetname: 'Underwriting Set', qdb_edp_description: 'Loan + credit checks',
      qdb_edp_membersjson: JSON.stringify(members), qdb_edp_setpolicy: 'Collect',
    }, sol));
  } else {
    await raw('PATCH', `${API}/qdb_edp_rulesets(${set.qdb_edp_rulesetid})`, t, { qdb_edp_membersjson: JSON.stringify(members), qdb_edp_setpolicy: 'Collect' });
  }
  const setId = set.qdb_edp_rulesetid;
  console.log('ruleSetId:', setId, '\n');

  const inputs = JSON.stringify({ loanAmount: 600000, riskRating: 'High', creditlimit: 100000, revenue: 50000 });
  const run = async (label) => { const r = await raw('POST', `${API}/qdb_edp_ExecuteRuleSet`, t, { RuleSetId: setId, InputsJson: inputs }); console.log(label, '->', r.status, r.status === 200 ? JSON.parse(r.body).ResultJson : r.body.slice(0, 200)); };

  console.log('--- policy=Collect (run all, merge outputs) ---');
  await run('Collect ');

  await raw('PATCH', `${API}/qdb_edp_rulesets(${setId})`, t, { qdb_edp_setpolicy: 'FirstMatch' });
  console.log('\n--- policy=FirstMatch (stop at first match) ---');
  await run('FirstMatch');
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
