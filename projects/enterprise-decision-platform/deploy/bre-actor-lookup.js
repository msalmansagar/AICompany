'use strict';
/* F-06 — add a systemuser lookup (qdb_edp_actorid) to qdb_edp_ruleaudit + qdb_edp_ruleapproval
   so the actor joins natively instead of via a GUID string. Idempotent. */
const fs = require('fs'), https = require('https');
const ENV_PATH = process.env.EDP_ENV_PATH || 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env';
const SOLUTION = 'BusinessRuleEngine', PREFIX = 'qdb_edp_';
const env = (() => { const o = {}; for (const l of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';
const solHdr = { 'MSCRM.SolutionUniqueName': SOLUTION };

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

async function relExists(t, schema) { const r = await raw('GET', `${API}/RelationshipDefinitions(SchemaName='${schema}')?$select=SchemaName`, t); return r.status === 200; }

async function addActorLookup(t, child) {
  const schema = `${PREFIX}systemuser_${child}_actorid`;
  if (await relExists(t, schema)) { console.log('  = exists', schema); return; }
  const payload = {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata', SchemaName: schema,
    ReferencedEntity: 'systemuser', ReferencingEntity: PREFIX + child,
    Lookup: { '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata', SchemaName: PREFIX + 'actorid', RequiredLevel: req0, DisplayName: label('Actor') },
    CascadeConfiguration: { Assign: 'NoCascade', Delete: 'RemoveLink', Merge: 'NoCascade', Reparent: 'NoCascade', Share: 'NoCascade', Unshare: 'NoCascade' },
  };
  const r = await raw('POST', `${API}/RelationshipDefinitions`, t, payload, solHdr);
  console.log(r.status < 300 ? `  + actor lookup on qdb_edp_${child}` : `  ! FAIL ${child} ${r.status} ${r.body.slice(0, 300)}`);
}

(async () => {
  const t = await token();
  for (const child of ['ruleaudit', 'ruleapproval']) await addActorLookup(t, child);
  console.log('DONE');
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
