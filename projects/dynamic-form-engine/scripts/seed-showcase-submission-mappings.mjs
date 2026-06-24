/**
 * Adds submission mappings + hidden form-code field to the Feature Showcase form.
 * Run: node scripts/seed-showcase-submission-mappings.mjs
 */
const TENANT_ID='d79e793c-f6de-4204-8508-7980a63df957',CLIENT_ID='08e80e93-0bab-45ef-8372-2e554fa9af9b',CLIENT_SECRET=process.env.DV_CLIENT_SECRET;
const DV='https://org5869857f.crm4.dynamics.com',BASE=`${DV}/api/data/v9.2`;

const bdy=new URLSearchParams({grant_type:'client_credentials',client_id:CLIENT_ID,client_secret:CLIENT_SECRET,scope:`${DV}/.default`});
const t=await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:bdy}).then(r=>r.json()).then(j=>j.access_token);
const h={Authorization:`Bearer ${t}`,'OData-MaxVersion':'4.0','OData-Version':'4.0',Accept:'application/json','Content-Type':'application/json',Prefer:'return=representation'};
async function get(p){return fetch(`${BASE}/${p}`,{headers:h}).then(r=>r.json());}
async function post(e,b){const r=await fetch(`${BASE}/${e}`,{method:'POST',headers:h,body:JSON.stringify(b)});const j=await r.json();if(!r.ok)throw new Error(`POST ${e}: ${j.error?.message}`);return j;}

console.log('✓ Token');

// 1. Get the showcase form
const formRes=await get(`qdb_form_definitions?$filter=qdb_form_code eq 'feature-showcase' and statecode eq 0&$select=qdb_form_definitionid&$top=1`);
const formId=formRes.value?.[0]?.qdb_form_definitionid;
if(!formId)throw new Error('feature-showcase form not found');
console.log('formId:', formId);

// 2. Get existing fields to find section IDs and field IDs
const fieldsRes=await get(`qdb_form_fields?$filter=qdb_schema_name eq 'qdb_selected_form_id' or qdb_schema_name eq 'qdb_field_entries'&$select=qdb_form_fieldid,qdb_schema_name`);
const selField=fieldsRes.value?.find(f=>f.qdb_schema_name==='qdb_selected_form_id');
const entField=fieldsRes.value?.find(f=>f.qdb_schema_name==='qdb_field_entries');
console.log('selFieldId:', selField?.qdb_form_fieldid);
console.log('entFieldId:', entField?.qdb_form_fieldid);

// 3. Find a section in Tab 1 (Guidance Cards) to add the hidden field
const tab1Res=await get(`qdb_form_tabs?$filter=_qdb_form_definition_id_value eq '${formId}' and qdb_label eq 'Guidance Cards'&$select=qdb_form_tabid&$top=1`);
const tab1Id=tab1Res.value?.[0]?.qdb_form_tabid;
const sec1Res=await get(`qdb_form_sections?$filter=_qdb_form_tab_id_value eq '${tab1Id}'&$select=qdb_form_sectionid&$top=1`);
const sec1Id=sec1Res.value?.[0]?.qdb_form_sectionid;

// 4. Add hidden form-code field (provides the primary name value for the log record)
const existCheck=await get(`qdb_form_fields?$filter=qdb_schema_name eq 'qdb_hidden_form_code'&$select=qdb_form_fieldid&$top=1`);
let hiddenFieldId;
if(existCheck.value?.length){
  hiddenFieldId=existCheck.value[0].qdb_form_fieldid;
  console.log('↷ hidden field already exists:', hiddenFieldId);
} else {
  const hf=await post('qdb_form_fields',{'qdb_form_section_id@odata.bind':`/qdb_form_sections(${sec1Id})`,qdb_schema_name:'qdb_hidden_form_code',qdb_field_type:100000001,qdb_label:'Form Code (hidden)',qdb_default_value:'feature-showcase',qdb_display_order:99,qdb_column_span:100000001,qdb_is_required:false,qdb_is_readonly:true,qdb_is_hidden:true});
  hiddenFieldId=hf.qdb_form_fieldid;
  console.log('✓ hidden field:', hiddenFieldId);
}

// 5. Check existing submission mappings
const existMappings=await get(`qdb_form_submission_mappings?$filter=_qdb_form_definition_id_value eq '${formId}'&$select=qdb_form_submission_mappingid`);
if(existMappings.value?.length){
  console.log(`↷ ${existMappings.value.length} submission mappings already exist — skipping`);
  process.exit(0);
}

// 6. Create submission mappings → qdb_form_submission_log
const mapBase={'qdb_form_definition_id@odata.bind':`/qdb_form_definitions(${formId})`,qdb_target_entity_logical_name:'qdb_form_submission_log',qdb_is_active:true,qdb_is_child_entity:false};

// Map: hidden form code field → qdb_form_code (primary name of the log record)
await post('qdb_form_submission_mappings',{...mapBase,'qdb_form_field_id@odata.bind':`/qdb_form_fields(${hiddenFieldId})`,qdb_target_attribute_logical_name:'qdb_form_code'});
console.log('✓ mapping: qdb_hidden_form_code → qdb_form_code');

// Map: selection grid field → qdb_selected_record_ids (store selected form IDs)
if(selField){
  await post('qdb_form_submission_mappings',{...mapBase,'qdb_form_field_id@odata.bind':`/qdb_form_fields(${selField.qdb_form_fieldid})`,qdb_target_attribute_logical_name:'qdb_selected_record_ids'});
  console.log('✓ mapping: qdb_selected_form_id → qdb_selected_record_ids');
}

// Map: entry grid field → qdb_grid_entries_json (serialized JSON rows)
if(entField){
  await post('qdb_form_submission_mappings',{...mapBase,'qdb_form_field_id@odata.bind':`/qdb_form_fields(${entField.qdb_form_fieldid})`,qdb_target_attribute_logical_name:'qdb_grid_entries_json',qdb_transform_expression:'toJson'});
  console.log('✓ mapping: qdb_field_entries → qdb_grid_entries_json (toJson transform)');
}

console.log('\nDone.');
