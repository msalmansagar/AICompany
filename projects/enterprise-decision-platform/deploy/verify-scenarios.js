// Live end-to-end proof of the scenario library + regression gate.
// Creates a throwaway rule, proves a failing scenario BLOCKS Publish and a passing one ALLOWS it,
// then deletes everything it created. Non-destructive to seed/real data.
const fs = require('fs'), https = require('https');
const ENV_PATH = process.env.EDP_ENV_PATH || 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env';
const env = (() => { const o = {}; for (const l of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';

function raw(method, path, t, body) {
  return new Promise((res, rej) => {
    const data = body == null ? null : JSON.stringify(body);
    const h = { Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Prefer: 'return=representation', Authorization: `Bearer ${t}` };
    if (data) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(data); }
    const req = https.request({ host: HOST, path, method, headers: h }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b })); });
    req.on('error', rej); if (data) req.write(data); req.end();
  });
}
async function token() { const f = `client_id=${env.AZURE_CLIENT_ID}&client_secret=${encodeURIComponent(env.AZURE_CLIENT_SECRET)}&grant_type=client_credentials&scope=${encodeURIComponent(ORG + '/.default')}`; const r = await new Promise((res, rej) => { const q = https.request({ host: 'login.microsoftonline.com', path: `/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(f) } }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res(b)); }); q.on('error', rej); q.write(f); q.end(); }); return JSON.parse(r).access_token; }
const body = (r) => { try { return JSON.parse(r.body); } catch { return {}; } };
const result = (r) => { try { return JSON.parse(body(r).ResultJson); } catch { return {}; } };

const PCRM = {
  schemaVersion: '1.0', name: 'Scenario Gate Probe', targetEntity: 'account',
  inputs: [{ name: 'score', type: 'Decimal' }], outputs: [{ name: 'tier', type: 'Text' }],
  logic: {
    type: 'decisionTable', hitPolicy: 'First', tableInputs: [{ field: 'score' }], outputColumns: ['tier'],
    rows: [
      { cells: [{ operator: 'GreaterThanOrEqual', value: 800 }], outputs: { tier: 'A' } },
      { cells: [{ any: true }], outputs: { tier: 'B' } }
    ]
  }
};
const scenarios = (expectedTier) => JSON.stringify([{ name: 'high score is tier A', inputs: { score: 850 }, expected: { tier: expectedTier } }]);
const gov = (t, versionId, action) => raw('POST', `${API}/qdb_edp_RuleGovernanceAction`, t, { RuleVersionId: versionId, Action: action });

let pass = true;
const check = (label, ok, detail) => { pass = pass && ok; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); };

(async () => {
  const t = await token();
  let ruleId, versionId, testId;
  try {
    // ── Arrange: throwaway rule + Draft version + a FAILING scenario ──
    ruleId = body(await raw('POST', `${API}/qdb_edp_rules`, t, { qdb_edp_rulename: 'ZZ Scenario Gate Probe' })).qdb_edp_ruleid;
    versionId = body(await raw('POST', `${API}/qdb_edp_ruleversions`, t, {
      qdb_edp_ruleversionname: 'ZZ Probe v1', qdb_edp_versionnumber: 1,
      qdb_edp_pcrmjson: JSON.stringify(PCRM), 'qdb_edp_ruleid@odata.bind': `/qdb_edp_rules(${ruleId})`
    })).qdb_edp_ruleversionid;
    testId = body(await raw('POST', `${API}/qdb_edp_ruletests`, t, {
      qdb_edp_ruletestname: 'ZZ Probe — scenarios', qdb_edp_testcasesjson: scenarios('WRONG'),
      'qdb_edp_ruleid@odata.bind': `/qdb_edp_rules(${ruleId})`
    })).qdb_edp_ruletestid;
    console.log(`setup: rule ${ruleId?.slice(0, 8)} · version ${versionId?.slice(0, 8)}\n`);

    // ── RunScenarios reports the failing scenario ──
    const failRun = result(await raw('POST', `${API}/qdb_edp_RunScenarios`, t, { PcrmJson: JSON.stringify(PCRM), RuleId: ruleId }));
    check('RunScenarios flags the failing scenario', failRun.failed === 1 && failRun.allPassed === false, `passed=${failRun.passed} failed=${failRun.failed}`);

    // ── Drive governance to Approved, then Publish must be BLOCKED by the gate ──
    await gov(t, versionId, 'Submit');
    await gov(t, versionId, 'Approve'); // Business
    await gov(t, versionId, 'Approve'); // Technical → Approved
    const blocked = await gov(t, versionId, 'Publish');
    check('Publish is blocked while a scenario fails', blocked.status >= 400 && /regression gate/i.test(blocked.body), body(blocked)?.error?.message?.slice(0, 90));

    // ── Fix the expectation; the same scenario now passes ──
    await raw('PATCH', `${API}/qdb_edp_ruletests(${testId})`, t, { qdb_edp_testcasesjson: scenarios('A') });
    const okRun = result(await raw('POST', `${API}/qdb_edp_RunScenarios`, t, { PcrmJson: JSON.stringify(PCRM), RuleId: ruleId }));
    check('RunScenarios passes after fixing the expectation', okRun.allPassed === true, `passed=${okRun.passed}/${okRun.total}`);

    // ── Publish now succeeds ──
    const published = await gov(t, versionId, 'Publish');
    check('Publish succeeds once scenarios pass', published.status === 200 && body(published).NewState === 'Published', body(published).NewState);
  } finally {
    // ── Cleanup (retire first — Published rows may block delete) ──
    if (versionId) { await gov(t, versionId, 'Retire').catch(() => {}); }
    if (testId) await raw('DELETE', `${API}/qdb_edp_ruletests(${testId})`, t).catch(() => {});
    if (versionId) await raw('DELETE', `${API}/qdb_edp_ruleversions(${versionId})`, t).catch(() => {});
    if (ruleId) await raw('DELETE', `${API}/qdb_edp_rules(${ruleId})`, t).catch(() => {});
    console.log('\ncleanup: temp rule/version/ruletest deleted.');
  }
  console.log(`\n${pass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);
  process.exit(pass ? 0 : 1);
})();
