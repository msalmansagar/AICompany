const TENANT_ID='d79e793c-f6de-4204-8508-7980a63df957',CLIENT_ID='08e80e93-0bab-45ef-8372-2e554fa9af9b',CLIENT_SECRET=process.env.DV_CLIENT_SECRET,DV='https://org5869857f.crm4.dynamics.com',BASE=`${DV}/api/data/v9.2`;
const body=new URLSearchParams({grant_type:'client_credentials',client_id:CLIENT_ID,client_secret:CLIENT_SECRET,scope:`${DV}/.default`});
const t=await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}).then(r=>r.json()).then(j=>j.access_token);
const h={Authorization:`Bearer ${t}`,'OData-MaxVersion':'4.0','OData-Version':'4.0',Accept:'application/json','Content-Type':'application/json'};
const lbl=s=>({'@odata.type':'Microsoft.Dynamics.CRM.Label',LocalizedLabels:[{'@odata.type':'Microsoft.Dynamics.CRM.LocalizedLabel',Label:s,LanguageCode:1033}]});

async function addAttr(entity,payload){
  const r=await fetch(`${BASE}/EntityDefinitions(LogicalName='${entity}')/Attributes`,{method:'POST',headers:h,body:JSON.stringify(payload)});
  if(r.status===204||r.status===201){console.log(`  ✓ ${payload.LogicalName}`);return;}
  const j=await r.json().catch(()=>({}));
  if(!r.ok){if((j.error?.message||'').includes('already exists')){console.log(`  ↷ ${payload.LogicalName} exists`);return;}throw new Error(j.error?.message??r.status);}
  console.log(`  ✓ ${payload.LogicalName}`);
}

await addAttr('qdb_form_submission_log',{'@odata.type':'Microsoft.Dynamics.CRM.MemoAttributeMetadata',SchemaName:'qdb_grid_entries_json',LogicalName:'qdb_grid_entries_json',MaxLength:1048576,RequiredLevel:{Value:'None'},DisplayName:lbl('Grid Entries JSON')});
await addAttr('qdb_form_submission_log',{'@odata.type':'Microsoft.Dynamics.CRM.StringAttributeMetadata',SchemaName:'qdb_selected_record_ids',LogicalName:'qdb_selected_record_ids',MaxLength:2000,RequiredLevel:{Value:'None'},DisplayName:lbl('Selected Record IDs')});

const xml='<importexportxml><entities><entity>qdb_form_submission_log</entity></entities></importexportxml>';
await fetch(`${BASE}/PublishXml`,{method:'POST',headers:h,body:JSON.stringify({ParameterXml:xml})});
console.log('✓ Published');
