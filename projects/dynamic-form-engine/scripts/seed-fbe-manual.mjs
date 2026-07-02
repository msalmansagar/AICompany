// seed-fbe-manual.mjs — DFE-FBE-001 Manual-summary demo form.
// Summary Mode = Manual: a designer-built "Review & Submit" tab (isSummaryTab) whose
// data-bound Label fields mirror the entered values read-only. Also shows tab descriptions,
// section icons, and a static Label heading.
// Idempotent: deletes any prior 'fbe-manual' first.
//
// Run: node --env-file=scripts/.env scripts/seed-fbe-manual.mjs

const T=process.env.DV_TENANT_ID,C=process.env.DV_CLIENT_ID,S=process.env.DV_CLIENT_SECRET,U=process.env.DV_DATAVERSE_URL;
const FORM_CODE='fbe-manual';
const STATUS_ACTIVE=100000001, FIELD_TEXT=100000001, FIELD_LABEL=100000022;
const SPAN2=100000002, COLS2=100000002, SUMMARY_MANUAL=100000003;

const tok=(await(await fetch(`https://login.microsoftonline.com/${T}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:C,client_secret:S,scope:`${U}/.default`})})).json()).access_token;
const base=`${U}/api/data/v9.2`;
const h={Authorization:`Bearer ${tok}`,Accept:'application/json','Content-Type':'application/json','OData-MaxVersion':'4.0','OData-Version':'4.0'};
const get=async p=>(await(await fetch(`${base}/${p}`,{headers:h})).json()).value||[];
const del=async(set,id)=>fetch(`${base}/${set}(${id})`,{method:'DELETE',headers:h});
async function create(set,body){const r=await fetch(`${base}/${set}`,{method:'POST',headers:{...h,Prefer:'return=representation'},body:JSON.stringify(body)});if(!r.ok)throw new Error(`create ${set} ${r.status}: ${(await r.text()).slice(0,300)}`);return r.json();}

// ── idempotent cleanup ──
for(const f of await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`)){
  const fid=f.qdb_form_definitionid;
  for(const t of await get(`qdb_form_tabs?$filter=_qdb_form_definition_id_value eq ${fid}&$select=qdb_form_tabid`)){
    for(const s of await get(`qdb_form_sections?$filter=_qdb_form_tab_id_value eq ${t.qdb_form_tabid}&$select=qdb_form_sectionid`)){
      for(const fl of await get(`qdb_form_fields?$filter=_qdb_form_section_id_value eq ${s.qdb_form_sectionid}&$select=qdb_form_fieldid`)) await del('qdb_form_fields',fl.qdb_form_fieldid);
      await del('qdb_form_sections',s.qdb_form_sectionid);
    }
    await del('qdb_form_tabs',t.qdb_form_tabid);
  }
  await del('qdb_form_definitions',fid);
}
console.log('cleared any prior fbe-manual');

// ── form (Summary Mode = Manual) ──
const form=await create('qdb_form_definitions',{
  qdb_form_code:FORM_CODE, qdb_title:'FBE Manual Summary', qdb_status:STATUS_ACTIVE, qdb_version:1,
  qdb_summary_mode:SUMMARY_MANUAL,
  qdb_confirmation_message:'Submitted — thanks for reviewing on the manual summary tab.',
});
const formId=form.qdb_form_definitionid;
console.log('+ form FBE Manual Summary',formId,'(summaryMode=Manual)');

const bindTab=id=>`/qdb_form_tabs(${id})`, bindSec=id=>`/qdb_form_sections(${id})`;
async function tab(label,desc,order,isSummary=false){return create('qdb_form_tabs',{qdb_label:label,qdb_display_order:order,qdb_is_visible:true,qdb_requires_previous_tab_complete:false,qdb_hide_tab_bar:false,qdb_description:desc,qdb_is_summary_tab:isSummary,'qdb_form_definition_id@odata.bind':`/qdb_form_definitions(${formId})`});}
async function section(tabId,label,icon,order){return create('qdb_form_sections',{qdb_label:label,qdb_display_order:order,qdb_columns:COLS2,qdb_is_collapsible:false,qdb_is_collapsed_by_default:false,qdb_is_visible:true,qdb_icon_name:icon,'qdb_form_tab_id@odata.bind':bindTab(tabId)});}
async function field(sectionId,type,label,schema,order,extra={}){return create('qdb_form_fields',{qdb_field_type:type,qdb_schema_name:schema,qdb_label:label,qdb_column_span:SPAN2,qdb_is_required:false,qdb_is_readonly:false,qdb_is_hidden:false,qdb_display_order:order,'qdb_form_section_id@odata.bind':bindSec(sectionId),...extra});}

// ── Tab 1 — input fields (explicit schema names referenced by the summary) ──
const t1=await tab('Your Details','Fill these in, then move to the Review tab — your answers mirror there automatically.',1);
const s1=await section(t1.qdb_form_tabid,'Applicant','Person',1);
await field(s1.qdb_form_sectionid,FIELD_TEXT,'Full Name','qdb_fbe_full_name',10);
await field(s1.qdb_form_sectionid,FIELD_TEXT,'Email Address','qdb_fbe_email',20);
await field(s1.qdb_form_sectionid,FIELD_TEXT,'Phone Number','qdb_fbe_phone',30);
console.log('  + tab 1 "Your Details" (3 text inputs)');

// ── Tab 2 — MANUAL SUMMARY (isSummaryTab) with data-bound Labels mirroring tab 1 ──
const t2=await tab('Review & Submit','Please review your answers below before submitting.',2,true);
const s2=await section(t2.qdb_form_tabid,'Your Summary','DocumentBulletList',1);
await field(s2.qdb_form_sectionid,FIELD_LABEL,'','qdb_sum_heading',5,{qdb_static_content:'Confirm the details below are correct, then submit.'});
await field(s2.qdb_form_sectionid,FIELD_LABEL,'Full Name','qdb_sum_full_name',10,{qdb_source_field_schema_name:'qdb_fbe_full_name'});
await field(s2.qdb_form_sectionid,FIELD_LABEL,'Email Address','qdb_sum_email',20,{qdb_source_field_schema_name:'qdb_fbe_email'});
await field(s2.qdb_form_sectionid,FIELD_LABEL,'Phone Number','qdb_sum_phone',30,{qdb_source_field_schema_name:'qdb_fbe_phone'});
console.log('  + tab 2 "Review & Submit" (isSummaryTab + 3 data-bound Labels + static heading)');

console.log(`\nDONE — 'fbe-manual' created. Portal (USE_RENDER_CACHE=false): fill tab 1, go to "Review & Submit" — values mirror read-only.`);
