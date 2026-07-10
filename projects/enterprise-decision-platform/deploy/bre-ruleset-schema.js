'use strict';
/* Creates the governed qdb_edp_ruleset entity (BusinessRuleEngine solution). Idempotent.
   A rule set owns its membership (membersjson) + aggregation policy (setpolicy), so the
   caller of qdb_edp_ExecuteRuleSet can't redefine what runs. */
const fs = require('fs'), https = require('https');
const ENV_PATH = 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env';
const SOLUTION = 'BusinessRuleEngine', PREFIX = 'qdb_edp_';
const env = (() => { const o = {}; for (const l of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';
const solHdr = { 'MSCRM.SolutionUniqueName': SOLUTION };

function raw(method, path, token, body, extra) {
  return new Promise((res, rej) => {
    const data = body == null ? null : JSON.stringify(body);
    const headers = { Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', ...(extra || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    const req = https.request({ host: HOST, path, method, headers }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b })); });
    req.on('error', rej); if (data) req.write(data); req.end();
  });
}
async function token() { const form = `client_id=${env.AZURE_CLIENT_ID}&client_secret=${encodeURIComponent(env.AZURE_CLIENT_SECRET)}&grant_type=client_credentials&scope=${encodeURIComponent(ORG + '/.default')}`; const r = await new Promise((res, rej) => { const req = https.request({ host: 'login.microsoftonline.com', path: `/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form) } }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res({ status: x.statusCode, body: b })); }); req.on('error', rej); req.write(form); req.end(); }); return JSON.parse(r.body).access_token; }

const label = (t) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: t, LanguageCode: 1033 }] });
const req0 = { '@odata.type': 'Microsoft.Dynamics.CRM.AttributeRequiredLevelManagedProperty', Value: 'None', CanBeChanged: true, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' };
const strAttr = (name, disp, max = 200, primary = false) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', SchemaName: PREFIX + name, RequiredLevel: req0, MaxLength: max, FormatName: { Value: 'Text' }, DisplayName: label(disp), IsPrimaryName: primary });
const memoAttr = (name, disp, max = 1048576) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', SchemaName: PREFIX + name, RequiredLevel: req0, MaxLength: max, DisplayName: label(disp) });

async function entityExists(t, logical) { const r = await raw('GET', `${API}/EntityDefinitions(LogicalName='${logical}')?$select=LogicalName`, t); return r.status === 200; }

(async () => {
  const t = await token();
  const logical = PREFIX + 'ruleset';
  if (await entityExists(t, logical)) { console.log('= entity exists:', logical); return; }
  const payload = {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata', SchemaName: PREFIX + 'ruleset',
    DisplayName: label('EDP Rule Set'), DisplayCollectionName: label('EDP Rule Sets'),
    OwnershipType: 'UserOwned', HasActivities: false, HasNotes: false, IsActivity: false,
    Attributes: [
      strAttr('rulesetname', 'Rule Set Name', 300, true),
      memoAttr('membersjson', 'Members (JSON)'),          // [{ruleId|ruleVersionId, key, order}]
      strAttr('setpolicy', 'Set Policy', 50),             // Collect | FirstMatch | Priority
      strAttr('description', 'Description', 2000),
    ],
  };
  const r = await raw('POST', `${API}/EntityDefinitions`, t, payload, solHdr);
  if (r.status >= 200 && r.status < 300) console.log('+ entity created:', logical);
  else { console.error('FAIL', r.status, r.body.slice(0, 500)); process.exit(1); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
