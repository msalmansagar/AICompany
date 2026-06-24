/**
 * Complete Arabic translation pass for dfe-all-features — fills the remaining
 * gaps found by i18n-gap-report.mjs (section descriptions, info-card item
 * descriptions + section notes, placeholders, option labels/descriptions,
 * tooltips, prefixes/suffixes, a few field labels).
 *
 * Keyed on stable identifiers (schema name / option value / English label /
 * info-card section name / info-card item title) — robust against mojibake.
 * Idempotent upsert via the qdb_translation composite alternate key.
 *
 * Run: node --env-file=scripts/.env scripts/seed-dfe-all-features-ar-complete.mjs
 */
const DV_CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
if (!DV_CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET required (node --env-file=scripts/.env ...)');

const TENANT_ID='d79e793c-f6de-4204-8508-7980a63df957', CLIENT_ID='08e80e93-0bab-45ef-8372-2e554fa9af9b';
const DV='https://org5869857f.crm4.dynamics.com', BASE=`${DV}/api/data/v9.2`, LANG='ar', FORM_CODE='dfe-all-features';

const token = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:CLIENT_ID,client_secret:DV_CLIENT_SECRET,scope:`${DV}/.default`})}).then(r=>r.json()).then(j=>j.access_token);
const H={Authorization:`Bearer ${token}`,'OData-MaxVersion':'4.0','OData-Version':'4.0',Accept:'application/json','Content-Type':'application/json'};
const get=async p=>{const r=await fetch(`${BASE}/${p}`,{headers:H});const j=await r.json();if(!r.ok)throw new Error(`${p}: ${j.error?.message}`);return j.value;};

let count=0;
async function upsert(entity,id,field,value){
  const key=`qdb_entity_name='${entity}',qdb_record_id='${id}',qdb_field_name='${field}',qdb_language_code='${LANG}'`;
  const body={qdb_entity_name:entity,qdb_record_id:id,qdb_field_name:field,qdb_language_code:LANG,qdb_translated_value:value,qdb_is_active:true};
  const r=await fetch(`${BASE}/qdb_translations(${key})`,{method:'PATCH',headers:H,body:JSON.stringify(body)});
  if(r.status===200||r.status===204){count++;return;}
  throw new Error(`PATCH ${key} -> ${r.status}: ${await r.text()}`);
}

// ── Translation maps (keyed on stable identifiers) ──────────────────────────
const FIELD_TR={
  cs_skills_guide:    {qdb_label:'إرشادات المهارات', qdb_info_card_download_label:'تنزيل دليل المهارات (PDF)'},
  cs_field_type_demo: {qdb_label:'نوع الحقل (من مجموعة خيارات CRM)', qdb_placeholder:'يتم تحميل الخيارات من qdb_form_field.qdb_field_type', qdb_tooltip:'يوضّح optionSourceEntity — الخيارات مصدرها سمة CRM'},
  cs_linked_form_code:{qdb_label:'رمز النموذج المرتبط', qdb_placeholder:'ابحث عن رمز النموذج…'},
  cs_lookup_context:  {qdb_label:'ملاحظات السياق', qdb_placeholder:'سبب ربط هذا النموذج'},
  cs_hidden_form_code:{qdb_label:'رمز النموذج (النظام)'},
  cs_employment_status:{qdb_placeholder:'— اختر الحالة —'},
  cs_nationality:     {qdb_placeholder:'— اختر —'},
  cs_filter_status:   {qdb_placeholder:'— اختر حالة للتصفية —'},
  cs_additional_notes:{qdb_placeholder:'أي معلومات إضافية تريد مشاركتها…'},
  cs_final_comment:   {qdb_placeholder:'أي ملاحظات أخيرة قبل التقديم…'},
  cs_monthly_income:  {qdb_prefix:'ر.ق', qdb_suffix:'/شهر'},
  cs_savings:         {qdb_prefix:'ر.ق'},
  cs_age:             {qdb_suffix:'سنة'},
  cs_years_exp:       {qdb_suffix:'سنوات'},
  cs_employer_name:   {qdb_suffix:' (ذ.م.م)'},
  cs_permissions:     {qdb_tooltip:'حدد الأذونات مباشرة — يصبح كل صف سجل إذن'},
  cs_filtered_forms:  {qdb_tooltip:'تتم إعادة تحميل السجلات عند تغيير قائمة الحالة بالأعلى'},
  cs_cv_file:         {qdb_file_download_label:'تنزيل قالب السيرة الذاتية'},
  cs_review_warning:  {qdb_info_card_download_label:'عرض سياسة التقديم'},
};
const OPTION_TR={
  '100000001':{qdb_label:'نشط'}, '100000000':{qdb_label:'مسودة'}, '100000002':{qdb_label:'غير نشط'},
  csharp:{qdb_label:'سي شارب'}, azure:{qdb_label:'أزور'}, nodejs:{qdb_label:'نود.جيه‌إس'}, dotnet:{qdb_label:'دوت نت'},
  dynamics:{qdb_label:'دايناميكس 365'}, power_platform:{qdb_label:'باور بلاتفورم'}, devops:{qdb_label:'ديف أوبس'},
  contract:{qdb_description:'مدة محددة بتاريخ انتهاء'}, part_time:{qdb_description:'ساعات أقل، جدول مرن'},
  permanent:{qdb_description:'دوام كامل، بدون تاريخ انتهاء'}, freelance:{qdb_description:'تعاقد كمقاول مستقل'},
};
const SECTION_DESC={
  'Date of Birth':'قدّم تاريخ ميلادك وجنسيتك',
  'Employment':'الحالة الوظيفية الحالية وتفاصيل جهة العمل',
  'Skills & Prefs':'المهارات والإشعارات ونوع العقد واللغات',
  'Financial Info':'الدخل الشهري والمدخرات والمبالغ النقدية',
  'Documents':'ارفع المستندات المطلوبة وأضِف الملاحظات',
  'Select Role':'اختر الدور المراد تعيينه (شبكة اختيار)',
  'Define Permissions':'حدد أذونات مخصصة مباشرة (شبكة إدخال)',
  'Linked Form':'اربط تعريف نموذج بطلب الوصول هذا',
  'Filtered Grid Demo':'يوضّح تصفية الشبكة الديناميكية: اختر حالة للتصفية',
  'Review':'أكّد تاريخ ووقت التقديم وأضِف التعليقات النهائية',
};
const ICSECTION_NOTE={
  'Form Steps':'يجب إكمال جميع الأقسام الخمسة قبل التقديم. يمكنك حفظ التقدم في أي وقت.',
  'Requirements':'تأكد من أن سيرتك الذاتية بصيغة PDF أو DOCX وألا تتجاوز 5 ميغابايت.',
  'Document Templates':'نزّل القوالب وأكملها قبل رفعها في قسم المالية والوثائق.',
};
const ICITEM_DESC={
  'Financial & Docs':'الدخل الشهري والمدخرات ورفع السيرة الذاتية وملاحظات إضافية',
  'Review & Submit':'المراجعة النهائية وتاريخ السريان والتقديم',
  'Qatar Mobile Number':'رقم جوالك القطري المكوّن من 8 أرقام',
  'Monthly Income Figure':'دخلك الشهري الإجمالي الحالي بالريال القطري',
  'Updated CV':'السيرة الذاتية بصيغة PDF أو DOCX — بحد أقصى 5 ميغابايت',
  'NOC Template':'قالب شهادة عدم ممانعة',
  'System Access':'اختر تعريف نموذج وحدد أذونات مخصصة',
  'Valid Email Address':'بريد إلكتروني مؤسسي فعّال لديك صلاحية الوصول إليه',
  'Date of Birth':'تاريخ ميلادك بالضبط بصيغة يوم/شهر/سنة',
  'CV Template (English)':'قالب سيرة ذاتية قياسي — بصيغة DOCX',
};

// ── Resolve form scope ──────────────────────────────────────────────────────
const fid=(await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}' and statecode eq 0&$top=1`))[0].qdb_form_definitionid;
const tabIds=new Set((await get(`qdb_form_tabs?$filter=_qdb_form_definition_id_value eq '${fid}' and statecode eq 0`)).map(t=>t.qdb_form_tabid));
const sections=(await get(`qdb_form_sections?$filter=statecode eq 0&$expand=qdb_form_tab_id($select=qdb_form_tabid)&$top=200`)).filter(s=>tabIds.has(s.qdb_form_tab_id?.qdb_form_tabid));
const secIds=new Set(sections.map(s=>s.qdb_form_sectionid));
const fields=(await get(`qdb_form_fields?$filter=statecode eq 0&$select=qdb_form_fieldid,qdb_schema_name&$expand=qdb_form_section_id($select=qdb_form_sectionid)&$top=300`)).filter(f=>secIds.has(f.qdb_form_section_id?.qdb_form_sectionid));
const fieldIds=fields.map(f=>f.qdb_form_fieldid);
const opts=(await get(`qdb_form_option_values?$filter=statecode eq 0&$select=qdb_form_option_valueid,qdb_value&$expand=qdb_form_field_id($select=qdb_form_fieldid)&$top=500`)).filter(o=>fieldIds.includes(o.qdb_form_field_id?.qdb_form_fieldid));
const screens=await get(`qdb_info_card_screens?$filter=_qdb_form_definition_id_value eq '${fid}' and statecode eq 0&$select=qdb_info_card_screenid`);
const scrFilter=screens.map(s=>`_qdb_info_card_screen_id_value eq '${s.qdb_info_card_screenid}'`).join(' or ');
const icSecs=scrFilter?await get(`qdb_info_card_sections?$filter=(${scrFilter}) and statecode eq 0&$select=qdb_info_card_sectionid,qdb_info_card_sectionname`):[];
const secFilter=icSecs.map(s=>`_qdb_info_card_section_id_value eq '${s.qdb_info_card_sectionid}'`).join(' or ');
const icItems=secFilter?await get(`qdb_info_card_items?$filter=(${secFilter}) and statecode eq 0&$select=qdb_info_card_itemid,qdb_item_title`):[];

console.log(`\n=== Complete Arabic seed — ${FORM_CODE} ===\n`);

// ── Apply ───────────────────────────────────────────────────────────────────
for(const f of fields){const m=FIELD_TR[f.qdb_schema_name];if(!m)continue;for(const [fn,v] of Object.entries(m))await upsert('qdb_form_field',f.qdb_form_fieldid,fn,v);}
console.log('  ✓ fields');
for(const o of opts){const m=OPTION_TR[o.qdb_value];if(!m)continue;for(const [fn,v] of Object.entries(m))await upsert('qdb_form_option_value',o.qdb_form_option_valueid,fn,v);}
console.log('  ✓ option labels/descriptions');
for(const s of sections){const ar=SECTION_DESC[s.qdb_label];if(ar)await upsert('qdb_form_section',s.qdb_form_sectionid,'qdb_description',ar);}
console.log('  ✓ section descriptions');
for(const s of icSecs){const ar=ICSECTION_NOTE[s.qdb_info_card_sectionname];if(ar)await upsert('qdb_info_card_section',s.qdb_info_card_sectionid,'qdb_note_text',ar);}
console.log('  ✓ info-card section notes');
for(const i of icItems){const ar=ICITEM_DESC[i.qdb_item_title];if(ar)await upsert('qdb_info_card_item',i.qdb_info_card_itemid,'qdb_item_description',ar);}
console.log('  ✓ info-card item descriptions');

console.log(`\n=== Done — ${count} translation records upserted ===\n`);
