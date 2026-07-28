/**
 * DFE-BARSRC-001 demo — one form showing every bar bounds source side by side.
 *
 *   Static      literal Min/Max on the field itself. No lookup, no read, nothing async.
 *   Static+min  a floor shifts the origin: 500k–1.5M at 750k is 25%, not 50%.
 *   Form Field  the original behaviour — bounds read from other fields on the form.
 *
 * The AMOUNT is a separate decision in every mode: the bar field's own value, unless
 * Bar Value Field Schema names another field. The third bar shows that variant.
 *
 * Run: node --env-file=scripts/.env scripts/seed-bar-source-demo.mjs
 * Idempotent: guards on the form code.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API = `${DATAVERSE_URL}/api/data/v9.2`;
const FORM_CODE = 'bar-source-demo';

const FIELD_TYPE = { currency: 100000011, number: 100000003 };
const DISPLAY_STYLE_BAR = 100000002;
const BAR_SOURCE = { formField: 100000000, static: 100000001 };
const SECTION_COLUMNS_ONE = 100000001;
const COLUMN_SPAN_TWO = 100000002;
const STATUS_ACTIVE = 100000001;

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
  if (!r.ok) throw new Error(`POST ${entitySet} → ${r.status}: ${text.slice(0, 300)}`);
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

  console.log(`Seeding '${FORM_CODE}'\n${'─'.repeat(64)}`);

  const form = await post('qdb_form_definitions', {
    qdb_form_code: FORM_CODE,
    qdb_title: 'Bar Source Demo',
    qdb_description: 'Static bounds, a static minimum shifting the origin, and the original form-field bounds.',
    qdb_status: STATUS_ACTIVE,
    qdb_version: 1,
    qdb_allow_save_draft: false,
  });
  const formId = form.qdb_form_definitionid;

  const tab = await post('qdb_form_tabs', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_label: 'Bars', qdb_display_order: 1, qdb_is_visible: true,
  });
  const section = await post('qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tab.qdb_form_tabid})`,
    qdb_label: 'Utilisation', qdb_display_order: 1,
    qdb_columns: SECTION_COLUMNS_ONE, qdb_is_visible: true,
  });

  const makeField = (attributes) => post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${section.qdb_form_sectionid})`,
    qdb_column_span: COLUMN_SPAN_TWO,
    qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
    ...attributes,
  });

  // 1 — Static, zero-based. 820,000 of 1,000,000 = 82%.
  await makeField({
    qdb_schema_name: 'bsd_static', qdb_label: 'Static bounds (0 – 1,000,000)',
    qdb_field_type: FIELD_TYPE.currency, qdb_display_order: 1,
    qdb_number_display_style: DISPLAY_STYLE_BAR, qdb_currency_code: 'QAR',
    qdb_is_readonly: true,
    qdb_bar_source: BAR_SOURCE.static, qdb_bar_min_value: 0, qdb_bar_max_value: 1000000,
    qdb_default_value: '820000',
  });
  console.log('  bsd_static            Static 0–1,000,000, value 820,000        → 82%');

  // 2 — Static with a floor. 750,000 in a 500,000–1,500,000 band = 25%, not 50%.
  await makeField({
    qdb_schema_name: 'bsd_static_min', qdb_label: 'Static bounds with a floor (500,000 – 1,500,000)',
    qdb_field_type: FIELD_TYPE.currency, qdb_display_order: 2,
    qdb_number_display_style: DISPLAY_STYLE_BAR, qdb_currency_code: 'QAR',
    qdb_is_readonly: true,
    qdb_bar_source: BAR_SOURCE.static, qdb_bar_min_value: 500000, qdb_bar_max_value: 1500000,
    qdb_default_value: '750000',
  });
  console.log('  bsd_static_min        Static 500,000–1,500,000, value 750,000  → 25% (not 50%)');

  // 3 — Form Field bounds, amount from another field: the original behaviour, untouched.
  await makeField({
    qdb_schema_name: 'bsd_limit', qdb_label: 'Approved limit',
    qdb_field_type: FIELD_TYPE.number, qdb_display_order: 3, qdb_default_value: '400000',
  });
  await makeField({
    qdb_schema_name: 'bsd_drawn', qdb_label: 'Drawn to date',
    qdb_field_type: FIELD_TYPE.number, qdb_display_order: 4, qdb_default_value: '100000',
  });
  await makeField({
    qdb_schema_name: 'bsd_form_field', qdb_label: 'Form Field bounds (reads the two fields above)',
    qdb_field_type: FIELD_TYPE.currency, qdb_display_order: 5,
    qdb_number_display_style: DISPLAY_STYLE_BAR, qdb_currency_code: 'QAR',
    qdb_is_readonly: true,
    qdb_bar_source: BAR_SOURCE.formField,
    qdb_bar_max_field_schema: 'bsd_limit',
    qdb_bar_value_field_schema: 'bsd_drawn',
  });
  console.log('  bsd_form_field        Form Field: 100,000 of 400,000           → 25%');

  console.log(`${'─'.repeat(64)}`);
  console.log(`form id ${formId}`);
  console.log(`Portal: http://localhost:3000/forms/${FORM_CODE}`);
  console.log('Publish it before opening the in-CRM runtime.');
}

run().catch((e) => { console.error('\nSEED FAILED:', e.message); process.exit(1); });
