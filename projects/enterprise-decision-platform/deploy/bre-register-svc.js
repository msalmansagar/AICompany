'use strict';
// Register the remaining Enterprise Decision Service operations (Phase 5) in Dataverse
// (BusinessRuleEngine): ValidateRule, TestRule, ExecuteDecisionTable, ExecuteRuleSet
// (Actions) + GetRuleHistory, GetRuleTemplates, GetRuleDocumentation (Functions). One
// shared plugin type (RuleServicePlugin) backs all seven. Idempotent. Then smoke-tests.
const fs = require('fs'), https = require('https');
const env = (() => { const o = {}; for (const l of fs.readFileSync('D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';
const SOLUTION = 'BusinessRuleEngine';
const DLL = 'D:/AI Projects/AICompany/projects/enterprise-decision-platform/runtime/pack/EDP.RuleRuntime.Crm.Signed.dll';
const ASSEMBLY_VERSION = '1.0.12.0';
const PLUGIN_TYPENAME = 'EDP.RuleRuntime.Crm.RuleServicePlugin';
const SEED_VERSION = '1a4a23bd-4f77-f111-ab0e-000d3abcff60';       // Loan Approval — Sample v1 (decision table)
const SEED_RULE = 'c9f1a5a9-4f77-f111-ab0e-70a8a55bc6a5';          // its rule

const FUNCTIONS = [
  { uniquename: 'qdb_edp_ValidateRule', displayname: 'EDP Validate Rule', isfunction: false, params: ['PcrmJson', 'RuleVersionId'] },
  { uniquename: 'qdb_edp_TestRule', displayname: 'EDP Test Rule', isfunction: false, params: ['PcrmJson', 'RuleVersionId', 'InputsJson'] },
  { uniquename: 'qdb_edp_ExecuteDecisionTable', displayname: 'EDP Execute Decision Table', isfunction: false, params: ['PcrmJson', 'RuleVersionId', 'InputsJson'] },
  { uniquename: 'qdb_edp_ExecuteRuleSet', displayname: 'EDP Execute Rule Set', isfunction: false, params: ['RuleSetId', 'RuleVersionIdsJson', 'InputsJson'] },
  { uniquename: 'qdb_edp_GetRuleHistory', displayname: 'EDP Get Rule History', isfunction: true, params: ['RuleId', 'RuleName', 'RuleVersionId'] },
  { uniquename: 'qdb_edp_GetRuleTemplates', displayname: 'EDP Get Rule Templates', isfunction: true, params: ['Industry'] },
  { uniquename: 'qdb_edp_GetRuleDocumentation', displayname: 'EDP Get Rule Documentation', isfunction: true, params: ['RuleId', 'RuleName', 'RuleVersionId'] },
];

function raw(method, path, token, body, extra) {
  return new Promise((res, rej) => {
    const data = body == null ? null : JSON.stringify(body);
    const h = { Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Prefer: 'return=representation', ...(extra || {}) };
    if (token) h.Authorization = `Bearer ${token}`;
    if (data) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(data); }
    const req = https.request({ host: HOST, path, method, headers: h }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b })); });
    req.on('error', rej); if (data) req.write(data); req.end();
  });
}
async function token() { const form = `client_id=${env.AZURE_CLIENT_ID}&client_secret=${encodeURIComponent(env.AZURE_CLIENT_SECRET)}&grant_type=client_credentials&scope=${encodeURIComponent(ORG + '/.default')}`; const r = await new Promise((res, rej) => { const req = https.request({ host: 'login.microsoftonline.com', path: `/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form) } }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res({ status: x.statusCode, body: b })); }); req.on('error', rej); req.write(form); req.end(); }); return JSON.parse(r.body).access_token; }
const sol = { 'MSCRM.SolutionUniqueName': SOLUTION };
const j = (r) => { try { return JSON.parse(r.body); } catch { return {}; } };
async function first(t, set, filter, select) { const r = await raw('GET', `${API}/${set}?$filter=${encodeURIComponent(filter)}&$select=${select}`, t); return (j(r).value || [])[0]; }

(async () => {
  const t = await token();

  const asm = await first(t, 'pluginassemblies', "name eq 'EDP.RuleRuntime.Crm.Signed'", 'pluginassemblyid');
  if (!asm) throw new Error('assembly not found — run bre-register.js first.');
  await raw('PATCH', `${API}/pluginassemblies(${asm.pluginassemblyid})`, t, { content: fs.readFileSync(DLL).toString('base64'), version: ASSEMBLY_VERSION });
  console.log('assembly patched ->', ASSEMBLY_VERSION);

  let ptype = await first(t, 'plugintypes', `typename eq '${PLUGIN_TYPENAME}'`, 'plugintypeid');
  if (!ptype) {
    const r = await raw('POST', `${API}/plugintypes`, t, { 'pluginassemblyid@odata.bind': `/pluginassemblies(${asm.pluginassemblyid})`, typename: PLUGIN_TYPENAME, friendlyname: 'EDP Rule Service', name: PLUGIN_TYPENAME }, sol);
    if (r.status >= 300) throw new Error('plugintype ' + r.status + ' ' + r.body.slice(0, 300));
    ptype = j(r);
  }
  console.log('plugintype:', ptype.plugintypeid);

  for (const fn of FUNCTIONS) {
    let capi = await first(t, 'customapis', `uniquename eq '${fn.uniquename}'`, 'customapiid');
    if (!capi) {
      const r = await raw('POST', `${API}/customapis`, t, {
        uniquename: fn.uniquename, name: fn.uniquename, displayname: fn.displayname, description: fn.displayname,
        bindingtype: 0, boundentitylogicalname: '', isfunction: fn.isfunction, isprivate: false, allowedcustomprocessingsteptype: 0,
        'PluginTypeId@odata.bind': `/plugintypes(${ptype.plugintypeid})`,
      }, sol);
      if (r.status >= 300) throw new Error(`customapi ${fn.uniquename} ${r.status} ${r.body.slice(0, 300)}`);
      capi = j(r);
    }
    console.log('customapi:', fn.uniquename, fn.isfunction ? '[Function]' : '[Action]');
    for (const p of fn.params) {
      const ex = await first(t, 'customapirequestparameters', `uniquename eq '${p}' and _customapiid_value eq ${capi.customapiid}`, 'customapirequestparameterid');
      if (ex) continue;
      const r = await raw('POST', `${API}/customapirequestparameters`, t, { uniquename: p, name: p, displayname: p, type: 10, isoptional: true, 'CustomAPIId@odata.bind': `/customapis(${capi.customapiid})` }, sol);
      if (r.status >= 300) console.log('  FAIL req', p, r.body.slice(0, 140));
    }
    const rp = await first(t, 'customapiresponseproperties', `uniquename eq 'ResultJson' and _customapiid_value eq ${capi.customapiid}`, 'customapiresponsepropertyid');
    if (!rp) {
      const r = await raw('POST', `${API}/customapiresponseproperties`, t, { uniquename: 'ResultJson', name: 'ResultJson', displayname: 'Result JSON', type: 10, 'CustomAPIId@odata.bind': `/customapis(${capi.customapiid})` }, sol);
      if (r.status >= 300) console.log('  FAIL resp', r.body.slice(0, 140));
    }
  }

  console.log('\n=== SMOKE ===');
  const inputs = JSON.stringify({ loanAmount: 600000, riskRating: 'High' });
  const post = async (name, body) => { const r = await raw('POST', `${API}/${name}`, t, body); return `${r.status}: ${r.status === 200 ? (JSON.parse(r.body).ResultJson || r.body).slice(0, 200) : r.body.slice(0, 200)}`; };
  const get = async (path) => { const r = await raw('GET', `${API}/${path}`, t); return `${r.status}: ${r.status === 200 ? (JSON.parse(r.body).ResultJson || '').slice(0, 200) : r.body.slice(0, 200)}`; };

  console.log('ValidateRule       ', await post('qdb_edp_ValidateRule', { RuleVersionId: SEED_VERSION }));
  console.log('TestRule           ', await post('qdb_edp_TestRule', { RuleVersionId: SEED_VERSION, InputsJson: inputs }));
  console.log('ExecuteDecisionTable', await post('qdb_edp_ExecuteDecisionTable', { RuleVersionId: SEED_VERSION, InputsJson: inputs }));
  console.log('ExecuteRuleSet     ', await post('qdb_edp_ExecuteRuleSet', { RuleVersionIdsJson: JSON.stringify([SEED_VERSION]), InputsJson: inputs }));
  console.log('GetRuleHistory     ', await get(`qdb_edp_GetRuleHistory(RuleId=@p)?@p=%27${SEED_RULE}%27`));
  console.log('GetRuleTemplates   ', await get('qdb_edp_GetRuleTemplates()'));
  console.log('GetRuleDocumentation', await get(`qdb_edp_GetRuleDocumentation(RuleId=@p)?@p=%27${SEED_RULE}%27`));
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
