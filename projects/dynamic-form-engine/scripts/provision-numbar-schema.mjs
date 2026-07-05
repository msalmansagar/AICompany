/**
 * DFE-NUMBAR — schema for number/decimal/currency "bar" display mode.
 *   qdb_form_field.qdb_number_display_style (Picklist: Text box 100000001 / Bar 100000002)
 *   qdb_form_field.qdb_bar_max_field_schema (String) — schema name of the field providing the max
 * Additive & idempotent. Run: node --env-file=scripts/.env scripts/provision-numbar-schema.mjs
 */
const TENANT_ID='d79e793c-f6de-4204-8508-7980a63df957', CLIENT_ID='08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET=process.env.DV_CLIENT_SECRET, DATAVERSE_URL='https://org5869857f.crm4.dynamics.com';
const API_BASE=`${DATAVERSE_URL}/api/data/v9.2`;
if(!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET not set');

async function token(){
  const body=new URLSearchParams({grant_type:'client_credentials',client_id:CLIENT_ID,client_secret:CLIENT_SECRET,scope:`${DATAVERSE_URL}/.default`});
  const r=await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const j=await r.json(); if(!r.ok) throw new Error(j.error_description); return j.access_token;
}
const lbl=t=>({'@odata.type':'Microsoft.Dynamics.CRM.Label',LocalizedLabels:[{'@odata.type':'Microsoft.Dynamics.CRM.LocalizedLabel',Label:t,LanguageCode:1033}]});
const h=t=>({Authorization:`Bearer ${t}`,'OData-MaxVersion':'4.0','OData-Version':'4.0',Accept:'application/json','Content-Type':'application/json'});
async function attrExists(t,s){return (await fetch(`${API_BASE}/EntityDefinitions(LogicalName='qdb_form_field')/Attributes(LogicalName='${s}')?$select=LogicalName`,{headers:h(t)})).ok;}
async function post(t,p,b){const r=await fetch(`${API_BASE}/${p}`,{method:'POST',headers:h(t),body:JSON.stringify(b)});if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(`${p}: ${j.error?.message??r.status}`);}return r;}

async function main(){
  console.log('\n== DFE-NUMBAR schema ==\n');
  const t=await token(); console.log('✓ token\n');

  console.log('[1] qdb_number_display_style (Picklist Text box/Bar)');
  if(await attrExists(t,'qdb_number_display_style')) console.log('  ↷ exists');
  else{
    await post(t,`EntityDefinitions(LogicalName='qdb_form_field')/Attributes`,{
      '@odata.type':'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
      SchemaName:'qdb_number_display_style',LogicalName:'qdb_number_display_style',
      RequiredLevel:{Value:'None'},DisplayName:lbl('Number Display Style'),
      OptionSet:{'@odata.type':'Microsoft.Dynamics.CRM.OptionSetMetadata',IsGlobal:false,OptionSetType:'Picklist',
        Options:[{Value:100000001,Label:lbl('Text box')},{Value:100000002,Label:lbl('Bar')}]},
    });
    console.log('  ✓ created');
  }

  console.log('\n[2] qdb_bar_max_field_schema (String)');
  if(await attrExists(t,'qdb_bar_max_field_schema')) console.log('  ↷ exists');
  else{
    await post(t,`EntityDefinitions(LogicalName='qdb_form_field')/Attributes`,{
      '@odata.type':'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName:'qdb_bar_max_field_schema',LogicalName:'qdb_bar_max_field_schema',
      RequiredLevel:{Value:'None'},DisplayName:lbl('Bar Max Field Schema'),
      MaxLength:200,FormatName:{Value:'Text'},
    });
    console.log('  ✓ created');
  }

  console.log('\n[Publish]');
  await post(t,'PublishXml',{ParameterXml:'<importexportxml><entities><entity>qdb_form_field</entity></entities></importexportxml>'});
  console.log('  ✓ published\n✓ DFE-NUMBAR schema done.\n');
}
main().catch(e=>{console.error('\n✗',e.message);process.exit(1);});
