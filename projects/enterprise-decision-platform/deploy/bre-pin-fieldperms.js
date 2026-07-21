/* W0-3 step 2 — RUN AFTER the 3 pin columns are secured in the portal.
   Grants the "EDP - Manage Production Pin" profile full field permission
   (read+create+update) on the pin fields. Idempotent. 4 = Allowed, 0 = Not allowed.
   NOTE: securing a column hides it from anyone without a granting profile. The
   runtime SP is already a profile member (keeps read). After running this, VERIFY a
   non-privileged EvaluateDecision on a pinned rule still resolves; if pin reads break,
   add a broad read-only profile granting canread on these fields to all eval users. */
const fs = require('fs'), https = require('https');
const ENVFILE = 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env';
const env = {};
for (const l of fs.readFileSync(ENVFILE, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/\r$/, ''); }
const TENANT = env.AZURE_TENANT_ID, CLIENT = env.AZURE_CLIENT_ID, SECRET = env.AZURE_CLIENT_SECRET;
const URL = env.DATAVERSE_URL.replace(/\/$/, ''), HOST = URL.replace(/^https:\/\//, '');
const ENTITY = 'qdb_edp_ruleversion';
const FIELDS = ['qdb_edp_ispinned','qdb_edp_pinjustificationcode','qdb_edp_pinjustificationnote'];
const PROFILE = 'EDP - Manage Production Pin';
function req(host, path, method, headers, body) {
  return new Promise((z, x) => {
    const d = body != null ? JSON.stringify(body) : null;
    const h = { ...headers }; if (d) h['Content-Length'] = Buffer.byteLength(d);
    const r = https.request({ host, path, method, headers: h, timeout: 60000 }, (s) => { let b=''; s.on('data',c=>b+=c); s.on('end',()=>z({status:s.statusCode,body:b})); });
    r.on('error', x); r.on('timeout', ()=>r.destroy(new Error('t'))); if (d) r.write(d); r.end();
  });
}
function token(){ const b=`grant_type=client_credentials&client_id=${encodeURIComponent(CLIENT)}&client_secret=${encodeURIComponent(SECRET)}&scope=${encodeURIComponent(URL+'/.default')}`; return new Promise((z,x)=>{const r=https.request({host:'login.microsoftonline.com',path:`/${TENANT}/oauth2/v2.0/token`,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(b)}},s=>{let d='';s.on('data',c=>d+=c);s.on('end',()=>z(JSON.parse(d).access_token));});r.on('error',x);r.write(b);r.end();});}
function j(b){try{return JSON.parse(b);}catch{return null;}}
(async()=>{
  const tok=await token(); const H={Authorization:'Bearer '+tok,Accept:'application/json','OData-MaxVersion':'4.0','OData-Version':'4.0'}; const HW={...H,'Content-Type':'application/json'};
  const p=await req(HOST,encodeURI(`/api/data/v9.2/fieldsecurityprofiles?$select=fieldsecurityprofileid&$filter=name eq '${PROFILE}'`),'GET',H);
  const pid=((j(p.body)||{}).value||[])[0] && j(p.body).value[0].fieldsecurityprofileid;
  if(!pid){ console.log('profile not found — run w0-3-profile.js first'); return; }
  for(const f of FIELDS){
    const ex=await req(HOST,encodeURI(`/api/data/v9.2/fieldpermissions?$select=fieldpermissionid&$filter=attributelogicalname eq '${f}' and _fieldsecurityprofileid_value eq ${pid}`),'GET',H);
    if(((j(ex.body)||{}).value||[]).length){ console.log('  exists:',f); continue; }
    const body={ attributelogicalname:f, entityname:ENTITY, canread:4, cancreate:4, canupdate:4, 'fieldsecurityprofileid@odata.bind':`/fieldsecurityprofiles(${pid})` };
    const r=await req(HOST,'/api/data/v9.2/fieldpermissions','POST',HW,body);
    console.log('  grant',f,'->',r.status, r.status>=300?r.body.slice(0,160):'OK');
  }
  console.log('DONE. Verify: non-member cannot UPDATE pin fields; runtime pinned-resolution still works.');
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
