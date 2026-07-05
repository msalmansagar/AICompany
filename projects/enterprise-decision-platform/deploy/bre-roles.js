'use strict';
// Provision the 6 EDP security roles with per-role privileges. Deterministic: deletes
// any existing EDP roles, recreates fresh, assigns via AddPrivilegesRole (204-verified).
const fs = require('fs'), https = require('https');
const env = (() => { const o = {}; for (const l of fs.readFileSync('D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL).replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';
const SOLUTION = 'BusinessRuleEngine';
function raw(method, p, t, body, extra) {
  return new Promise((res, rej) => {
    const data = body == null ? null : JSON.stringify(body);
    const h = { Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Prefer: 'return=representation', ...(extra || {}) };
    if (t) h.Authorization = `Bearer ${t}`;
    if (data) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(data); }
    const req = https.request({ host: HOST, path: encodeURI(p), method, headers: h }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b })); });
    req.on('error', rej); if (data) req.write(data); req.end();
  });
}
async function token() { const f = `client_id=${env.AZURE_CLIENT_ID}&client_secret=${encodeURIComponent(env.AZURE_CLIENT_SECRET)}&grant_type=client_credentials&scope=${encodeURIComponent(ORG + '/.default')}`; const r = await new Promise((res, rej) => { const q = https.request({ host: 'login.microsoftonline.com', path: `/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(f) } }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res(b)); }); q.on('error', rej); q.write(f); q.end(); }); return JSON.parse(r).access_token; }
const j = (r) => { try { return JSON.parse(r.body); } catch { return {}; } };

const ROLES = [
  { key: 'admin', name: 'EDP Rule Administrator', depth: 'Global' },
  { key: 'author', name: 'EDP Rule Author', depth: 'Local' },
  { key: 'reviewer', name: 'EDP Rule Reviewer', depth: 'Local' },
  { key: 'publisher', name: 'EDP Rule Publisher', depth: 'Local' },
  { key: 'businessuser', name: 'EDP Business User', depth: 'Local' },
  { key: 'readonly', name: 'EDP Read-Only', depth: 'Local' },
];
const AUTHORING_OPS = ['Create', 'Read', 'Write', 'Delete', 'Append', 'AppendTo'];
const ENTITIES = ['rule', 'ruleversion', 'ruleapproval', 'ruleaudit', 'ruleexecutionlog', 'ruletest', 'rulesimulationrun', 'ruleanalytics', 'rulefunction', 'rulecategory', 'rulefolder', 'rulepackage', 'ruletemplate', 'ruletag', 'ruledocumentation', 'ruledependency', 'ruleconfiguration', 'featureflag', 'metadataentitydef', 'metadataattributedef', 'metadataoptionsetdef', 'ruleimportrecord'].map(s => 'qdb_edp_' + s);

function grant(roleKey, entity, op) {
  switch (roleKey) {
    case 'admin': return true;
    case 'author': return AUTHORING_OPS.includes(op);
    case 'reviewer': return op === 'Read' || (entity === 'qdb_edp_ruleapproval' && ['Create', 'Write', 'Append', 'AppendTo'].includes(op));
    case 'publisher': return op === 'Read' || (entity === 'qdb_edp_ruleversion' && op === 'Write');
    case 'businessuser': return op === 'Read' && ['qdb_edp_rule', 'qdb_edp_ruleversion', 'qdb_edp_ruleexecutionlog'].includes(entity);
    case 'readonly': return op === 'Read';
    default: return false;
  }
}

(async () => {
  const t = await token();
  const bu = (j(await raw('GET', `${API}/businessunits?$select=businessunitid&$filter=_parentbusinessunitid_value eq null`, t)).value || [])[0];

  // 1) delete existing EDP roles (client-side filter — role name filter is unreliable)
  const all = (j(await raw('GET', `${API}/roles?$select=name,roleid&$top=2000`, t)).value || []).filter(r => (r.name || '').startsWith('EDP Rule') || (r.name || '').startsWith('EDP Business') || (r.name || '').startsWith('EDP Read'));
  for (const r of all) { await raw('DELETE', `${API}/roles(${r.roleid})`, t); }
  console.log('deleted existing EDP roles:', all.length);

  // 2) privilege catalog from entity metadata (PrivilegeType is a string op)
  const parsed = [];
  for (const e of ENTITIES) {
    const md = j(await raw('GET', `${API}/EntityDefinitions(LogicalName='${e}')?$select=Privileges`, t));
    for (const pr of md.Privileges || []) parsed.push({ id: pr.PrivilegeId, op: pr.PrivilegeType, entity: e });
  }
  console.log('privileges catalog:', parsed.length);

  // 3) create + assign
  for (const role of ROLES) {
    const roleId = j(await raw('POST', `${API}/roles`, t, { name: role.name, 'businessunitid@odata.bind': `/businessunits(${bu.businessunitid})` }, { 'MSCRM.SolutionUniqueName': SOLUTION })).roleid;
    const selected = parsed.filter(p => grant(role.key, p.entity, p.op)).map(p => ({ Depth: role.depth, PrivilegeId: p.id }));
    const r = await raw('POST', `${API}/roles(${roleId})/Microsoft.Dynamics.CRM.AddPrivilegesRole`, t, { Privileges: selected });
    console.log(`${r.status < 300 ? '+' : '!'} ${role.name}: ${selected.length} privs @ ${role.depth}`, r.status < 300 ? 'ok' : r.body.slice(0, 200));
  }
  console.log('DONE');
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
