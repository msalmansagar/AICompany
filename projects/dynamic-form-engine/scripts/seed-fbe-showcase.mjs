// seed-fbe-showcase.mjs — DFE-FBE-001 demo form.
// Showcases all Wave 1 features: section ICONS, tab DESCRIPTIONS, a static LABEL field,
// and SUMMARY MODE = SystemGenerated (auto review step on the last tab).
// Idempotent: deletes any prior 'fbe-showcase' form first.
//
// Run: node --env-file=scripts/.env scripts/seed-fbe-showcase.mjs

const T=process.env.DV_TENANT_ID,C=process.env.DV_CLIENT_ID,S=process.env.DV_CLIENT_SECRET,U=process.env.DV_DATAVERSE_URL;
const FORM_CODE='fbe-showcase';
const STATUS_ACTIVE=100000001, FIELD_TEXT=100000001, FIELD_LABEL=100000022;
const SPAN2=100000002, COLS2=100000002, SUMMARY_SYSTEM=100000002;

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
console.log('cleared any prior fbe-showcase');

// ── 1) form (Summary Mode = SystemGenerated) ──
const form=await create('qdb_form_definitions',{
  qdb_form_code:FORM_CODE, qdb_title:'FBE Showcase', qdb_status:STATUS_ACTIVE, qdb_version:1,
  qdb_summary_mode:SUMMARY_SYSTEM,
  qdb_confirmation_message:'Thanks — this demo showcased the DFE-FBE-001 features.',
});
const formId=form.qdb_form_definitionid;
console.log('+ form FBE Showcase',formId,'(summaryMode=SystemGenerated)');

const slug=s=>'qdb_'+s.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,55);
async function field(sectionId,type,label,order,extra={}){
  return create('qdb_form_fields',{qdb_field_type:type,qdb_schema_name:slug(label),qdb_label:label,qdb_column_span:SPAN2,qdb_is_required:false,qdb_is_readonly:false,qdb_is_hidden:false,qdb_display_order:order,'qdb_form_section_id@odata.bind':`/qdb_form_sections(${sectionId})`,...extra});
}
async function section(tabId,label,icon,order){
  return create('qdb_form_sections',{qdb_label:label,qdb_display_order:order,qdb_columns:COLS2,qdb_is_collapsible:false,qdb_is_collapsed_by_default:false,qdb_is_visible:true,qdb_icon_name:icon,'qdb_form_tab_id@odata.bind':`/qdb_form_tabs(${tabId})`});
}
async function tab(label,desc,order){
  return create('qdb_form_tabs',{qdb_label:label,qdb_display_order:order,qdb_is_visible:true,qdb_requires_previous_tab_complete:false,qdb_hide_tab_bar:false,qdb_description:desc,'qdb_form_definition_id@odata.bind':`/qdb_form_definitions(${formId})`});
}

// ── 2) Tab 1 — description + section icons + a static Label field ──
const t1=await tab('Applicant','This tab has a description (shown above the sections) and sections with icons.',1);
const s1=await section(t1.qdb_form_tabid,'Personal Information','Person',1);
await field(s1.qdb_form_sectionid,FIELD_LABEL,'Please complete all fields accurately.',5,{qdb_static_content:'ℹ️ This is a Label field — read-only display text (no input). Great for headings, notes and instructions.'});
await field(s1.qdb_form_sectionid,FIELD_TEXT,'Full Name',10);
await field(s1.qdb_form_sectionid,FIELD_TEXT,'Email Address',20);
const s2=await section(t1.qdb_form_tabid,'Contact','Phone',2);
await field(s2.qdb_form_sectionid,FIELD_TEXT,'Phone Number',10);
console.log('  + tab 1 "Applicant" (desc + 2 icon sections + Label field)');

// ── 3) Tab 2 — description + icon section ──
const t2=await tab('Preferences','Your preferences. The final review step is auto-generated (Summary Mode = System-generated).',2);
const s3=await section(t2.qdb_form_tabid,'Options','Settings',1);
await field(s3.qdb_form_sectionid,FIELD_TEXT,'Notes',10);
console.log('  + tab 2 "Preferences" (desc + icon section)');

console.log(`\nDONE — 'fbe-showcase' created. Open the portal (USE_RENDER_CACHE=false) at /forms/fbe-showcase.`);
