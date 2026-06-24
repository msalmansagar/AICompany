/**
 * Supplemental Arabic translations for dfe-all-features — fills gaps the
 * original seed missed: option-value notes (radio-card callouts), the
 * cs_work_permit_required boolean field, and the cs_region/cs_country fields.
 *
 * Idempotent upsert via the qdb_translation composite alternate key.
 * Run: node --env-file=scripts/.env scripts/seed-dfe-all-features-ar-supplemental.mjs
 */

const DV_CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
if (!DV_CLIENT_SECRET) {
  throw new Error('DV_CLIENT_SECRET is required. Run with: node --env-file=scripts/.env scripts/seed-dfe-all-features-ar-supplemental.mjs');
}

const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const DV        = 'https://org5869857f.crm4.dynamics.com';
const BASE      = `${DV}/api/data/v9.2`;
const LANG      = 'ar';
const FORM_CODE = 'dfe-all-features';

const token = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: DV_CLIENT_SECRET, scope: `${DV}/.default` }),
}).then(r => r.json()).then(j => { if (!j.access_token) throw new Error(j.error_description); return j.access_token; });

const H = { Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json' };

async function get(path) {
  const r = await fetch(`${BASE}/${path}`, { headers: H });
  const j = await r.json();
  if (!r.ok) throw new Error(`GET ${path}: ${j.error?.message ?? r.status}`);
  return j;
}

let count = 0;
async function upsert(entityName, recordId, fieldName, value) {
  const key = `qdb_entity_name='${entityName}',qdb_record_id='${recordId}',qdb_field_name='${fieldName}',qdb_language_code='${LANG}'`;
  const body = { qdb_entity_name: entityName, qdb_record_id: recordId, qdb_field_name: fieldName, qdb_language_code: LANG, qdb_translated_value: value, qdb_is_active: true };
  const r = await fetch(`${BASE}/qdb_translations(${key})`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
  if (r.status === 200 || r.status === 204) { count++; return; }
  throw new Error(`PATCH ${key} -> ${r.status}: ${await r.text()}`);
}

console.log('\n=== Supplemental Arabic translations — dfe-all-features ===\n');

// ── Resolve form, tabs, fields ──────────────────────────────────────────────
const form = (await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}' and statecode eq 0&$select=qdb_form_definitionid&$top=1`)).value[0];
if (!form) throw new Error(`Form '${FORM_CODE}' not found`);
const fid = form.qdb_form_definitionid;

const tabIds = new Set((await get(`qdb_form_tabs?$filter=_qdb_form_definition_id_value eq '${fid}' and statecode eq 0&$select=qdb_form_tabid`)).value.map(t => t.qdb_form_tabid));
const fields = (await get(`qdb_form_fields?$filter=statecode eq 0&$select=qdb_form_fieldid,qdb_schema_name&$expand=qdb_form_section_id($select=_qdb_form_tab_id_value)&$top=200`)).value
  .filter(f => tabIds.has(f.qdb_form_section_id?._qdb_form_tab_id_value));
const fieldId = Object.fromEntries(fields.map(f => [f.qdb_schema_name, f.qdb_form_fieldid]));

// ── [1] cs_work_permit_required field (label + true/false) ──────────────────
console.log('[1] cs_work_permit_required …');
const wp = fieldId['cs_work_permit_required'];
if (wp) {
  await upsert('qdb_form_field', wp, 'qdb_label', 'هل تحتاج إلى تصريح عمل؟');
  await upsert('qdb_form_field', wp, 'qdb_true_label', 'نعم — أحتاج إلى تصريح عمل');
  await upsert('qdb_form_field', wp, 'qdb_false_label', 'لا — أنا مخوّل للعمل بالفعل');
  console.log('   ✓ label + true/false');
} else console.log('   ⚠ field not found');

// ── [2] cs_region / cs_country fields + their options ───────────────────────
console.log('[2] cs_region / cs_country …');
const regionLabels = { Region: 'المنطقة' };
const optAr = {
  gcc: 'دول مجلس التعاون الخليجي', europe: 'أوروبا', asia: 'آسيا',
  qa: 'قطر', ae: 'الإمارات العربية المتحدة', sa: 'المملكة العربية السعودية',
  gb: 'المملكة المتحدة', de: 'ألمانيا', fr: 'فرنسا',
  in: 'الهند', pk: 'باكستان', ph: 'الفلبين',
};
for (const [schema, labelAr] of [['cs_region', 'المنطقة'], ['cs_country', 'الدولة (مُصفّاة حسب المنطقة)']]) {
  const id = fieldId[schema];
  if (!id) { console.log(`   ⚠ ${schema} not found`); continue; }
  await upsert('qdb_form_field', id, 'qdb_label', labelAr);
  const opts = (await get(`qdb_form_option_values?$filter=_qdb_form_field_id_value eq '${id}' and statecode eq 0&$select=qdb_form_option_valueid,qdb_value`)).value;
  for (const o of opts) {
    const ar = optAr[o.qdb_value];
    if (ar) await upsert('qdb_form_option_value', o.qdb_form_option_valueid, 'qdb_label', ar);
  }
  console.log(`   ✓ ${schema} label + ${opts.length} options`);
}

// ── [3] Option NOTES (radio-card callouts) + missing descriptions ───────────
console.log('[3] option notes (gender + contract) …');
const notesByValue = {
  // gender
  male:   'سيظهر هذا في مستنداتك الرسمية.',
  female: 'سيظهر هذا في مستنداتك الرسمية.',
  other:  'خصوصيتك محمية ولا تتم مشاركتها خارجياً.',
  // contract
  permanent: 'يشمل حزمة مزايا كاملة: تأمين صحي وإجازة سنوية ومعاش تقاعدي.',
  contract:  'تُحتسب المزايا تناسبياً حسب مدة العقد. بدون مساهمات تقاعدية.',
  part_time: 'مؤهل للتأمين الصحي فقط. تُحتسب الإجازة السنوية تناسبياً.',
  freelance: 'لا توجد مزايا توظيف. يلزم تقديم فاتورة ضريبية شهرياً. يخضع لقواعد IR35.',
};
const descByValue = {
  // gender — fill the one that fell back to English
  other: 'الخصوصية — غير مُفصح عنها',
};
for (const schema of ['cs_gender', 'cs_contract_type']) {
  const id = fieldId[schema];
  if (!id) { console.log(`   ⚠ ${schema} not found`); continue; }
  const opts = (await get(`qdb_form_option_values?$filter=_qdb_form_field_id_value eq '${id}' and statecode eq 0&$select=qdb_form_option_valueid,qdb_value,qdb_notes,qdb_description`)).value;
  for (const o of opts) {
    if (o.qdb_notes && notesByValue[o.qdb_value]) await upsert('qdb_form_option_value', o.qdb_form_option_valueid, 'qdb_notes', notesByValue[o.qdb_value]);
    if (descByValue[o.qdb_value]) await upsert('qdb_form_option_value', o.qdb_form_option_valueid, 'qdb_description', descByValue[o.qdb_value]);
  }
  console.log(`   ✓ ${schema}: ${opts.length} options processed`);
}

console.log(`\n=== Done — ${count} translation records upserted ===`);
console.log('Invalidate cache: POST /api/internal/cache/invalidate { "target": "translations" }\n');
