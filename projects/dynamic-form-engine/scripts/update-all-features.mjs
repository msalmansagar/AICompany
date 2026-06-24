/**
 * Update dfe-all-features form with every missing feature:
 *   - form: showSummaryStep, infocardSkipLabel, infocardCountsInProgress, confirmationRecordRefAttribute
 *   - tabs: iconName, requiresPreviousTabComplete
 *   - fields: prefix, suffix, fileDownloadLabel/Icon, uploadDocumentSetting, downloadDocumentSetting
 *   - info-card field: infoCardDownloadUrl/Label/Icon
 *   - info-card sections: noteText
 *   - option values: notes (radio-card callout text)
 *   - new boolean radio field
 *   - lookup dependsOnField
 *
 * Run: node scripts/update-all-features.mjs
 */

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;
const FORM_CODE     = 'dfe-all-features';

// ── Auth ──────────────────────────────────────────────────────────────────────
const tokenBody = new URLSearchParams({
  grant_type: 'client_credentials', client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET, scope: `${DV}/.default`,
});
const token = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenBody },
).then(r => r.json()).then(j => { if (!j.access_token) throw new Error(j.error_description); return j.access_token; });

const H = {
  Authorization: `Bearer ${token}`,
  'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
  Accept: 'application/json', 'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function get(path) {
  const r = await fetch(`${BASE}/${path}`, { headers: H });
  const j = await r.json();
  if (!r.ok) throw new Error(`GET ${path}: ${j.error?.message ?? r.status}`);
  return j;
}
async function patch(entity, id, body) {
  const r = await fetch(`${BASE}/${entity}(${id})`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`PATCH ${entity}(${id}): ${j.error?.message ?? r.status}`); }
}
async function post(entity, body) {
  const r = await fetch(`${BASE}/${entity}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`POST ${entity}: ${j.error?.message ?? r.status}`);
  return j;
}

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║   Update dfe-all-features — Add ALL Missing Features             ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');
console.log('✓ Token acquired');

// ── Fetch the form ────────────────────────────────────────────────────────────
const formRes = await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}' and statecode eq 0&$select=qdb_form_definitionid&$top=1`);
if (!formRes.value?.length) { console.error(`\n✗ Form '${FORM_CODE}' not found. Run seed-all-features.mjs first.\n`); process.exit(1); }
const fid = formRes.value[0].qdb_form_definitionid;
console.log(`✓ Form found: ${fid}`);

// ── Fetch tabs ────────────────────────────────────────────────────────────────
const tabsRes = await get(`qdb_form_tabs?$filter=_qdb_form_definition_id_value eq '${fid}' and statecode eq 0&$select=qdb_form_tabid,qdb_label&$orderby=qdb_display_order asc`);
const tabMap = Object.fromEntries(tabsRes.value.map(t => [t.qdb_label, t.qdb_form_tabid]));
console.log(`✓ Fetched ${tabsRes.value.length} tabs`);

// ── Fetch fields ──────────────────────────────────────────────────────────────
const fieldsRes = await get(`qdb_form_fields?$filter=statecode eq 0&$select=qdb_form_fieldid,qdb_schema_name,qdb_field_type&$expand=qdb_form_section_id($select=_qdb_form_tab_id_value)&$top=200`);
// Filter only fields belonging to this form's tabs
const tabIds = new Set(Object.values(tabMap));
const formFields = fieldsRes.value.filter(f => tabIds.has(f.qdb_form_section_id?._qdb_form_tab_id_value));
const fieldMap = Object.fromEntries(formFields.map(f => [f.qdb_schema_name, f.qdb_form_fieldid]));
console.log(`✓ Fetched ${formFields.length} fields for this form`);

// ── Fetch option values for radio-card fields ─────────────────────────────────
const genderFieldId   = fieldMap['cs_gender'];
const contractFieldId = fieldMap['cs_contract_type'];

const genderOpts   = genderFieldId   ? (await get(`qdb_form_option_values?$filter=_qdb_form_field_id_value eq '${genderFieldId}' and statecode eq 0&$select=qdb_form_option_valueid,qdb_value`)).value : [];
const contractOpts = contractFieldId ? (await get(`qdb_form_option_values?$filter=_qdb_form_field_id_value eq '${contractFieldId}' and statecode eq 0&$select=qdb_form_option_valueid,qdb_value`)).value : [];
console.log(`✓ Fetched ${genderOpts.length} gender options, ${contractOpts.length} contract options`);

// ── Fetch info-card sections ──────────────────────────────────────────────────
const screensRes  = await get(`qdb_info_card_screens?$filter=_qdb_form_definition_id_value eq '${fid}' and statecode eq 0&$select=qdb_info_card_screenid,qdb_heading`);
const screenIds   = screensRes.value.map(s => s.qdb_info_card_screenid);
let allSections   = [];
if (screenIds.length) {
  const filter = screenIds.map(id => `_qdb_info_card_screen_id_value eq '${id}'`).join(' or ');
  const sectRes = await get(`qdb_info_card_sections?$filter=(${filter}) and statecode eq 0&$select=qdb_info_card_sectionid,qdb_section_title,qdb_section_type`);
  allSections = sectRes.value;
}
console.log(`✓ Fetched ${allSections.length} info-card sections`);

// ═════════════════════════════════════════════════════════════════════════════
// [1] PATCH FORM DEFINITION — showSummaryStep, skip label, counts, ref attr
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[1] Patching form definition…');
await patch('qdb_form_definitions', fid, {
  qdb_show_summary_step:                 true,
  qdb_allow_infocard_skip:               true,
  qdb_infocard_skip_label:               'Skip Introduction',
  qdb_infocard_counts_in_progress:       true,
  qdb_confirmation_record_ref_attribute: 'qdb_form_code',
});
console.log('  ✓ showSummaryStep=true, allowInfocardSkip=true, infocardSkipLabel, infocardCountsInProgress, confirmationRecordRefAttribute');

// ═════════════════════════════════════════════════════════════════════════════
// [2] PATCH TABS — add icon names, requiresPreviousTabComplete on System Access
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[2] Patching tabs with icon names…');
const tabIcons = {
  'Personal Info':        { qdb_icon_name: 'PersonRegular' },
  'Professional Details': { qdb_icon_name: 'BriefcaseRegular' },
  'Financial & Docs':     { qdb_icon_name: 'DocumentRegular' },
  'System Access':        { qdb_icon_name: 'LockClosedRegular', qdb_requires_previous_tab_complete: true },
  'Review & Submit':      { qdb_icon_name: 'CheckmarkCircleRegular' },
};
for (const [label, body] of Object.entries(tabIcons)) {
  const tid = tabMap[label];
  if (!tid) { console.log(`  ⚠ Tab '${label}' not found — skipping`); continue; }
  await patch('qdb_form_tabs', tid, body);
  console.log(`  ✓ ${label}: ${JSON.stringify(body)}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// [3] PATCH FIELDS — prefix / suffix
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[3] Patching fields with prefix/suffix…');
const prefixSuffixUpdates = [
  ['cs_mobile',          { qdb_prefix: '+974' }],
  ['cs_monthly_income',  { qdb_prefix: 'QAR', qdb_suffix: '/month' }],
  ['cs_savings',         { qdb_prefix: 'QAR' }],
  ['cs_age',             { qdb_suffix: 'yrs' }],
  ['cs_years_exp',       { qdb_suffix: 'years' }],
  ['cs_job_title',       { qdb_prefix: '💼 ' }],
  ['cs_employer_name',   { qdb_suffix: ' (Ltd / LLC / Co.)' }],
];
for (const [schema, body] of prefixSuffixUpdates) {
  const fldId = fieldMap[schema];
  if (!fldId) { console.log(`  ⚠ Field '${schema}' not found — skipping`); continue; }
  await patch('qdb_form_fields', fldId, body);
  console.log(`  ✓ ${schema}: ${JSON.stringify(body)}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// [4] PATCH FILE FIELD — file download template + upload/download doc settings
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[4] Patching file field with download template + document settings…');
const cvFileId = fieldMap['cs_cv_file'];
if (cvFileId) {
  const uploadSetting = JSON.stringify({
    entityName: 'qdb_form_submission_log',
    attributeConfig: [
      { attributeName: 'qdb_document_type',      attributeValue: '100000000', type: 'optionset' },
      { attributeName: 'qdb_submission_log_name', attributeValue: 'CV Upload', type: 'string' },
    ],
  });
  const downloadSetting = JSON.stringify({
    downloadSetting: {
      attributeConfig: [
        { attributeName: 'documentName', attributeValue: 'CV Template',   type: 'string' },
        { attributeName: 'documentType', attributeValue: 'Word',          type: 'string' },
      ],
    },
  });
  await patch('qdb_form_fields', cvFileId, {
    qdb_file_download_label:       'Download CV Template',
    qdb_file_download_icon:        'DocumentDownloadRegular',
    qdb_upload_document_setting:   uploadSetting,
    qdb_download_document_setting: downloadSetting,
  });
  console.log('  ✓ cs_cv_file: fileDownloadLabel, fileDownloadIcon, uploadDocumentSetting, downloadDocumentSetting');
} else {
  console.log('  ⚠ cs_cv_file not found — skipping');
}

// ═════════════════════════════════════════════════════════════════════════════
// [5] PATCH INFO-CARD FIELD — add download URL/label/icon
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[5] Patching info-card fields with download link…');
const skillsGuideId = fieldMap['cs_skills_guide'];
if (skillsGuideId) {
  await patch('qdb_form_fields', skillsGuideId, {
    qdb_info_card_download_url:   'https://example.com/skills-guide.pdf',
    qdb_info_card_download_label: 'Download Skills Guide (PDF)',
    qdb_info_card_download_icon:  'DocumentDownloadRegular',
  });
  console.log('  ✓ cs_skills_guide: infoCardDownloadUrl, infoCardDownloadLabel, infoCardDownloadIcon');
} else {
  console.log('  ⚠ cs_skills_guide not found — skipping');
}

// Also patch the review warning info-card
const reviewWarningId = fieldMap['cs_review_warning'];
if (reviewWarningId) {
  await patch('qdb_form_fields', reviewWarningId, {
    qdb_info_card_download_url:   'https://example.com/submission-policy.pdf',
    qdb_info_card_download_label: 'View Submission Policy',
    qdb_info_card_download_icon:  'DocumentRegular',
  });
  console.log('  ✓ cs_review_warning: infoCardDownloadUrl, infoCardDownloadLabel, infoCardDownloadIcon');
}

// ═════════════════════════════════════════════════════════════════════════════
// [6] PATCH INFO-CARD SECTIONS — add noteText to each section
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[6] Patching info-card sections with noteText…');
const sectionNotes = [
  { title: 'Form Steps',          note: 'All 5 sections must be completed before submitting. You can save progress at any time.' },
  { title: 'Requirements',        note: 'Ensure your CV is in PDF or DOCX format and does not exceed 5 MB.' },
  { title: 'Document Templates',  note: 'Download and complete the templates before uploading them in the Financial & Docs section.' },
];
for (const section of allSections) {
  const match = sectionNotes.find(n => n.title === section.qdb_section_title);
  if (match) {
    await patch('qdb_info_card_sections', section.qdb_info_card_sectionid, { qdb_note_text: match.note });
    console.log(`  ✓ Section '${match.title}': noteText added`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// [7] PATCH OPTION VALUES — add 'notes' callout text to radio-card options
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[7] Patching radio-card option values with notes callout text…');

const genderNotes = {
  male:   'This will be shown on your official documents.',
  female: 'This will be shown on your official documents.',
  other:  'Your privacy is protected. This is not shared externally.',
};
for (const opt of genderOpts) {
  const note = genderNotes[opt.qdb_value];
  if (note) {
    await patch('qdb_form_option_values', opt.qdb_form_option_valueid, { qdb_notes: note });
    console.log(`  ✓ Gender '${opt.qdb_value}': notes added`);
  }
}

const contractNotes = {
  permanent:  'Includes full benefits package: health insurance, annual leave, and pension.',
  contract:   'Benefits are pro-rated based on contract duration. No pension contributions.',
  part_time:  'Eligible for health insurance only. Annual leave is calculated proportionally.',
  freelance:  'No employment benefits. Tax invoice required monthly. Subject to IR35 rules.',
};
for (const opt of contractOpts) {
  const note = contractNotes[opt.qdb_value];
  if (note) {
    await patch('qdb_form_option_values', opt.qdb_form_option_valueid, { qdb_notes: note });
    console.log(`  ✓ Contract '${opt.qdb_value}': notes added`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// [8] ADD BOOLEAN RADIO FIELD — demonstrates radio render style (vs toggle)
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[8] Adding boolean field with radio render style…');

// Find the Date of Birth section to place it alongside the existing toggle boolean
const identitySectionRes = await get(
  `qdb_form_sections?$filter=qdb_label eq 'Date of Birth' and statecode eq 0&$select=qdb_form_sectionid,_qdb_form_tab_id_value&$top=5`,
);
const dobSec = identitySectionRes.value.find(s => tabIds.has(s._qdb_form_tab_id_value));

if (dobSec) {
  const boolRadioField = await post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${dobSec.qdb_form_sectionid})`,
    qdb_schema_name:           'cs_work_permit_required',
    qdb_field_type:            100000019,   // boolean
    qdb_label:                 'Work Permit Required?',
    qdb_display_order:         5,
    qdb_column_span:           100000001,   // 1 column
    qdb_is_required:           false,
    qdb_is_readonly:           false,
    qdb_is_hidden:             false,
    qdb_boolean_render_style:  100000001,   // radio (vs toggle = 100000000)
    qdb_true_label:            'Yes — I need a work permit',
    qdb_false_label:           'No — I am already authorised to work',
  });
  console.log(`  ✓ cs_work_permit_required (boolean radio) created: ${boolRadioField.qdb_form_fieldid}`);
} else {
  console.log('  ⚠ Date of Birth section not found for this form — skipping');
}

// ═════════════════════════════════════════════════════════════════════════════
// [9] PATCH LOOKUP FIELD — add dependsOn linked to cs_filter_status
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[9] Patching lookup config with dependsOnField…');
const linkedFormFieldId = fieldMap['cs_linked_form_code'];
if (linkedFormFieldId) {
  // Fetch the existing lookup config for this field
  const lcRes = await get(`qdb_form_lookup_configs?$filter=_qdb_form_field_id_value eq '${linkedFormFieldId}' and statecode eq 0&$select=qdb_form_lookup_configid&$top=1`);
  if (lcRes.value?.length) {
    const lcId = lcRes.value[0].qdb_form_lookup_configid;
    const filterStatusFieldId = fieldMap['cs_filter_status'];
    if (filterStatusFieldId) {
      await patch('qdb_form_lookup_configs', lcId, {
        qdb_depends_on_field_schema:           'cs_filter_status',
        qdb_depends_on_filter_template:        'qdb_status eq {dependsOnValue}',
      });
      console.log('  ✓ cs_linked_form_code lookup: dependsOnFieldSchema=cs_filter_status, dependsOnFilterTemplate set');
    } else {
      console.log('  ⚠ cs_filter_status field not found — skipping lookup dependsOn');
    }
  } else {
    console.log('  ⚠ Lookup config not found for cs_linked_form_code');
  }
} else {
  console.log('  ⚠ cs_linked_form_code field not found');
}

// ═════════════════════════════════════════════════════════════════════════════
// [10] ADD OPTION NOTES FIELD — add a multiselect with parentOptionValue demo
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[10] Adding dependent dropdown (parentOptionValue) to Skills & Prefs section…');

const skillsSectionRes = await get(
  `qdb_form_sections?$filter=qdb_label eq 'Skills %26 Prefs' and statecode eq 0&$select=qdb_form_sectionid,_qdb_form_tab_id_value&$top=5`,
);
const skillsSec = skillsSectionRes.value.find(s => tabIds.has(s._qdb_form_tab_id_value));

if (skillsSec) {
  // Parent dropdown: region
  const regionField = await post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${skillsSec.qdb_form_sectionid})`,
    qdb_schema_name:    'cs_region',
    qdb_field_type:     100000006,   // dropdown
    qdb_label:          'Region',
    qdb_placeholder:    '— Select region —',
    qdb_display_order:  5,
    qdb_column_span:    100000001,
    qdb_is_required:    false,
    qdb_is_readonly:    false,
    qdb_is_hidden:      false,
  });
  const regionId = regionField.qdb_form_fieldid;

  // Region options
  for (const [i, [val, lbl]] of [['gcc','GCC'],['europe','Europe'],['asia','Asia']].entries()) {
    await post('qdb_form_option_values', {
      'qdb_form_field_id@odata.bind': `/qdb_form_fields(${regionId})`,
      qdb_value: val, qdb_label: lbl, qdb_display_order: i + 1, qdb_is_active: true,
    });
  }

  // Child dropdown: country — depends on region (parentOptionValue)
  const countryField = await post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${skillsSec.qdb_form_sectionid})`,
    qdb_schema_name:    'cs_country',
    qdb_field_type:     100000006,   // dropdown
    qdb_label:          'Country (filtered by region)',
    qdb_placeholder:    '— Select country —',
    qdb_display_order:  6,
    qdb_column_span:    100000001,
    qdb_is_required:    false,
    qdb_is_readonly:    false,
    qdb_is_hidden:      false,
  });
  const countryId = countryField.qdb_form_fieldid;

  // Country options with parentOptionValue = region value
  const countries = [
    { val: 'qa', lbl: 'Qatar',        parent: 'gcc'    },
    { val: 'ae', lbl: 'UAE',          parent: 'gcc'    },
    { val: 'sa', lbl: 'Saudi Arabia', parent: 'gcc'    },
    { val: 'gb', lbl: 'UK',           parent: 'europe' },
    { val: 'de', lbl: 'Germany',      parent: 'europe' },
    { val: 'fr', lbl: 'France',       parent: 'europe' },
    { val: 'in', lbl: 'India',        parent: 'asia'   },
    { val: 'pk', lbl: 'Pakistan',     parent: 'asia'   },
    { val: 'ph', lbl: 'Philippines',  parent: 'asia'   },
  ];
  for (const [i, c] of countries.entries()) {
    await post('qdb_form_option_values', {
      'qdb_form_field_id@odata.bind': `/qdb_form_fields(${countryId})`,
      qdb_value: c.val, qdb_label: c.lbl, qdb_display_order: i + 1,
      qdb_is_active: true, qdb_parent_option_value: c.parent,
    });
  }

  console.log(`  ✓ cs_region (parent dropdown) + cs_country (child dropdown with parentOptionValue) created`);
} else {
  console.log('  ⚠ Skills & Prefs section not found — skipping dependent dropdown');
}

// ═════════════════════════════════════════════════════════════════════════════
// Summary
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  UPDATE COMPLETE                                                  ║');
console.log('╠══════════════════════════════════════════════════════════════════╣');
console.log('║  Feature                          │ Status                        ║');
console.log('║  ────────────────────────────────────────────────────────────── ║');
console.log('║  showSummaryStep                  │ ✓ Enabled                     ║');
console.log('║  infocardSkipLabel                │ ✓ "Skip Introduction"         ║');
console.log('║  infocardCountsInProgress         │ ✓ Enabled                     ║');
console.log('║  confirmationRecordRefAttribute   │ ✓ qdb_form_code               ║');
console.log('║  Tab icon names (5 tabs)          │ ✓ Added                       ║');
console.log('║  Tab requiresPreviousTab          │ ✓ System Access tab           ║');
console.log('║  Field prefix/suffix (7 fields)   │ ✓ Added                       ║');
console.log('║  File download template           │ ✓ fileDownloadLabel/Icon      ║');
console.log('║  uploadDocumentSetting            │ ✓ On cs_cv_file               ║');
console.log('║  downloadDocumentSetting          │ ✓ On cs_cv_file               ║');
console.log('║  InfoCard field download link     │ ✓ cs_skills_guide + warning   ║');
console.log('║  InfoCard section noteText        │ ✓ 3 sections                  ║');
console.log('║  Option value notes (radio cards) │ ✓ 7 options (gender+contract) ║');
console.log('║  Boolean radio render style       │ ✓ cs_work_permit_required     ║');
console.log('║  Lookup dependsOnField            │ ✓ cs_linked_form_code         ║');
console.log('║  Dependent dropdown (parent/child)│ ✓ cs_region → cs_country      ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');
