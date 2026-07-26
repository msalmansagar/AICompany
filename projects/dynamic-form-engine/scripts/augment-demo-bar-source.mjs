/**
 * Adds a record-driven utilization bar to `custom-entity-lookup-demo`.
 *
 * The bar's minimum, maximum and current value are read from the CRM record the user picks
 * in a lookup — not from other fields on the form, which is all the bar could do before.
 *
 *   source lookup : cel_external_status   (already on the form)
 *   entity        : qdb_applicationstatus
 *   min / max / value attributes are provisioned on that table by this script, so the demo
 *   has real numbers to read without touching a business table.
 *
 * Run: node --env-file=scripts/.env scripts/augment-demo-bar-source.mjs
 * Idempotent: guards on the bar field and on each attribute.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION = 'QdbDynamicFormEngine';

const FORM_CODE = 'custom-entity-lookup-demo';
const BAR_FIELD = 'cel_utilisation';
const SOURCE_FIELD = 'cel_external_status';
const SOURCE_ENTITY = 'qdb_applicationstatus';
const SOURCE_ENTITY_SET = 'qdb_applicationstatuses';

const FIELD_TYPE_CURRENCY = 100000011;
const NUMBER_DISPLAY_BAR = 100000002;
const COLUMN_SPAN_TWO = 100000002;

// Numbers the bar reads. Added to the demo reference table so no business table is touched.
const BAR_ATTRIBUTES = [
  { schema: 'qdb_demo_floor', display: 'Demo Floor', description: 'Demo only — bar minimum.' },
  { schema: 'qdb_demo_limit', display: 'Demo Limit', description: 'Demo only — bar maximum.' },
  { schema: 'qdb_demo_utilised', display: 'Demo Utilised', description: 'Demo only — bar current value.' },
];

/** Values written onto the two existing demo status rows, so each shows a different fill. */
const DEMO_VALUES = {
  'DFE DEMO — Approved': { qdb_demo_floor: 0, qdb_demo_limit: 1000000, qdb_demo_utilised: 820000 },
  'DFE DEMO — Under Review': { qdb_demo_floor: 500000, qdb_demo_limit: 1500000, qdb_demo_utilised: 750000 },
};

let H;

async function acquireToken() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default` });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description ?? 'token request failed');
  return j.access_token;
}

const label = (text) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }] });

async function get(path) {
  const r = await fetch(`${API}/${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function post(entitySet, body) {
  const r = await fetch(`${API}/${entitySet}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`POST ${entitySet} → ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function patch(entitySet, id, body) {
  const r = await fetch(`${API}/${entitySet}(${id})`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PATCH ${entitySet} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function ensureMoneyAttribute(attribute) {
  const exists = await fetch(
    `${API}/EntityDefinitions(LogicalName='${SOURCE_ENTITY}')/Attributes(LogicalName='${attribute.schema}')?$select=LogicalName`,
    { headers: H },
  );
  if (exists.ok) { console.log(`  exists — ${attribute.schema}`); return; }

  const body = {
    '@odata.type': 'Microsoft.Dynamics.CRM.MoneyAttributeMetadata',
    SchemaName: attribute.schema,
    LogicalName: attribute.schema,
    RequiredLevel: { Value: 'None' },
    DisplayName: label(attribute.display),
    Description: label(attribute.description),
    PrecisionSource: 2,
  };
  const r = await fetch(`${API}/EntityDefinitions(LogicalName='${SOURCE_ENTITY}')/Attributes`, {
    method: 'POST', headers: { ...H, 'MSCRM.SolutionUniqueName': SOLUTION }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`add ${attribute.schema}: ${(await r.text()).slice(0, 300)}`);
  console.log(`  created ${attribute.schema}`);
}

async function run() {
  const accessToken = await acquireToken();
  H = { Authorization: `Bearer ${accessToken}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json' };

  console.log(`Record-driven bar on '${FORM_CODE}'\n${'─'.repeat(66)}`);

  for (const attribute of BAR_ATTRIBUTES) await ensureMoneyAttribute(attribute);
  await fetch(`${API}/PublishXml`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ ParameterXml: `<importexportxml><entities><entity>${SOURCE_ENTITY}</entity></entities></importexportxml>` }),
  });

  const statuses = await get(`${SOURCE_ENTITY_SET}?$select=${SOURCE_ENTITY}id,qdb_name&$filter=startswith(qdb_name,'DFE DEMO')`);
  for (const status of statuses.value) {
    const values = DEMO_VALUES[status.qdb_name];
    if (!values) continue;
    await patch(SOURCE_ENTITY_SET, status[`${SOURCE_ENTITY}id`], values);
    console.log(`  ${status.qdb_name}: floor ${values.qdb_demo_floor}, limit ${values.qdb_demo_limit}, utilised ${values.qdb_demo_utilised}`);
  }

  const existingBar = await get(`qdb_form_fields?$filter=qdb_schema_name eq '${BAR_FIELD}'&$select=qdb_form_fieldid`);
  if (existingBar.value.length > 0) {
    console.log(`  bar field '${BAR_FIELD}' already present — nothing further to do.`);
    return;
  }

  const forms = await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`);
  const formId = forms.value[0].qdb_form_definitionid;

  const source = await get(`qdb_form_fields?$filter=qdb_schema_name eq '${SOURCE_FIELD}'&$select=qdb_form_fieldid,_qdb_form_section_id_value`);
  const sourceField = source.value[0];

  const bar = await post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${sourceField._qdb_form_section_id_value})`,
    qdb_schema_name: BAR_FIELD,
    qdb_label: 'Facility utilisation (read from the selected status record)',
    qdb_field_type: FIELD_TYPE_CURRENCY,
    qdb_number_display_style: NUMBER_DISPLAY_BAR,
    qdb_display_order: 5,
    qdb_column_span: COLUMN_SPAN_TWO,
    qdb_is_required: false,
    qdb_is_readonly: true,
    qdb_is_hidden: false,
    qdb_currency_code: 'QAR',
  });
  console.log(`  created bar field ${BAR_FIELD}`);

  await post('qdb_form_bar_configs', {
    qdb_name: `bar-${BAR_FIELD}`,
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${bar.qdb_form_fieldid})`,
    'qdb_source_field_id@odata.bind': `/qdb_form_fields(${sourceField.qdb_form_fieldid})`,
    qdb_entity_logical_name: SOURCE_ENTITY,
    qdb_min_attribute: 'qdb_demo_floor',
    qdb_max_attribute: 'qdb_demo_limit',
    qdb_value_attribute: 'qdb_demo_utilised',
  });
  console.log('  created bar config → reads from the record picked in External Status');

  console.log(`${'─'.repeat(66)}`);
  console.log(`Portal: http://localhost:3000/forms/${FORM_CODE}`);
  console.log('Pick "DFE DEMO — Approved"     → 0–1,000,000 with 820,000 used  = 82%');
  console.log('Pick "DFE DEMO — Under Review" → 500,000–1,500,000 with 750,000 = 25%  (min shifts the origin)');
}

run().catch((e) => { console.error('\nAUGMENT FAILED:', e.message); process.exit(1); });
