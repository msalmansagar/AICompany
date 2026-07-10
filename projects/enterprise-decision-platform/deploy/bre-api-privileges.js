'use strict';
/* F-03 — restrict Custom API execution. Without an executeprivilegename, an unbound Custom
   API is callable by ANY authenticated user. This binds each EDP API to an existing entity
   privilege so only holders (via an EDP security role) can invoke it. Idempotent. */
const fs = require('fs'), https = require('https');
const env = (() => { const o = {}; for (const l of fs.readFileSync((process.env.EDP_ENV_PATH || 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL).replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';
const SOLUTION = 'BusinessRuleEngine';

// Privilege gate per capability (existing entity privileges — no custom-privilege authoring needed):
//   read  = prvReadqdb_edp_rule           -> any EDP role (business user and up); blocks non-EDP users
//   write = prvWriteqdb_edp_rule          -> authors/admin only (validate/test a rule)
//   gov   = prvReadqdb_edp_ruleapproval   -> governance actors (excludes pure consumers)
const PRIV = { read: 'prvReadqdb_edp_rule', write: 'prvWriteqdb_edp_rule', gov: 'prvReadqdb_edp_ruleapproval' };
const OVERRIDE = {
  qdb_edp_ValidateRule: 'write',
  qdb_edp_TestRule: 'write',
  qdb_edp_RuleGovernanceAction: 'gov',
};

function raw(method, p, t, body) {
  return new Promise((res, rej) => {
    const data = body == null ? null : JSON.stringify(body);
    const h = { Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', 'MSCRM.SolutionUniqueName': SOLUTION };
    if (t) h.Authorization = `Bearer ${t}`;
    if (data) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(data); }
    const req = https.request({ host: HOST, path: encodeURI(p), method, headers: h }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b })); });
    req.on('error', rej); if (data) req.write(data); req.end();
  });
}
async function token() { const f = `client_id=${env.AZURE_CLIENT_ID}&client_secret=${encodeURIComponent(env.AZURE_CLIENT_SECRET)}&grant_type=client_credentials&scope=${encodeURIComponent(ORG + '/.default')}`; const r = await new Promise((res, rej) => { const q = https.request({ host: 'login.microsoftonline.com', path: `/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(f) } }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res(b)); }); q.on('error', rej); q.write(f); q.end(); }); return JSON.parse(r).access_token; }
const j = (r) => { try { return JSON.parse(r.body); } catch { return {}; } };

(async () => {
  const t = await token();
  const apis = (j(await raw('GET', `${API}/customapis?$filter=startswith(uniquename,'qdb_edp_')&$select=customapiid,uniquename,executeprivilegename`, t)).value) || [];
  let set = 0;
  for (const a of apis) {
    const priv = PRIV[OVERRIDE[a.uniquename] || 'read'];
    if (a.executeprivilegename === priv) { console.log(`  = ${a.uniquename} already ${priv}`); continue; }
    const r = await raw('PATCH', `${API}/customapis(${a.customapiid})`, t, { executeprivilegename: priv });
    if (r.status < 300) { console.log(`  + ${a.uniquename} -> ${priv}`); set++; }
    else console.log(`  ! ${a.uniquename} FAIL ${r.status} ${r.body.slice(0, 160)}`);
  }
  console.log(`\nDONE — ${set} updated / ${apis.length} APIs. Non-EDP-role users can no longer invoke these APIs.`);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
