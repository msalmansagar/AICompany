'use strict';
// Register the Phase-6 Decision Intelligence read-only Functions (ADR-AI-02/05/07) in
// Dataverse (BusinessRuleEngine): ExplainDecision, GetAnalytics. One shared plugin type
// (DecisionIntelligencePlugin) backs both; the plugin branches on the message name.
// Idempotent. Then smoke-tests against the latest execution log row.
const fs = require('fs'), https = require('https');
const env = (() => { const o = {}; for (const l of fs.readFileSync('D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';
const SOLUTION = 'BusinessRuleEngine';
const DLL = 'D:/AI Projects/AICompany/projects/enterprise-decision-platform/runtime/pack/EDP.RuleRuntime.Crm.Signed.dll';
const ASSEMBLY_VERSION = '1.0.8.0';
const PLUGIN_TYPENAME = 'EDP.RuleRuntime.Crm.DecisionIntelligencePlugin';

const FUNCTIONS = [
  { uniquename: 'qdb_edp_ExplainDecision', displayname: 'EDP Explain Decision', description: 'Business + technical explanation of a recorded decision, grounded in its step-trace.', params: [{ uniquename: 'ExecutionLogId', displayname: 'Execution Log Id', isoptional: false }] },
  { uniquename: 'qdb_edp_GetAnalytics', displayname: 'EDP Get Analytics', description: 'Historical count/avg/max duration by outcome over the execution log.', params: [{ uniquename: 'RuleVersionId', displayname: 'Rule Version Id', isoptional: true }] },
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
    const r = await raw('POST', `${API}/plugintypes`, t, { 'pluginassemblyid@odata.bind': `/pluginassemblies(${asm.pluginassemblyid})`, typename: PLUGIN_TYPENAME, friendlyname: 'EDP Decision Intelligence', name: PLUGIN_TYPENAME }, sol);
    if (r.status >= 300) throw new Error('plugintype ' + r.status + ' ' + r.body.slice(0, 300));
    ptype = j(r);
  }
  console.log('plugintype:', ptype.plugintypeid);

  for (const fn of FUNCTIONS) {
    let capi = await first(t, 'customapis', `uniquename eq '${fn.uniquename}'`, 'customapiid');
    if (!capi) {
      const r = await raw('POST', `${API}/customapis`, t, {
        uniquename: fn.uniquename, name: fn.uniquename, displayname: fn.displayname, description: fn.description,
        bindingtype: 0, boundentitylogicalname: '', isfunction: true, isprivate: false, allowedcustomprocessingsteptype: 0,
        'PluginTypeId@odata.bind': `/plugintypes(${ptype.plugintypeid})`,
      }, sol);
      if (r.status >= 300) throw new Error(`customapi ${fn.uniquename} ${r.status} ${r.body.slice(0, 300)}`);
      capi = j(r);
    }
    console.log('customapi:', fn.uniquename, capi.customapiid);
    for (const p of fn.params) {
      const ex = await first(t, 'customapirequestparameters', `uniquename eq '${p.uniquename}' and _customapiid_value eq ${capi.customapiid}`, 'customapirequestparameterid');
      if (ex) { await raw('PATCH', `${API}/customapirequestparameters(${ex.customapirequestparameterid})`, t, { isoptional: p.isoptional }); continue; }
      const r = await raw('POST', `${API}/customapirequestparameters`, t, { uniquename: p.uniquename, name: p.uniquename, displayname: p.displayname, type: 10, isoptional: p.isoptional, 'CustomAPIId@odata.bind': `/customapis(${capi.customapiid})` }, sol);
      console.log('  + req', p.uniquename, r.status >= 300 ? 'FAIL ' + r.body.slice(0, 160) : 'ok');
    }
    const rp = await first(t, 'customapiresponseproperties', `uniquename eq 'ResultJson' and _customapiid_value eq ${capi.customapiid}`, 'customapiresponsepropertyid');
    if (!rp) {
      const r = await raw('POST', `${API}/customapiresponseproperties`, t, { uniquename: 'ResultJson', name: 'ResultJson', displayname: 'Result JSON', type: 10, 'CustomAPIId@odata.bind': `/customapis(${capi.customapiid})` }, sol);
      console.log('  + resp ResultJson', r.status >= 300 ? 'FAIL ' + r.body.slice(0, 160) : 'ok');
    }
  }

  // SMOKE — pick the latest log row that has a trace, explain it, then aggregate.
  console.log('\n=== SMOKE ===');
  const logs = await raw('GET', `${API}/qdb_edp_ruleexecutionlogs?$select=qdb_edp_ruleexecutionlogid,qdb_edp_outcome,qdb_edp_tracejson&$orderby=createdon%20desc&$top=20`, t);
  const withTrace = (j(logs).value || []).find(x => x.qdb_edp_tracejson) || (j(logs).value || [])[0];
  if (withTrace) {
    const ex = await raw('GET', `${API}/qdb_edp_ExplainDecision(ExecutionLogId=@p)?@p=%27${withTrace.qdb_edp_ruleexecutionlogid}%27`, t);
    console.log('ExplainDecision', ex.status + ':', ex.status === 200 ? JSON.parse(JSON.parse(ex.body).ResultJson).business : ex.body.slice(0, 200));
  } else {
    console.log('ExplainDecision: no log rows to explain.');
  }
  const an = await raw('GET', `${API}/qdb_edp_GetAnalytics()`, t);
  console.log('GetAnalytics', an.status + ':', an.status === 200 ? JSON.parse(an.body).ResultJson : an.body.slice(0, 200));
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
