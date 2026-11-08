/**
 * Seeds `iban-not-same-demo`: a new IBAN must differ from the existing one.
 *   vrp_bank2_acno                 existing IBAN, read-only, pre-filled by a default value
 *                                  (stands in for the value loaded from the record)
 *   vrp_externalbankaccountnumber  new IBAN, with a Custom Expression rule:
 *     isEmpty(new) || upper(trim(new)) != upper(trim(existing))
 * Then publishes the form and checks the published JSON.
 *
 *   node --env-file=scripts/.env scripts/seed-iban-not-same-demo.mjs [--force]
 */
const TENANT_ID = process.env.DV_TENANT_ID;
const CLIENT_ID = process.env.DV_CLIENT_ID;
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = process.env.DV_DATAVERSE_URL.replace(/\/$/, '');
const API = `${DATAVERSE_URL}/api/data/v9.2`;

const FORM_CODE = 'iban-not-same-demo';
const FORCE = process.argv.includes('--force');

const FIELD_TYPE_TEXT = 100000001;
const SECTION_ONE_COLUMN = 100000001;
const COLUMN_SPAN_ONE = 100000001;
const STATUS_ACTIVE = 100000001;
const RULE_TYPE_REQUIRED = 100000001;
const RULE_TYPE_CUSTOM_EXPRESSION = 100000012;

const EXISTING_FIELD = 'vrp_bank2_acno';
const NEW_FIELD = 'vrp_externalbankaccountnumber';
/** The demo's "existing" IBAN; on a real form this value comes from the record. */
const EXISTING_IBAN = 'QA58DOHB00001234567890ABCDEFG';
const EXPRESSION = `isEmpty({${NEW_FIELD}}) || upper(trim({${NEW_FIELD}})) != upper(trim({${EXISTING_FIELD}}))`;
const MESSAGE = 'Entered IBAN is same as existing IBAN Number.';

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
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function post(entitySet, body) {
  const res = await fetch(`${API}/${entitySet}`, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${entitySet} -> ${res.status}: ${text.slice(0, 320)}`);
  return text ? JSON.parse(text) : null;
}

async function del(entitySet, id) {
  const res = await fetch(`${API}/${entitySet}(${id})`, { method: 'DELETE', headers: H });
  if (!res.ok && res.status !== 404) throw new Error(`DELETE ${entitySet} -> ${res.status}`);
}

async function removeExisting(formId) {
  const caches = await get(`qdb_form_render_caches?$select=qdb_form_render_cacheid&$filter=qdb_form_code eq '${FORM_CODE}'`);
  for (const cache of caches.value) await del('qdb_form_render_caches', cache.qdb_form_render_cacheid);
  await del('qdb_form_definitions', formId);
}

async function seed() {
  const form = await post('qdb_form_definitions', {
    qdb_form_code: FORM_CODE, qdb_title: 'IBAN Must Change Demo',
    qdb_description: 'A new IBAN must differ from the existing one (Custom Expression rule).',
    qdb_status: STATUS_ACTIVE, qdb_version: 1, qdb_allow_save_draft: false,
  });
  const formId = form.qdb_form_definitionid;
  const tab = await post('qdb_form_tabs', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_label: 'Bank account update', qdb_display_order: 1, qdb_is_visible: true,
  });
  const section = await post('qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tab.qdb_form_tabid})`,
    qdb_label: 'Change IBAN', qdb_display_order: 1, qdb_columns: SECTION_ONE_COLUMN, qdb_is_visible: true,
  });
  const makeField = (attributes) => post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${section.qdb_form_sectionid})`,
    qdb_field_type: FIELD_TYPE_TEXT, qdb_column_span: COLUMN_SPAN_ONE,
    qdb_is_required: false, qdb_is_hidden: false, ...attributes,
  });

  await makeField({
    qdb_schema_name: EXISTING_FIELD, qdb_label: 'Existing IBAN', qdb_display_order: 1,
    qdb_is_readonly: true, qdb_default_value: EXISTING_IBAN,
  });
  const newIban = await makeField({
    qdb_schema_name: NEW_FIELD, qdb_label: 'New IBAN', qdb_display_order: 2, qdb_is_readonly: false,
  });

  const rule = (attributes) => post('qdb_form_validation_rules', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${newIban.qdb_form_fieldid})`,
    qdb_is_active: true, ...attributes,
  });
  await rule({ qdb_rule_type: RULE_TYPE_REQUIRED, qdb_error_message: 'New IBAN is required.', qdb_priority: 1 });
  await rule({
    qdb_rule_type: RULE_TYPE_CUSTOM_EXPRESSION, qdb_custom_expression: EXPRESSION,
    qdb_error_message: MESSAGE, qdb_priority: 2,
  });
  return formId;
}

async function publishAndRead() {
  const res = await fetch(`${API}/qdb_PublishForm`, {
    method: 'POST', headers: H, body: JSON.stringify({ FormCode: FORM_CODE, TargetVersion: 1, PublishJobId: '' }),
  });
  if (!res.ok) throw new Error(`qdb_PublishForm -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));
    const caches = await get(`qdb_form_render_caches?$select=qdb_form_render_cacheid&$filter=qdb_form_code eq '${FORM_CODE}'`);
    if (caches.value.length >= 1) break;
  }
  const read = await fetch(`${API}/qdb_GetPublishedFormJson`, {
    method: 'POST', headers: H, body: JSON.stringify({ FormCode: FORM_CODE, LanguageCode: 'en', Version: 0 }),
  });
  const body = await read.json();
  if (!read.ok || body.errorCode) throw new Error(`qdb_GetPublishedFormJson -> ${read.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body.RuntimeJson;
}

function check(label, passed, detail) {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  return passed;
}

function verify(runtimeJson) {
  const json = JSON.parse(runtimeJson);
  const fields = json.tabs.flatMap((t) => t.sections.flatMap((s) => s.fields));
  const byCode = Object.fromEntries(fields.map((f) => [f.schemaName, f]));
  const rules = byCode[NEW_FIELD]?.validationRules ?? [];
  const expressionRule = rules.find((r) => r.ruleType === 'customExpression');
  return [
    check('existing IBAN field is read-only with its default', byCode[EXISTING_FIELD]?.isReadonly === true && byCode[EXISTING_FIELD]?.defaultValue === EXISTING_IBAN,
      `readonly=${byCode[EXISTING_FIELD]?.isReadonly} default=${byCode[EXISTING_FIELD]?.defaultValue}`),
    check('new IBAN carries the Custom Expression rule', expressionRule?.customExpression === EXPRESSION, expressionRule?.customExpression),
    check('new IBAN keeps its Required rule', rules.some((r) => r.ruleType === 'required')),
  ].every(Boolean);
}

async function run() {
  H = { Authorization: `Bearer ${await token()}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json' };
  const existing = await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`);
  if (existing.value.length > 0) {
    if (!FORCE) { console.log(`Form '${FORM_CODE}' already exists. Pass --force to reseed.`); return; }
    await removeExisting(existing.value[0].qdb_form_definitionid);
  }
  const formId = await seed();
  console.log(`seeded ${FORM_CODE}: form ${formId}`);
  const runtimeJson = await publishAndRead();
  const outIndex = process.argv.indexOf('--json-out');
  if (outIndex >= 0) (await import('node:fs')).writeFileSync(process.argv[outIndex + 1], runtimeJson);
  const ok = verify(runtimeJson);
  console.log(`\nOpen: ${DATAVERSE_URL}/main.aspx?pagetype=webresource&webresourceName=qdb_form_runtime.html&data=${formId}`);
  process.exit(ok ? 0 : 1);
}

run().catch((error) => { console.error('SEED FAILED:', error.message); process.exit(1); });
