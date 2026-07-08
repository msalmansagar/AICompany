'use strict';
// Registers Phase-4/6 analysis Functions (RuleAnalysisPlugin) + the append-only guard
// steps (AppendOnlyGuardPlugin) in Dataverse (BusinessRuleEngine). Idempotent. Smoke-tests.
//   Functions: qdb_edp_GetDependencies, qdb_edp_CompareVersions, qdb_edp_ExplainRule, qdb_edp_AnalyzeRule
//   Guard steps: block Update+Delete on qdb_edp_ruleaudit + qdb_edp_ruleexecutionlog
const fs = require('fs'), https = require('https');
const env = (() => { const o = {}; for (const l of fs.readFileSync('D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';
const SOLUTION = 'BusinessRuleEngine';
const DLL = 'D:/AI Projects/AICompany/projects/enterprise-decision-platform/runtime/pack/EDP.RuleRuntime.Crm.Signed.dll';
const ASSEMBLY_VERSION = '1.0.9.0';
const ANALYSIS_TYPE = 'EDP.RuleRuntime.Crm.RuleAnalysisPlugin';
const GUARD_TYPE = 'EDP.RuleRuntime.Crm.AppendOnlyGuardPlugin';
const SEED = '1a4a23bd-4f77-f111-ab0e-000d3abcff60';
const OTHER = '26f45b83-be77-f111-ab0e-000d3abcff60';
const APPEND_ONLY_ENTITIES = ['qdb_edp_ruleaudit', 'qdb_edp_ruleexecutionlog'];

const FUNCTIONS = [
  { uniquename: 'qdb_edp_GetDependencies', displayname: 'EDP Get Dependencies', params: ['PcrmJson', 'RuleVersionId'] },
  { uniquename: 'qdb_edp_CompareVersions', displayname: 'EDP Compare Versions', params: ['RuleVersionIdA', 'RuleVersionIdB'] },
  { uniquename: 'qdb_edp_ExplainRule', displayname: 'EDP Explain Rule', params: ['PcrmJson', 'RuleVersionId'] },
  { uniquename: 'qdb_edp_AnalyzeRule', displayname: 'EDP Analyze Rule', params: ['PcrmJson', 'RuleVersionId'] },
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
async function ensureType(t, asmId, typename, friendly) {
  let p = await first(t, 'plugintypes', `typename eq '${typename}'`, 'plugintypeid');
  if (!p) { const r = await raw('POST', `${API}/plugintypes`, t, { 'pluginassemblyid@odata.bind': `/pluginassemblies(${asmId})`, typename, friendlyname: friendly, name: typename }, sol); p = j(r); }
  return p.plugintypeid;
}

(async () => {
  const t = await token();
  const asm = await first(t, 'pluginassemblies', "name eq 'EDP.RuleRuntime.Crm.Signed'", 'pluginassemblyid');
  await raw('PATCH', `${API}/pluginassemblies(${asm.pluginassemblyid})`, t, { content: fs.readFileSync(DLL).toString('base64'), version: ASSEMBLY_VERSION });
  console.log('assembly patched ->', ASSEMBLY_VERSION);

  // --- Analysis Functions ---
  const analysisType = await ensureType(t, asm.pluginassemblyid, ANALYSIS_TYPE, 'EDP Rule Analysis');
  console.log('analysis plugintype:', analysisType);
  for (const fn of FUNCTIONS) {
    let capi = await first(t, 'customapis', `uniquename eq '${fn.uniquename}'`, 'customapiid');
    if (!capi) {
      const r = await raw('POST', `${API}/customapis`, t, { uniquename: fn.uniquename, name: fn.uniquename, displayname: fn.displayname, description: fn.displayname, bindingtype: 0, boundentitylogicalname: '', isfunction: true, isprivate: false, allowedcustomprocessingsteptype: 0, 'PluginTypeId@odata.bind': `/plugintypes(${analysisType})` }, sol);
      if (r.status >= 300) throw new Error(`customapi ${fn.uniquename} ${r.status} ${r.body.slice(0, 200)}`);
      capi = j(r);
    }
    console.log('  customapi:', fn.uniquename);
    for (const p of fn.params) {
      const ex = await first(t, 'customapirequestparameters', `uniquename eq '${p}' and _customapiid_value eq ${capi.customapiid}`, 'customapirequestparameterid');
      if (!ex) await raw('POST', `${API}/customapirequestparameters`, t, { uniquename: p, name: p, displayname: p, type: 10, isoptional: true, 'CustomAPIId@odata.bind': `/customapis(${capi.customapiid})` }, sol);
    }
    const rp = await first(t, 'customapiresponseproperties', `uniquename eq 'ResultJson' and _customapiid_value eq ${capi.customapiid}`, 'customapiresponsepropertyid');
    if (!rp) await raw('POST', `${API}/customapiresponseproperties`, t, { uniquename: 'ResultJson', name: 'ResultJson', displayname: 'Result JSON', type: 10, 'CustomAPIId@odata.bind': `/customapis(${capi.customapiid})` }, sol);
  }

  // --- Append-only guard steps ---
  const guardType = await ensureType(t, asm.pluginassemblyid, GUARD_TYPE, 'EDP Append-Only Guard');
  console.log('guard plugintype:', guardType);
  const msgIds = {};
  for (const m of ['Update', 'Delete']) msgIds[m] = (await first(t, 'sdkmessages', `name eq '${m}'`, 'sdkmessageid')).sdkmessageid;
  for (const entity of APPEND_ONLY_ENTITIES) {
    for (const m of ['Update', 'Delete']) {
      const flt = await first(t, 'sdkmessagefilters', `primaryobjecttypecode eq '${entity}' and _sdkmessageid_value eq ${msgIds[m]}`, 'sdkmessagefilterid');
      if (!flt) { console.log('  ! no filter for', entity, m); continue; }
      const name = `EDP AppendOnly ${entity} ${m}`;
      const ex = await first(t, 'sdkmessageprocessingsteps', `name eq '${name}'`, 'sdkmessageprocessingstepid');
      if (ex) { console.log('  = step', name); continue; }
      const r = await raw('POST', `${API}/sdkmessageprocessingsteps`, t, {
        name, description: name, mode: 0, rank: 1, stage: 10, supporteddeployment: 0, invocationsource: 0,
        'eventhandler_plugintype@odata.bind': `/plugintypes(${guardType})`,
        'sdkmessageid@odata.bind': `/sdkmessages(${msgIds[m]})`,
        'sdkmessagefilterid@odata.bind': `/sdkmessagefilters(${flt.sdkmessagefilterid})`,
      }, sol);
      console.log('  + step', name, r.status >= 300 ? 'FAIL ' + r.body.slice(0, 160) : 'ok');
    }
  }

  // --- SMOKE ---
  console.log('\n=== SMOKE (analysis) ===');
  const get = async (path) => { const r = await raw('GET', `${API}/${path}`, t); return `${r.status}: ${r.status === 200 ? (JSON.parse(r.body).ResultJson || '').slice(0, 220) : r.body.slice(0, 200)}`; };
  console.log('GetDependencies ', await get(`qdb_edp_GetDependencies(RuleVersionId=@p)?@p=%27${SEED}%27`));
  console.log('CompareVersions ', await get(`qdb_edp_CompareVersions(RuleVersionIdA=@a,RuleVersionIdB=@b)?@a=%27${SEED}%27&@b=%27${OTHER}%27`));
  console.log('ExplainRule     ', await get(`qdb_edp_ExplainRule(RuleVersionId=@p)?@p=%27${SEED}%27`));
  console.log('AnalyzeRule     ', await get(`qdb_edp_AnalyzeRule(RuleVersionId=@p)?@p=%27${SEED}%27`));

  console.log('\n=== SMOKE (append-only guard — expect BLOCKED) ===');
  const anyLog = j(await raw('GET', `${API}/qdb_edp_ruleexecutionlogs?$select=qdb_edp_ruleexecutionlogid&$top=1`, t)).value?.[0];
  if (anyLog) {
    const upd = await raw('PATCH', `${API}/qdb_edp_ruleexecutionlogs(${anyLog.qdb_edp_ruleexecutionlogid})`, t, { qdb_edp_outcome: 'tampered' });
    const msg = (() => { try { return JSON.parse(upd.body).error.message; } catch { return upd.body.slice(0, 160); } })();
    console.log(`Update execution log -> ${upd.status} ${upd.status >= 400 ? 'BLOCKED ✓' : 'NOT BLOCKED ✗'}: ${msg.slice(0, 160)}`);
  } else console.log('no execution log row to test guard.');
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
