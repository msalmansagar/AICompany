// Live verification that TableCompletenessAnalyzer findings surface through ValidateRule.
const fs = require('fs'), https = require('https');
const ENV_PATH = process.env.EDP_ENV_PATH || 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env';
const env = (() => { const o = {}; for (const l of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';

function raw(method, p, t, body) {
  return new Promise((res, rej) => {
    const data = body == null ? null : JSON.stringify(body);
    const h = { Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Authorization: `Bearer ${t}` };
    if (data) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(data); }
    const req = https.request({ host: HOST, path: p, method, headers: h }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b })); });
    req.on('error', rej); if (data) req.write(data); req.end();
  });
}
async function token() { const f = `client_id=${env.AZURE_CLIENT_ID}&client_secret=${encodeURIComponent(env.AZURE_CLIENT_SECRET)}&grant_type=client_credentials&scope=${encodeURIComponent(ORG + '/.default')}`; const r = await new Promise((res, rej) => { const q = https.request({ host: 'login.microsoftonline.com', path: `/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(f) } }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res(b)); }); q.on('error', rej); q.write(f); q.end(); }); return JSON.parse(r).access_token; }

// Unreachable row (row 2 >500000 is covered by row 1 >=0) + no catch-all → expect EDP020 + EDP023.
const pcrm = {
  schemaVersion: '1.0', name: 'completeness-probe', targetEntity: 'e',
  inputs: [{ name: 'amt', type: 'Decimal' }], outputs: [{ name: 'r', type: 'Text' }],
  logic: {
    type: 'decisionTable', hitPolicy: 'First', tableInputs: [{ field: 'amt' }], outputColumns: ['r'],
    rows: [
      { cells: [{ operator: 'GreaterThanOrEqual', value: 0 }], outputs: { r: 'a' } },
      { cells: [{ operator: 'GreaterThan', value: 500000 }], outputs: { r: 'b' } }
    ]
  }
};

(async () => {
  const t = await token();
  const r = await raw('POST', `${API}/qdb_edp_ValidateRule`, t, { PcrmJson: JSON.stringify(pcrm) });
  const body = JSON.parse(JSON.parse(r.body).ResultJson); // Custom API wraps the result in ResultJson
  const codes = (body.diagnostics || []).map(d => d.code);
  console.log('HTTP', r.status);
  console.log('diagnostics:', JSON.stringify(body.diagnostics, null, 2));
  const want = ['EDP020', 'EDP023'];
  const got = want.filter(c => codes.includes(c));
  console.log(`\nExpected ${want.join(', ')} — found ${got.join(', ') || 'NONE'}`);
  process.exit(got.length === want.length ? 0 : 1);
})();
