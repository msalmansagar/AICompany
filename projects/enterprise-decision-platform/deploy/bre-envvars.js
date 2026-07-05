'use strict';
/* Create BusinessRuleEngine environment variables (idempotent) + add to solution. */
const fs=require('fs'),https=require('https');
const ENV_PATH='D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env';
const SOLUTION='BusinessRuleEngine';
function loadEnv(p){const o={};for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)o[m[1]]=m[2].trim();}return o;}
const env=loadEnv(ENV_PATH);
const ORG=(env.DATAVERSE_URL||'https://org5869857f.crm4.dynamics.com').replace(/\/$/,'');
const HOST=new URL(ORG).host, API='/api/data/v9.2';
function raw(method,path,token,body,extra){return new Promise((res,rej)=>{const data=body==null?null:JSON.stringify(body);const headers={Accept:'application/json','OData-Version':'4.0','OData-MaxVersion':'4.0',...(extra||{})};if(token)headers.Authorization=`Bearer ${token}`;if(data){headers['Content-Type']='application/json';headers['Content-Length']=Buffer.byteLength(data);}const req=https.request({host:HOST,path,method,headers},r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>res({status:r.statusCode,body:b}));});req.on('error',rej);if(data)req.write(data);req.end();});}
async function token(){const form=`client_id=${env.AZURE_CLIENT_ID}&client_secret=${encodeURIComponent(env.AZURE_CLIENT_SECRET)}&grant_type=client_credentials&scope=${encodeURIComponent(ORG+'/.default')}`;const r=await new Promise((res,rej)=>{const req=https.request({host:'login.microsoftonline.com',path:`/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(form)}},x=>{let b='';x.on('data',c=>b+=c);x.on('end',()=>res({status:x.statusCode,body:b}));});req.on('error',rej);req.write(form);req.end();});if(r.status!==200)throw new Error('token '+r.status);return JSON.parse(r.body).access_token;}
const solHdr={'MSCRM.SolutionUniqueName':SOLUTION};
const log=(...a)=>console.log(new Date().toISOString().slice(11,19),...a);
// type: 100000000 String, 100000001 Number, 100000002 Boolean, 100000003 JSON
const VARS=[
 {schema:'qdb_edp_EnvironmentSettings',disp:'EDP Environment Settings',type:100000003,def:'{}'},
 {schema:'qdb_edp_IsProductionEnvironment',disp:'EDP Is Production Environment',type:100000002,def:'no'},
];
async function exists(t,schema){const q=encodeURIComponent(`schemaname eq '${schema}'`);const r=await raw('GET',`${API}/environmentvariabledefinitions?$filter=${q}&$select=schemaname`,t);try{return (JSON.parse(r.body).value||[]).length>0;}catch{return false;}}
(async()=>{
  const t=await token();log('AUTH ok');let ok=0;
  for(const v of VARS){
    if(await exists(t,v.schema)){log('= envvar exists',v.schema);ok++;continue;}
    const payload={schemaname:v.schema,displayname:v.disp,type:v.type,defaultvalue:v.def};
    const r=await raw('POST',`${API}/environmentvariabledefinitions`,t,payload,solHdr);
    if(r.status>=200&&r.status<300){log('+ envvar',v.schema);ok++;}
    else log('! envvar FAIL',v.schema,r.status,r.body.slice(0,300));
  }
  log('envvars ok:',ok,'/',VARS.length);
  const pub=await raw('POST',`${API}/PublishAllXml`,t,{});log('publish',pub.status);
  log('ENVVARS DONE');
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
