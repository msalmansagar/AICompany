const TENANT_ID='d79e793c-f6de-4204-8508-7980a63df957', CLIENT_ID='08e80e93-0bab-45ef-8372-2e554fa9af9b';
const DV='https://org5869857f.crm4.dynamics.com', BASE=`${DV}/api/data/v9.2`;
const t=await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:CLIENT_ID,client_secret:process.env.DV_CLIENT_SECRET,scope:`${DV}/.default`})}).then(r=>r.json());
const H={Authorization:`Bearer ${t.access_token}`,'OData-MaxVersion':'4.0','OData-Version':'4.0',Accept:'application/json','Content-Type':'application/json'};

const api=(await fetch(`${BASE}/customapis?$filter=uniquename eq 'qdb_GetPublishedFormJson'&$select=customapiid`,{headers:H}).then(r=>r.json())).value[0];
const p=(await fetch(`${BASE}/customapirequestparameters?$filter=_customapiid_value eq ${api.customapiid} and uniquename eq 'FormCode'&$select=customapirequestparameterid,name,displayname,description,type,isoptional`,{headers:H}).then(r=>r.json())).value[0];
if(!p){console.log('FormCode parameter not found');process.exit(1);}
if(p.isoptional){console.log('FormCode already optional — nothing to do');process.exit(0);}

// Keep the original wording so the API contract reads the same to callers.
const saved={ name:p.name, displayname:p.displayname, description:p.description, type:p.type };
console.log('captured:', JSON.stringify(saved));

const del=await fetch(`${BASE}/customapirequestparameters(${p.customapirequestparameterid})`,{method:'DELETE',headers:H});
console.log(`delete FormCode → ${del.status}`);
if(!del.ok){console.log((await del.text()).slice(0,250));process.exit(1);}

const re=await fetch(`${BASE}/customapirequestparameters`,{method:'POST',headers:{...H,Prefer:'return=representation'},body:JSON.stringify({
  uniquename:'FormCode',
  name:saved.name, displayname:saved.displayname,
  description: saved.description ?? 'qdb_form_code of the form. An alternative to FormId; supply one or the other.',
  type:saved.type, isoptional:true,
  'CustomAPIId@odata.bind':`/customapis(${api.customapiid})`,
})});
console.log(`recreate FormCode (optional) → ${re.status}`, re.ok?'':(await re.text()).slice(0,300));

const pub=await fetch(`${BASE}/PublishAllXml`,{method:'POST',headers:H,body:'{}'});
console.log(`PublishAllXml → ${pub.status}`);
const now=(await fetch(`${BASE}/customapirequestparameters?$filter=_customapiid_value eq ${api.customapiid}&$select=uniquename,isoptional`,{headers:H}).then(r=>r.json())).value;
for(const x of now) console.log(`   ${x.uniquename.padEnd(14)} optional=${x.isoptional}`);
