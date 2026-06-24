/**
 * seed-dfe-all-features-ar-translations.mjs
 *
 * Queries the live dfe-all-features form and seeds Arabic (ar) translations
 * for all FR-001..FR-014 string types into qdb_translations.
 *
 * Covers every translatable entity:
 *   FR-001  qdb_form_definition — title, description, confirmation_message
 *   FR-002  qdb_form_definition — infocard nav labels
 *   FR-003  qdb_form_tab        — label
 *   FR-004  qdb_form_section    — label, description
 *   FR-005  qdb_form_field      — label, placeholder, tooltip, info_card_title, info_card_body
 *   FR-006  prefix/suffix       — not present on this form (skipped)
 *   FR-007  qdb_form_field      — true_label, false_label (boolean field)
 *   FR-008  qdb_form_field      — labels for checkbox fields (covered under FR-005)
 *   FR-009  qdb_form_option_value — label, description
 *   FR-010  CRM OptionSet       — handled by LCID pack, not seeded here
 *   FR-011  qdb_grid_column_config — column_label
 *   FR-012  qdb_info_card_screen/section/item — headings, titles, items
 *   FR-013  qdb_form_validation_rule — error_message
 *   FR-014  qdb_form_button     — label, confirmation_message
 *
 * Run:
 *   node --env-file=scripts/.env scripts/seed-dfe-all-features-ar-translations.mjs
 *
 * Required .env entry:
 *   DV_CLIENT_SECRET=<service-principal-secret>
 *
 * NOTE: Requires qdb_translation entity and qdb_translation_composite_key alternate key
 * to exist in Dataverse. Run provision-i18n-schema-webapi.mjs first if they do not exist.
 */

// ── Guard ─────────────────────────────────────────────────────────────────────

const DV_CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
if (!DV_CLIENT_SECRET) {
  throw new Error(
    'DV_CLIENT_SECRET is not set. ' +
    'Run with: node --env-file=scripts/.env scripts/seed-dfe-all-features-ar-translations.mjs'
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;
const FORM_CODE     = 'dfe-all-features';
const LANG_CODE     = 'ar';

// ── Auth ──────────────────────────────────────────────────────────────────────

async function acquireToken() {
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     CLIENT_ID,
    client_secret: DV_CLIENT_SECRET,
    scope:         `${DATAVERSE_URL}/.default`,
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
  );
  if (!res.ok) throw new Error(`Token request failed ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (!json.access_token) throw new Error(json.error_description ?? 'Token acquisition failed');
  return json.access_token;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function buildHeaders(token) {
  return {
    Authorization:      `Bearer ${token}`,
    'OData-MaxVersion': '4.0',
    'OData-Version':    '4.0',
    Accept:             'application/json',
    'Content-Type':     'application/json',
  };
}

async function apiGet(token, path) {
  const res = await fetch(`${API_BASE}/${path}`, { headers: buildHeaders(token) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} -> ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Translation upsert ────────────────────────────────────────────────────────

// Counter tracked at module level so helpers can increment without passing state
let upsertedCount = 0;

/**
 * Upserts one Arabic translation record via the composite alternate key.
 * All four key fields MUST be included in the body (Dataverse requirement for
 * alternate-key upserts). Returns true if the record was written.
 */
async function upsertTranslation(token, entityName, recordId, fieldName, translatedValue) {
  const keyExpression =
    `qdb_entity_name='${entityName}',` +
    `qdb_record_id='${recordId}',` +
    `qdb_field_name='${fieldName}',` +
    `qdb_language_code='${LANG_CODE}'`;

  const body = {
    qdb_entity_name:      entityName,
    qdb_record_id:        recordId,
    qdb_field_name:       fieldName,
    qdb_language_code:    LANG_CODE,
    qdb_translated_value: translatedValue,
    qdb_is_active:        true,
  };

  const res = await fetch(`${API_BASE}/qdb_translations(${keyExpression})`, {
    method:  'PATCH',
    headers: buildHeaders(token),
    body:    JSON.stringify(body),
  });

  if (res.status === 200 || res.status === 204) {
    upsertedCount++;
    return true;
  }

  const text = await res.text();
  throw new Error(`PATCH qdb_translations(${keyExpression}) -> ${res.status}: ${text}`);
}

// ── Translation mapping helpers ───────────────────────────────────────────────

/**
 * Applies a field-level translation map to a single record.
 * translationMap: Array of { fieldName, englishValue, arabicValue }
 * Only writes a translation if the record's current field matches englishValue
 * (exact string match, null-safe).
 */
async function applyTranslationMap(token, entityName, record, recordIdField, translationMap) {
  const recordId = record[recordIdField];
  for (const { fieldName, englishValue, arabicValue } of translationMap) {
    if (record[fieldName] === englishValue) {
      await upsertTranslation(token, entityName, recordId, fieldName, arabicValue);
    }
  }
}

/**
 * Iterates a list of records and applies the translation map to each.
 */
async function seedEntityTranslations(token, entityName, records, recordIdField, translationMap) {
  for (const record of records) {
    await applyTranslationMap(token, entityName, record, recordIdField, translationMap);
  }
}

// ── Data fetch helpers ────────────────────────────────────────────────────────

async function fetchForm(token) {
  const res = await apiGet(
    token,
    `qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}' and statecode eq 0` +
    `&$select=qdb_form_definitionid,qdb_title,qdb_description,qdb_confirmation_message,` +
    `qdb_infocard_start_label,qdb_infocard_continue_label,qdb_infocard_back_label&$top=1`
  );
  if (!res.value?.length) throw new Error(`Form '${FORM_CODE}' not found or inactive`);
  return res.value[0];
}

async function fetchTabs(token, formId) {
  const res = await apiGet(
    token,
    `qdb_form_tabs?$filter=_qdb_form_definition_id_value eq '${formId}'` +
    `&$select=qdb_form_tabid,qdb_label`
  );
  return res.value ?? [];
}

async function fetchSectionsForTab(token, tabId) {
  const res = await apiGet(
    token,
    `qdb_form_sections?$filter=_qdb_form_tab_id_value eq '${tabId}'` +
    `&$select=qdb_form_sectionid,qdb_label,qdb_description`
  );
  return res.value ?? [];
}

async function fetchFieldsForSection(token, sectionId) {
  const res = await apiGet(
    token,
    `qdb_form_fields?$filter=_qdb_form_section_id_value eq '${sectionId}'` +
    `&$select=qdb_form_fieldid,qdb_label,qdb_placeholder,qdb_tooltip,` +
    `qdb_true_label,qdb_false_label,qdb_info_card_title,qdb_info_card_body,` +
    `qdb_info_card_download_label,qdb_file_download_label`
  );
  return res.value ?? [];
}

async function fetchOptionValuesForField(token, fieldId) {
  const res = await apiGet(
    token,
    `qdb_form_option_values?$filter=_qdb_form_field_id_value eq '${fieldId}'` +
    `&$select=qdb_form_option_valueid,qdb_label,qdb_description,qdb_notes`
  );
  return res.value ?? [];
}

async function fetchValidationRulesForField(token, fieldId) {
  const res = await apiGet(
    token,
    `qdb_form_validation_rules?$filter=_qdb_form_field_id_value eq '${fieldId}'` +
    `&$select=qdb_form_validation_ruleid,qdb_error_message`
  );
  return res.value ?? [];
}

async function fetchGridColumnsForField(token, fieldId) {
  const res = await apiGet(
    token,
    `qdb_grid_column_configs?$filter=_qdb_form_field_id_value eq '${fieldId}'` +
    `&$select=qdb_grid_column_configid,qdb_column_label`
  );
  return res.value ?? [];
}

async function fetchButtonsForForm(token, formId) {
  const res = await apiGet(
    token,
    `qdb_form_buttons?$filter=_qdb_form_definition_id_value eq '${formId}'` +
    `&$select=qdb_form_buttonid,qdb_label,qdb_confirmation_message`
  );
  return res.value ?? [];
}

async function fetchInfoCardScreensForForm(token, formId) {
  const res = await apiGet(
    token,
    `qdb_info_card_screens?$filter=_qdb_form_definition_id_value eq '${formId}'` +
    `&$select=qdb_info_card_screenid,qdb_heading,qdb_sub_heading,qdb_icon_alt_text`
  );
  return res.value ?? [];
}

async function fetchInfoCardSectionsForScreen(token, screenId) {
  const res = await apiGet(
    token,
    `qdb_info_card_sections?$filter=_qdb_info_card_screen_id_value eq '${screenId}'` +
    `&$select=qdb_info_card_sectionid,qdb_section_title,qdb_note_text`
  );
  return res.value ?? [];
}

async function fetchInfoCardItemsForSection(token, sectionId) {
  const res = await apiGet(
    token,
    `qdb_info_card_items?$filter=_qdb_info_card_section_id_value eq '${sectionId}'` +
    `&$select=qdb_info_card_itemid,qdb_item_title,qdb_item_description`
  );
  return res.value ?? [];
}

// ── Translation maps (English value → Arabic value) ───────────────────────────
// Each map entry drives an exact-match lookup against the queried record.
// FR-006 prefix/suffix is not present on this form — no map entry needed.
// FR-010 CRM OptionSet labels are handled by the Dataverse LCID pack — skipped here.

const FORM_DEFINITION_MAP = [
  // FR-001 — core labels
  { fieldName: 'qdb_title',                arabicValue: 'نموذج شامل لجميع الميزات',                    englishValue: 'DFE All Features' },
  { fieldName: 'qdb_description',          arabicValue: 'يوضح جميع أنواع الحقول الواحد والعشرين والتحقق من الصحة والقواعد والشبكات والبطاقات المعلوماتية', englishValue: 'Demonstrates all 21 field types, themes, designs, business rules, validation, lookups, grids, and info-cards.' },
  { fieldName: 'qdb_confirmation_message', arabicValue: 'تم استلام طلبك بنجاح. رقم المرجع معروض أعلاه.',  englishValue: 'Your DFE All Features submission has been received. Reference number is shown above.' },
  // FR-002 — infocard nav labels
  { fieldName: 'qdb_infocard_start_label',    arabicValue: 'ابدأ',    englishValue: 'Get Started' },
  { fieldName: 'qdb_infocard_continue_label', arabicValue: 'التالي',  englishValue: 'Next' },
  { fieldName: 'qdb_infocard_back_label',     arabicValue: 'رجوع',    englishValue: 'Back' },
];

const TAB_LABEL_MAP = [
  // FR-003
  { fieldName: 'qdb_label', englishValue: 'Personal Info',        arabicValue: 'المعلومات الشخصية' },
  { fieldName: 'qdb_label', englishValue: 'Professional Details', arabicValue: 'التفاصيل المهنية' },
  { fieldName: 'qdb_label', englishValue: 'Financial & Docs',     arabicValue: 'المالية والوثائق' },
  { fieldName: 'qdb_label', englishValue: 'System Access',        arabicValue: 'الوصول إلى النظام' },
  { fieldName: 'qdb_label', englishValue: 'Review & Submit',      arabicValue: 'المراجعة والإرسال' },
];

const SECTION_MAP = [
  // FR-004 — labels
  { fieldName: 'qdb_label', englishValue: 'Identity',        arabicValue: 'الهوية' },
  { fieldName: 'qdb_label', englishValue: 'Date of Birth',   arabicValue: 'تاريخ الميلاد' },
  { fieldName: 'qdb_label', englishValue: 'Employment',      arabicValue: 'التوظيف' },
  { fieldName: 'qdb_label', englishValue: 'Skills & Prefs',  arabicValue: 'المهارات والتفضيلات' },
  { fieldName: 'qdb_label', englishValue: 'Financial Info',  arabicValue: 'المعلومات المالية' },
  { fieldName: 'qdb_label', englishValue: 'Documents',       arabicValue: 'الوثائق' },
  { fieldName: 'qdb_label', englishValue: 'Select Role',     arabicValue: 'اختيار الدور' },
  { fieldName: 'qdb_label', englishValue: 'Define Permissions', arabicValue: 'تحديد الأذونات' },
  { fieldName: 'qdb_label', englishValue: 'Linked Form',     arabicValue: 'النموذج المرتبط' },
  { fieldName: 'qdb_label', englishValue: 'Filtered Grid Demo', arabicValue: 'عرض الشبكة المفلترة' },
  { fieldName: 'qdb_label', englishValue: 'Review',          arabicValue: 'المراجعة' },
  // FR-004 — descriptions (Identity section has a description)
  { fieldName: 'qdb_description', englishValue: 'Your full legal name, email, and contact number', arabicValue: 'اسمك القانوني الكامل والبريد الإلكتروني ورقم الاتصال' },
];

const FIELD_MAP = [
  // FR-005 — labels
  { fieldName: 'qdb_label', englishValue: 'Full Name',                            arabicValue: 'الاسم الكامل' },
  { fieldName: 'qdb_label', englishValue: 'Work Email',                           arabicValue: 'البريد الإلكتروني للعمل' },
  { fieldName: 'qdb_label', englishValue: 'Mobile Number',                        arabicValue: 'رقم الجوال' },
  { fieldName: 'qdb_label', englishValue: 'Nationality',                          arabicValue: 'الجنسية' },
  { fieldName: 'qdb_label', englishValue: 'Date of Birth',                        arabicValue: 'تاريخ الميلاد' },
  { fieldName: 'qdb_label', englishValue: 'Age (years)',                          arabicValue: 'العمر (بالسنوات)' },
  { fieldName: 'qdb_label', englishValue: 'Gender',                               arabicValue: 'الجنس' },
  { fieldName: 'qdb_label', englishValue: 'Qatar Resident?',                      arabicValue: 'مقيم في قطر؟' },
  { fieldName: 'qdb_label', englishValue: 'Employment Status',                    arabicValue: 'الحالة الوظيفية' },
  { fieldName: 'qdb_label', englishValue: 'Employer Name',                        arabicValue: 'اسم جهة العمل' },
  { fieldName: 'qdb_label', englishValue: 'Job Title',                            arabicValue: 'المسمى الوظيفي' },
  { fieldName: 'qdb_label', englishValue: 'Contract Type',                        arabicValue: 'نوع العقد' },
  { fieldName: 'qdb_label', englishValue: 'Technical Skills',                     arabicValue: 'المهارات التقنية' },
  { fieldName: 'qdb_label', englishValue: 'Email notifications enabled?',         arabicValue: 'تفعيل إشعارات البريد الإلكتروني؟' },
  { fieldName: 'qdb_label', englishValue: 'I agree to the terms and conditions',  arabicValue: 'أوافق على الشروط والأحكام' },
  { fieldName: 'qdb_label', englishValue: 'Monthly Income (QAR)',                  arabicValue: 'الدخل الشهري (ريال قطري)' },
  { fieldName: 'qdb_label', englishValue: 'Total Savings (QAR)',                  arabicValue: 'إجمالي المدخرات (ريال قطري)' },
  { fieldName: 'qdb_label', englishValue: 'Employment Start Date',                arabicValue: 'تاريخ بدء العمل' },
  { fieldName: 'qdb_label', englishValue: 'Years of Experience',                  arabicValue: 'سنوات الخبرة' },
  { fieldName: 'qdb_label', englishValue: 'Upload CV / Resume',                   arabicValue: 'رفع السيرة الذاتية' },
  { fieldName: 'qdb_label', englishValue: 'Additional Notes',                     arabicValue: 'ملاحظات إضافية' },
  { fieldName: 'qdb_label', englishValue: 'Form Definition',                      arabicValue: 'تعريف النموذج' },
  { fieldName: 'qdb_label', englishValue: 'Custom Permissions',                   arabicValue: 'الأذونات المخصصة' },
  { fieldName: 'qdb_label', englishValue: 'Filter by Form Status',                arabicValue: 'تصفية حسب حالة النموذج' },
  { fieldName: 'qdb_label', englishValue: 'Forms (filtered by status)',            arabicValue: 'النماذج (مفلترة حسب الحالة)' },
  { fieldName: 'qdb_label', englishValue: 'Proposed Effective Date & Time',       arabicValue: 'التاريخ والوقت المقترحان للنفاذ' },
  { fieldName: 'qdb_label', englishValue: 'Final Comment',                        arabicValue: 'التعليق الأخير' },
  { fieldName: 'qdb_label', englishValue: 'Submission warning',                   arabicValue: 'تحذير الإرسال' },
  { fieldName: 'qdb_label', englishValue: 'Field Type',                           arabicValue: 'نوع الحقل' },
  { fieldName: 'qdb_label', englishValue: 'Form Code system',                     arabicValue: 'رمز النموذج (نظام)' },
  // FR-005 — placeholders
  { fieldName: 'qdb_placeholder', englishValue: 'First and last name',            arabicValue: 'الاسم الأول والأخير' },
  { fieldName: 'qdb_placeholder', englishValue: 'name@company.com',               arabicValue: 'الاسم@الشركة.com' },
  { fieldName: 'qdb_placeholder', englishValue: '8 digits',                       arabicValue: '8 أرقام' },
  { fieldName: 'qdb_placeholder', englishValue: '— Select —',                     arabicValue: '— اختر —' },
  { fieldName: 'qdb_placeholder', englishValue: 'e.g. 28',                        arabicValue: 'مثال: 28' },
  { fieldName: 'qdb_placeholder', englishValue: '— Select status —',              arabicValue: '— اختر الحالة —' },
  { fieldName: 'qdb_placeholder', englishValue: 'Company name',                   arabicValue: 'اسم الشركة' },
  { fieldName: 'qdb_placeholder', englishValue: 'e.g. Senior Engineer',           arabicValue: 'مثال: مهندس أول' },
  { fieldName: 'qdb_placeholder', englishValue: '0.00',                           arabicValue: '0.00' },
  { fieldName: 'qdb_placeholder', englishValue: 'Any extra information you want to share…', arabicValue: 'أي معلومات إضافية تريد مشاركتها...' },
  { fieldName: 'qdb_placeholder', englishValue: 'Any last remarks before submission…',     arabicValue: 'أي ملاحظات أخيرة قبل الإرسال...' },
  // FR-005 — tooltips
  { fieldName: 'qdb_tooltip', englishValue: 'Browse active form definitions and pick one',            arabicValue: 'تصفح تعريفات النماذج النشطة واختر واحداً' },
  { fieldName: 'qdb_tooltip', englishValue: 'Define permissions inline — each row becomes a permission record', arabicValue: 'حدد الأذونات — كل صف يصبح سجل إذن' },
  // FR-005 — inline infoCard field labels (on infoCard field type)
  { fieldName: 'qdb_info_card_title', englishValue: 'Tip: Multi-select Skills',                    arabicValue: 'نصيحة: اختيار متعدد للمهارات' },
  { fieldName: 'qdb_info_card_body',  englishValue: 'Hold Ctrl (or Cmd on Mac) to select multiple skills. Your selections will be saved automatically.', arabicValue: 'اضغط Ctrl (أو Cmd على Mac) لاختيار مهارات متعددة. سيتم حفظ اختياراتك تلقائياً.' },
  { fieldName: 'qdb_info_card_title', englishValue: 'Cannot Edit After Submission',                arabicValue: 'لا يمكن التعديل بعد الإرسال' },
  { fieldName: 'qdb_info_card_body',  englishValue: 'Once submitted, this record cannot be modified. Please review all sections before proceeding.', arabicValue: 'بمجرد الإرسال، لا يمكن تعديل هذا السجل. يرجى مراجعة جميع الأقسام قبل المتابعة.' },
  // FR-007 — Boolean field labels (fResident)
  { fieldName: 'qdb_true_label',  englishValue: 'Yes, I am a Qatar resident',     arabicValue: 'نعم، أنا مقيم في قطر' },
  { fieldName: 'qdb_false_label', englishValue: 'No, I am not a resident',        arabicValue: 'لا، لست مقيماً' },
];

const OPTION_VALUE_MAP = [
  // FR-009 — Nationality options
  { fieldName: 'qdb_label', englishValue: 'Qatari',             arabicValue: 'قطري' },
  { fieldName: 'qdb_label', englishValue: 'Saudi',              arabicValue: 'سعودي' },
  { fieldName: 'qdb_label', englishValue: 'Egyptian',           arabicValue: 'مصري' },
  { fieldName: 'qdb_label', englishValue: 'Indian',             arabicValue: 'هندي' },
  { fieldName: 'qdb_label', englishValue: 'Pakistani',          arabicValue: 'باكستاني' },
  { fieldName: 'qdb_label', englishValue: 'British',            arabicValue: 'بريطاني' },
  { fieldName: 'qdb_label', englishValue: 'American',           arabicValue: 'أمريكي' },
  { fieldName: 'qdb_label', englishValue: 'Other',              arabicValue: 'أخرى' },
  // FR-009 — Employment Status options
  { fieldName: 'qdb_label', englishValue: 'Employed',           arabicValue: 'موظف' },
  { fieldName: 'qdb_label', englishValue: 'Self-Employed',      arabicValue: 'يعمل لحسابه' },
  { fieldName: 'qdb_label', englishValue: 'Unemployed',         arabicValue: 'غير موظف' },
  { fieldName: 'qdb_label', englishValue: 'Student',            arabicValue: 'طالب' },
  { fieldName: 'qdb_label', englishValue: 'Retired',            arabicValue: 'متقاعد' },
  // FR-009 — Gender options
  { fieldName: 'qdb_label', englishValue: 'Male',               arabicValue: 'ذكر' },
  { fieldName: 'qdb_label', englishValue: 'Female',             arabicValue: 'أنثى' },
  { fieldName: 'qdb_label', englishValue: 'Prefer not to say',  arabicValue: 'أفضل عدم الإفصاح' },
  // FR-009 — Gender descriptions
  { fieldName: 'qdb_description', englishValue: 'Identifies as male',   arabicValue: 'يُعرَّف كذكر' },
  { fieldName: 'qdb_description', englishValue: 'Identifies as female', arabicValue: 'تُعرَّف كأنثى' },
  // FR-009 — Contract Type options
  { fieldName: 'qdb_label', englishValue: 'Permanent',          arabicValue: 'دائم' },
  { fieldName: 'qdb_label', englishValue: 'Fixed-term',         arabicValue: 'محدد المدة' },
  { fieldName: 'qdb_label', englishValue: 'Part-time',          arabicValue: 'دوام جزئي' },
  { fieldName: 'qdb_label', englishValue: 'Freelance',          arabicValue: 'مستقل' },
  // FR-009 — Technical Skills (top 3 as specified)
  { fieldName: 'qdb_label', englishValue: 'JavaScript',         arabicValue: 'جافاسكريبت' },
  { fieldName: 'qdb_label', englishValue: 'TypeScript',         arabicValue: 'تايب سكريبت' },
  { fieldName: 'qdb_label', englishValue: 'React',              arabicValue: 'ريآكت' },
];

const GRID_COLUMN_MAP = [
  // FR-011 — fSelectRole columns
  { fieldName: 'qdb_column_label', englishValue: 'Form Code',    arabicValue: 'رمز النموذج' },
  { fieldName: 'qdb_column_label', englishValue: 'Title',        arabicValue: 'العنوان' },
  { fieldName: 'qdb_column_label', englishValue: 'Status',       arabicValue: 'الحالة' },
  { fieldName: 'qdb_column_label', englishValue: 'Modified',     arabicValue: 'آخر تعديل' },
  // FR-011 — fPermGrid columns
  { fieldName: 'qdb_column_label', englishValue: 'Schema Name',  arabicValue: 'اسم المخطط' },
  { fieldName: 'qdb_column_label', englishValue: 'Label',        arabicValue: 'التسمية' },
  { fieldName: 'qdb_column_label', englishValue: 'Field Type',   arabicValue: 'نوع الحقل' },
  { fieldName: 'qdb_column_label', englishValue: 'Required',     arabicValue: 'مطلوب' },
  // FR-011 — fFilteredForms columns (Form Code, Title, Status are covered above)
];

const INFO_CARD_SCREEN_MAP = [
  // FR-012 — Screen 1
  { fieldName: 'qdb_heading',      englishValue: 'Welcome to the Complete DFE Showcase',                              arabicValue: 'مرحباً بكم في العرض التوضيحي الكامل لـ DFE' },
  { fieldName: 'qdb_sub_heading',  englishValue: 'This form demonstrates all Dynamic Form Engine capabilities',       arabicValue: 'يوضح هذا النموذج جميع قدرات محرك النماذج الديناميكية' },
  { fieldName: 'qdb_icon_alt_text',englishValue: 'DFE showcase illustration',                                         arabicValue: 'رسم توضيحي لعرض DFE' },
  // FR-012 — Screen 2
  { fieldName: 'qdb_heading',      englishValue: 'What You Will Need',                                                arabicValue: 'ما ستحتاجه' },
  { fieldName: 'qdb_sub_heading',  englishValue: 'Gather these before you start',                                     arabicValue: 'اجمع هذه المستلزمات قبل البدء' },
  { fieldName: 'qdb_icon_alt_text',englishValue: 'Checklist illustration',                                            arabicValue: 'رسم توضيحي للقائمة المرجعية' },
];

const INFO_CARD_SECTION_MAP = [
  // FR-012 — section titles
  { fieldName: 'qdb_section_title', englishValue: 'What You Will Fill In',    arabicValue: 'ما ستقوم بتعبئته' },
  { fieldName: 'qdb_section_title', englishValue: 'Required Information',     arabicValue: 'المعلومات المطلوبة' },
  { fieldName: 'qdb_section_title', englishValue: 'Download Templates',       arabicValue: 'تنزيل القوالب' },
];

const INFO_CARD_ITEM_MAP = [
  // FR-012 — Screen 1, Section 1 (steps)
  { fieldName: 'qdb_item_title', englishValue: 'Personal Info',          arabicValue: 'المعلومات الشخصية' },
  { fieldName: 'qdb_item_title', englishValue: 'Professional Details',   arabicValue: 'التفاصيل المهنية' },
  { fieldName: 'qdb_item_title', englishValue: 'Financial & Docs',       arabicValue: 'المالية والوثائق' },
  { fieldName: 'qdb_item_title', englishValue: 'System Access',          arabicValue: 'الوصول إلى النظام' },
  { fieldName: 'qdb_item_title', englishValue: 'Review & Submit',        arabicValue: 'المراجعة والإرسال' },
  // FR-012 — item descriptions (step items)
  { fieldName: 'qdb_item_description', englishValue: 'Full name, email, phone, date of birth, and gender', arabicValue: 'الاسم الكامل والبريد الإلكتروني والهاتف وتاريخ الميلاد والجنس' },
  { fieldName: 'qdb_item_description', englishValue: 'Employment status, job title, skills, and contract type', arabicValue: 'الحالة الوظيفية والمسمى الوظيفي والمهارات ونوع العقد' },
  // FR-012 — Screen 2, Section 1 (required info)
  { fieldName: 'qdb_item_title', englishValue: 'Valid Email Address',    arabicValue: 'عنوان بريد إلكتروني صالح' },
  { fieldName: 'qdb_item_title', englishValue: 'Qatar Mobile Number',    arabicValue: 'رقم جوال قطري' },
  { fieldName: 'qdb_item_title', englishValue: 'Date of Birth',          arabicValue: 'تاريخ الميلاد' },
  { fieldName: 'qdb_item_title', englishValue: 'Monthly Income Figure',  arabicValue: 'رقم الدخل الشهري' },
  { fieldName: 'qdb_item_title', englishValue: 'Updated CV',             arabicValue: 'سيرة ذاتية محدثة' },
  // FR-012 — Screen 2, Section 2 (download list)
  { fieldName: 'qdb_item_title', englishValue: 'CV Template (English)',  arabicValue: 'قالب السيرة الذاتية (إنجليزي)' },
  { fieldName: 'qdb_item_title', englishValue: 'NOC Template',           arabicValue: 'قالب خطاب عدم الممانعة' },
];

const VALIDATION_RULE_MAP = [
  // FR-013
  { fieldName: 'qdb_error_message', englishValue: 'Full name must be at least 3 characters',           arabicValue: 'يجب أن يتكون الاسم الكامل من 3 أحرف على الأقل' },
  { fieldName: 'qdb_error_message', englishValue: 'Full name cannot exceed 80 characters',             arabicValue: 'لا يمكن أن يتجاوز الاسم الكامل 80 حرفاً' },
  { fieldName: 'qdb_error_message', englishValue: 'Enter a valid email address',                       arabicValue: 'يرجى إدخال عنوان بريد إلكتروني صالح' },
  { fieldName: 'qdb_error_message', englishValue: 'Enter a valid 8-digit Qatar mobile number',         arabicValue: 'يرجى إدخال رقم جوال قطري مكون من 8 أرقام' },
  { fieldName: 'qdb_error_message', englishValue: 'Must be at least 18 years old',                     arabicValue: 'يجب أن يكون العمر 18 عاماً على الأقل' },
  { fieldName: 'qdb_error_message', englishValue: 'Maximum age is 70',                                 arabicValue: 'الحد الأقصى للعمر هو 70 عاماً' },
  { fieldName: 'qdb_error_message', englishValue: 'Monthly income must be at least QAR 1,000',         arabicValue: 'يجب أن يكون الدخل الشهري 1,000 ريال قطري على الأقل' },
  { fieldName: 'qdb_error_message', englishValue: 'Notes cannot exceed 1,000 characters',              arabicValue: 'لا يمكن أن تتجاوز الملاحظات 1,000 حرف' },
  { fieldName: 'qdb_error_message', englishValue: 'Final comment cannot exceed 500 characters',        arabicValue: 'لا يمكن أن يتجاوز التعليق الأخير 500 حرف' },
];

const BUTTON_MAP = [
  // FR-014
  { fieldName: 'qdb_label',                englishValue: 'Cancel',                                 arabicValue: 'إلغاء' },
  { fieldName: 'qdb_label',                englishValue: 'Save Progress',                          arabicValue: 'حفظ التقدم' },
  { fieldName: 'qdb_label',                englishValue: 'Submit Application',                     arabicValue: 'إرسال الطلب' },
  { fieldName: 'qdb_confirmation_message', englishValue: 'This will submit the DFE All Features record. Are you sure?', arabicValue: 'سيتم إرسال سجل جميع الميزات. هل أنت متأكد؟' },
];

// ── Section seeding ───────────────────────────────────────────────────────────
// The section loop runs per-tab, collecting all section records and applying
// the section translation map. It also collects field IDs for child seeding.

async function seedSectionsAndChildren(token, tabs) {
  const allFields = [];

  for (const tab of tabs) {
    const sections = await fetchSectionsForTab(token, tab.qdb_form_tabid);
    await seedEntityTranslations(token, 'qdb_form_section', sections, 'qdb_form_sectionid', SECTION_MAP);

    for (const section of sections) {
      const fields = await fetchFieldsForSection(token, section.qdb_form_sectionid);
      allFields.push(...fields);
    }
  }

  return allFields;
}

async function seedFieldsAndChildren(token, fields) {
  await seedEntityTranslations(token, 'qdb_form_field', fields, 'qdb_form_fieldid', FIELD_MAP);

  for (const field of fields) {
    const fieldId = field.qdb_form_fieldid;

    const [optionValues, validationRules, gridColumns] = await Promise.all([
      fetchOptionValuesForField(token, fieldId),
      fetchValidationRulesForField(token, fieldId),
      fetchGridColumnsForField(token, fieldId),
    ]);

    if (optionValues.length) {
      await seedEntityTranslations(token, 'qdb_form_option_value', optionValues, 'qdb_form_option_valueid', OPTION_VALUE_MAP);
    }
    if (validationRules.length) {
      await seedEntityTranslations(token, 'qdb_form_validation_rule', validationRules, 'qdb_form_validation_ruleid', VALIDATION_RULE_MAP);
    }
    if (gridColumns.length) {
      await seedEntityTranslations(token, 'qdb_grid_column_config', gridColumns, 'qdb_grid_column_configid', GRID_COLUMN_MAP);
    }
  }
}

async function seedInfoCards(token, formId) {
  const screens = await fetchInfoCardScreensForForm(token, formId);
  await seedEntityTranslations(token, 'qdb_info_card_screen', screens, 'qdb_info_card_screenid', INFO_CARD_SCREEN_MAP);

  for (const screen of screens) {
    const cardSections = await fetchInfoCardSectionsForScreen(token, screen.qdb_info_card_screenid);
    await seedEntityTranslations(token, 'qdb_info_card_section', cardSections, 'qdb_info_card_sectionid', INFO_CARD_SECTION_MAP);

    for (const cardSection of cardSections) {
      const items = await fetchInfoCardItemsForSection(token, cardSection.qdb_info_card_sectionid);
      await seedEntityTranslations(token, 'qdb_info_card_item', items, 'qdb_info_card_itemid', INFO_CARD_ITEM_MAP);
    }
  }
}

// ── Final AR count query ──────────────────────────────────────────────────────

async function fetchTotalArTranslationCount(token) {
  const res = await apiGet(
    token,
    `qdb_translations?$filter=qdb_language_code eq 'ar'&$count=true&$top=1&$select=qdb_translationid`
  );
  // $count=true puts the total on @odata.count
  return res['@odata.count'] ?? 'unknown';
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== DFE All Features — Arabic Translation Seed ===');
  console.log(`    Form: ${FORM_CODE}`);
  console.log(`    Language: ${LANG_CODE}`);
  console.log(`    Org: ${DATAVERSE_URL}`);
  console.log('');

  const token = await acquireToken();
  console.log('[OK]   Token acquired');

  // Fetch the form
  const form = await fetchForm(token);
  const formId = form.qdb_form_definitionid;
  console.log(`[OK]   Form found: ${formId}`);

  // FR-001 + FR-002 — form definition fields
  console.log('\n[1/8]  Seeding form definition translations (FR-001, FR-002)...');
  await seedEntityTranslations(token, 'qdb_form_definition', [form], 'qdb_form_definitionid', FORM_DEFINITION_MAP);

  // FR-003 — tabs
  console.log('\n[2/8]  Seeding tab translations (FR-003)...');
  const tabs = await fetchTabs(token, formId);
  await seedEntityTranslations(token, 'qdb_form_tab', tabs, 'qdb_form_tabid', TAB_LABEL_MAP);
  console.log(`       ${tabs.length} tabs processed`);

  // FR-004 — sections (fetched per-tab inside seedSectionsAndChildren)
  console.log('\n[3/8]  Seeding section translations (FR-004) and collecting fields...');
  const allFields = await seedSectionsAndChildren(token, tabs);
  console.log(`       ${allFields.length} fields collected across all sections`);

  // FR-005, FR-007, FR-008, FR-009, FR-011, FR-013 — fields and all children
  console.log('\n[4/8]  Seeding field translations (FR-005, FR-007, FR-008) and child entities...');
  console.log('       Also seeding option values (FR-009), validation rules (FR-013), grid columns (FR-011)...');
  await seedFieldsAndChildren(token, allFields);

  // FR-014 — buttons
  console.log('\n[5/8]  Seeding button translations (FR-014)...');
  const buttons = await fetchButtonsForForm(token, formId);
  await seedEntityTranslations(token, 'qdb_form_button', buttons, 'qdb_form_buttonid', BUTTON_MAP);
  console.log(`       ${buttons.length} buttons processed`);

  // FR-012 — info card screens, sections, items
  console.log('\n[6/8]  Seeding info card translations (FR-012)...');
  await seedInfoCards(token, formId);

  // Summary
  console.log('\n--- Summary ---');
  console.log(`Upserted: ${upsertedCount} translation records`);

  // Total AR count in org
  const totalArCount = await fetchTotalArTranslationCount(token);
  console.log(`Total Arabic translation records in org: ${totalArCount}`);

  console.log('\n=== Arabic translation seed complete ===');
  console.log('NOTE: Invalidate the translation cache after this run:');
  console.log('  POST /api/internal/cache/invalidate  { "target": "translations" }');
}

await main();
