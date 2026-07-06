'use strict';
// Register the EDS read-only metadata/schema Functions (ADR-EDS-03) in Dataverse
// (BusinessRuleEngine solution): GetInputSchema, GetOutputSchema, GetRuleMetadata,
// GetPublishedVersion. One shared plugin type (RuleMetadataPlugin) backs all four;
// the plugin branches on the invoked message name. Idempotent. Then smoke-tests.
const fs = require('fs'), https = require('https');
const env = (() => { const o = {}; for (const l of fs.readFileSync('D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';
const SOLUTION = 'BusinessRuleEngine';
const DLL = 'D:/AI Projects/AICompany/projects/enterprise-decision-platform/runtime/pack/EDP.RuleRuntime.Crm.Signed.dll';
const ASSEMBLY_VERSION = '1.0.8.0';
const PLUGIN_TYPENAME = 'EDP.RuleRuntime.Crm.RuleMetadataPlugin';
const SEED_VERSION = '1a4a23bd-4f77-f111-ab0e-000d3abcff60'; // Loan Approval — Sample v1 (unpublished)
const PUBLISHED_RULE = '23f45b83-be77-f111-ab0e-000d3abcff60'; // a rule with a Published version

const FUNCTIONS = [
  { uniquename: 'qdb_edp_GetInputSchema', displayname: 'EDP Get Input Schema', description: 'Declared inputs (name/type/binding) of a rule version.' },
  { uniquename: 'qdb_edp_GetOutputSchema', displayname: 'EDP Get Output Schema', description: 'Declared outputs (name/type) of a rule version.' },
  { uniquename: 'qdb_edp_GetRuleMetadata', displayname: 'EDP Get Rule Metadata', description: 'Rule/version summary and declared-object counts.' },
  { uniquename: 'qdb_edp_GetPublishedVersion', displayname: 'EDP Get Published Version', description: 'Resolve a business identity to its published version.' },
];
const REQ_PARAMS = [
  { uniquename: 'RuleVersionId', displayname: 'Rule Version Id' },
  { uniquename: 'RuleId', displayname: 'Rule Id' },
  { uniquename: 'RuleName', displayname: 'Rule Name' },
  { uniquename: 'Version', displayname: 'Version Number' },
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

  // 1) assembly — PATCH content + version so the sandbox reloads.
  const asm = await first(t, 'pluginassemblies', "name eq 'EDP.RuleRuntime.Crm.Signed'", 'pluginassemblyid');
  if (!asm) throw new Error('assembly EDP.RuleRuntime.Crm.Signed not found — run bre-register.js first.');
  const b64 = fs.readFileSync(DLL).toString('base64');
  await raw('PATCH', `${API}/pluginassemblies(${asm.pluginassemblyid})`, t, { content: b64, version: ASSEMBLY_VERSION });
  console.log('assembly patched ->', ASSEMBLY_VERSION, asm.pluginassemblyid);

  // 2) one shared plugin type (branches on message name).
  let ptype = await first(t, 'plugintypes', `typename eq '${PLUGIN_TYPENAME}'`, 'plugintypeid');
  if (!ptype) {
    const r = await raw('POST', `${API}/plugintypes`, t, { 'pluginassemblyid@odata.bind': `/pluginassemblies(${asm.pluginassemblyid})`, typename: PLUGIN_TYPENAME, friendlyname: 'EDP Rule Metadata', name: PLUGIN_TYPENAME }, sol);
    if (r.status >= 300) throw new Error('plugintype ' + r.status + ' ' + r.body.slice(0, 300));
    ptype = j(r);
  }
  console.log('plugintype:', ptype.plugintypeid);

  // 3) four Custom API Functions.
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

    for (const p of REQ_PARAMS) {
      const ex = await first(t, 'customapirequestparameters', `uniquename eq '${p.uniquename}' and _customapiid_value eq ${capi.customapiid}`, 'customapirequestparameterid');
      if (ex) { continue; }
      const r = await raw('POST', `${API}/customapirequestparameters`, t, { uniquename: p.uniquename, name: p.uniquename, displayname: p.displayname, type: 10, isoptional: true, 'CustomAPIId@odata.bind': `/customapis(${capi.customapiid})` }, sol);
      console.log('  + req', p.uniquename, r.status >= 300 ? 'FAIL ' + r.body.slice(0, 160) : 'ok');
    }
    const rp = await first(t, 'customapiresponseproperties', `uniquename eq 'ResultJson' and _customapiid_value eq ${capi.customapiid}`, 'customapiresponsepropertyid');
    if (!rp) {
      const r = await raw('POST', `${API}/customapiresponseproperties`, t, { uniquename: 'ResultJson', name: 'ResultJson', displayname: 'Result JSON', type: 10, 'CustomAPIId@odata.bind': `/customapis(${capi.customapiid})` }, sol);
      console.log('  + resp ResultJson', r.status >= 300 ? 'FAIL ' + r.body.slice(0, 160) : 'ok');
    }
  }

  // 4) SMOKE — all four resolve by RuleVersionId (direct); plus published-resolution by RuleId.
  console.log('\n=== SMOKE ===');
  for (const fn of FUNCTIONS) {
    const call = await raw('GET', `${API}/${fn.uniquename}(RuleVersionId=@p)?@p=%27${SEED_VERSION}%27`, t);
    console.log(`${fn.uniquename} [byVersionId] ${call.status}: ${call.body.slice(0, 260)}`);
  }
  const pub = await raw('GET', `${API}/qdb_edp_GetPublishedVersion(RuleId=@p)?@p=%27${PUBLISHED_RULE}%27`, t);
  console.log(`qdb_edp_GetPublishedVersion [byRuleId->published] ${pub.status}: ${pub.body.slice(0, 260)}`);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
