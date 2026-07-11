'use strict';
// Adds the effective-dating window columns to qdb_edp_ruleversion:
//   qdb_edp_effectivefrom, qdb_edp_effectiveto (both nullable DateAndTime).
// Idempotent — skips attributes that already exist. Publishes when done.
const fs = require('fs'), https = require('https');
const ENV_PATH = process.env.EDP_ENV_PATH || 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env';
const env = (() => { const o = {}; for (const l of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';
const SOLUTION = 'BusinessRuleEngine', PREFIX = 'qdb_edp_', ENTITY = 'qdb_edp_ruleversion';
const sol = { 'MSCRM.SolutionUniqueName': SOLUTION };

function raw(method, p, t, body, extra) {
  return new Promise((res, rej) => {
    const data = body == null ? null : JSON.stringify(body);
    const h = { Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', ...(extra || {}) };
    if (t) h.Authorization = `Bearer ${t}`;
    if (data) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(data); }
    const req = https.request({ host: HOST, path: p, method, headers: h }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b })); });
    req.on('error', rej); if (data) req.write(data); req.end();
  });
}
async function token() { const f = `client_id=${env.AZURE_CLIENT_ID}&client_secret=${encodeURIComponent(env.AZURE_CLIENT_SECRET)}&grant_type=client_credentials&scope=${encodeURIComponent(ORG + '/.default')}`; const r = await new Promise((res, rej) => { const q = https.request({ host: 'login.microsoftonline.com', path: `/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(f) } }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res(b)); }); q.on('error', rej); q.write(f); q.end(); }); return JSON.parse(r).access_token; }

const label = (t) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: t, LanguageCode: 1033 }] });
const req0 = { '@odata.type': 'Microsoft.Dynamics.CRM.AttributeRequiredLevelManagedProperty', Value: 'None', CanBeChanged: true, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' };
const dtAttr = (name, disp) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata', SchemaName: PREFIX + name, RequiredLevel: req0, Format: 'DateAndTime', DisplayName: label(disp) });

async function attrExists(t, logical) {
  const filter = encodeURIComponent(`LogicalName eq '${logical}'`);
  const r = await raw('GET', `${API}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes?$filter=${filter}&$select=LogicalName`, t);
  try { return (JSON.parse(r.body).value || []).length > 0; } catch { return false; }
}

(async () => {
  const t = await token();
  const attrs = [
    { name: 'effectivefrom', disp: 'Effective From' },
    { name: 'effectiveto', disp: 'Effective To' },
  ];
  for (const a of attrs) {
    const logical = PREFIX + a.name;
    if (await attrExists(t, logical)) { console.log('= exists', logical); continue; }
    const r = await raw('POST', `${API}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`, t, dtAttr(a.name, a.disp), sol);
    console.log((r.status < 300 ? '+ created ' : `FAIL ${r.status} `) + logical + (r.status < 300 ? '' : ' ' + r.body.slice(0, 200)));
  }
  const pub = await raw('POST', `${API}/PublishAllXml`, t, {});
  console.log('PublishAllXml', pub.status);
})();
