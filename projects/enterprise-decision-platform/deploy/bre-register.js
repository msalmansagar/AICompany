'use strict';
// Register the EDP plugin assembly + Custom API (qdb_edp_EvaluateDecision) in Dataverse
// (BusinessRuleEngine solution), then smoke-test it. Idempotent.
const fs = require('fs'), https = require('https');
const env = (() => { const o = {}; for (const l of fs.readFileSync('D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';
const SOLUTION = 'BusinessRuleEngine';
const DLL = 'D:/AI Projects/AICompany/projects/enterprise-decision-platform/runtime/pack/EDP.RuleRuntime.Crm.Signed.dll';
const SEED_VERSION = '1a4a23bd-4f77-f111-ab0e-000d3abcff60'; // "Loan Approval — Sample" v1

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
  const b64 = fs.readFileSync(DLL).toString('base64');
  console.log('DLL base64 length:', b64.length);

  // 1) plugin assembly
  let asm = await first(t, 'pluginassemblies', "name eq 'EDP.RuleRuntime.Crm.Signed'", 'pluginassemblyid');
  if (asm) {
    await raw('PATCH', `${API}/pluginassemblies(${asm.pluginassemblyid})`, t, { content: b64, version: '1.0.4.0' });
    console.log('assembly updated:', asm.pluginassemblyid);
  } else {
    const r = await raw('POST', `${API}/pluginassemblies`, t, { name: 'EDP.RuleRuntime.Crm.Signed', content: b64, isolationmode: 2, sourcetype: 0, version: '1.0.0.0', culture: 'neutral', publickeytoken: '06949b1887fabe5d' }, sol);
    if (r.status >= 300) throw new Error('assembly ' + r.status + ' ' + r.body.slice(0, 300));
    asm = j(r); console.log('assembly created:', asm.pluginassemblyid);
  }

  // 2) plugin type
  let ptype = await first(t, 'plugintypes', "typename eq 'EDP.RuleRuntime.Crm.EvaluateDecisionPlugin'", 'plugintypeid');
  if (!ptype) {
    const r = await raw('POST', `${API}/plugintypes`, t, { 'pluginassemblyid@odata.bind': `/pluginassemblies(${asm.pluginassemblyid})`, typename: 'EDP.RuleRuntime.Crm.EvaluateDecisionPlugin', friendlyname: 'EDP EvaluateDecision', name: 'EDP.RuleRuntime.Crm.EvaluateDecisionPlugin' }, sol);
    if (r.status >= 300) throw new Error('plugintype ' + r.status + ' ' + r.body.slice(0, 300));
    ptype = j(r);
  }
  console.log('plugintype:', ptype.plugintypeid);

  // 3) custom api
  let capi = await first(t, 'customapis', "uniquename eq 'qdb_edp_EvaluateDecision'", 'customapiid');
  if (!capi) {
    const r = await raw('POST', `${API}/customapis`, t, {
      uniquename: 'qdb_edp_EvaluateDecision', name: 'qdb_edp_EvaluateDecision', displayname: 'EDP Evaluate Decision',
      description: 'Executes a published EDP rule version against inputs or a target record.',
      bindingtype: 0, boundentitylogicalname: '', isfunction: false, isprivate: false, allowedcustomprocessingsteptype: 0,
      'PluginTypeId@odata.bind': `/plugintypes(${ptype.plugintypeid})`,
    }, sol);
    if (r.status >= 300) throw new Error('customapi ' + r.status + ' ' + r.body.slice(0, 400));
    capi = j(r);
  }
  console.log('customapi:', capi.customapiid);

  // 4) request parameters
  const reqParams = [
    { uniquename: 'PcrmJson', displayname: 'PCRM JSON', type: 10, isoptional: true },
    { uniquename: 'RuleVersionId', displayname: 'Rule Version Id', type: 10, isoptional: true },
    { uniquename: 'InputsJson', displayname: 'Inputs JSON', type: 10, isoptional: true },
    { uniquename: 'TargetRef', displayname: 'Target Reference', type: 5, isoptional: true },
  ];
  for (const p of reqParams) {
    const ex = await first(t, 'customapirequestparameters', `uniquename eq '${p.uniquename}' and _customapiid_value eq ${capi.customapiid}`, 'customapirequestparameterid');
    if (ex) { await raw('PATCH', `${API}/customapirequestparameters(${ex.customapirequestparameterid})`, t, { isoptional: p.isoptional }); console.log('  ~ req param patched', p.uniquename); continue; }
    const r = await raw('POST', `${API}/customapirequestparameters`, t, { uniquename: p.uniquename, name: p.uniquename, displayname: p.displayname, type: p.type, isoptional: p.isoptional, 'CustomAPIId@odata.bind': `/customapis(${capi.customapiid})` }, sol);
    console.log('  + req param', p.uniquename, r.status >= 300 ? 'FAIL ' + r.body.slice(0, 200) : 'ok');
  }

  // 5) response properties
  const resProps = [
    { uniquename: 'Success', displayname: 'Success', type: 0 },
    { uniquename: 'Matched', displayname: 'Matched', type: 0 },
    { uniquename: 'OutputsJson', displayname: 'Outputs JSON', type: 10 },
    { uniquename: 'TraceJson', displayname: 'Trace JSON', type: 10 },
    { uniquename: 'DiagnosticsJson', displayname: 'Diagnostics JSON', type: 10 },
    { uniquename: 'ElapsedMs', displayname: 'Elapsed Ms', type: 7 },
  ];
  for (const p of resProps) {
    const ex = await first(t, 'customapiresponseproperties', `uniquename eq '${p.uniquename}' and _customapiid_value eq ${capi.customapiid}`, 'customapiresponsepropertyid');
    if (ex) { console.log('  = res prop', p.uniquename); continue; }
    const r = await raw('POST', `${API}/customapiresponseproperties`, t, { uniquename: p.uniquename, name: p.uniquename, displayname: p.displayname, type: p.type, 'CustomAPIId@odata.bind': `/customapis(${capi.customapiid})` }, sol);
    console.log('  + res prop', p.uniquename, r.status >= 300 ? 'FAIL ' + r.body.slice(0, 200) : 'ok');
  }

  // 6) SMOKE TEST — call the custom API with an ad-hoc PCRM (like the designer Test button)
  console.log('\n=== SMOKE TEST: qdb_edp_EvaluateDecision (PcrmJson) ===');
  const pcrm = { schemaVersion: '1.0', ruleId: 't', name: 't', targetEntity: 'e', inputs: [{ name: 'x', binding: 'x' }], logic: { type: 'conditionSet', rules: [{ when: { op: 'and', conditions: [{ field: 'x', operator: 'GreaterThan', value: 10 }] }, then: { ok: true } }], otherwise: { ok: false } } };
  const call = await raw('POST', `${API}/qdb_edp_EvaluateDecision`, t, {
    PcrmJson: JSON.stringify(pcrm),
    InputsJson: JSON.stringify({ x: 42 }),
  });
  console.log('status:', call.status);
  console.log('response:', call.body.slice(0, 700));
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
