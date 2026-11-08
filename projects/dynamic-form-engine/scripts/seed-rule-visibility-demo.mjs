/**
 * Business rules that hide a SECTION and a TAB.
 *
 * Form `rule-visibility-demo`. One dropdown drives everything:
 *
 *   Applicant type = Company     → everything visible
 *   Applicant type = Individual  → the "Company details" SECTION hides
 *                                  the "Company documents" TAB hides
 *
 * Two rules, one per target, both triggered by the same field. Rules are stored in the
 * legacy/seed shape: a flat conditions array in qdb_conditions_json keyed by FIELD GUID,
 * plus the structured qdb_action + qdb_target_section_id / qdb_target_tab_id columns.
 * (The visual designer serialises a different shape into the same column, which the
 * backend detects and parses separately — that path targets fields only.)
 *
 * Run: node --env-file=scripts/.env scripts/seed-rule-visibility-demo.mjs
 * Idempotent: guards on the form code.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API = `${DATAVERSE_URL}/api/data/v9.2`;
const FORM_CODE = 'rule-visibility-demo';

const FIELD_TYPE = { text: 100000001, dropdown: 100000006 };
const SECTION_COLUMNS_ONE = 100000001;
const COLUMN_SPAN_TWO = 100000002;
const STATUS_ACTIVE = 100000001;

/** qdb_action option values — see CrmMetadataService.mapAction. */
const ACTION = { hideSection: 100000004, hideTab: 100000006 };
const LOGIC_AND = 100000001;

let H;

async function token() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default` });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description ?? 'token failed');
  return j.access_token;
}

async function get(path) {
  const r = await fetch(`${API}/${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json();
}

async function post(entitySet, body) {
  const r = await fetch(`${API}/${entitySet}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`POST ${entitySet} → ${r.status}: ${text.slice(0, 320)}`);
  return JSON.parse(text);
}

async function run() {
  const accessToken = await token();
  H = { Authorization: `Bearer ${accessToken}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json' };

  const existing = await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`);
  if (existing.value.length > 0) {
    console.log(`Form '${FORM_CODE}' already exists (${existing.value[0].qdb_form_definitionid}) — nothing to do.`);
    return;
  }

  console.log(`Seeding '${FORM_CODE}'\n${'─'.repeat(66)}`);

  const form = await post('qdb_form_definitions', {
    qdb_form_code: FORM_CODE,
    qdb_title: 'Business Rule Visibility Demo',
    qdb_description: 'One dropdown hides a section on this tab and hides a whole tab.',
    qdb_status: STATUS_ACTIVE, qdb_version: 1, qdb_allow_save_draft: false,
  });
  const formId = form.qdb_form_definitionid;

  const makeTab = (label, order) => post('qdb_form_tabs', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_label: label, qdb_display_order: order, qdb_is_visible: true,
  });
  const makeSection = (tabId, label, order) => post('qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tabId})`,
    qdb_label: label, qdb_display_order: order,
    qdb_columns: SECTION_COLUMNS_ONE, qdb_is_visible: true,
  });
  const makeField = (sectionId, attributes) => post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${sectionId})`,
    qdb_column_span: COLUMN_SPAN_TWO,
    qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
    ...attributes,
  });

  // ── Tab 1: the trigger, plus the section the rule hides ────────
  const tab1 = await makeTab('1 · Applicant', 1);
  const secTrigger = await makeSection(tab1.qdb_form_tabid, 'Applicant', 1);

  const trigger = await makeField(secTrigger.qdb_form_sectionid, {
    qdb_schema_name: 'rvd_applicant_type', qdb_label: 'Applicant type',
    qdb_field_type: FIELD_TYPE.dropdown, qdb_display_order: 1,
  });
  for (const [index, [value, label]] of [['company', 'Company'], ['individual', 'Individual']].entries()) {
    await post('qdb_form_option_values', {
      'qdb_form_field_id@odata.bind': `/qdb_form_fields(${trigger.qdb_form_fieldid})`,
      qdb_value: value, qdb_label: label, qdb_display_order: index + 1, qdb_is_active: true,
    });
  }
  await makeField(secTrigger.qdb_form_sectionid, {
    qdb_schema_name: 'rvd_full_name', qdb_label: 'Full name',
    qdb_field_type: FIELD_TYPE.text, qdb_display_order: 2,
  });

  // The section the first rule hides — same tab, so the effect is visible immediately.
  const secCompany = await makeSection(tab1.qdb_form_tabid, 'Company details', 2);
  await makeField(secCompany.qdb_form_sectionid, {
    qdb_schema_name: 'rvd_company_name', qdb_label: 'Registered company name',
    qdb_field_type: FIELD_TYPE.text, qdb_display_order: 1,
  });
  await makeField(secCompany.qdb_form_sectionid, {
    qdb_schema_name: 'rvd_cr_number', qdb_label: 'CR number',
    qdb_field_type: FIELD_TYPE.text, qdb_display_order: 2,
  });

  // ── Tab 2: hidden entirely by the second rule ──────────────────
  const tab2 = await makeTab('2 · Company documents', 2);
  const secDocs = await makeSection(tab2.qdb_form_tabid, 'Documents', 1);
  await makeField(secDocs.qdb_form_sectionid, {
    qdb_schema_name: 'rvd_doc_note', qdb_label: 'Document reference',
    qdb_field_type: FIELD_TYPE.text, qdb_display_order: 1,
  });

  // ── Tab 3: always visible, so something remains when tab 2 hides ─
  const tab3 = await makeTab('3 · Review', 3);
  const secReview = await makeSection(tab3.qdb_form_tabid, 'Review', 1);
  await makeField(secReview.qdb_form_sectionid, {
    qdb_schema_name: 'rvd_comments', qdb_label: 'Comments',
    qdb_field_type: FIELD_TYPE.text, qdb_display_order: 1,
  });

  console.log('  tabs + sections + fields created');

  // ── The two rules ──────────────────────────────────────────────
  // Conditions are keyed by FIELD GUID: the backend resolves the trigger field from here,
  // and only rules whose trigger is on this form are evaluated.
  const conditions = JSON.stringify([
    { fieldId: trigger.qdb_form_fieldid, operator: 'equals', value: 'individual' },
  ]);

  await post('qdb_form_business_rules', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_name: 'Hide Company details when the applicant is an individual',
    qdb_description: 'Section-level visibility driven by rvd_applicant_type.',
    qdb_conditions_json: conditions,
    qdb_conditions_logic: LOGIC_AND,
    qdb_action: ACTION.hideSection,
    'qdb_target_section_id@odata.bind': `/qdb_form_sections(${secCompany.qdb_form_sectionid})`,
    qdb_priority: 100, qdb_is_active: true,
  });
  console.log('  rule 1 — hideSection → "Company details"');

  await post('qdb_form_business_rules', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_name: 'Hide Company documents tab when the applicant is an individual',
    qdb_description: 'Tab-level visibility driven by rvd_applicant_type.',
    qdb_conditions_json: conditions,
    qdb_conditions_logic: LOGIC_AND,
    qdb_action: ACTION.hideTab,
    'qdb_target_tab_id@odata.bind': `/qdb_form_tabs(${tab2.qdb_form_tabid})`,
    qdb_priority: 110, qdb_is_active: true,
  });
  console.log('  rule 2 — hideTab → "2 · Company documents"');

  console.log(`${'─'.repeat(66)}`);
  console.log(`form id ${formId}`);
  console.log(`Portal: http://localhost:3000/forms/${FORM_CODE}`);
  console.log('\nPick "Individual" → the Company details section disappears AND tab 2 disappears.');
  console.log('Pick "Company"    → both come back.');
}

run().catch((e) => { console.error('\nSEED FAILED:', e.message); process.exit(1); });
