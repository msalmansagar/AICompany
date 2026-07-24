/* W0-1 pre-flight: capture the COMPLETE current EDP plugin registration graph so the
   post-rotation re-registration can be verified/reproduced exactly. Read-only. */
const fs = require('fs'), https = require('https');
const ENVFILE = process.env.EDP_ENV_PATH || 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env';
const env = {};
for (const l of fs.readFileSync(ENVFILE, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/\r$/, ''); }
const TENANT = env.AZURE_TENANT_ID, CLIENT = env.AZURE_CLIENT_ID, SECRET = env.AZURE_CLIENT_SECRET;
const URL = env.DATAVERSE_URL.replace(/\/$/, ''), HOST = URL.replace(/^https:\/\//, '');
const ASSEMBLY = 'EDP.RuleRuntime.Crm.Signed';
function req(host, path, method, headers) { return new Promise((z, x) => { const r = https.request({ host, path, method, headers, timeout: 60000 }, s => { let b=''; s.on('data',c=>b+=c); s.on('end',()=>z({status:s.statusCode,body:b})); }); r.on('error',x); r.on('timeout',()=>r.destroy(new Error('t'))); r.end(); }); }
function token(){ const b=`grant_type=client_credentials&client_id=${encodeURIComponent(CLIENT)}&client_secret=${encodeURIComponent(SECRET)}&scope=${encodeURIComponent(URL+'/.default')}`; return new Promise((z,x)=>{const r=https.request({host:'login.microsoftonline.com',path:`/${TENANT}/oauth2/v2.0/token`,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(b)}},s=>{let d='';s.on('data',c=>d+=c);s.on('end',()=>z(JSON.parse(d).access_token));});r.on('error',x);r.write(b);r.end();});}
const STAGE = { 10:'pre-validation', 20:'pre-operation', 40:'post-operation' };
const MODE = { 0:'sync', 1:'async' };
(async()=>{
  const tok=await token(); const H={Authorization:'Bearer '+tok,Accept:'application/json','OData-MaxVersion':'4.0','OData-Version':'4.0'};
  const get=(p)=>req(HOST,encodeURI('/api/data/v9.2/'+p),'GET',H).then(r=>{ const j=JSON.parse(r.body); return j.value||[]; });

  const asm=(await get(`pluginassemblies?$select=pluginassemblyid,name,version,publickeytoken,culture,isolationmode&$filter=name eq '${ASSEMBLY}'`))[0];
  if(!asm){ console.log('assembly not found'); return; }
  const types=await get(`plugintypes?$select=plugintypeid,typename,friendlyname&$filter=_pluginassemblyid_value eq ${asm.pluginassemblyid}`);

  const manifest={ capturedFor:'W0-1 re-registration pre-flight', assembly:{ name:asm.name, version:asm.version, publickeytoken:asm.publickeytoken, culture:asm.culture, isolationmode:asm.isolationmode }, pluginTypes:[], steps:[], customApis:[] };

  let stepCount=0, imageCount=0;
  for(const t of types){
    manifest.pluginTypes.push({ typename:t.typename, friendlyname:t.friendlyname });
    const steps=await get(`sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name,stage,mode,rank,filteringattributes,_sdkmessageid_value,_sdkmessagefilterid_value&$filter=_plugintypeid_value eq ${t.plugintypeid}&$expand=sdkmessageid($select=name)`);
    for(const s of steps){
      stepCount++;
      const imgs=await get(`sdkmessageprocessingstepimages?$select=name,entityalias,imagetype,messagepropertyname,attributes1&$filter=_sdkmessageprocessingstepid_value eq ${s.sdkmessageprocessingstepid}`).catch(()=>[]);
      imageCount+=imgs.length;
      manifest.steps.push({ plugin:t.typename, name:s.name, message:s.sdkmessageid&&s.sdkmessageid.name, stage:STAGE[s.stage]||s.stage, mode:MODE[s.mode]||s.mode, rank:s.rank, filteringattributes:s.filteringattributes||null,
        images: imgs.map(i=>({ name:i.name, alias:i.entityalias, type:i.imagetype===0?'pre':'post', property:i.messagepropertyname, attributes:i.attributes1||null })) });
    }
    // custom APIs backed by this type
    const apis=await get(`customapis?$select=uniquename,name,boundentitylogicalname,isfunction,executeprivilegename&$filter=_plugintypeid_value eq ${t.plugintypeid}`);
    for(const a of apis) manifest.customApis.push({ uniquename:a.uniquename, isfunction:!!a.isfunction, boundentity:a.boundentitylogicalname||null, executeprivilege:a.executeprivilegename||null, backedBy:t.typename });
  }
  // images (separate pass, all for the assembly's steps) — count via a broad query
  fs.writeFileSync('C:/Users/salma/AppData/Local/Temp/claude/D--AI-Projects-AICompany/ebeda561-ae0a-4c3a-96e1-caab002dcdc4/scratchpad/wave-0-registration-manifest.json', JSON.stringify(manifest,null,2));

  console.log('=== EDP REGISTRATION MANIFEST (current identity to re-create) ===');
  console.log('assembly :', asm.name, '| version', asm.version, '| token', asm.publickeytoken, '| isolation', asm.isolationmode);
  console.log('plugin types :', manifest.pluginTypes.length);
  for(const t of manifest.pluginTypes) console.log('   -', t.typename);
  console.log('sdk steps :', manifest.steps.length);
  const byMsg={}; for(const s of manifest.steps){ byMsg[s.message]=(byMsg[s.message]||0)+1; }
  console.log('   by message:', JSON.stringify(byMsg));
  console.log('step images :', imageCount);
  console.log('custom APIs :', manifest.customApis.length, '(', manifest.customApis.filter(a=>a.isfunction).length,'functions /', manifest.customApis.filter(a=>!a.isfunction).length,'actions )');
  console.log('saved -> wave-0-registration-manifest.json');
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
