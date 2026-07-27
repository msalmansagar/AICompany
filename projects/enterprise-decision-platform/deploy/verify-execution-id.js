// Live proof that a decision can be explained: qdb_edp_EvaluateDecision returns the id of the
// execution log it wrote (ExecutionId), and that id resolves through qdb_edp_ExplainDecision.
// Before this shipped, ExplainDecision was unreachable — nothing handed the caller a log id.
// Requires assembly >= 1.0.24 deployed AND the ExecutionId response property registered
// (deploy/bre-register.js). Creates + cleans up its own rule.
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

// amount > 1000 → tier "high", else "low".
const pcrm = { schemaVersion: '1.0', name: 'ExecId', targetEntity: 'account', inputs: [{ name: 'amount', type: 'Decimal' }], outputs: [{ name: 'tier', type: 'Text' }],
  logic: { type: 'decisionTable', hitPolicy: 'First', tableInputs: [{ field: 'amount' }], outputColumns: ['tier'], rows: [{ cells: [{ operator: 'GreaterThan', value: 1000 }], outputs: { tier: 'high' } }], defaultRow: { outputs: { tier: 'low' } } } };

let pass = true;
const check = (label, ok, detail) => { pass = pass && ok; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); };

(async () => {
  const t = await token();
  let ruleId, versionId;
  try {
    ruleId = body(await raw('POST', `${API}/qdb_edp_rules`, t, { qdb_edp_rulename: 'ZZ ExecId' })).qdb_edp_ruleid;
    versionId = body(await raw('POST', `${API}/qdb_edp_ruleversions`, t, { qdb_edp_ruleversionname: 'ZZ ExecId v1', qdb_edp_versionnumber: 1, qdb_edp_lifecyclestate: PUBLISHED, qdb_edp_pcrmjson: JSON.stringify(pcrm), 'qdb_edp_ruleid@odata.bind': `/qdb_edp_rules(${ruleId})` })).qdb_edp_ruleversionid;
    console.log(`setup: version ${versionId?.slice(0, 8)}\n`);

    const decision = body(await raw('POST', `${API}/qdb_edp_EvaluateDecision`, t, { RuleVersionId: versionId, InputsJson: JSON.stringify({ amount: 5000 }) }));
    check('EvaluateDecision matched', decision.Matched === true, JSON.stringify(decision.OutputsJson));

    const executionId = decision.ExecutionId;
    check('EvaluateDecision returns a non-empty ExecutionId', typeof executionId === 'string' && executionId.length > 0, executionId);
    if (!executionId) throw new Error('No ExecutionId — assembly or response property not deployed.');

    const log = body(await raw('GET', `${API}/qdb_edp_ruleexecutionlogs(${executionId})?$select=qdb_edp_ruleexecutionlogid,qdb_edp_outcome`, t));
    check('ExecutionId addresses a real execution log', log.qdb_edp_ruleexecutionlogid === executionId, log.qdb_edp_outcome);

    const explained = body(await raw('GET', `${API}/qdb_edp_ExplainDecision(ExecutionLogId=@p)?@p=%27${executionId}%27`, t));
    const result = (() => { try { return JSON.parse(explained.ResultJson); } catch { return {}; } })();
    check('ExplainDecision resolves that id', result.executionLogId === executionId, result.outcome);
    check('Explanation is grounded in the traced decision', typeof result.business === 'string' && result.business.length > 0, result.business);
  } finally {
    if (versionId) await raw('DELETE', `${API}/qdb_edp_ruleversions(${versionId})`, t);
    if (ruleId) await raw('DELETE', `${API}/qdb_edp_rules(${ruleId})`, t);
  }
  console.log(`\n${pass ? 'ALL CHECKS PASSED' : 'FAILURES PRESENT'}`);
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
