const fs=require('fs'),https=require('https');
const env=(()=>{const o={};for(const l of fs.readFileSync((process.env.EDP_ENV_PATH || 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env'),'utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)o[m[1]]=m[2].trim();}return o;})();
const ORG=(env.DATAVERSE_URL).replace(/\/$/,''),HOST=new URL(ORG).host,API='/api/data/v9.2';
function raw(method,p,t,body){return new Promise((res,rej)=>{const data=body==null?null:JSON.stringify(body);const h={Accept:'application/json',Authorization:`Bearer ${t}`,'OData-Version':'4.0','OData-MaxVersion':'4.0','MSCRM.SolutionUniqueName':'BusinessRuleEngine'};if(data){h['Content-Type']='application/json';h['Content-Length']=Buffer.byteLength(data);}const r=https.request({host:HOST,path:p,method,headers:h},x=>{let b='';x.on('data',c=>b+=c);x.on('end',()=>res({status:x.statusCode,body:b}));});r.on('error',rej);if(data)r.write(data);r.end();});}
async function tok(){const f=`client_id=${env.AZURE_CLIENT_ID}&client_secret=${encodeURIComponent(env.AZURE_CLIENT_SECRET)}&grant_type=client_credentials&scope=${encodeURIComponent(ORG+'/.default')}`;const r=await new Promise((res,rej)=>{const q=https.request({host:'login.microsoftonline.com',path:`/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(f)}},x=>{let b='';x.on('data',c=>b+=c);x.on('end',()=>res(b));});q.on('error',rej);q.write(f);q.end();});return JSON.parse(r).access_token;}
const j=(r)=>{try{return JSON.parse(r.body);}catch{return{};}};
(async()=>{const t=await tok();
const capi=j(await raw('GET',`${API}/customapis?$filter=${encodeURIComponent("uniquename eq 'qdb_edp_EvaluateDecision'")}&$select=customapiid`,t)).value[0];
const ex=j(await raw('GET',`${API}/customapirequestparameters?$filter=${encodeURIComponent("uniquename eq 'RuleVersionId'")}&$select=customapirequestparameterid`,t)).value[0];
if(ex){const d=await raw('DELETE',`${API}/customapirequestparameters(${ex.customapirequestparameterid})`,t);console.log('delete RuleVersionId:',d.status);}
const c=await raw('POST',`${API}/customapirequestparameters`,t,{uniquename:'RuleVersionId',name:'RuleVersionId',displayname:'Rule Version Id',type:10,isoptional:true,'CustomAPIId@odata.bind':`/customapis(${capi.customapiid})`});
console.log('recreate optional:',c.status);
// retry smoke test
const pcrm={schemaVersion:'1.0',ruleId:'t',name:'t',targetEntity:'e',inputs:[{name:'x',binding:'x'}],logic:{type:'conditionSet',rules:[{when:{op:'and',conditions:[{field:'x',operator:'GreaterThan',value:10}]},then:{ok:true}}],otherwise:{ok:false}}};
const call=await raw('POST',`${API}/qdb_edp_EvaluateDecision`,t,{PcrmJson:JSON.stringify(pcrm),InputsJson:JSON.stringify({x:42})});
console.log('SMOKE status:',call.status);console.log('response:',call.body.slice(0,700));
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
