// seed-fbe2-demo.mjs — DFE-FBE-002 demo: progress bar + multi-select lookup.
// Idempotent: deletes any prior 'fbe2-demo' first.
// Run: node --env-file=scripts/.env scripts/seed-fbe2-demo.mjs

const T=process.env.DV_TENANT_ID,C=process.env.DV_CLIENT_ID,S=process.env.DV_CLIENT_SECRET,U=process.env.DV_DATAVERSE_URL;
const FORM_CODE='fbe2-demo';
const STATUS_ACTIVE=100000001, FIELD_TEXT=100000001, FIELD_MULTILOOKUP=100000023, SPAN2=100000002, COLS2=100000002;

const tok=(await(await fetch(`https://login.microsoftonline.com/${T}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:C,client_secret:S,scope:`${U}/.default`})})).json()).access_token;
const base=`${U}/api/data/v9.2`;
const h={Authorization:`Bearer ${tok}`,Accept:'application/json','Content-Type':'application/json','OData-MaxVersion':'4.0','OData-Version':'4.0'};
const get=async p=>(await(await fetch(`${base}/${p}`,{headers:h})).json()).value||[];
const del=async(set,id)=>fetch(`${base}/${set}(${id})`,{method:'DELETE',headers:h});
async function create(set,body){const r=await fetch(`${base}/${set}`,{method:'POST',headers:{...h,Prefer:'return=representation'},body:JSON.stringify(body)});if(!r.ok)throw new Error(`create ${set} ${r.status}: ${(await r.text()).slice(0,300)}`);return r.json();}

for(const f of await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`)){
  const fid=f.qdb_form_definitionid;
  for(const t of await get(`qdb_form_tabs?$filter=_qdb_form_definition_id_value eq ${fid}&$select=qdb_form_tabid`)){
    for(const s of await get(`qdb_form_sections?$filter=_qdb_form_tab_id_value eq ${t.qdb_form_tabid}&$select=qdb_form_sectionid`)){
      for(const fl of await get(`qdb_form_fields?$filter=_qdb_form_section_id_value eq ${s.qdb_form_sectionid}&$select=qdb_form_fieldid`)){
        for(const lc of await get(`qdb_form_lookup_configs?$filter=_qdb_form_field_id_value eq ${fl.qdb_form_fieldid}&$select=qdb_form_lookup_configid`)) await del('qdb_form_lookup_configs',lc.qdb_form_lookup_configid);
        await del('qdb_form_fields',fl.qdb_form_fieldid);
      }
      await del('qdb_form_sections',s.qdb_form_sectionid);
    }
    await del('qdb_form_tabs',t.qdb_form_tabid);
  }
  await del('qdb_form_definitions',fid);
}
console.log('cleared any prior fbe2-demo');

// form — progress bar ON
const form=await create('qdb_form_definitions',{qdb_form_code:FORM_CODE,qdb_title:'FBE2 Demo',qdb_status:STATUS_ACTIVE,qdb_version:1,qdb_show_progress_bar:true,qdb_confirmation_message:'Submitted — progress bar + multi-lookup demo.'});
const formId=form.qdb_form_definitionid;
console.log('+ form FBE2 Demo',formId,'(showProgressBar=true)');

async function tab(label,order){return create('qdb_form_tabs',{qdb_label:label,qdb_display_order:order,qdb_is_visible:true,qdb_requires_previous_tab_complete:false,qdb_hide_tab_bar:false,'qdb_form_definition_id@odata.bind':`/qdb_form_definitions(${formId})`});}
async function section(tabId,label,order){return create('qdb_form_sections',{qdb_label:label,qdb_display_order:order,qdb_columns:COLS2,qdb_is_collapsible:false,qdb_is_collapsed_by_default:false,qdb_is_visible:true,'qdb_form_tab_id@odata.bind':`/qdb_form_tabs(${tabId})`});}
async function field(sectionId,type,label,schema,order,required,extra={}){return create('qdb_form_fields',{qdb_field_type:type,qdb_schema_name:schema,qdb_label:label,qdb_column_span:SPAN2,qdb_is_required:required,qdb_is_readonly:false,qdb_is_hidden:false,qdb_display_order:order,'qdb_form_section_id@odata.bind':`/qdb_form_sections(${sectionId})`,...extra});}

const t1=await tab('Details',1);
const s1=await section(t1.qdb_form_tabid,'Applicant',1);
await field(s1.qdb_form_sectionid,FIELD_TEXT,'Full Name','qdb_fbe2_name',10,true);
await field(s1.qdb_form_sectionid,FIELD_TEXT,'Email','qdb_fbe2_email',20,true);
// multi-select lookup → systemuser; add a lookup config record so it can search
const ml=await field(s1.qdb_form_sectionid,FIELD_MULTILOOKUP,'Team Members','qdb_fbe2_team',30,true);
await create('qdb_form_lookup_configs',{qdb_entity_logical_name:'systemuser',qdb_display_attribute:'fullname',qdb_value_attribute:'systemuserid',qdb_search_min_chars:1,qdb_max_results:10,'qdb_form_field_id@odata.bind':`/qdb_form_fields(${ml.qdb_form_fieldid})`});
console.log('  + tab 1: Full Name, Email (required) + Team Members (multi-lookup → systemuser)');

const t2=await tab('Extra',2);
const s2=await section(t2.qdb_form_tabid,'More',1);
await field(s2.qdb_form_sectionid,FIELD_TEXT,'Notes','qdb_fbe2_notes',10,true);
console.log('  + tab 2: Notes (required)');

console.log(`\nDONE — 'fbe2-demo' created. Portal: fill fields and watch the % bar climb; add multiple team members.`);
