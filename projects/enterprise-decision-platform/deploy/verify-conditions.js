// Live proof that a conditionSet PCRM (AND / OR / nested / NOT) — the shape the Condition
// builder emits — executes correctly through the runtime (TestRule). Ad-hoc PCRM, nothing stored.
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

// WHEN (revenue > 1000 AND score >= 700) OR vip == true → tier A, ELSE tier B
const pcrm = {
  schemaVersion: '1.0', name: 'cond-probe', targetEntity: 'account',
  inputs: [{ name: 'revenue', type: 'Decimal' }, { name: 'score', type: 'Decimal' }, { name: 'vip', type: 'Boolean' }, { name: 'blocked', type: 'Boolean' }],
  outputs: [{ name: 'tier', type: 'Text' }],
  logic: {
    type: 'conditionSet',
    rules: [{
      when: {
        op: 'or',
        conditions: [{ field: 'vip', operator: 'Equals', value: true }],
        groups: [{ op: 'and', conditions: [{ field: 'revenue', operator: 'GreaterThan', value: 1000 }, { field: 'score', operator: 'GreaterThanOrEqual', value: 700 }] }],
      },
      then: { tier: 'A' },
    }],
    otherwise: { tier: 'B' },
  },
};
// NOT variant: WHEN NOT(blocked == true) → tier OK
const notPcrm = {
  schemaVersion: '1.0', name: 'not-probe', targetEntity: 'account',
  inputs: [{ name: 'blocked', type: 'Boolean' }], outputs: [{ name: 'tier', type: 'Text' }],
  logic: { type: 'conditionSet', rules: [{ when: { op: 'and', negate: true, conditions: [{ field: 'blocked', operator: 'Equals', value: true }] }, then: { tier: 'OK' } }], otherwise: { tier: 'BLOCKED' } },
};

let pass = true;
const check = (label, ok, detail) => { pass = pass && ok; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); };

(async () => {
  const t = await token();
  const run = async (doc, inputs) => {
    const r = await post('qdb_edp_TestRule', t, { PcrmJson: JSON.stringify(doc), InputsJson: JSON.stringify(inputs) });
    return JSON.parse(JSON.parse(r.body).ResultJson).outputs?.tier;
  };
  check('AND branch true → A', await run(pcrm, { revenue: 2000, score: 800, vip: false }) === 'A');
  check('AND fails, vip false → B (else)', await run(pcrm, { revenue: 500, score: 800, vip: false }) === 'B');
  check('OR via vip → A', await run(pcrm, { revenue: 500, score: 100, vip: true }) === 'A');
  check('NOT(blocked) true → OK', await run(notPcrm, { blocked: false }) === 'OK');
  check('NOT(blocked) with blocked → BLOCKED', await run(notPcrm, { blocked: true }) === 'BLOCKED');
  console.log(`\n${pass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);
  process.exit(pass ? 0 : 1);
})();
