'use strict';
// Re-upload assembly, register GovernanceActionPlugin + qdb_edp_RuleGovernanceAction Custom API,
// then smoke-test Draft->Submit->Approve->Publish verifying state + approval + audit records.
const fs = require('fs'), https = require('https');
const env = (() => { const o = {}; for (const l of fs.readFileSync('D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL).replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';
const SOLUTION = 'BusinessRuleEngine';
const DLL = 'D:/AI Projects/AICompany/projects/enterprise-decision-platform/runtime/pack/EDP.RuleRuntime.Crm.Signed.dll';
function raw(method, p, t, body, extra) {
  return new Promise((res, rej) => {
    const data = body == null ? null : JSON.stringify(body);
    const h = { Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Prefer: 'return=representation', ...(extra || {}) };
    if (t) h.Authorization = `Bearer ${t}`;
    if (data) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(data); }
    const req = https.request({ host: HOST, path: p, method, headers: h }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b })); });
    req.on('error', rej); if (data) req.write(data); req.end();
  });
}
async function token() { const form = `client_id=${env.AZURE_CLIENT_ID}&client_secret=${encodeURIComponent(env.AZURE_CLIENT_SECRET)}&grant_type=client_credentials&scope=${encodeURIComponent(ORG + '/.default')}`; const r = await new Promise((res, rej) => { const req = https.request({ host: 'login.microsoftonline.com', path: `/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form) } }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res({ status: x.statusCode, body: b })); }); req.on('error', rej); req.write(form); req.end(); }); return JSON.parse(r.body).access_token; }
const sol = { 'MSCRM.SolutionUniqueName': SOLUTION };
const j = (r) => { try { return JSON.parse(r.body); } catch { return {}; } };
async function first(t, set, filter, select) { const r = await raw('GET', `${API}/${set}?$filter=${encodeURIComponent(filter)}&$select=${select}`, t); return (j(r).value || [])[0]; }

(async () => {
  const t = await token();
  // 1) re-upload assembly content
  const asm = await first(t, 'pluginassemblies', "name eq 'EDP.RuleRuntime.Crm.Signed'", 'pluginassemblyid');
  await raw('PATCH', `${API}/pluginassemblies(${asm.pluginassemblyid})`, t, { content: fs.readFileSync(DLL).toString('base64') });
  console.log('assembly re-uploaded:', asm.pluginassemblyid);

  // 2) plugintype
  let ptype = await first(t, 'plugintypes', "typename eq 'EDP.RuleRuntime.Crm.GovernanceActionPlugin'", 'plugintypeid');
  if (!ptype) {
    const r = await raw('POST', `${API}/plugintypes`, t, { 'pluginassemblyid@odata.bind': `/pluginassemblies(${asm.pluginassemblyid})`, typename: 'EDP.RuleRuntime.Crm.GovernanceActionPlugin', friendlyname: 'EDP Governance Action', name: 'EDP.RuleRuntime.Crm.GovernanceActionPlugin' }, sol);
    if (r.status >= 300) throw new Error('plugintype ' + r.status + ' ' + r.body.slice(0, 300));
    ptype = j(r);
  }
  console.log('plugintype:', ptype.plugintypeid);

  // 3) custom api
  let capi = await first(t, 'customapis', "uniquename eq 'qdb_edp_RuleGovernanceAction'", 'customapiid');
  if (!capi) {
    const r = await raw('POST', `${API}/customapis`, t, { uniquename: 'qdb_edp_RuleGovernanceAction', name: 'qdb_edp_RuleGovernanceAction', displayname: 'EDP Rule Governance Action', description: 'Maker-checker lifecycle transition (Submit/Approve/Reject/Publish/Retire) with audit.', bindingtype: 0, boundentitylogicalname: '', isfunction: false, isprivate: false, allowedcustomprocessingsteptype: 0, 'PluginTypeId@odata.bind': `/plugintypes(${ptype.plugintypeid})` }, sol);
    if (r.status >= 300) throw new Error('customapi ' + r.status + ' ' + r.body.slice(0, 400));
    capi = j(r);
  }
  console.log('customapi:', capi.customapiid);

  // 4) request params
  for (const p of [
    { u: 'RuleVersionId', t: 10, opt: false }, { u: 'Action', t: 10, opt: false }, { u: 'Comments', t: 10, opt: true },
  ]) {
    const ex = await first(t, 'customapirequestparameters', `uniquename eq '${p.u}' and _customapiid_value eq ${capi.customapiid}`, 'customapirequestparameterid');
    if (ex) { console.log('  = req', p.u); continue; }
    const r = await raw('POST', `${API}/customapirequestparameters`, t, { uniquename: p.u, name: p.u, displayname: p.u, type: p.t, isoptional: p.opt, 'CustomAPIId@odata.bind': `/customapis(${capi.customapiid})` }, sol);
    console.log('  + req', p.u, r.status >= 300 ? 'FAIL ' + r.body.slice(0, 150) : 'ok');
  }
  // 5) response props
  for (const p of [{ u: 'Success', t: 0 }, { u: 'NewState', t: 10 }, { u: 'Message', t: 10 }]) {
    const ex = await first(t, 'customapiresponseproperties', `uniquename eq '${p.u}' and _customapiid_value eq ${capi.customapiid}`, 'customapiresponsepropertyid');
    if (ex) { console.log('  = res', p.u); continue; }
    const r = await raw('POST', `${API}/customapiresponseproperties`, t, { uniquename: p.u, name: p.u, displayname: p.u, type: p.t, 'CustomAPIId@odata.bind': `/customapis(${capi.customapiid})` }, sol);
    console.log('  + res', p.u, r.status >= 300 ? 'FAIL ' + r.body.slice(0, 150) : 'ok');
  }

  // 6) SMOKE: create a draft rule+version, then Submit->Approve->Publish
  console.log('\n=== SMOKE: governance workflow ===');
  const rel = await raw('GET', `${API}/RelationshipDefinitions(SchemaName='qdb_edp_rule_ruleversion_ruleid')/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata?$select=ReferencingEntityNavigationPropertyName`, t);
  const nav = j(rel).ReferencingEntityNavigationPropertyName;
  const rule = j(await raw('POST', `${API}/qdb_edp_rules`, t, { qdb_edp_rulename: 'Governance Test Rule' }));
  const ver = j(await raw('POST', `${API}/qdb_edp_ruleversions`, t, { qdb_edp_ruleversionname: 'Governance Test v1', qdb_edp_versionnumber: 1, qdb_edp_lifecyclestate: 100000000, qdb_edp_pcrmjson: '{"schemaVersion":"1.0"}', [`${nav}@odata.bind`]: `/qdb_edp_rules(${rule.qdb_edp_ruleid})` }));
  const vid = ver.qdb_edp_ruleversionid;
  console.log('draft version:', vid);

  for (const action of ['Submit', 'Approve', 'Publish']) {
    const r = await raw('POST', `${API}/qdb_edp_RuleGovernanceAction`, t, { RuleVersionId: vid, Action: action, Comments: action + ' via smoke test' });
    console.log(`  ${action}:`, r.status, r.status < 300 ? j(r).Message + ' -> ' + j(r).NewState : r.body.slice(0, 200));
  }

  // 7) verify
  const finalV = j(await raw('GET', `${API}/qdb_edp_ruleversions(${vid})?$select=qdb_edp_lifecyclestate`, t));
  const apprs = j(await raw('GET', `${API}/qdb_edp_ruleapprovals?$filter=_qdb_edp_ruleversionid_value eq ${vid}&$select=qdb_edp_ruleapprovalname`, t)).value || [];
  const audits = j(await raw('GET', `${API}/qdb_edp_ruleaudits?$filter=_qdb_edp_ruleversionid_value eq ${vid}&$select=qdb_edp_action,qdb_edp_details`, t)).value || [];
  console.log('\nfinal lifecyclestate:', finalV['qdb_edp_lifecyclestate@OData.Community.Display.V1.FormattedValue'] || finalV.qdb_edp_lifecyclestate);
  console.log('approval records:', apprs.length, apprs.map(a => a.qdb_edp_ruleapprovalname).join(' | '));
  console.log('audit records:', audits.length, audits.map(a => a.qdb_edp_action + '(' + a.qdb_edp_details + ')').join(' | '));
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
