/**
 * i18n gap report — lists every translatable string on a form that lacks an
 * Arabic (ar) qdb_translation record. Read-only.
 * Run: node --env-file=scripts/.env scripts/i18n-gap-report.mjs
 */
const DV_CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
if (!DV_CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET required (node --env-file=scripts/.env ...)');

const TENANT_ID='d79e793c-f6de-4204-8508-7980a63df957', CLIENT_ID='08e80e93-0bab-45ef-8372-2e554fa9af9b';
const DV='https://org5869857f.crm4.dynamics.com', BASE=`${DV}/api/data/v9.2`, LANG='ar', FORM_CODE='dfe-all-features';

const token = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:CLIENT_ID,client_secret:DV_CLIENT_SECRET,scope:`${DV}/.default`})}).then(r=>r.json()).then(j=>j.access_token);
const H={Authorization:`Bearer ${token}`,Accept:'application/json'};
const get=async p=>{const r=await fetch(`${BASE}/${p}`,{headers:H});const j=await r.json();if(!r.ok)throw new Error(`${p}: ${j.error?.message}`);return j.value;};

const form=(await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}' and statecode eq 0&$top=1`))[0];
const fid=form.qdb_form_definitionid;
const tabs=await get(`qdb_form_tabs?$filter=_qdb_form_definition_id_value eq '${fid}' and statecode eq 0`);
const tabIds=new Set(tabs.map(t=>t.qdb_form_tabid));
const sections=(await get(`qdb_form_sections?$filter=statecode eq 0&$expand=qdb_form_tab_id($select=qdb_form_tabid)&$top=200`)).filter(s=>tabIds.has(s.qdb_form_tab_id?.qdb_form_tabid));
const secIds=new Set(sections.map(s=>s.qdb_form_sectionid));
const fields=(await get(`qdb_form_fields?$filter=statecode eq 0&$expand=qdb_form_section_id($select=qdb_form_sectionid)&$top=300`)).filter(f=>secIds.has(f.qdb_form_section_id?.qdb_form_sectionid));
const fieldIds=fields.map(f=>f.qdb_form_fieldid);
const opts=fieldIds.length?(await get(`qdb_form_option_values?$filter=statecode eq 0&$expand=qdb_form_field_id($select=qdb_form_fieldid)&$top=500`)).filter(o=>fieldIds.includes(o.qdb_form_field_id?.qdb_form_fieldid)):[];
const grids=fieldIds.length?(await get(`qdb_grid_column_configs?$filter=statecode eq 0&$expand=qdb_form_field_id($select=qdb_form_fieldid)&$top=500`)).filter(g=>fieldIds.includes(g.qdb_form_field_id?.qdb_form_fieldid)):[];
const screens=await get(`qdb_info_card_screens?$filter=_qdb_form_definition_id_value eq '${fid}' and statecode eq 0`);
const scrIds=screens.map(s=>s.qdb_info_card_screenid);
const icSecs=scrIds.length?(await get(`qdb_info_card_sections?$filter=(${scrIds.map(i=>`_qdb_info_card_screen_id_value eq '${i}'`).join(' or ')}) and statecode eq 0`)):[];
const icSecIds=icSecs.map(s=>s.qdb_info_card_sectionid);
const icItems=icSecIds.length?(await get(`qdb_info_card_items?$filter=(${icSecIds.map(i=>`_qdb_info_card_section_id_value eq '${i}'`).join(' or ')}) and statecode eq 0`)):[];
const rules=fieldIds.length?(await get(`qdb_form_validation_rules?$filter=statecode eq 0&$expand=qdb_form_field_id($select=qdb_form_fieldid)&$top=500`)).filter(r=>fieldIds.includes(r.qdb_form_field_id?.qdb_form_fieldid)):[];
const buttons=await get(`qdb_form_buttons?$filter=_qdb_form_definition_id_value eq '${fid}' and statecode eq 0`);

const existing=new Set((await get(`qdb_translations?$filter=qdb_language_code eq '${LANG}'&$select=qdb_entity_name,qdb_record_id,qdb_field_name&$top=1000`)).map(t=>`${t.qdb_entity_name}|${t.qdb_record_id}|${t.qdb_field_name}`));

const FIELDS={
  qdb_form_definition:[['qdb_title',form.qdb_title],['qdb_description',form.qdb_description],['qdb_confirmation_message',form.qdb_confirmation_message]],
};
const gaps=[];
const check=(entity,id,field,val)=>{ if(val && String(val).trim() && !existing.has(`${entity}|${id}|${field}`)) gaps.push({entity,field,en:String(val).slice(0,70)}); };

for(const [f,v] of FIELDS.qdb_form_definition) check('qdb_form_definition',fid,f,v);
for(const t of tabs) check('qdb_form_tab',t.qdb_form_tabid,'qdb_label',t.qdb_label);
for(const s of sections){check('qdb_form_section',s.qdb_form_sectionid,'qdb_label',s.qdb_label);check('qdb_form_section',s.qdb_form_sectionid,'qdb_description',s.qdb_description);}
for(const f of fields)for(const fn of ['qdb_label','qdb_placeholder','qdb_tooltip','qdb_prefix','qdb_suffix','qdb_true_label','qdb_false_label','qdb_info_card_title','qdb_info_card_body','qdb_info_card_download_label','qdb_file_download_label']) check('qdb_form_field',f.qdb_form_fieldid,fn,f[fn]);
for(const o of opts)for(const fn of ['qdb_label','qdb_description','qdb_notes']) check('qdb_form_option_value',o.qdb_form_option_valueid,fn,o[fn]);
for(const g of grids) check('qdb_grid_column_config',g.qdb_grid_column_configid,'qdb_column_label',g.qdb_column_label);
for(const s of screens)for(const fn of ['qdb_heading','qdb_sub_heading','qdb_icon_alt_text']) check('qdb_info_card_screen',s.qdb_info_card_screenid,fn,s[fn]);
for(const s of icSecs)for(const fn of ['qdb_section_title','qdb_note_text']) check('qdb_info_card_section',s.qdb_info_card_sectionid,fn,s[fn]);
for(const i of icItems)for(const fn of ['qdb_item_title','qdb_item_description']) check('qdb_info_card_item',i.qdb_info_card_itemid,fn,i[fn]);
for(const r of rules) check('qdb_form_validation_rule',r.qdb_form_validation_ruleid,'qdb_error_message',r.qdb_error_message);
for(const b of buttons)for(const fn of ['qdb_label','qdb_confirmation_message']) check('qdb_form_button',b.qdb_form_buttonid,fn,b[fn]);

const byEnt={};
for(const g of gaps){(byEnt[`${g.entity}.${g.field}`] ||= []).push(g.en);}
console.log(`\n=== ${gaps.length} strings MISSING Arabic on ${FORM_CODE} ===\n`);
for(const k of Object.keys(byEnt).sort()){console.log(`${k}  (${byEnt[k].length})`);for(const en of byEnt[k])console.log(`    EN: ${en}`);}
