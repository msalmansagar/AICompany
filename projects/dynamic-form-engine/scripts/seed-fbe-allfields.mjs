// seed-fbe-allfields.mjs — one demo form with EVERY field type + all 6 FBE features
// (progress bar, summary mode, tab descriptions, section icons, static+bound Label, multi-lookup).
// Idempotent. Run: node --env-file=scripts/.env scripts/seed-fbe-allfields.mjs

const T=process.env.DV_TENANT_ID,C=process.env.DV_CLIENT_ID,S=process.env.DV_CLIENT_SECRET,U=process.env.DV_DATAVERSE_URL;
const FORM_CODE='fbe-allfields';
const STATUS_ACTIVE=100000001, COLS2=100000002, SPAN_FULL=100000002;
const SUMMARY_SYSTEM=100000002, ICSTYLE_INFO=100000000, GRID_SELECTION=100000001;
// qdb_field_type option-set values (confirmed on org)
const FT={text:100000001,textarea:100000002,number:100000003,date:100000004,datetime:100000005,
  dropdown:100000006,multiselect:100000007,lookup:100000008,checkbox:100000009,radio:100000010,
  currency:100000011,decimal:100000012,email:100000013,phone:100000014,file:100000015,
  repeatingGrid:100000016,richText:100000017,custom:100000018,boolean:100000019,infoCard:100000020,
  interactiveGrid:100000021,label:100000022,multiLookup:100000023};

const tok=(await(await fetch(`https://login.microsoftonline.com/${T}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:C,client_secret:S,scope:`${U}/.default`})})).json()).access_token;
const base=`${U}/api/data/v9.2`;
const h={Authorization:`Bearer ${tok}`,Accept:'application/json','Content-Type':'application/json','OData-MaxVersion':'4.0','OData-Version':'4.0'};
const get=async p=>(await(await fetch(`${base}/${p}`,{headers:h})).json()).value||[];
const del=async(set,id)=>fetch(`${base}/${set}(${id})`,{method:'DELETE',headers:h});
async function create(set,body){const r=await fetch(`${base}/${set}`,{method:'POST',headers:{...h,Prefer:'return=representation'},body:JSON.stringify(body)});if(!r.ok)throw new Error(`create ${set} ${r.status}: ${(await r.text()).slice(0,300)}`);return r.json();}

// ---- cleanup any prior form ----
for(const f of await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`)){
  const fid=f.qdb_form_definitionid;
  for(const t of await get(`qdb_form_tabs?$filter=_qdb_form_definition_id_value eq ${fid}&$select=qdb_form_tabid`)){
    for(const s of await get(`qdb_form_sections?$filter=_qdb_form_tab_id_value eq ${t.qdb_form_tabid}&$select=qdb_form_sectionid`)){
      for(const fl of await get(`qdb_form_fields?$filter=_qdb_form_section_id_value eq ${s.qdb_form_sectionid}&$select=qdb_form_fieldid`)){
        for(const o of await get(`qdb_form_option_values?$filter=_qdb_form_field_id_value eq ${fl.qdb_form_fieldid}&$select=qdb_form_option_valueid`)) await del('qdb_form_option_values',o.qdb_form_option_valueid);
        for(const lc of await get(`qdb_form_lookup_configs?$filter=_qdb_form_field_id_value eq ${fl.qdb_form_fieldid}&$select=qdb_form_lookup_configid`)) await del('qdb_form_lookup_configs',lc.qdb_form_lookup_configid);
        await del('qdb_form_fields',fl.qdb_form_fieldid);
      }
      await del('qdb_form_sections',s.qdb_form_sectionid);
    }
    await del('qdb_form_tabs',t.qdb_form_tabid);
  }
  await del('qdb_form_definitions',fid);
}
console.log('cleared any prior fbe-allfields');

// ---- form: progress bar ON + summary mode System-generated ----
const form=await create('qdb_form_definitions',{qdb_form_code:FORM_CODE,qdb_title:'All Field Types Showcase',qdb_status:STATUS_ACTIVE,qdb_version:1,qdb_show_progress_bar:true,qdb_summary_mode:SUMMARY_SYSTEM,qdb_confirmation_message:'Thanks — all field types submitted.'});
const formId=form.qdb_form_definitionid;
console.log('+ form',formId,'(progressBar=true, summaryMode=SystemGenerated)');

let order=0;
const tab=(label,description,ord)=>create('qdb_form_tabs',{qdb_label:label,qdb_description:description,qdb_display_order:ord,qdb_is_visible:true,qdb_requires_previous_tab_complete:false,qdb_hide_tab_bar:false,'qdb_form_definition_id@odata.bind':`/qdb_form_definitions(${formId})`});
const section=(tabId,label,icon)=>create('qdb_form_sections',{qdb_label:label,qdb_icon_name:icon,qdb_display_order:1,qdb_columns:COLS2,qdb_is_collapsible:false,qdb_is_collapsed_by_default:false,qdb_is_visible:true,'qdb_form_tab_id@odata.bind':`/qdb_form_tabs(${tabId})`});
const field=(sectionId,type,label,schema,extra={})=>create('qdb_form_fields',{qdb_field_type:type,qdb_schema_name:schema,qdb_label:label,qdb_column_span:SPAN_FULL,qdb_is_required:false,qdb_is_readonly:false,qdb_is_hidden:false,qdb_display_order:(order+=10),'qdb_form_section_id@odata.bind':`/qdb_form_sections(${sectionId})`,...extra});
const option=(fieldId,val,label,ord)=>create('qdb_form_option_values',{qdb_value:val,qdb_label:label,qdb_display_order:ord,qdb_is_active:true,'qdb_form_field_id@odata.bind':`/qdb_form_fields(${fieldId})`});
const lookupCfg=fieldId=>create('qdb_form_lookup_configs',{qdb_entity_logical_name:'systemuser',qdb_display_attribute:'fullname',qdb_value_attribute:'systemuserid',qdb_search_min_chars:1,qdb_max_results:10,'qdb_form_field_id@odata.bind':`/qdb_form_fields(${fieldId})`});
async function withOptions(f){await option(f.qdb_form_fieldid,'a','Option A',1);await option(f.qdb_form_fieldid,'b','Option B',2);await option(f.qdb_form_fieldid,'c','Option C',3);return f;}

// TAB 1 — Text & Numbers (icon Person)
const t1=await tab('Text & Numbers','Basic text, numeric and contact inputs.',1);
const s1=await section(t1.qdb_form_tabid,'Inputs','Person');
await field(s1.qdb_form_sectionid,FT.text,'Single Line','qdb_all_text');
await field(s1.qdb_form_sectionid,FT.textarea,'Multi Line','qdb_all_textarea');
await field(s1.qdb_form_sectionid,FT.number,'Number','qdb_all_number');
await field(s1.qdb_form_sectionid,FT.decimal,'Decimal','qdb_all_decimal');
await field(s1.qdb_form_sectionid,FT.currency,'Currency','qdb_all_currency');
await field(s1.qdb_form_sectionid,FT.email,'Email','qdb_all_email');
await field(s1.qdb_form_sectionid,FT.phone,'Phone','qdb_all_phone');
await field(s1.qdb_form_sectionid,FT.richText,'Rich Text','qdb_all_richtext');
console.log('  tab 1: text, textarea, number, decimal, currency, email, phone, richText');

// TAB 2 — Dates & Choices (icon Calendar)
const t2=await tab('Dates & Choices','Dates and every choice input.',2);
const s2=await section(t2.qdb_form_tabid,'Selections','CalendarLtr');
await field(s2.qdb_form_sectionid,FT.date,'Date','qdb_all_date');
await field(s2.qdb_form_sectionid,FT.datetime,'Date & Time','qdb_all_datetime');
await withOptions(await field(s2.qdb_form_sectionid,FT.dropdown,'Dropdown','qdb_all_dropdown'));
await withOptions(await field(s2.qdb_form_sectionid,FT.radio,'Radio','qdb_all_radio'));
await withOptions(await field(s2.qdb_form_sectionid,FT.multiselect,'Multi-select','qdb_all_multiselect'));
await field(s2.qdb_form_sectionid,FT.checkbox,'Checkbox','qdb_all_checkbox');
await field(s2.qdb_form_sectionid,FT.boolean,'Boolean Toggle','qdb_all_boolean',{qdb_true_label:'Yes',qdb_false_label:'No'});
console.log('  tab 2: date, datetime, dropdown, radio, multiselect, checkbox, boolean');

// TAB 3 — Lookups, Files & Grids (icon Search)
const t3=await tab('Lookups & Advanced','Lookups, multi-lookup, files, grids, info-card and custom.',3);
const s3=await section(t3.qdb_form_tabid,'Advanced','Search');
await lookupCfg((await field(s3.qdb_form_sectionid,FT.lookup,'Lookup (user)','qdb_all_lookup')).qdb_form_fieldid);
await lookupCfg((await field(s3.qdb_form_sectionid,FT.multiLookup,'Multi-select Lookup (users)','qdb_all_multilookup')).qdb_form_fieldid);
await field(s3.qdb_form_sectionid,FT.file,'File Upload','qdb_all_file');
await field(s3.qdb_form_sectionid,FT.repeatingGrid,'Repeating Grid','qdb_all_repeatgrid',{qdb_grid_entity_name:'systemuser',qdb_grid_mode:GRID_SELECTION});
await field(s3.qdb_form_sectionid,FT.interactiveGrid,'Interactive Grid','qdb_all_intgrid',{qdb_grid_entity_name:'systemuser',qdb_grid_mode:GRID_SELECTION});
await field(s3.qdb_form_sectionid,FT.infoCard,'Info Card','qdb_all_infocard',{qdb_info_card_title:'Heads up',qdb_info_card_body:'This is an info card demonstrating the info-card field type.',qdb_info_card_style:ICSTYLE_INFO});
await field(s3.qdb_form_sectionid,FT.custom,'Custom Component','qdb_all_custom',{qdb_component_key:'demo-custom-widget'});
console.log('  tab 3: lookup, multiLookup, file, repeatingGrid, interactiveGrid, info-card, custom');

// TAB 4 — Display / Labels (icon Info) — static + data-bound Label
const t4=await tab('Display','Read-only Label fields — static text and a data-bound mirror.',4);
const s4=await section(t4.qdb_form_tabid,'Labels','Info');
await field(s4.qdb_form_sectionid,FT.label,'Notice','qdb_all_label_static',{qdb_static_content:'Please review your answers before submitting.'});
await field(s4.qdb_form_sectionid,FT.label,'Your name (mirrored)','qdb_all_label_bound',{qdb_source_field_schema_name:'qdb_all_text'});
console.log('  tab 4: label (static), label (data-bound → Single Line)');

console.log(`\nDONE — 'fbe-allfields' created with all 23 field types + 6 FBE features.`);
console.log('Publish it (qdb_PublishForm) then open at /forms/fbe-allfields or via the in-CRM Open command.');
