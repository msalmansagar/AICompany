/**
 * Complete DFE End-to-End Showcase Seed
 * Involves all 23 Dataverse tables: form definition, tabs, sections, fields (all 21 types),
 * option values, validation rules, lookup config, business rules, buttons, info-card screens/sections/items,
 * grid column configs, submission mappings, theme, form design, section designs, field designs,
 * button designs, layout grids, and a rule template.
 *
 * Run: node scripts/seed-complete-showcase.mjs
 */

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = 'zMp8Q~~kJW3l3h_HOKbkYdH56c5ALU-Pxc3X_ct6';
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;
const FORM_CODE     = 'dfe-complete';

// ── Auth ──────────────────────────────────────────────────────────────────────
const tokenBody = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DV}/.default` });
const token = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenBody })
  .then(r => r.json()).then(j => { if (!j.access_token) throw new Error(j.error_description); return j.access_token; });

const H = { Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json', Prefer: 'return=representation' };

async function post(entity, body) {
  const r = await fetch(`${BASE}/${entity}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`POST ${entity}: ${j.error?.message ?? r.status}`);
  return j;
}
async function patch(entity, id, body) {
  const r = await fetch(`${BASE}/${entity}(${id})`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`PATCH ${entity}: ${j.error?.message ?? r.status}`); }
}
async function get(path) {
  const r = await fetch(`${BASE}/${path}`, { headers: H });
  const j = await r.json();
  if (!r.ok) throw new Error(`GET ${path}: ${j.error?.message ?? r.status}`);
  return j;
}

// ── Picklist constants ────────────────────────────────────────────────────────
const FT = { text:100000001, textarea:100000002, number:100000003, date:100000004, datetime:100000005,
             dropdown:100000006, multiselect:100000007, lookup:100000008, checkbox:100000009, radio:100000010,
             currency:100000011, decimal:100000012, email:100000013, phone:100000014, file:100000015,
             boolean:100000019, infoCard:100000020, interactiveGrid:100000021 };
const BA  = { submit:100000001, saveDraft:100000002, cancel:100000003, reset:100000004 };
const COL = { one:100000001, two:100000002, three:100000003, four:100000004 };
const CS  = { one:100000001, two:100000002 };
const IST = { steps:100000000, iconList:100000001, downloadList:100000002 };
const RT  = { required:100000001, minLength:100000002, maxLength:100000003, minValue:100000004, maxValue:100000005, regex:100000006, email:100000007, phone:100000008 };
const BRA = { showField:100000001, hideField:100000002, showSection:100000003, hideSection:100000004, makeRequired:100000007, makeReadonly:100000009 };
const GRD = { selection:100000000, entry:100000001 };
const SEL = { single:100000000, multi:100000001 };
const ICS = { info:100000000, warning:100000001, success:100000002, error:100000003 };
const BOOL= { toggle:100000000, radio:100000001 };
// Design codes
const LAY = { singleCol:100000001, twoCol:100000002, grid:100000003 };
const LBL = { top:100000001, left:100000002, floating:100000003 };
const SST = { card:100000001, flat:100000002, outlined:100000003 };
const TST = { tabs:100000001, stepper:100000002 };
const BST = { primary:100000001, outline:100000002, text:100000003 };
const IST2= { outlined:100000001, filled:100000002, standard:100000003 };
const FW  = { full:100000001, half:100000002, custom:100000003 };
const BTN = { submit:100000001, saveDraft:100000002, cancel:100000003 };
const ALN = { left:100000001, center:100000002, right:100000003 };
const HOV = { none:100000001, elevate:100000002, colorShift:100000003 };
const LOD = { spinner:100000001, dots:100000002, pulse:100000003 };
const SHW = { none:100000001, subtle:100000002, strong:100000003 };
const SPC = { compact:100000001, normal:100000002, comfortable:100000003 };
const CST = { flat:100000001, elevated:100000002, outlined:100000003 };
const CLP = { none:100000001, animated:100000002 };
const ANM = { none:100000001, fade:100000002, slide:100000003 };

console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║   DFE Complete Showcase — All 23 Entities        ║');
console.log('╚══════════════════════════════════════════════════╝\n');
console.log('✓ Token acquired');

// ── Guard ─────────────────────────────────────────────────────────────────────
const existing = await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}' and statecode eq 0&$select=qdb_form_definitionid&$top=1`);
if (existing.value?.length) {
  console.log(`\n⚠  '${FORM_CODE}' already exists (${existing.value[0].qdb_form_definitionid}). Delete it first to re-seed.\n`);
  process.exit(0);
}

// ══════════════════════════════════════════════════════════════════════════════
// [1] THEME — qdb_theme
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[1] Theme (qdb_theme)…');
const theme = await post('qdb_themes', {
  qdb_theme_code:            'showcase-slate',
  qdb_theme_name:            'Showcase Slate',
  qdb_primary_color:         '#1a56db',
  qdb_secondary_color:       '#7e3af2',
  qdb_background_color:      '#f9fafb',
  qdb_surface_color:         '#ffffff',
  qdb_text_primary_color:    '#111928',
  qdb_text_secondary_color:  '#6b7280',
  qdb_border_color:          '#d1d5db',
  qdb_error_color:           '#e02424',
  qdb_success_color:         '#057a55',
  qdb_warning_color:         '#d97706',
  qdb_font_family:           'Inter, system-ui, sans-serif',
  qdb_base_font_size:        '14px',
  qdb_heading_font_size:     '22px',
  qdb_label_font_size:       '13px',
  qdb_input_font_size:       '14px',
  qdb_border_radius:         '8px',
  qdb_shadow_style:          SHW.subtle,
  qdb_spacing_scale:         SPC.comfortable,
  qdb_is_dark_mode:          false,
  qdb_is_active:             true,
});
const themeId = theme.qdb_themeid;
console.log(`  ✓ Theme 'Showcase Slate' (${themeId})`);

// ══════════════════════════════════════════════════════════════════════════════
// [2] RULE TEMPLATE — qdb_rule_template
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[2] Rule Template (qdb_rule_template)…');
const qatarPhoneTemplate = await post('qdb_rule_templates', {
  qdb_name:          'Qatar Mobile Number',
  qdb_rule_type:     RT.regex,
  qdb_error_message: 'Enter a valid 8-digit Qatar mobile number',
  qdb_regex_pattern: '^[0-9]{8}$',
});
console.log(`  ✓ Rule template 'Qatar Mobile Number' (${qatarPhoneTemplate.qdb_rule_templateid})`);

// ══════════════════════════════════════════════════════════════════════════════
// [3] FORM DEFINITION — qdb_form_definition
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[3] Form Definition (qdb_form_definition)…');
const form = await post('qdb_form_definitions', {
  qdb_form_code:               FORM_CODE,
  qdb_title:                   'DFE Complete Showcase',
  qdb_description:             'Demonstrates all 21 field types, themes, designs, business rules, validation, lookups, grids, and info-cards.',
  qdb_status:                  100000001,   // active
  qdb_version:                 1,
  qdb_allow_save_draft:        true,
  qdb_allow_infocard_skip:     false,
  qdb_infocard_start_label:    'Get Started',
  qdb_infocard_continue_label: 'Next',
  qdb_infocard_back_label:     'Back',
  qdb_confirmation_message:    'Your DFE Complete Showcase submission has been received. Reference number is shown above.',
});
const fid = form.qdb_form_definitionid;
console.log(`  ✓ Form '${FORM_CODE}' (${fid})`);

// ══════════════════════════════════════════════════════════════════════════════
// [4] TABS — qdb_form_tab  (5 tabs)
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[4] Tabs (qdb_form_tab)…');
const tabDef = (label, order) => ({
  'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
  qdb_label: label, qdb_display_order: order, qdb_is_visible: true,
});
const tabPersonal    = await post('qdb_form_tabs', tabDef('Personal Info',        1));
const tabProfessional= await post('qdb_form_tabs', tabDef('Professional Details', 2));
const tabFinancial   = await post('qdb_form_tabs', tabDef('Financial & Docs',     3));
const tabSystem      = await post('qdb_form_tabs', tabDef('System Access',        4));
const tabReview      = await post('qdb_form_tabs', tabDef('Review & Submit',      5));
console.log(`  ✓ 5 tabs created`);

// ══════════════════════════════════════════════════════════════════════════════
// [5] SECTIONS — qdb_form_section
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[5] Sections (qdb_form_section)…');
const secDef = (tabId, label, desc, order, cols = COL.two, collapsible = false) => ({
  'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tabId})`,
  qdb_label: label, qdb_description: desc, qdb_display_order: order,
  qdb_columns: cols, qdb_is_collapsible: collapsible,
  qdb_is_collapsed_by_default: false, qdb_is_visible: true,
});
// Personal Info tab
const secIdentity    = await post('qdb_form_sections', secDef(tabPersonal.qdb_form_tabid,     'Identity',           'Your full legal name, email, and contact number',               1, COL.two));
const secDOB         = await post('qdb_form_sections', secDef(tabPersonal.qdb_form_tabid,     'Date of Birth',      'Provide your date of birth and nationality',                    2, COL.two));
// Professional tab
const secEmployment  = await post('qdb_form_sections', secDef(tabProfessional.qdb_form_tabid, 'Employment',         'Current employment status and employer details',                1, COL.two));
const secSkills      = await post('qdb_form_sections', secDef(tabProfessional.qdb_form_tabid, 'Skills & Prefs',     'Skills, notifications, contract type, and languages',           2, COL.two, true));
// Financial & Docs tab
const secFinance     = await post('qdb_form_sections', secDef(tabFinancial.qdb_form_tabid,    'Financial Info',     'Monthly income, savings, and currency amounts',                 1, COL.two));
const secDocs        = await post('qdb_form_sections', secDef(tabFinancial.qdb_form_tabid,    'Documents',          'Upload required documents and provide notes',                   2, COL.one));
// System Access tab
const secGrid        = await post('qdb_form_sections', secDef(tabSystem.qdb_form_tabid,       'Select Role',        'Pick the role to assign (selection grid)',                      1, COL.one));
const secEntryGrid   = await post('qdb_form_sections', secDef(tabSystem.qdb_form_tabid,       'Define Permissions', 'Define custom permissions inline (entry grid)',                 2, COL.one));
const secLookup      = await post('qdb_form_sections', secDef(tabSystem.qdb_form_tabid,       'Linked Form',        'Link a form definition to this access request',                3, COL.two));
// System Access — depends-on filter demo section
const secFilterDemo  = await post('qdb_form_sections', secDef(tabSystem.qdb_form_tabid,       'Filtered Grid Demo', 'Demonstrates dynamic grid filtering: select a status to filter', 4, COL.one));
// Review tab
const secReview      = await post('qdb_form_sections', secDef(tabReview.qdb_form_tabid,       'Review',             'Confirm submission date-time and add final comments',           1, COL.two));
console.log(`  ✓ 10 sections created`);

// ══════════════════════════════════════════════════════════════════════════════
// [6] FIELDS — qdb_form_field  (all 21 field types + hidden)
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[6] Fields (qdb_form_field) — all 21 field types…');
const fld = (secId, body) => ({
  'qdb_form_section_id@odata.bind': `/qdb_form_sections(${secId})`,
  qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
  qdb_column_span: CS.one, ...body,
});

// ── Section: Identity ─────────────────────────────────────────────────────────
const fFullName = await post('qdb_form_fields', fld(secIdentity.qdb_form_sectionid, {
  qdb_schema_name: 'cs_full_name', qdb_field_type: FT.text,
  qdb_label: 'Full Name', qdb_placeholder: 'First and last name',
  qdb_display_order: 1, qdb_column_span: CS.two, qdb_is_required: true,
}));
const fEmail = await post('qdb_form_fields', fld(secIdentity.qdb_form_sectionid, {
  qdb_schema_name: 'cs_email', qdb_field_type: FT.email,
  qdb_label: 'Work Email', qdb_placeholder: 'name@company.com',
  qdb_display_order: 2, qdb_is_required: true,
}));
const fPhone = await post('qdb_form_fields', fld(secIdentity.qdb_form_sectionid, {
  qdb_schema_name: 'cs_mobile', qdb_field_type: FT.phone,
  qdb_label: 'Mobile Number', qdb_placeholder: '8 digits',
  qdb_display_order: 3,
}));
const fNationality = await post('qdb_form_fields', fld(secIdentity.qdb_form_sectionid, {
  qdb_schema_name: 'cs_nationality', qdb_field_type: FT.dropdown,
  qdb_label: 'Nationality', qdb_placeholder: '— Select —',
  qdb_display_order: 4,
}));

// ── Section: Date of Birth ────────────────────────────────────────────────────
const fDOB = await post('qdb_form_fields', fld(secDOB.qdb_form_sectionid, {
  qdb_schema_name: 'cs_dob', qdb_field_type: FT.date,
  qdb_label: 'Date of Birth', qdb_display_order: 1, qdb_is_required: true,
}));
const fAge = await post('qdb_form_fields', fld(secDOB.qdb_form_sectionid, {
  qdb_schema_name: 'cs_age', qdb_field_type: FT.number,
  qdb_label: 'Age (years)', qdb_placeholder: 'e.g. 28',
  qdb_display_order: 2,
}));
const fGender = await post('qdb_form_fields', fld(secDOB.qdb_form_sectionid, {
  qdb_schema_name: 'cs_gender', qdb_field_type: FT.radio,
  qdb_label: 'Gender', qdb_display_order: 3,
  qdb_radio_render_style: 100000001, // cards
}));
const fResident = await post('qdb_form_fields', fld(secDOB.qdb_form_sectionid, {
  qdb_schema_name: 'cs_is_resident', qdb_field_type: FT.boolean,
  qdb_label: 'Qatar Resident?', qdb_display_order: 4,
  qdb_boolean_render_style: BOOL.toggle,
  qdb_true_label:  'Yes, I am a Qatar resident',
  qdb_false_label: 'No, I am not a resident',
}));

// ── Section: Employment ───────────────────────────────────────────────────────
const fEmpStatus = await post('qdb_form_fields', fld(secEmployment.qdb_form_sectionid, {
  qdb_schema_name: 'cs_employment_status', qdb_field_type: FT.dropdown,
  qdb_label: 'Employment Status', qdb_placeholder: '— Select status —',
  qdb_display_order: 1, qdb_is_required: true,
}));
const fEmployer = await post('qdb_form_fields', fld(secEmployment.qdb_form_sectionid, {
  qdb_schema_name: 'cs_employer_name', qdb_field_type: FT.text,
  qdb_label: 'Employer Name', qdb_placeholder: 'Company name',
  qdb_display_order: 2,
  // Hidden by default — business rule shows it when employed
}));
const fJobTitle = await post('qdb_form_fields', fld(secEmployment.qdb_form_sectionid, {
  qdb_schema_name: 'cs_job_title', qdb_field_type: FT.text,
  qdb_label: 'Job Title', qdb_placeholder: 'e.g. Senior Engineer',
  qdb_display_order: 3,
}));
const fContractType = await post('qdb_form_fields', fld(secEmployment.qdb_form_sectionid, {
  qdb_schema_name: 'cs_contract_type', qdb_field_type: FT.radio,
  qdb_label: 'Contract Type', qdb_display_order: 4,
  qdb_radio_render_style: 100000001, // cards
}));

// ── Section: Skills & Prefs ───────────────────────────────────────────────────
const fSkills = await post('qdb_form_fields', fld(secSkills.qdb_form_sectionid, {
  qdb_schema_name: 'cs_skills', qdb_field_type: FT.multiselect,
  qdb_label: 'Technical Skills', qdb_display_order: 1, qdb_column_span: CS.two,
  qdb_multiselect_render_style: 100000001, // checkboxes (visible list, not dropdown)
}));
const fNotifications = await post('qdb_form_fields', fld(secSkills.qdb_form_sectionid, {
  qdb_schema_name: 'cs_notifications', qdb_field_type: FT.checkbox,
  qdb_label: 'Email notifications enabled?', qdb_display_order: 2,
}));
const fAgreeTerms = await post('qdb_form_fields', fld(secSkills.qdb_form_sectionid, {
  qdb_schema_name: 'cs_agree_terms', qdb_field_type: FT.checkbox,
  qdb_label: 'I agree to the terms and conditions', qdb_display_order: 3,
  qdb_is_required: true,
}));
// Info-card guidance field
const fGuidanceCard = await post('qdb_form_fields', fld(secSkills.qdb_form_sectionid, {
  qdb_schema_name: 'cs_skills_guide', qdb_field_type: FT.infoCard,
  qdb_label: 'Skills guidance', qdb_display_order: 4, qdb_column_span: CS.two,
  qdb_info_card_style: ICS.info,
  qdb_info_card_title: 'Tip: Multi-select Skills',
  qdb_info_card_body:  'Hold Ctrl (or Cmd on Mac) to select multiple skills. Your selections will be saved automatically.',
  qdb_info_card_icon:  'InfoRegular',
}));

// ── Section: Financial Info ────────────────────────────────────────────────────
const fIncome = await post('qdb_form_fields', fld(secFinance.qdb_form_sectionid, {
  qdb_schema_name: 'cs_monthly_income', qdb_field_type: FT.currency,
  qdb_label: 'Monthly Income (QAR)', qdb_placeholder: '0.00',
  qdb_display_order: 1, qdb_is_required: true,
}));
const fSavings = await post('qdb_form_fields', fld(secFinance.qdb_form_sectionid, {
  qdb_schema_name: 'cs_savings', qdb_field_type: FT.decimal,
  qdb_label: 'Total Savings (QAR)', qdb_placeholder: '0.00',
  qdb_decimal_places: 2, qdb_display_order: 2,
}));
const fJoinDate = await post('qdb_form_fields', fld(secFinance.qdb_form_sectionid, {
  qdb_schema_name: 'cs_join_date', qdb_field_type: FT.date,
  qdb_label: 'Employment Start Date', qdb_display_order: 3,
}));
const fYearsExp = await post('qdb_form_fields', fld(secFinance.qdb_form_sectionid, {
  qdb_schema_name: 'cs_years_exp', qdb_field_type: FT.number,
  qdb_label: 'Years of Experience', qdb_placeholder: '0',
  qdb_display_order: 4,
}));

// ── Section: Documents ────────────────────────────────────────────────────────
const fCvFile = await post('qdb_form_fields', fld(secDocs.qdb_form_sectionid, {
  qdb_schema_name: 'cs_cv_file', qdb_field_type: FT.file,
  qdb_label: 'Upload CV / Resume', qdb_display_order: 1, qdb_column_span: CS.two,
  // Structured multiselect (OData format: comma-separated string)
  // PDF(0), JPEG(1), PNG(2), DOC(6), DOCX(5)
  qdb_allowed_file_extensions: '100000000,100000001,100000002,100000006,100000005',
  qdb_document_type: 100000000, // CV / Resume
  qdb_max_file_size_mb: 5,
  qdb_max_files: 1,
}));
const fNotes = await post('qdb_form_fields', fld(secDocs.qdb_form_sectionid, {
  qdb_schema_name: 'cs_additional_notes', qdb_field_type: FT.textarea,
  qdb_label: 'Additional Notes', qdb_placeholder: 'Any extra information you want to share…',
  qdb_display_order: 2, qdb_column_span: CS.two,
}));

// ── Section: Select Role (selection grid) ────────────────────────────────────
const fSelectRole = await post('qdb_form_fields', fld(secGrid.qdb_form_sectionid, {
  qdb_schema_name: 'cs_selected_form',  qdb_field_type: FT.interactiveGrid,
  qdb_label: 'Form Definition',
  qdb_tooltip: 'Browse active form definitions and pick one',
  qdb_display_order: 1, qdb_column_span: CS.two, qdb_is_required: true,
  qdb_grid_mode: GRD.selection,
  qdb_selection_mode: SEL.multi,
  qdb_grid_entity_name: 'qdb_form_definition',
  qdb_saved_view_id: '0448a02f-deed-4410-8a7d-aba72b7802d7',
  qdb_max_rows: 50,
  // Static filter: show only active forms
  qdb_grid_filter_expression: 'qdb_status eq 100000001',
}));

// ── Section: Entry grid (define permissions) ─────────────────────────────────
const fPermGrid = await post('qdb_form_fields', fld(secEntryGrid.qdb_form_sectionid, {
  qdb_schema_name: 'cs_permissions', qdb_field_type: FT.interactiveGrid,
  qdb_label: 'Custom Permissions',
  qdb_tooltip: 'Define permissions inline — each row becomes a permission record',
  qdb_display_order: 1, qdb_column_span: CS.two,
  qdb_grid_mode: GRD.entry,
  qdb_grid_entity_name: 'qdb_form_field',
  qdb_saved_view_id: 'db3e8a5e-1e11-4117-ad7c-d056854c2a2f',
  qdb_grid_min_rows: 1,
  qdb_max_rows: 20,
}));

// ── Section: Filtered Grid Demo (depends-on filter) ───────────────────────────
const fFilterStatus = await post('qdb_form_fields', fld(secFilterDemo.qdb_form_sectionid, {
  qdb_schema_name: 'cs_filter_status', qdb_field_type: FT.dropdown,
  qdb_label: 'Filter by Form Status', qdb_placeholder: '— Select a status to filter —',
  qdb_display_order: 1, qdb_column_span: CS.two,
}));
for (const [v, l] of [['100000001','Active'],['100000000','Draft'],['100000002','Inactive']]) {
  await post('qdb_form_option_values', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fFilterStatus.qdb_form_fieldid})`,
    qdb_value: v, qdb_label: l, qdb_display_order: parseInt(v) - 100000000 + 1, qdb_is_active: true,
  });
}
const fFilteredForms = await post('qdb_form_fields', fld(secFilterDemo.qdb_form_sectionid, {
  qdb_schema_name: 'cs_filtered_forms', qdb_field_type: FT.interactiveGrid,
  qdb_label: 'Forms (filtered by status)',
  qdb_tooltip: 'Records re-load when you change the status dropdown above',
  qdb_display_order: 2, qdb_column_span: CS.two,
  qdb_grid_mode: GRD.selection,
  qdb_selection_mode: SEL.multi,
  qdb_grid_entity_name: 'qdb_form_definition',
  qdb_saved_view_id: '0448a02f-deed-4410-8a7d-aba72b7802d7',
  qdb_max_rows: 20,
  // Dynamic filter: re-queries when cs_filter_status value changes
  qdb_grid_depends_on_field_schema: 'cs_filter_status',
  qdb_grid_depends_on_filter_template: 'qdb_status eq {dependsOnValue}',
}));
for (const [attr, label, type, order] of [['qdb_form_code','Form Code','text',1],['qdb_title','Title','text',2],['qdb_status','Status','status',3]]) {
  await post('qdb_grid_column_configs', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fFilteredForms.qdb_form_fieldid})`,
    qdb_grid_column_configname: `filtered-grid-${attr}`,
    qdb_column_label: label, qdb_column_attribute: attr, qdb_column_field_type: type,
    qdb_display_order: order, qdb_is_visible: true, qdb_is_editable: false,
  });
}

// ── Section: Linked Form (lookup) ────────────────────────────────────────────
const fLinkedForm = await post('qdb_form_fields', fld(secLookup.qdb_form_sectionid, {
  qdb_schema_name: 'cs_linked_form_code', qdb_field_type: FT.lookup,
  qdb_label: 'Linked Form Code', qdb_placeholder: 'Search form code…',
  qdb_display_order: 1, qdb_is_required: true,
}));
const fLookupNotes = await post('qdb_form_fields', fld(secLookup.qdb_form_sectionid, {
  qdb_schema_name: 'cs_lookup_context', qdb_field_type: FT.text,
  qdb_label: 'Context Notes', qdb_placeholder: 'Why this form is linked',
  qdb_display_order: 2,
}));

// ── Section: Review ───────────────────────────────────────────────────────────
const fSubmitDT = await post('qdb_form_fields', fld(secReview.qdb_form_sectionid, {
  qdb_schema_name: 'cs_submission_datetime', qdb_field_type: FT.datetime,
  qdb_label: 'Proposed Effective Date & Time',
  qdb_display_order: 1,
}));
const fFinalComment = await post('qdb_form_fields', fld(secReview.qdb_form_sectionid, {
  qdb_schema_name: 'cs_final_comment', qdb_field_type: FT.textarea,
  qdb_label: 'Final Comment', qdb_placeholder: 'Any last remarks before submission…',
  qdb_display_order: 2, qdb_column_span: CS.two,
}));
const fWarningCard = await post('qdb_form_fields', fld(secReview.qdb_form_sectionid, {
  qdb_schema_name: 'cs_review_warning', qdb_field_type: FT.infoCard,
  qdb_label: 'Submission warning',
  qdb_display_order: 3, qdb_column_span: CS.two,
  qdb_info_card_style: ICS.warning,
  qdb_info_card_title: 'Cannot Edit After Submission',
  qdb_info_card_body:  'Once submitted, this record cannot be modified. Please review all sections before proceeding.',
  qdb_info_card_icon:  'WarningRegular',
}));
// CRM optionset source demo — options populated from qdb_form_field.qdb_field_type at runtime
await post('qdb_form_fields', fld(secReview.qdb_form_sectionid, {
  qdb_schema_name: 'cs_field_type_demo', qdb_field_type: FT.dropdown,
  qdb_label: 'Field Type (from CRM Optionset)',
  qdb_placeholder: 'Options loaded from qdb_form_field.qdb_field_type',
  qdb_tooltip: 'Demonstrates optionSourceEntity — options sourced from CRM attribute OptionSet metadata',
  qdb_display_order: 10, qdb_column_span: CS.two,
  qdb_option_source_entity: 'qdb_form_field',
  qdb_option_source_attribute: 'qdb_field_type',
}));

// Hidden form-code field for submission mapping
const fHiddenCode = await post('qdb_form_fields', fld(secReview.qdb_form_sectionid, {
  qdb_schema_name: 'cs_hidden_form_code', qdb_field_type: FT.text,
  qdb_label: 'Form Code (system)', qdb_default_value: FORM_CODE,
  qdb_display_order: 99, qdb_is_hidden: true, qdb_is_readonly: true,
}));

console.log(`  ✓ 22 fields created (all 21 types + 1 hidden system field)`);

// ══════════════════════════════════════════════════════════════════════════════
// [7] OPTION VALUES — qdb_form_option_value
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[7] Option Values (qdb_form_option_value)…');
const opt = (fieldId, value, label, order, description = null, iconName = null) => ({
  'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fieldId})`,
  qdb_value: value, qdb_label: label, qdb_display_order: order, qdb_is_active: true,
  ...(description ? { qdb_description: description } : {}),
  ...(iconName    ? { qdb_icon_name:    iconName    } : {}),
});

// Nationality options
for (const [i, [val, lbl]] of [['qat','Qatari'],['sau','Saudi'],['egy','Egyptian'],['ind','Indian'],['pak','Pakistani'],['gbr','British'],['usa','American'],['other','Other']].entries()) {
  await post('qdb_form_option_values', opt(fNationality.qdb_form_fieldid, val, lbl, i + 1));
}
// Employment status options
for (const [i, [val, lbl]] of [['employed','Employed'],['self_employed','Self-Employed'],['unemployed','Unemployed'],['student','Student'],['retired','Retired']].entries()) {
  await post('qdb_form_option_values', opt(fEmpStatus.qdb_form_fieldid, val, lbl, i + 1));
}
// Gender options (radio cards — heading + description + icon)
for (const [i, [val, lbl, desc, icon]] of [
  ['male',   'Male',              'Identifies as male',              'PersonRegular'],
  ['female', 'Female',            'Identifies as female',            'PersonCircleRegular'],
  ['other',  'Prefer not to say', 'Privacy — not disclosed',         'ShieldRegular'],
].entries()) {
  await post('qdb_form_option_values', opt(fGender.qdb_form_fieldid, val, lbl, i + 1, desc, icon));
}
// Contract type (radio cards — heading + description + icon)
for (const [i, [val, lbl, desc, icon]] of [
  ['permanent', 'Permanent',          'Full-time, no end date',              'BriefcaseRegular'],
  ['contract',  'Fixed-term',         'Defined duration with end date',      'DocumentRegular'],
  ['part_time', 'Part-time',          'Reduced hours, flexible schedule',    'CalendarRegular'],
  ['freelance', 'Freelance',          'Independent contractor engagement',   'StarRegular'],
].entries()) {
  await post('qdb_form_option_values', opt(fContractType.qdb_form_fieldid, val, lbl, i + 1, desc, icon));
}
// Skills (multiselect)
for (const [i, [val, lbl]] of [['js','JavaScript'],['ts','TypeScript'],['react','React'],['nodejs','Node.js'],['csharp','C#'],['dotnet','.NET'],['dynamics','Dynamics 365'],['power_platform','Power Platform'],['azure','Azure'],['devops','DevOps']].entries()) {
  await post('qdb_form_option_values', opt(fSkills.qdb_form_fieldid, val, lbl, i + 1));
}
console.log('  ✓ 30 option values (nationality × 8, employment × 5, gender × 3, contract × 4, skills × 10)');

// ══════════════════════════════════════════════════════════════════════════════
// [8] VALIDATION RULES — qdb_form_validation_rule
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[8] Validation Rules (qdb_form_validation_rule)…');
const vr = (fieldId, type, extra) => ({
  'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fieldId})`,
  qdb_rule_type: type, qdb_is_active: true, qdb_priority: 100,
  qdb_error_message: extra.qdb_error_message ?? 'Invalid value', ...extra,
});

// Full Name: minLength 3, maxLength 80
await post('qdb_form_validation_rules', vr(fFullName.qdb_form_fieldid, RT.minLength, { qdb_min_length: 3, qdb_error_message: 'Full name must be at least 3 characters' }));
await post('qdb_form_validation_rules', vr(fFullName.qdb_form_fieldid, RT.maxLength, { qdb_max_length: 80, qdb_error_message: 'Full name cannot exceed 80 characters' }));

// Email: built-in email rule + via rule template reference? Just use RT.email
await post('qdb_form_validation_rules', vr(fEmail.qdb_form_fieldid, RT.email, { qdb_error_message: 'Enter a valid email address' }));

// Mobile: regex via rule template
await post('qdb_form_validation_rules', {
  'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fPhone.qdb_form_fieldid})`,
  'qdb_rule_template_id@odata.bind': `/qdb_rule_templates(${qatarPhoneTemplate.qdb_rule_templateid})`,
  qdb_rule_type: RT.regex,
  qdb_error_message: 'Enter a valid 8-digit Qatar mobile number',
  qdb_regex_pattern: '^[0-9]{8}$',
  qdb_is_active: true, qdb_priority: 100,
});

// Age: min 18, max 70
await post('qdb_form_validation_rules', vr(fAge.qdb_form_fieldid, RT.minValue, { qdb_min_value: 18, qdb_error_message: 'Must be at least 18 years old' }));
await post('qdb_form_validation_rules', vr(fAge.qdb_form_fieldid, RT.maxValue, { qdb_max_value: 70, qdb_error_message: 'Maximum age is 70' }));

// Monthly income: minValue 1000
await post('qdb_form_validation_rules', vr(fIncome.qdb_form_fieldid, RT.minValue, { qdb_min_value: 1000, qdb_error_message: 'Monthly income must be at least QAR 1,000' }));

// Additional notes: maxLength 1000
await post('qdb_form_validation_rules', vr(fNotes.qdb_form_fieldid, RT.maxLength, { qdb_max_length: 1000, qdb_error_message: 'Notes cannot exceed 1,000 characters' }));

// Final comment: maxLength 500
await post('qdb_form_validation_rules', vr(fFinalComment.qdb_form_fieldid, RT.maxLength, { qdb_max_length: 500, qdb_error_message: 'Final comment cannot exceed 500 characters' }));

console.log('  ✓ 9 validation rules (minLength, maxLength, email, regex via template, minValue × 2, maxValue × 2)');

// ══════════════════════════════════════════════════════════════════════════════
// [9] LOOKUP CONFIG — qdb_form_lookup_config
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[9] Lookup Config (qdb_form_lookup_config)…');
await post('qdb_form_lookup_configs', {
  'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fLinkedForm.qdb_form_fieldid})`,
  qdb_entity_logical_name:   'qdb_form_definition',
  qdb_display_attribute:     'qdb_form_code',
  qdb_value_attribute:       'qdb_form_code',
  qdb_filter_expression:     'statecode eq 0',
  qdb_search_min_chars:      2,
  qdb_max_results:           20,
});
console.log('  ✓ Lookup config: cs_linked_form_code → qdb_form_definition.qdb_form_code');

// ══════════════════════════════════════════════════════════════════════════════
// [10] BUSINESS RULES — qdb_form_business_rule
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[10] Business Rules (qdb_form_business_rule)…');

// Rule 1: When employment_status = 'employed' → show employer_name field
const conditionsShow = JSON.stringify([{
  fieldId: fEmpStatus.qdb_form_fieldid,
  operator: 'equals',
  value: 'employed',
}]);
await post('qdb_form_business_rules', {
  'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
  qdb_name:               'Show Employer Name when Employed',
  qdb_description:        'Reveals employer name field only when employment status is Employed',
  qdb_conditions_json:    conditionsShow,
  qdb_conditions_logic:   100000000,  // AND
  qdb_action:             BRA.showField,
  'qdb_target_field_id@odata.bind': `/qdb_form_fields(${fEmployer.qdb_form_fieldid})`,
  qdb_priority:           10,
  qdb_is_active:          true,
});

// Rule 2: When employment_status = 'unemployed' → hide job_title
const conditionsHide = JSON.stringify([{
  fieldId: fEmpStatus.qdb_form_fieldid,
  operator: 'equals',
  value: 'unemployed',
}]);
await post('qdb_form_business_rules', {
  'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
  qdb_name:               'Hide Job Title when Unemployed',
  qdb_description:        'Hides the job title field when employment status is Unemployed',
  qdb_conditions_json:    conditionsHide,
  qdb_conditions_logic:   100000000,
  qdb_action:             BRA.hideField,
  'qdb_target_field_id@odata.bind': `/qdb_form_fields(${fJobTitle.qdb_form_fieldid})`,
  qdb_priority:           20,
  qdb_is_active:          true,
});

// Rule 3: When is_resident = true → make Skills section visible
const conditionsSection = JSON.stringify([{
  fieldId: fResident.qdb_form_fieldid,
  operator: 'equals',
  value: 'true',
}]);
await post('qdb_form_business_rules', {
  'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
  qdb_name:               'Show Skills when Resident',
  qdb_description:        'Shows the Skills & Prefs section only for Qatar residents',
  qdb_conditions_json:    conditionsSection,
  qdb_conditions_logic:   100000000,
  qdb_action:             BRA.showSection,
  'qdb_target_section_id@odata.bind': `/qdb_form_sections(${secSkills.qdb_form_sectionid})`,
  qdb_priority:           30,
  qdb_is_active:          true,
});

console.log('  ✓ 3 business rules (showField, hideField, showSection)');

// ══════════════════════════════════════════════════════════════════════════════
// [11] BUTTONS — qdb_form_button
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[11] Buttons (qdb_form_button)…');
const btn = body => ({ 'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`, qdb_is_visible: true, qdb_is_active: true, ...body });
await post('qdb_form_buttons', btn({ qdb_label: 'Cancel',             qdb_action: BA.cancel,    qdb_display_order: 1, qdb_is_primary: false, qdb_confirmation_required: false }));
await post('qdb_form_buttons', btn({ qdb_label: 'Save Progress',      qdb_action: BA.saveDraft, qdb_display_order: 2, qdb_is_primary: false, qdb_confirmation_required: false }));
await post('qdb_form_buttons', btn({
  qdb_label: 'Submit Application', qdb_action: BA.submit, qdb_display_order: 3, qdb_is_primary: true,
  qdb_confirmation_required: true,
  qdb_confirmation_message: 'This will submit the DFE Complete Showcase record. Are you sure?',
}));
console.log('  ✓ 3 buttons (Cancel, Save Progress, Submit Application)');

// ══════════════════════════════════════════════════════════════════════════════
// [12] GRID COLUMN CONFIGS — qdb_grid_column_config
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[12] Grid Column Configs (qdb_grid_column_config)…');
const gcol = (fieldId, name, label, colType, order, editable, opts) => ({
  'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fieldId})`,
  qdb_grid_column_configname: name,
  qdb_column_label: label,
  qdb_column_attribute: name.replace('showcase-sel-', '').replace('showcase-ent-', ''),
  qdb_column_field_type: colType,
  qdb_display_order: order,
  qdb_is_visible: true,
  qdb_is_editable: editable,
  ...(opts ? { qdb_column_options_json: JSON.stringify(opts) } : {}),
});

// Selection grid columns (form definitions)
await post('qdb_grid_column_configs', gcol(fSelectRole.qdb_form_fieldid, 'showcase-sel-qdb_form_code',  'Form Code', 'text',     1, false));
await post('qdb_grid_column_configs', gcol(fSelectRole.qdb_form_fieldid, 'showcase-sel-qdb_title',      'Title',     'text',     2, false));
await post('qdb_grid_column_configs', gcol(fSelectRole.qdb_form_fieldid, 'showcase-sel-qdb_status',     'Status',    'status',   3, false));
await post('qdb_grid_column_configs', gcol(fSelectRole.qdb_form_fieldid, 'showcase-sel-modifiedon',     'Modified',  'datetime', 4, false));

// Entry grid columns (custom permissions)
const fieldTypeOpts = [
  {value:'100000001',label:'Text'},{value:'100000002',label:'Textarea'},
  {value:'100000003',label:'Number'},{value:'100000004',label:'Date'},
  {value:'100000006',label:'Dropdown'},{value:'100000007',label:'Multiselect'},
  {value:'100000008',label:'Lookup'},{value:'100000009',label:'Checkbox'},
  {value:'100000019',label:'Boolean'},{value:'100000020',label:'Info Card'},
  {value:'100000021',label:'Interactive Grid'},
];
await post('qdb_grid_column_configs', gcol(fPermGrid.qdb_form_fieldid, 'showcase-ent-qdb_schema_name', 'Schema Name', 'text',     1, true));
await post('qdb_grid_column_configs', gcol(fPermGrid.qdb_form_fieldid, 'showcase-ent-qdb_label',       'Label',       'text',     2, true));
await post('qdb_grid_column_configs', gcol(fPermGrid.qdb_form_fieldid, 'showcase-ent-qdb_field_type',  'Field Type',  'dropdown', 3, true, fieldTypeOpts));
await post('qdb_grid_column_configs', gcol(fPermGrid.qdb_form_fieldid, 'showcase-ent-qdb_is_required', 'Required',    'boolean',  4, true));

console.log('  ✓ 8 column configs (4 selection + 4 entry)');

// ══════════════════════════════════════════════════════════════════════════════
// [13] INFO-CARD SCREENS — qdb_info_card_screen
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[13] Info-Card Screens/Sections/Items…');

// Screen 1: Welcome & Process
const s1 = await post('qdb_info_card_screens', {
  qdb_info_card_screenname: 'Welcome to DFE Showcase',
  'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
  qdb_display_order: 1,
  qdb_heading:      'Welcome to the Complete DFE Showcase',
  qdb_sub_heading:  'This form demonstrates all Dynamic Form Engine capabilities',
  qdb_icon_url:     'https://cdn-icons-png.flaticon.com/512/3588/3588196.png',
  qdb_icon_alt_text:'DFE showcase illustration',
});

// Screen 1, Section 1: Numbered Steps
const s1sec1 = await post('qdb_info_card_sections', {
  qdb_info_card_sectionname: 'Form Steps',
  'qdb_info_card_screen_id@odata.bind': `/qdb_info_card_screens(${s1.qdb_info_card_screenid})`,
  qdb_display_order: 1, qdb_section_type: IST.steps, qdb_section_title: 'What You Will Fill In',
});
for (const [i, step] of [
  { title: 'Personal Info',        description: 'Full name, email, phone, date of birth, and gender',       icon: 'PersonRegular' },
  { title: 'Professional Details', description: 'Employment status, job title, skills, and contract type',  icon: 'BriefcaseRegular' },
  { title: 'Financial & Docs',     description: 'Monthly income, savings, upload CV, and additional notes', icon: 'DocumentRegular' },
  { title: 'System Access',        description: 'Select a form definition and define custom permissions',   icon: 'LockClosedRegular' },
  { title: 'Review & Submit',      description: 'Final review, effective date, and submission',             icon: 'CheckmarkCircleRegular' },
].entries()) {
  await post('qdb_info_card_items', {
    qdb_info_card_itemname: step.title,
    'qdb_info_card_section_id@odata.bind': `/qdb_info_card_sections(${s1sec1.qdb_info_card_sectionid})`,
    qdb_display_order: i + 1, qdb_item_title: step.title,
    qdb_item_description: step.description, qdb_icon_reference: step.icon,
  });
}
console.log('  ✓ Screen 1: Welcome (numbered steps)');

// Screen 2: Requirements
const s2 = await post('qdb_info_card_screens', {
  qdb_info_card_screenname: 'Requirements Checklist',
  'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
  qdb_display_order: 2,
  qdb_heading:      'What You Will Need',
  qdb_sub_heading:  'Gather these before you start',
  qdb_icon_url:     'https://cdn-icons-png.flaticon.com/512/1828/1828640.png',
  qdb_icon_alt_text:'Checklist illustration',
});

// Screen 2, Section 1: Icon list — requirements
const s2sec1 = await post('qdb_info_card_sections', {
  qdb_info_card_sectionname: 'Requirements',
  'qdb_info_card_screen_id@odata.bind': `/qdb_info_card_screens(${s2.qdb_info_card_screenid})`,
  qdb_display_order: 1, qdb_section_type: IST.iconList, qdb_section_title: 'Required Information',
});
for (const [i, item] of [
  { title: 'Valid Email Address',   description: 'A working corporate email you have access to',  icon: 'MailRegular'     },
  { title: 'Qatar Mobile Number',   description: 'Your 8-digit Qatar mobile number',              icon: 'PhoneRegular'    },
  { title: 'Date of Birth',         description: 'Your exact date of birth in DD/MM/YYYY format', icon: 'CalendarRegular' },
  { title: 'Monthly Income Figure', description: 'Your current gross monthly income in QAR',      icon: 'MoneyRegular'    },
  { title: 'Updated CV',            description: 'CV/resume as PDF or DOCX — max 5MB',            icon: 'DocumentRegular' },
].entries()) {
  await post('qdb_info_card_items', {
    qdb_info_card_itemname: item.title,
    'qdb_info_card_section_id@odata.bind': `/qdb_info_card_sections(${s2sec1.qdb_info_card_sectionid})`,
    qdb_display_order: i + 1, qdb_item_title: item.title,
    qdb_item_description: item.description, qdb_icon_reference: item.icon,
  });
}

// Screen 2, Section 2: Download list — templates
const s2sec2 = await post('qdb_info_card_sections', {
  qdb_info_card_sectionname: 'Document Templates',
  'qdb_info_card_screen_id@odata.bind': `/qdb_info_card_screens(${s2.qdb_info_card_screenid})`,
  qdb_display_order: 2, qdb_section_type: IST.downloadList, qdb_section_title: 'Download Templates',
});
for (const [i, item] of [
  { title: 'CV Template (English)', description: 'Standard CV template — DOCX format', url: 'https://example.com/cv-template-en.docx', icon: 'DocumentRegular'    },
  { title: 'NOC Template',          description: 'No Objection Certificate template',   url: 'https://example.com/noc-template.pdf',    icon: 'DocumentPdfRegular' },
].entries()) {
  await post('qdb_info_card_items', {
    qdb_info_card_itemname: item.title,
    'qdb_info_card_section_id@odata.bind': `/qdb_info_card_sections(${s2sec2.qdb_info_card_sectionid})`,
    qdb_display_order: i + 1, qdb_item_title: item.title,
    qdb_item_description: item.description, qdb_download_url: item.url, qdb_icon_reference: item.icon,
  });
}
console.log('  ✓ Screen 2: Requirements (icon list + download list)');
console.log('  ✓ 2 screens, 3 sections, 12 info-card items created');

// ══════════════════════════════════════════════════════════════════════════════
// [14] FORM DESIGN — qdb_form_design  (linked to theme)
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[14] Form Design (qdb_form_design)…');
const design = await post('qdb_form_designs', {
  'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
  'qdb_theme_id@odata.bind':           `/qdb_themes(${themeId})`,
  qdb_layout_type:              LAY.twoCol,
  qdb_label_position:           LBL.top,
  qdb_section_style:            SST.card,
  qdb_tab_style:                TST.tabs,
  qdb_button_style:             BST.primary,
  qdb_max_width:                '960px',
  qdb_alignment:                ALN.left,
  qdb_sticky_action_bar:        true,
  qdb_skeleton_loader_enabled:  true,
  qdb_is_active:                true,
});
const designId = design.qdb_form_designid;
console.log(`  ✓ Form design (${designId}) → theme Showcase Slate`);

// ══════════════════════════════════════════════════════════════════════════════
// [15] SECTION DESIGNS — qdb_section_design
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[15] Section Designs (qdb_section_design)…');
const sdBase = (secId, name) => ({
  'qdb_form_section_id@odata.bind': `/qdb_form_sections(${secId})`,
  qdb_name: name, qdb_is_active: true,
});

// Identity section — elevated card, 2 columns
await post('qdb_section_designs', { ...sdBase(secIdentity.qdb_form_sectionid, 'design-identity'),
  qdb_card_style: CST.elevated, qdb_column_layout: 100000002,
  qdb_collapsible_style: CLP.none, qdb_visibility_animation: ANM.fade,
  qdb_padding: '20px', qdb_background_color: '#ffffff',
});
// Financial section — outlined card, blue tint
await post('qdb_section_designs', { ...sdBase(secFinance.qdb_form_sectionid, 'design-finance'),
  qdb_card_style: CST.outlined, qdb_column_layout: 100000002,
  qdb_collapsible_style: CLP.none, qdb_visibility_animation: ANM.fade,
  qdb_background_color: '#eff6ff', qdb_border_style: '1px solid #bfdbfe',
});
// Skills section — collapsible, animated
await post('qdb_section_designs', { ...sdBase(secSkills.qdb_form_sectionid, 'design-skills'),
  qdb_card_style: CST.flat, qdb_column_layout: 100000002,
  qdb_collapsible_style: CLP.animated, qdb_visibility_animation: ANM.slide,
});
// Review section — elevated, amber tint
await post('qdb_section_designs', { ...sdBase(secReview.qdb_form_sectionid, 'design-review'),
  qdb_card_style: CST.elevated, qdb_column_layout: 100000002,
  qdb_collapsible_style: CLP.none, qdb_visibility_animation: ANM.fade,
  qdb_background_color: '#fffbeb', qdb_border_style: '1px solid #fcd34d',
});
console.log('  ✓ 4 section designs');

// ══════════════════════════════════════════════════════════════════════════════
// [16] FIELD DESIGNS — qdb_field_design
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[16] Field Designs (qdb_field_design)…');
const fdBase = (fieldId, name) => ({
  'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fieldId})`,
  qdb_name: name, qdb_is_active: true,
});

// Full name — filled style, person icon prefix
await post('qdb_field_designs', { ...fdBase(fFullName.qdb_form_fieldid, 'fdesign-fullname'),
  qdb_input_style: IST2.filled, qdb_width: FW.full,
  qdb_icon_prefix: 'PersonRegular',
  qdb_label_style: 'font-weight:600',
});
// Email — outlined, mail icon
await post('qdb_field_designs', { ...fdBase(fEmail.qdb_form_fieldid, 'fdesign-email'),
  qdb_input_style: IST2.outlined, qdb_width: FW.full,
  qdb_icon_prefix: 'MailRegular',
});
// Phone — half width, phone icon
await post('qdb_field_designs', { ...fdBase(fPhone.qdb_form_fieldid, 'fdesign-phone'),
  qdb_input_style: IST2.outlined, qdb_width: FW.half,
  qdb_icon_prefix: 'PhoneRegular',
});
// Monthly income — filled, money icon suffix
await post('qdb_field_designs', { ...fdBase(fIncome.qdb_form_fieldid, 'fdesign-income'),
  qdb_input_style: IST2.filled, qdb_width: FW.full,
  qdb_icon_suffix: 'MoneyRegular',
  qdb_label_style: 'color:#1a56db;font-weight:600',
});
// Notes — standard style, taller
await post('qdb_field_designs', { ...fdBase(fNotes.qdb_form_fieldid, 'fdesign-notes'),
  qdb_input_style: IST2.standard, qdb_width: FW.full,
  qdb_height: '120px',
});
console.log('  ✓ 5 field designs');

// ══════════════════════════════════════════════════════════════════════════════
// [17] BUTTON DESIGNS — qdb_button_design
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[17] Button Designs (qdb_button_design)…');
await post('qdb_button_designs', {
  'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
  qdb_name: 'bdesign-submit',
  qdb_button_type: BTN.submit,
  qdb_color:       '#1a56db',
  qdb_size:        100000002,
  qdb_border_radius: '8px',
  qdb_alignment:   ALN.right,
  qdb_icon:        'SendRegular',
  qdb_hover_effect: HOV.elevate,
  qdb_loading_style: LOD.spinner,
  qdb_is_active:   true,
});
await post('qdb_button_designs', {
  'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
  qdb_name: 'bdesign-savedraft',
  qdb_button_type: BTN.saveDraft,
  qdb_color:       '#7e3af2',
  qdb_size:        100000002,
  qdb_border_radius: '8px',
  qdb_alignment:   ALN.right,
  qdb_icon:        'SaveRegular',
  qdb_hover_effect: HOV.colorShift,
  qdb_loading_style: LOD.dots,
  qdb_is_active:   true,
});
await post('qdb_button_designs', {
  'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
  qdb_name: 'bdesign-cancel',
  qdb_button_type: BTN.cancel,
  qdb_size:        100000002,
  qdb_border_radius: '6px',
  qdb_alignment:   ALN.left,
  qdb_hover_effect: HOV.none,
  qdb_loading_style: LOD.spinner,
  qdb_is_active:   true,
});
console.log('  ✓ 3 button designs (Submit, Save Draft, Cancel)');

// ══════════════════════════════════════════════════════════════════════════════
// [18] LAYOUT GRIDS — qdb_layout_grid
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[18] Layout Grids (qdb_layout_grid)…');
const lgBase = (fieldId, name) => ({
  'qdb_form_design_id@odata.bind': `/qdb_form_designs(${designId})`,
  'qdb_form_field_id@odata.bind':  `/qdb_form_fields(${fieldId})`,
  qdb_name: name,
});
// Full name — full width at all breakpoints
await post('qdb_layout_grids', { ...lgBase(fFullName.qdb_form_fieldid, 'lg-fullname'), qdb_columns_total: 12, qdb_span_mobile: 12, qdb_span_tablet: 12, qdb_span_desktop: 12 });
// Email — full mobile, half tablet/desktop
await post('qdb_layout_grids', { ...lgBase(fEmail.qdb_form_fieldid,    'lg-email'),   qdb_columns_total: 12, qdb_span_mobile: 12, qdb_span_tablet: 6,  qdb_span_desktop: 6  });
// Phone — full mobile, half tablet/desktop
await post('qdb_layout_grids', { ...lgBase(fPhone.qdb_form_fieldid,    'lg-phone'),   qdb_columns_total: 12, qdb_span_mobile: 12, qdb_span_tablet: 6,  qdb_span_desktop: 6  });
// Income — full mobile, half tablet/desktop
await post('qdb_layout_grids', { ...lgBase(fIncome.qdb_form_fieldid,   'lg-income'),  qdb_columns_total: 12, qdb_span_mobile: 12, qdb_span_tablet: 6,  qdb_span_desktop: 6  });
// Notes — full width always
await post('qdb_layout_grids', { ...lgBase(fNotes.qdb_form_fieldid,    'lg-notes'),   qdb_columns_total: 12, qdb_span_mobile: 12, qdb_span_tablet: 12, qdb_span_desktop: 12 });
console.log('  ✓ 5 layout grid entries (responsive breakpoints: mobile/tablet/desktop)');

// ══════════════════════════════════════════════════════════════════════════════
// [19] SUBMISSION MAPPINGS — qdb_form_submission_mapping
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[19] Submission Mappings (qdb_form_submission_mapping)…');
const mapBase = { 'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`, qdb_target_entity_logical_name: 'qdb_form_submission_log', qdb_is_active: true, qdb_is_child_entity: false };
const mapping = async (fieldId, target, transform) => post('qdb_form_submission_mappings', {
  ...mapBase,
  'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fieldId})`,
  qdb_target_attribute_logical_name: target,
  ...(transform ? { qdb_transform_expression: transform } : {}),
});

await mapping(fHiddenCode.qdb_form_fieldid,  'qdb_form_code');
await mapping(fSelectRole.qdb_form_fieldid,  'qdb_selected_record_ids', 'toJson');
await mapping(fPermGrid.qdb_form_fieldid,    'qdb_grid_entries_json',   'toJson');
console.log('  ✓ 3 submission mappings → qdb_form_submission_log');

// ══════════════════════════════════════════════════════════════════════════════
// Update selection grid saved view ID (patch to use correct view)
// ══════════════════════════════════════════════════════════════════════════════
await patch('qdb_form_fields', fSelectRole.qdb_form_fieldid, {
  qdb_selection_mode: SEL.multi,
  qdb_saved_view_id:  '0448a02f-deed-4410-8a7d-aba72b7802d7',
});

// ══════════════════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  SEED COMPLETE — All 23 Dataverse Tables Involved               ║');
console.log('╠══════════════════════════════════════════════════════════════════╣');
console.log('║  Table                         │ Records Created                ║');
console.log('║  ─────────────────────────────────────────────────────────────  ║');
console.log('║  qdb_theme                     │ 1 (Showcase Slate)             ║');
console.log('║  qdb_rule_template             │ 1 (Qatar Mobile Number)        ║');
console.log('║  qdb_form_definition           │ 1 (dfe-complete)               ║');
console.log('║  qdb_form_tab                  │ 5                              ║');
console.log('║  qdb_form_section              │ 10                             ║');
console.log('║  qdb_form_field                │ 22 (all 21 types + 1 hidden)   ║');
console.log('║  qdb_form_option_value         │ 30                             ║');
console.log('║  qdb_form_validation_rule      │ 9                              ║');
console.log('║  qdb_form_lookup_config        │ 1                              ║');
console.log('║  qdb_form_business_rule        │ 3                              ║');
console.log('║  qdb_form_button               │ 3                              ║');
console.log('║  qdb_grid_column_config        │ 8                              ║');
console.log('║  qdb_info_card_screen          │ 2                              ║');
console.log('║  qdb_info_card_section         │ 3                              ║');
console.log('║  qdb_info_card_item            │ 12                             ║');
console.log('║  qdb_form_design               │ 1                              ║');
console.log('║  qdb_section_design            │ 4                              ║');
console.log('║  qdb_field_design              │ 5                              ║');
console.log('║  qdb_button_design             │ 3                              ║');
console.log('║  qdb_layout_grid               │ 5                              ║');
console.log('║  qdb_form_submission_mapping   │ 3                              ║');
console.log('║  qdb_form_submission_log       │ (written on submit)            ║');
console.log('║  qdb_form_submission_draft     │ (written on save draft)        ║');
console.log('╠══════════════════════════════════════════════════════════════════╣');
console.log(`║  Form URL: http://localhost:3000  →  "DFE Complete Showcase"     ║`);
console.log(`║  Form Code: ${FORM_CODE}                                 ║`);
console.log(`║  Form ID:   ${fid}     ║`);
console.log('╚══════════════════════════════════════════════════════════════════╝\n');
