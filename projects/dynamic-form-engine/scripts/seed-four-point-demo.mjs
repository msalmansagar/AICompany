/**
 * Demo form for the two enhancements and the two defect fixes, in one place.
 *
 *   Form `four-point-demo`
 *
 *   1. Dropdown default      — "Country" opens already set to Qatar.
 *   2. Multi-select default  — "Services" opens with two options already ticked.
 *   3. Grid lookup sort      — the grid's "Company" column lists accounts Z-A.
 *   4. Hidden field in the summary tab  — published in the JSON, marked not visible.
 *   5. Rule on a summary-tab section    — a LOOKUP value hides a section on that tab.
 *
 * Items 4 and 5 sit on a tab flagged qdb_is_summary_tab, which is the exact shape that
 * was reported broken: before the fix the hidden field was deleted from the published
 * JSON, and a rule with no reachable trigger never fired.
 *
 * Run:    node --env-file=scripts/.env scripts/seed-four-point-demo.mjs
 * Reseed: node --env-file=scripts/.env scripts/seed-four-point-demo.mjs --force
 * Idempotent: guards on the form code unless --force is passed.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API = `${DATAVERSE_URL}/api/data/v9.2`;

const FORM_CODE = 'four-point-demo';
const FORCE = process.argv.includes('--force');

const FIELD_TYPE = {
  text: 100000001, dropdown: 100000006, multi_select: 100000007,
  lookup: 100000008, interactiveGrid: 100000021,
};
const SECTION_ONE_COLUMN = 100000001;
const COLUMN_SPAN_TWO = 100000002;
const STATUS_ACTIVE = 100000001;
const GRID_MODE_ENTRY = 100000001;

/** The account whose selection hides the summary-tab section. */
const SPONSOR_THAT_HIDES = 'QDB Enterprise Solutions';

let H;

async function token() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
  });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? 'token failed');
  return json.access_token;
}

async function get(path) {
  const res = await fetch(`${API}/${path}`, { headers: H });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}

async function post(entitySet, body) {
  const res = await fetch(`${API}/${entitySet}`, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${entitySet} -> ${res.status}: ${text.slice(0, 320)}`);
  return JSON.parse(text);
}

async function del(entitySet, id) {
  const res = await fetch(`${API}/${entitySet}(${id})`, { method: 'DELETE', headers: H });
  if (!res.ok && res.status !== 404) throw new Error(`DELETE ${entitySet} -> ${res.status}`);
}

/** Removes a previous run so --force reseeds cleanly. Children cascade from the form. */
async function removeExisting(formId) {
  const rules = await get(`qdb_form_business_rules?$select=qdb_form_business_ruleid&$filter=_qdb_form_definition_id_value eq ${formId}`);
  for (const rule of rules.value) await del('qdb_form_business_rules', rule.qdb_form_business_ruleid);
  await del('qdb_form_definitions', formId);
}

async function run() {
  H = {
    Authorization: `Bearer ${await token()}`,
    'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
    Accept: 'application/json', 'Content-Type': 'application/json',
  };

  const existing = await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`);
  if (existing.value.length > 0) {
    if (!FORCE) {
      console.log(`Form '${FORM_CODE}' already exists. Pass --force to reseed.`);
      return;
    }
    console.log('removing the previous run…');
    await removeExisting(existing.value[0].qdb_form_definitionid);
  }

  console.log(`Seeding '${FORM_CODE}'\n${'-'.repeat(70)}`);

  const form = await post('qdb_form_definitions', {
    qdb_form_code: FORM_CODE,
    qdb_title: 'Four Point Demo',
    qdb_description: 'Defaults on choice fields, a sorted grid lookup, a hidden field on the summary tab, and a lookup-driven rule hiding a summary-tab section.',
    qdb_status: STATUS_ACTIVE, qdb_version: 1, qdb_allow_save_draft: false,
  });
  const formId = form.qdb_form_definitionid;

  const makeTab = (label, order, extra = {}) => post('qdb_form_tabs', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_label: label, qdb_display_order: order, qdb_is_visible: true, ...extra,
  });
  const makeSection = (tabId, label, order) => post('qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tabId})`,
    qdb_label: label, qdb_display_order: order,
    qdb_columns: SECTION_ONE_COLUMN, qdb_is_visible: true,
  });
  const makeField = (sectionId, attributes) => post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${sectionId})`,
    qdb_column_span: COLUMN_SPAN_TWO,
    qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
    ...attributes,
  });
  const makeOption = (fieldId, value, label, order) => post('qdb_form_option_values', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fieldId})`,
    qdb_value: value, qdb_label: label, qdb_display_order: order, qdb_is_active: true,
  });
  const makeGridColumn = (fieldId, attributes) => post('qdb_grid_column_configs', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fieldId})`,
    qdb_is_visible: true, qdb_is_editable: true, ...attributes,
  });

  // ── Tab 1 — the two enhancements ────────────────────────────────────────
  const tab1 = await makeTab('1 · Application', 1);
  const secApplicant = await makeSection(tab1.qdb_form_tabid, 'Applicant', 1);

  // 1. Dropdown default. Stored as the option's value; the form opens on Qatar.
  const country = await makeField(secApplicant.qdb_form_sectionid, {
    qdb_schema_name: 'fpd_country', qdb_label: 'Country',
    qdb_field_type: FIELD_TYPE.dropdown, qdb_display_order: 1,
    qdb_default_value: 'qa',
  });
  for (const [index, [value, label]] of [['qa', 'Qatar'], ['ae', 'United Arab Emirates'], ['sa', 'Saudi Arabia']].entries()) {
    await makeOption(country.qdb_form_fieldid, value, label, index + 1);
  }
  console.log('  1. dropdown  "Country"  default = qa');

  // 2. Multi-select default. One text column holds a list, so it is stored as JSON.
  const services = await makeField(secApplicant.qdb_form_sectionid, {
    qdb_schema_name: 'fpd_services', qdb_label: 'Services required',
    qdb_field_type: FIELD_TYPE.multi_select, qdb_display_order: 2,
    qdb_default_value: JSON.stringify(['advisory', 'funding']),
  });
  for (const [index, [value, label]] of [['advisory', 'Advisory'], ['funding', 'Funding'], ['training', 'Training'], ['export', 'Export support']].entries()) {
    await makeOption(services.qdb_form_fieldid, value, label, index + 1);
  }
  console.log('  2. multi-select "Services required"  default = ["advisory","funding"]');

  // The lookup that drives the summary-tab rule.
  const sponsor = await makeField(secApplicant.qdb_form_sectionid, {
    qdb_schema_name: 'fpd_sponsor', qdb_label: 'Sponsor',
    qdb_field_type: FIELD_TYPE.lookup, qdb_display_order: 3,
  });
  await post('qdb_form_lookup_configs', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${sponsor.qdb_form_fieldid})`,
    qdb_entity_logical_name: 'account', qdb_display_attribute: 'name',
    // qdb_search_min_chars has a floor of 1 in Dataverse; 0 is rejected outright.
    qdb_value_attribute: 'accountid', qdb_search_min_chars: 1, qdb_max_results: 20,
  });
  console.log('  .  lookup "Sponsor" -> account (drives the rule)');

  // 3. Grid lookup sort. The Company column lists accounts descending by name.
  const secDocs = await makeSection(tab1.qdb_form_tabid, 'Supporting documents', 2);
  const grid = await makeField(secDocs.qdb_form_sectionid, {
    qdb_schema_name: 'fpd_documents', qdb_label: 'Documents',
    qdb_field_type: FIELD_TYPE.interactiveGrid, qdb_display_order: 1,
    qdb_grid_mode: GRID_MODE_ENTRY, qdb_max_rows: 10, qdb_grid_min_rows: 1,
    qdb_grid_entity_name: 'qdb_demo_document',
  });
  await makeGridColumn(grid.qdb_form_fieldid, {
    qdb_column_label: 'Description', qdb_column_attribute: 'fpd_desc',
    qdb_column_field_type: 'text', qdb_display_order: 1,
  });
  await makeGridColumn(grid.qdb_form_fieldid, {
    qdb_column_label: 'Company', qdb_column_attribute: 'fpd_company',
    qdb_column_field_type: 'lookup', qdb_display_order: 2,
    qdb_column_options_json: JSON.stringify({
      v: 2, filterType: 'lookup',
      lookupTargetEntity: 'account', lookupDisplayAttribute: 'name',
      lookupValueAttribute: 'accountid',
      lookupSort: 'desc',
    }),
  });
  console.log('  3. grid column "Company"  lookupSort = desc');

  // ── Tab 2 — the summary tab, where both defects were reported ───────────
  const tabSummary = await makeTab('2 · Summary', 2, { qdb_is_summary_tab: true });

  const secSummary = await makeSection(tabSummary.qdb_form_tabid, 'Summary details', 1);
  await makeField(secSummary.qdb_form_sectionid, {
    qdb_schema_name: 'fpd_reference', qdb_label: 'Application reference',
    qdb_field_type: FIELD_TYPE.text, qdb_display_order: 1,
  });
  // 4. Hidden field on the summary tab, referenced by nothing. This is the field that
  //    used to be deleted from the published JSON entirely.
  await makeField(secSummary.qdb_form_sectionid, {
    qdb_schema_name: 'fpd_internal_ref', qdb_label: 'Internal reference (hidden)',
    qdb_field_type: FIELD_TYPE.text, qdb_display_order: 2,
    qdb_is_hidden: true,
  });
  console.log('  4. hidden field "fpd_internal_ref" on the summary tab');

  // 5. The section a lookup value hides, on the summary tab.
  const secSponsor = await makeSection(tabSummary.qdb_form_tabid, 'Sponsor block', 2);
  await makeField(secSponsor.qdb_form_sectionid, {
    qdb_schema_name: 'fpd_sponsor_note', qdb_label: 'Sponsor note',
    qdb_field_type: FIELD_TYPE.text, qdb_display_order: 1,
  });

  // The designer rule shape: the rule is published on its TRIGGER field, and the
  // condition matches the lookup's display name.
  const definition = {
    version: '1.0',
    trigger_field_code: 'fpd_sponsor',
    trigger_event: 'on_change',
    condition_group: {
      logical_operator: 'AND',
      conditions: [{ field_code: 'fpd_sponsor', operator: 'equals', value: SPONSOR_THAT_HIDES }],
    },
    actions: [{ action_type: 'hide_section', target_section_id: secSponsor.qdb_form_sectionid }],
  };
  await post('qdb_form_business_rules', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_name: `Hide the Sponsor block when the sponsor is ${SPONSOR_THAT_HIDES}`,
    qdb_description: 'Section on the SUMMARY tab, hidden on a lookup value.',
    qdb_conditions_json: JSON.stringify(definition),
    qdb_action: 100000004, // hideSection — mirrors the single action into the columns
    'qdb_target_section_id@odata.bind': `/qdb_form_sections(${secSponsor.qdb_form_sectionid})`,
    qdb_priority: 100, qdb_is_active: true,
  });
  console.log(`  5. rule  fpd_sponsor equals "${SPONSOR_THAT_HIDES}"  ->  hide section "Sponsor block"`);

  console.log('-'.repeat(70));
  console.log(`form id ${formId}`);
  console.log(`\nPublish it, then open  http://localhost:3000/forms/${FORM_CODE}`);
}

run().catch((error) => { console.error('\nSEED FAILED:', error.message); process.exit(1); });
