/* Register ProductionPinJustificationPlugin (ADR-14 / ADR-12 layer 1).
   Targets the ACTIVE runtime assembly — the plug-in package assembly (ADR-18) — resolved from
   registration/rule-engine-registration.json. In a plug-in package Dataverse creates the plugin
   types when the package is uploaded, so this script never creates one: it binds steps to the
   type that already exists in the active assembly and stops if that type is missing.
   This is its own, separately authorised live change (not part of A7). When it runs, move the
   pin-guard steps from contract.notYetRegistered into contract.entitySteps, or a7-repoint.mjs
   will (correctly) refuse to run on seeing steps the contract does not declare.
   Registers a synchronous (mode 0) pre-operation (stage 20) step on Create and Update of
   qdb_edp_ruleversion, filtered to the pin fields, with a PreImage on Update. Idempotent.

   Auth: reads the SP creds from process.env.EDP_ENV_PATH || the DFE backend .env (F-09). */
const fs = require('fs'), https = require('https');
const { ACTIVE_ASSEMBLY_NAME } = require('./lib/runtime-target.cjs');
const ENVFILE = process.env.EDP_ENV_PATH || 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env';
const env = {};
for (const l of fs.readFileSync(ENVFILE, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/\r$/, ''); }
const TENANT = env.AZURE_TENANT_ID, CLIENT = env.AZURE_CLIENT_ID, SECRET = env.AZURE_CLIENT_SECRET;
const URL = env.DATAVERSE_URL.replace(/\/$/, ''), HOST = URL.replace(/^https:\/\//, '');

const ASSEMBLY = ACTIVE_ASSEMBLY_NAME;
const TYPENAME = 'EDP.RuleRuntime.Crm.ProductionPinJustificationPlugin';
const ENTITY = 'qdb_edp_ruleversion';
const PIN_ATTRS = 'qdb_edp_ispinned,qdb_edp_pinjustificationcode,qdb_edp_pinjustificationnote';

function req(host, path, method, headers, body) {
  return new Promise((z, x) => {
    const d = body != null ? JSON.stringify(body) : null;
    const h = { ...headers }; if (d) h['Content-Length'] = Buffer.byteLength(d);
    const r = https.request({ host, path, method, headers: h, timeout: 60000 }, (s) => { let b=''; s.on('data',c=>b+=c); s.on('end',()=>z({status:s.statusCode,body:b,headers:s.headers})); });
    r.on('error', x); r.on('timeout', ()=>r.destroy(new Error('timeout'))); if (d) r.write(d); r.end();
  });
}
function token(){ const b=`grant_type=client_credentials&client_id=${encodeURIComponent(CLIENT)}&client_secret=${encodeURIComponent(SECRET)}&scope=${encodeURIComponent(URL+'/.default')}`; return new Promise((z,x)=>{const r=https.request({host:'login.microsoftonline.com',path:`/${TENANT}/oauth2/v2.0/token`,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(b)}},s=>{let d='';s.on('data',c=>d+=c);s.on('end',()=>z(JSON.parse(d).access_token));});r.on('error',x);r.write(b);r.end();});}
const j = b => { try { return JSON.parse(b); } catch { return null; } };

async function main() {
  const tok = await token();
  const H = { Authorization: 'Bearer ' + tok, Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' };
  const HW = { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const get = (p) => req(HOST, encodeURI('/api/data/v9.2/' + p), 'GET', H).then(r => (j(r.body) || {}).value || []);
  const create = (set, body) => req(HOST, '/api/data/v9.2/' + set, 'POST', HW, body);

  // 1. the plugin type, scoped to the active assembly — never an unscoped name lookup, which
  //    with two assemblies loaded would bind to whichever copy the query happened to return.
  const asm = (await get(`pluginassemblies?$select=pluginassemblyid&$filter=name eq '${ASSEMBLY}'`))[0];
  if (!asm) throw new Error(`active assembly '${ASSEMBLY}' not found — upload the plug-in package first`);
  const type = (await get(`plugintypes?$select=plugintypeid&$filter=typename eq '${TYPENAME}' and _pluginassemblyid_value eq ${asm.pluginassemblyid}`))[0];
  if (!type) throw new Error(`'${TYPENAME}' is not in '${ASSEMBLY}' — the uploaded package does not contain the pin guard`);
  const typeId = type.plugintypeid;

  // 2. steps for Create + Update
  for (const message of ['Create', 'Update']) {
    const msg = (await get(`sdkmessages?$select=sdkmessageid&$filter=name eq '${message}'`))[0];
    const filter = (await get(`sdkmessagefilters?$select=sdkmessagefilterid&$filter=primaryobjecttypecode eq '${ENTITY}' and _sdkmessageid_value eq ${msg.sdkmessageid}`))[0];
    const stepName = `EDP PinGuard ${ENTITY} ${message}`;
    // Identity is (message, table filter, handler) — a display name is not an identity.
    const existing = (await get(`sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid&$filter=_sdkmessageid_value eq ${msg.sdkmessageid} and _eventhandler_value eq ${typeId}` +
      (filter ? ` and _sdkmessagefilterid_value eq ${filter.sdkmessagefilterid}` : '')))[0];
    if (existing) { console.log('step exists:', stepName); continue; }
    const body = {
      name: stepName, mode: 0, rank: 1, stage: 20, supporteddeployment: 0, invocationsource: 0, asyncautodelete: false,
      'sdkmessageid@odata.bind': `/sdkmessages(${msg.sdkmessageid})`,
      'eventhandler_plugintype@odata.bind': `/plugintypes(${typeId})`,
    };
    if (filter) body['sdkmessagefilterid@odata.bind'] = `/sdkmessagefilters(${filter.sdkmessagefilterid})`;
    if (message === 'Update') body.filteringattributes = PIN_ATTRS;
    const r = await create('sdkmessageprocessingsteps', body);
    if (r.status >= 300) { console.log('  step FAIL', message, r.status, r.body.slice(0, 180)); continue; }
    const stepId = j(r.body).sdkmessageprocessingstepid;
    console.log('registered step:', stepName);

    // 3. pre-image (Update only — Create has no pre-image)
    if (message === 'Update') {
      const img = await create('sdkmessageprocessingstepimages', {
        name: 'PreImage', entityalias: 'PreImage', imagetype: 0, messagepropertyname: 'Target', attributes1: PIN_ATTRS,
        'sdkmessageprocessingstepid@odata.bind': `/sdkmessageprocessingsteps(${stepId})`,
      });
      console.log('  pre-image ->', img.status, img.status >= 300 ? img.body.slice(0, 160) : 'OK');
    }
  }
  console.log('\nDONE. Verify per wave-0-pin-governance-verification.md (VP-3/VP-4/VP-6 now enforce justification in prod).');
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
