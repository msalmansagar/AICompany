// Live verification of reason codes through both API paths (TestRule + EvaluateDecision).
// Ad-hoc PCRM only — reads/writes nothing in the org.
const fs = require('fs'), https = require('https');
const ENV_PATH = process.env.EDP_ENV_PATH || 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env';
const env = (() => { const o = {}; for (const l of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';

function post(name, t, body) {
  return new Promise((res, rej) => {
    const data = JSON.stringify(body);
    const req = https.request({ host: HOST, path: `${API}/${name}`, method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', 'Content-Length': Buffer.byteLength(data), Authorization: `Bearer ${t}` } },
      r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b })); });
    req.on('error', rej); req.write(data); req.end();
  });
}
async function token() { const f = `client_id=${env.AZURE_CLIENT_ID}&client_secret=${encodeURIComponent(env.AZURE_CLIENT_SECRET)}&grant_type=client_credentials&scope=${encodeURIComponent(ORG + '/.default')}`; const r = await new Promise((res, rej) => { const q = https.request({ host: 'login.microsoftonline.com', path: `/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(f) } }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res(b)); }); q.on('error', rej); q.write(f); q.end(); }); return JSON.parse(r).access_token; }

const pcrm = (hitPolicy) => ({
  schemaVersion: '1.0', name: 'reason-probe', targetEntity: 'e',
  inputs: [{ name: 'score', type: 'WholeNumber' }], outputs: [{ name: 'tier', type: 'Text' }],
  logic: {
    type: 'decisionTable', hitPolicy, tableInputs: [{ field: 'score' }], outputColumns: ['tier'],
    rows: [
      { priority: 2, cells: [{ operator: 'GreaterThanOrEqual', value: 800 }], outputs: { tier: 'A' }, reasonCodes: ['HIGH_SCORE', 'SHARED'] },
      { priority: 1, cells: [{ any: true }], outputs: { tier: 'B' }, reasonCodes: ['CATCH_ALL', 'SHARED'] }
    ]
  }
});

let pass = true;
const check = (label, ok, detail) => { pass = pass && ok; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const t = await token();

  // TestRule path (ResultJson.reasonCodes)
  const tr = (r) => JSON.parse(JSON.parse(r.body).ResultJson).reasonCodes;
  const first850 = tr(await post('qdb_edp_TestRule', t, { PcrmJson: JSON.stringify(pcrm('First')), InputsJson: JSON.stringify({ score: 850 }) }));
  check('TestRule First: winning row codes', eq(first850, ['HIGH_SCORE', 'SHARED']), JSON.stringify(first850));

  const first100 = tr(await post('qdb_edp_TestRule', t, { PcrmJson: JSON.stringify(pcrm('First')), InputsJson: JSON.stringify({ score: 100 }) }));
  check('TestRule First: catch-all row codes', eq(first100, ['CATCH_ALL', 'SHARED']), JSON.stringify(first100));

  const all850 = tr(await post('qdb_edp_TestRule', t, { PcrmJson: JSON.stringify(pcrm('All')), InputsJson: JSON.stringify({ score: 850 }) }));
  check('TestRule All: union, deduped, ordered', eq(all850, ['HIGH_SCORE', 'SHARED', 'CATCH_ALL']), JSON.stringify(all850));

  // EvaluateDecision path (ReasonCodesJson) — the API the designer Test button uses
  const ed = await post('qdb_edp_EvaluateDecision', t, { PcrmJson: JSON.stringify(pcrm('First')), InputsJson: JSON.stringify({ score: 850 }) });
  const edCodes = JSON.parse(JSON.parse(ed.body).ReasonCodesJson);
  check('EvaluateDecision returns ReasonCodesJson', eq(edCodes, ['HIGH_SCORE', 'SHARED']), JSON.stringify(edCodes));

  console.log(`\n${pass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);
  process.exit(pass ? 0 : 1);
})();
