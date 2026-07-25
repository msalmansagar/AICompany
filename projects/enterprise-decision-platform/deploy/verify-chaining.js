// Live proof of rule chaining: rule A outputs `band`; rule B reads `band` as an input. A rule set
// runs [A, B] in order, and ExecuteRuleSet feeds A's output into B. Creates + cleans up everything.
const fs = require('fs'), https = require('https');
const ENV_PATH = process.env.EDP_ENV_PATH || 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env';
const env = (() => { const o = {}; for (const l of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';
const PUBLISHED = 100000003;

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

// Rule A: amount > 1000 → band "high" else "low".
const pcrmA = { schemaVersion: '1.0', name: 'A', targetEntity: 'account', inputs: [{ name: 'amount', type: 'Decimal' }], outputs: [{ name: 'band', type: 'Text' }],
  logic: { type: 'decisionTable', hitPolicy: 'First', tableInputs: [{ field: 'amount' }], outputColumns: ['band'], rows: [{ cells: [{ operator: 'GreaterThan', value: 1000 }], outputs: { band: 'high' } }], defaultRow: { outputs: { band: 'low' } } } };
// Rule B: reads `band` (A's output) → decision.
const pcrmB = { schemaVersion: '1.0', name: 'B', targetEntity: 'account', inputs: [{ name: 'band', type: 'Text' }], outputs: [{ name: 'decision', type: 'Text' }],
  logic: { type: 'decisionTable', hitPolicy: 'First', tableInputs: [{ field: 'band' }], outputColumns: ['decision'], rows: [{ cells: [{ operator: 'Equals', value: 'high' }], outputs: { decision: 'approve' } }], defaultRow: { outputs: { decision: 'review' } } } };

let pass = true;
const check = (label, ok, detail) => { pass = pass && ok; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); };

(async () => {
  const t = await token();
  let rA, vA, rB, vB, setId;
  const mkRule = async (name, pcrm) => {
    const rid = body(await raw('POST', `${API}/qdb_edp_rules`, t, { qdb_edp_rulename: 'ZZ Chain ' + name })).qdb_edp_ruleid;
    const vid = body(await raw('POST', `${API}/qdb_edp_ruleversions`, t, { qdb_edp_ruleversionname: 'ZZ Chain ' + name + ' v1', qdb_edp_versionnumber: 1, qdb_edp_lifecyclestate: PUBLISHED, qdb_edp_pcrmjson: JSON.stringify(pcrm), 'qdb_edp_ruleid@odata.bind': `/qdb_edp_rules(${rid})` })).qdb_edp_ruleversionid;
    return [rid, vid];
  };
  try {
    [rA, vA] = await mkRule('A', pcrmA);
    [rB, vB] = await mkRule('B', pcrmB);
    const members = [{ ruleVersionId: vA, key: 'a', order: 1 }, { ruleVersionId: vB, key: 'b', order: 2 }];
    setId = body(await raw('POST', `${API}/qdb_edp_rulesets`, t, { qdb_edp_rulesetname: 'ZZ Chain Set', qdb_edp_setpolicy: 'Collect', qdb_edp_membersjson: JSON.stringify(members) })).qdb_edp_rulesetid;
    console.log(`setup: A ${vA?.slice(0, 8)} (→band) · B ${vB?.slice(0, 8)} (band→decision) · set ${setId?.slice(0, 8)}\n`);

    const run = async (amount) => {
      const r = await raw('POST', `${API}/qdb_edp_ExecuteRuleSet`, t, { RuleSetId: setId, InputsJson: JSON.stringify({ amount }) });
      return JSON.parse(body(r).ResultJson).aggregate.outputs;
    };
    const hi = await run(2000);
    check('amount 2000 → A band=high, B chained → decision=approve', hi.band === 'high' && hi.decision === 'approve', JSON.stringify(hi));
    const lo = await run(500);
    check('amount 500 → A band=low, B chained → decision=review', lo.band === 'low' && lo.decision === 'review', JSON.stringify(lo));
  } finally {
    if (setId) await raw('DELETE', `${API}/qdb_edp_rulesets(${setId})`, t).catch(() => {});
    for (const v of [vA, vB]) if (v) await raw('DELETE', `${API}/qdb_edp_ruleversions(${v})`, t).catch(() => {});
    for (const r of [rA, rB]) if (r) await raw('DELETE', `${API}/qdb_edp_rules(${r})`, t).catch(() => {});
    console.log('\ncleanup: temp rules + versions + set deleted.');
  }
  console.log(`\n${pass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);
  process.exit(pass ? 0 : 1);
})();
