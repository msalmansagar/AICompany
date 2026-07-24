// seed-reyada-form.mjs — builds the "Reyada" form (QDB M&A advisory look-and-feel).
// Creates the 6-step form + sections + representative fields, a GREEN theme matching the
// reference design, a form/button design, and the wizard buttons (Save & Continue / Back).
// Summary step is auto (qdb_show_summary_step). Idempotent: deletes any prior 'reyada' first.
//
// Run: node --env-file=scripts/.env scripts/seed-reyada-form.mjs

const T=process.env.DV_TENANT_ID,C=process.env.DV_CLIENT_ID,S=process.env.DV_CLIENT_SECRET,U=process.env.DV_DATAVERSE_URL;
const FORM_CODE='reyada', THEME_CODE='REYADA-GREEN';
const STATUS_ACTIVE=100000001, FIELD_TEXT=100000001, SPAN=100000002, COLS=100000002;

const tok=(await(await fetch(`https://login.microsoftonline.com/${T}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:C,client_secret:S,scope:`${U}/.default`})})).json()).access_token;
const base=`${U}/api/data/v9.2`;
const h={Authorization:`Bearer ${tok}`,Accept:'application/json','Content-Type':'application/json','OData-MaxVersion':'4.0','OData-Version':'4.0'};
const get=async p=>(await(await fetch(`${base}/${p}`,{headers:h})).json()).value||[];
const del=async(set,id)=>fetch(`${base}/${set}(${id})`,{method:'DELETE',headers:h});
async function create(set,body){const r=await fetch(`${base}/${set}`,{method:'POST',headers:{...h,Prefer:'return=representation'},body:JSON.stringify(body)});if(!r.ok)throw new Error(`create ${set} ${r.status}: ${(await r.text()).slice(0,300)}`);return r.json();}

// scoped-button lookup nav props (schema-cased)
const rels=await get(`EntityDefinitions(LogicalName='qdb_form_scoped_button')/ManyToOneRelationships?$select=ReferencingEntityNavigationPropertyName,ReferencedEntity`);
const bnav=e=>rels.find(r=>r.ReferencedEntity===e).ReferencingEntityNavigationPropertyName;
const B_FORM=bnav('qdb_form_definition'), B_TAB=bnav('qdb_form_tab');

// ── idempotent cleanup ──
const existing=await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`);
for(const f of existing){
  const fid=f.qdb_form_definitionid;
  for(const b of await get(`qdb_form_scoped_buttons?$filter=_qdb_form_definition_id_value eq ${fid}&$select=qdb_form_scoped_buttonid`)) await del('qdb_form_scoped_buttons',b.qdb_form_scoped_buttonid);
  for(const d of await get(`qdb_form_designs?$filter=_qdb_form_definition_id_value eq ${fid}&$select=qdb_form_designid`)) await del('qdb_form_designs',d.qdb_form_designid);
  const tabs=await get(`qdb_form_tabs?$filter=_qdb_form_definition_id_value eq ${fid}&$select=qdb_form_tabid`);
  for(const t of tabs){const secs=await get(`qdb_form_sections?$filter=_qdb_form_tab_id_value eq ${t.qdb_form_tabid}&$select=qdb_form_sectionid`);
    for(const s of secs){for(const fl of await get(`qdb_form_fields?$filter=_qdb_form_section_id_value eq ${s.qdb_form_sectionid}&$select=qdb_form_fieldid`)) await del('qdb_form_fields',fl.qdb_form_fieldid); await del('qdb_form_sections',s.qdb_form_sectionid);}
    await del('qdb_form_tabs',t.qdb_form_tabid);}
  await del('qdb_form_definitions',fid);
}
for(const t of await get(`qdb_themes?$filter=qdb_theme_code eq '${THEME_CODE}'&$select=qdb_themeid`)) await del('qdb_themes',t.qdb_themeid);
console.log('cleared any prior reyada form/theme');

// ── 1) form ──
const form=await create('qdb_form_definitions',{
  qdb_form_code:FORM_CODE, qdb_title:'Reyada', qdb_status:STATUS_ACTIVE, qdb_version:1,
  qdb_allow_save_draft:true, qdb_show_summary_step:true,
  qdb_confirmation_message:'Your Reyada application has been submitted. Our team will review it and follow up shortly.',
});
const formId=form.qdb_form_definitionid;
console.log('+ form Reyada',formId);

// ── 2) green theme (matches the reference) ──
const theme=await create('qdb_themes',{
  qdb_theme_code:THEME_CODE,
  qdb_primary_color:'#2E8B6F', qdb_secondary_color:'#1E3A5F',
  qdb_background_color:'#F5F7F9', qdb_surface_color:'#FFFFFF', qdb_border_color:'#E2E8F0',
  qdb_text_primary_color:'#1E293B', qdb_text_secondary_color:'#64748B',
  qdb_error_color:'#DC2626', qdb_success_color:'#2E8B6F', qdb_warning_color:'#D97706',
  qdb_font_family:"'Inter','Segoe UI',Arial,sans-serif",
  qdb_base_font_size:'15px', qdb_heading_font_size:'22px', qdb_label_font_size:'13px', qdb_input_font_size:'14px',
  qdb_border_radius:'6px', qdb_is_dark_mode:false, qdb_is_active:true,
});
console.log('+ green theme',THEME_CODE);

await create('qdb_form_designs',{
  qdb_is_active:true, qdb_max_width:'1040px',
  qdb_custom_css:'.qdb-section{border:1px solid #E2E8F0;}',
  'qdb_form_definition_id@odata.bind':`/qdb_form_definitions(${formId})`,
  'qdb_theme_id@odata.bind':`/qdb_themes(${theme.qdb_themeid})`,
});
console.log('+ form design (green theme, 1040px)');

// ── 3) tabs + sections + fields + wizard buttons ──
const STEPS=[
  {label:'Transaction Type',  section:'Transaction Type',      fields:['Your Budget Range','What are you looking to do?','Where will the proceeds go?']},
  {label:'Financial Overview',section:'Financial Overview',    fields:['Most Recent Annual Revenue (QAR)','Most Recent Annual Revenue EBITDA (QAR)','Total Assets (QAR, Approx.)']},
  {label:'Operational Profile',section:'Operational Profile',  fields:['Key competitive advantages','Customer concentration','Key person dependency']},
  {label:'Deal Readiness',    section:'Deal Readiness',        fields:['Documents already prepared','Engagement scope']},
  {label:'Legal & Corporate Structure',section:'Legal & Corporate Structure',fields:['Legal entity type','Active legal disputes or litigation?','Commercial registrations & licences']},
  {label:'Service Providers', section:'Service Providers',     fields:['Preferred service providers','Notes for advisors']},
];
const slug=s=>'qdb_'+s.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const tb=(label,order,primary,type,cfg)=>({qdb_label:label,qdb_placement_scope:'tab',qdb_display_order:order,qdb_is_primary:primary,qdb_is_visible:true,qdb_confirm_required:false,qdb_is_active:true,qdb_action_type:type,qdb_action_config_json:cfg,[`${B_FORM}@odata.bind`]:`/qdb_form_definitions(${formId})`});

for(let i=0;i<STEPS.length;i++){
  const step=STEPS[i];
  const tab=await create('qdb_form_tabs',{qdb_label:step.label,qdb_display_order:i+1,qdb_is_visible:true,qdb_requires_previous_tab_complete:false,qdb_hide_tab_bar:false,'qdb_form_definition_id@odata.bind':`/qdb_form_definitions(${formId})`});
  const sec=await create('qdb_form_sections',{qdb_label:step.section,qdb_display_order:1,qdb_columns:COLS,qdb_is_collapsible:false,qdb_is_collapsed_by_default:false,qdb_is_visible:true,'qdb_form_tab_id@odata.bind':`/qdb_form_tabs(${tab.qdb_form_tabid})`});
  let order=10;
  for(const fl of step.fields){
    await create('qdb_form_fields',{qdb_field_type:FIELD_TEXT,qdb_schema_name:slug(step.label+'_'+fl).slice(0,60),qdb_label:fl,qdb_placeholder:'',qdb_column_span:SPAN,qdb_is_required:false,qdb_is_readonly:false,qdb_is_hidden:false,qdb_display_order:order,'qdb_form_section_id@odata.bind':`/qdb_form_sections(${sec.qdb_form_sectionid})`});
    order+=10;
  }
  // wizard buttons: Back (not on first), Save & Continue (green primary)
  const tbind=`/qdb_form_tabs(${tab.qdb_form_tabid})`;
  if(i>0) await create('qdb_form_scoped_buttons',{...tb('← Back',0,false,'navigate','{"target":"previousStep"}'),[`${B_TAB}@odata.bind`]:tbind});
  await create('qdb_form_scoped_buttons',{...tb('Save & Continue ›',1,true,'navigate','{"target":"nextStep"}'),[`${B_TAB}@odata.bind`]:tbind});
  console.log(`  + tab ${i+1} "${step.label}" (${step.fields.length} fields, buttons)`);
}

console.log(`\nDONE — Reyada form created (code '${FORM_CODE}'). Run the portal with USE_RENDER_CACHE=false and open it.`);
