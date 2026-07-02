/**
 * DFE-FBE-002 — schema for: progress bar + multi-select lookup field type.
 * (Feature 3, infoCardStyle-empty, needs no schema.) Additive & idempotent.
 *
 *   qdb_form_definition.qdb_show_progress_bar (Boolean)
 *   qdb_field_type option value  multiLookup = 100000023
 *
 * Cloud-only (Azure AD client-creds). Run: node --env-file=scripts/.env scripts/provision-fbe2-schema.mjs
 */
const TENANT_ID='d79e793c-f6de-4204-8508-7980a63df957', CLIENT_ID='08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET=process.env.DV_CLIENT_SECRET, DATAVERSE_URL='https://org5869857f.crm4.dynamics.com';
const API_BASE=`${DATAVERSE_URL}/api/data/v9.2`;
if(!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET not set (pass --env-file=scripts/.env)');

async function acquireToken(){
  const body=new URLSearchParams({grant_type:'client_credentials',client_id:CLIENT_ID,client_secret:CLIENT_SECRET,scope:`${DATAVERSE_URL}/.default`});
  const r=await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const j=await r.json(); if(!r.ok) throw new Error(j.error_description); return j.access_token;
}
const lbl=t=>({'@odata.type':'Microsoft.Dynamics.CRM.Label',LocalizedLabels:[{'@odata.type':'Microsoft.Dynamics.CRM.LocalizedLabel',Label:t,LanguageCode:1033}]});
const h=t=>({Authorization:`Bearer ${t}`,'OData-MaxVersion':'4.0','OData-Version':'4.0',Accept:'application/json','Content-Type':'application/json'});
async function attrExists(t,e,s){return (await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${e}')/Attributes(LogicalName='${s}')?$select=LogicalName`,{headers:h(t)})).ok;}
async function post(t,p,b){const r=await fetch(`${API_BASE}/${p}`,{method:'POST',headers:h(t),body:JSON.stringify(b)});if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(`${p}: ${j.error?.message??r.status}`);}return r;}

async function main(){
  console.log('\n== DFE-FBE-002 schema ==\n');
  const t=await acquireToken(); console.log('✓ token\n');

  console.log('[1] qdb_show_progress_bar (Boolean) on qdb_form_definition');
  if(await attrExists(t,'qdb_form_definition','qdb_show_progress_bar')){console.log('  ↷ exists');}
  else{
    await post(t,`EntityDefinitions(LogicalName='qdb_form_definition')/Attributes`,{
      '@odata.type':'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
      SchemaName:'qdb_show_progress_bar',LogicalName:'qdb_show_progress_bar',DefaultValue:false,
      RequiredLevel:{Value:'None'},DisplayName:lbl('Show Progress Bar'),
      OptionSet:{'@odata.type':'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',TrueOption:{Value:1,Label:lbl('Yes')},FalseOption:{Value:0,Label:lbl('No')}},
    });
    console.log('  ✓ created');
  }

  console.log('\n[2] qdb_field_type += multiLookup (100000023)');
  const r=await fetch(`${API_BASE}/InsertOptionValue`,{method:'POST',headers:h(t),body:JSON.stringify({EntityLogicalName:'qdb_form_field',AttributeLogicalName:'qdb_field_type',Value:100000023,Label:lbl('multiLookup')})});
  if(r.ok) console.log('  ✓ inserted');
  else{const j=await r.json().catch(()=>({}));if((j.error?.message??'').match(/already exists|duplicate/i))console.log('  ↷ exists');else throw new Error(`InsertOptionValue: ${j.error?.message??r.status}`);}

  console.log('\n[Publish]');
  await post(t,'PublishXml',{ParameterXml:'<importexportxml><entities><entity>qdb_form_definition</entity><entity>qdb_form_field</entity></entities></importexportxml>'});
  console.log('  ✓ published\n✓ DFE-FBE-002 schema done.\n');
}
main().catch(e=>{console.error('\n✗',e.message);process.exit(1);});
