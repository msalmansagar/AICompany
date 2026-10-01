/**
 * Seeds `apival-camera-demo` — DFE-APIVAL-CAM-001:
 *   A. An IBAN field with an API Validation rule (key IBAN) plus Required. The form calls no API;
 *      a handler the front end registers for "IBAN" decides.
 *   B. A photo field set to Camera only, allowing JPEG and PNG.
 * Then publishes the form and checks the published JSON.
 *
 *   node --env-file=scripts/.env scripts/seed-apival-camera-demo.mjs [--force]
 */
const TENANT_ID = process.env.DV_TENANT_ID;
const CLIENT_ID = process.env.DV_CLIENT_ID;
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = process.env.DV_DATAVERSE_URL.replace(/\/$/, '');
const API = `${DATAVERSE_URL}/api/data/v9.2`;

const FORM_CODE = 'apival-camera-demo';
const FORCE = process.argv.includes('--force');

const FIELD_TYPE = { text: 100000001, file: 100000015 };
const SECTION_ONE_COLUMN = 100000001;
const COLUMN_SPAN_ONE = 100000001;
const STATUS_ACTIVE = 100000001;
const RULE_TYPE_REQUIRED = 100000001;
const RULE_TYPE_API_VALIDATION = 100000014;
const CAPTURE_CAMERA_ONLY = 100000001;
/** qdb_allowed_file_extensions option values for JPEG and PNG. */
const ALLOWED_IMAGE_EXTENSIONS = '100000001,100000002';

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

function validationRule(fieldId, ruleType, errorMessage, priority, ruleJson) {
  return post('qdb_form_validation_rules', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fieldId})`,
    qdb_rule_type: ruleType, qdb_error_message: errorMessage,
    qdb_priority: priority, qdb_is_active: true,
    ...(ruleJson ? { qdb_rule_json: JSON.stringify(ruleJson) } : {}),
  });
}

async function seed() {
  const form = await post('qdb_form_definitions', {
    qdb_form_code: FORM_CODE, qdb_title: 'API Validation and Camera Demo',
    qdb_description: 'An IBAN checked by the front end through an API Validation rule, and a camera-only photo field.',
    qdb_status: STATUS_ACTIVE, qdb_version: 1, qdb_allow_save_draft: false,
  });
  const formId = form.qdb_form_definitionid;

  const tab = await post('qdb_form_tabs', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_label: 'Bank details', qdb_display_order: 1, qdb_is_visible: true,
  });
  const makeSection = (label, order) => post('qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tab.qdb_form_tabid})`,
    qdb_label: label, qdb_display_order: order, qdb_columns: SECTION_ONE_COLUMN, qdb_is_visible: true,
  });
  const makeField = (sectionId, attributes) => post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${sectionId})`,
    qdb_column_span: COLUMN_SPAN_ONE, qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
    ...attributes,
  });

  // ── A. API validation ────────────────────────────────────────────────────
  const secBank = await makeSection('A · IBAN checked by the front end', 1);
  await makeField(secBank.qdb_form_sectionid, {
    qdb_schema_name: 'avc_account_holder', qdb_label: 'Account holder name',
    qdb_field_type: FIELD_TYPE.text, qdb_display_order: 1,
  });
  const iban = await makeField(secBank.qdb_form_sectionid, {
    qdb_schema_name: 'avc_iban', qdb_label: 'IBAN',
    qdb_field_type: FIELD_TYPE.text, qdb_display_order: 2,
  });
  await validationRule(iban.qdb_form_fieldid, RULE_TYPE_REQUIRED, 'IBAN is required.', 1);
  await validationRule(iban.qdb_form_fieldid, RULE_TYPE_API_VALIDATION, 'This IBAN could not be verified.', 2,
    { schemaVersion: 2, type: 'api_validation', key: 'IBAN' });

  // ── B. Camera only ───────────────────────────────────────────────────────
  const secPhoto = await makeSection('B · Camera-only photo', 2);
  await makeField(secPhoto.qdb_form_sectionid, {
    qdb_schema_name: 'avc_site_photo', qdb_label: 'Photo of the site',
    qdb_field_type: FIELD_TYPE.file, qdb_display_order: 1, qdb_max_files: 1,
    qdb_allowed_file_extensions: ALLOWED_IMAGE_EXTENSIONS,
    qdb_file_capture_mode: CAPTURE_CAMERA_ONLY,
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
  return JSON.parse(body.RuntimeJson);
}

function check(label, passed, detail) {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  return passed;
}

function verify(json) {
  const fields = json.tabs.flatMap((t) => t.sections.flatMap((s) => s.fields));
  const byCode = Object.fromEntries(fields.map((f) => [f.schemaName, f]));
  const ibanRules = byCode.avc_iban.validationRules ?? [];
  const apiRule = ibanRules.find((r) => r.ruleType === 'apiValidation');
  const upload = byCode.avc_site_photo.fileUploadConfig ?? {};
  const holderUpload = byCode.avc_account_holder.fileUploadConfig;
  return [
    check('A. IBAN carries an API Validation rule with key IBAN', apiRule?.validationKey === 'IBAN',
      `ruleTypes=${ibanRules.map((r) => r.ruleType).join(',')} key=${apiRule?.validationKey}`),
    check('A. IBAN keeps its Required rule', ibanRules.some((r) => r.ruleType === 'required')),
    check('B. photo field publishes captureMode camera', upload.captureMode === 'camera', `captureMode=${upload.captureMode}`),
    check('B. photo field allows JPEG and PNG', ['image/jpeg', 'image/png'].every((t) => (upload.allowedMimeTypes ?? []).includes(t)),
      (upload.allowedMimeTypes ?? []).join(',')),
    check('B. a non-file field carries no upload config', holderUpload === undefined || holderUpload === null),
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
  const ok = verify(await publishAndRead());
  console.log(`\nOpen: ${DATAVERSE_URL}/main.aspx?pagetype=webresource&webresourceName=qdb_form_runtime.html&data=${formId}`);
  process.exit(ok ? 0 : 1);
}

run().catch((error) => { console.error('SEED FAILED:', error.message); process.exit(1); });
