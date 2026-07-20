/* W0-3 (field-level security path): create the "EDP - Manage Production Pin"
   field security profile + add the runtime service principal as a member.
   Inert until the pin columns are secured (portal step). Field permissions are
   staged separately (w0-3-fieldperms.js) to run AFTER columns are secured. */
const fs = require('fs'), https = require('https');
const ENVFILE = 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env';
const env = {};
for (const l of fs.readFileSync(ENVFILE, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/\r$/, ''); }
const TENANT = env.AZURE_TENANT_ID, CLIENT = env.AZURE_CLIENT_ID, SECRET = env.AZURE_CLIENT_SECRET;
const URL = env.DATAVERSE_URL.replace(/\/$/, ''), HOST = URL.replace(/^https:\/\//, '');
function req(host, path, method, headers, body) {
  return new Promise((res2, rej) => {
    const data = body != null ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const h = { ...headers }; if (data) h['Content-Length'] = Buffer.byteLength(data);
    const r = https.request({ host, path, method, headers: h, timeout: 60000 }, (res) => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>res2({status:res.statusCode,body:b,headers:res.headers})); });
    r.on('error', rej); r.on('timeout', ()=>r.destroy(new Error('timeout'))); if (data) r.write(data); r.end();
  });
}
function token(){ const body=`grant_type=client_credentials&client_id=${encodeURIComponent(CLIENT)}&client_secret=${encodeURIComponent(SECRET)}&scope=${encodeURIComponent(URL+'/.default')}`; return new Promise((z,x)=>{const r=https.request({host:'login.microsoftonline.com',path:`/${TENANT}/oauth2/v2.0/token`,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)}},s=>{let b='';s.on('data',c=>b+=c);s.on('end',()=>z(JSON.parse(b).access_token));});r.on('error',x);r.write(body);r.end();});}
function j(b){try{return JSON.parse(b);}catch{return null;}}
const NAME = 'EDP - Manage Production Pin';
(async()=>{
  const tok=await token();
  const H={Authorization:'Bearer '+tok,Accept:'application/json','OData-MaxVersion':'4.0','OData-Version':'4.0'};
  const HW={...H,'Content-Type':'application/json'};

  // 1. profile (idempotent)
  let prof = await req(HOST, encodeURI(`/api/data/v9.2/fieldsecurityprofiles?$select=fieldsecurityprofileid,name&$filter=name eq '${NAME}'`), 'GET', H);
  let pid = ((j(prof.body)||{}).value||[])[0] && (j(prof.body).value[0].fieldsecurityprofileid);
  if (!pid) {
    const c = await req(HOST, '/api/data/v9.2/fieldsecurityprofiles', 'POST', {...HW, Prefer:'return=representation'}, { name: NAME, description: 'ADR-12 amendment: gates write access to version-pin fields (qdb_edp_ispinned / pinjustificationcode / pinjustificationnote). Members = pin managers + runtime identity.' });
    pid = j(c.body) && j(c.body).fieldsecurityprofileid;
    console.log('created profile:', pid, '(status', c.status + ')');
  } else console.log('profile exists:', pid);

  // 2. find the runtime service-principal application user
  const su = await req(HOST, encodeURI(`/api/data/v9.2/systemusers?$select=systemuserid,fullname,applicationid&$filter=applicationid eq ${CLIENT}`), 'GET', H);
  const app = ((j(su.body)||{}).value||[])[0];
  if (!app) { console.log('WARN: no application user found for client id'); return; }
  console.log('runtime app user:', app.systemuserid, '|', app.fullname);

  // 3. add as member of the profile (idempotent-ish; ignore dup error)
  const assoc = await req(HOST, `/api/data/v9.2/fieldsecurityprofiles(${pid})/systemuserprofiles_association/$ref`, 'POST', HW, { '@odata.id': `${URL}/api/data/v9.2/systemusers(${app.systemuserid})` });
  console.log('add member ->', assoc.status, assoc.status>=300 ? assoc.body.slice(0,160) : 'OK');

  console.log('\nPROFILE READY. profileId=' + pid + ' appUserId=' + app.systemuserid);
  console.log('Next: after the pin columns are secured in the portal, run w0-3-fieldperms.js to grant field permissions.');
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
