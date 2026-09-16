/**
 * Seeds `summary-section-rule-demo` — the exact shape reported on 2026-09-16 for form
 * Reyada-IPC: a dropdown on the first tab, a tab flagged Is Summary Tab whose section
 * "Additional Documents" starts with Is Visible = No, and a LEGACY-format business rule
 * (flat conditions array keyed by the trigger field's RECORD ID, OR logic, structured
 * qdb_action / qdb_target_section_id columns) that shows the section for two statuses.
 * Then publishes the form and prints what the render cache says about the rule.
 *
 *   node --env-file=scripts/.env scripts/seed-summary-section-rule-demo.mjs [--force]
 */
const TENANT_ID = process.env.DV_TENANT_ID;
const CLIENT_ID = process.env.DV_CLIENT_ID;
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = process.env.DV_DATAVERSE_URL.replace(/\/$/, '');
const API = `${DATAVERSE_URL}/api/data/v9.2`;

const FORM_CODE = 'summary-section-rule-demo';
const FORCE = process.argv.includes('--force');

const FIELD_TYPE = { text: 100000001, dropdown: 100000006 };
const SECTION_ONE_COLUMN = 100000001;
const COLUMN_SPAN_TWO = 100000002;
const STATUS_ACTIVE = 100000001;
const ACTION_SHOW_SECTION = 100000003;
const LOGIC_OR = 100000001;

const STATUSES_THAT_SHOW = ['Application Approved – Documents Pending', 'Returned for Additional Documents'];
const OTHER_STATUSES = ['Draft', 'Application Approved'];

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
  return text ? JSON.parse(text) : null;
}

async function del(entitySet, id) {
  const res = await fetch(`${API}/${entitySet}(${id})`, { method: 'DELETE', headers: H });
  if (!res.ok && res.status !== 404) throw new Error(`DELETE ${entitySet} -> ${res.status}`);
}

async function removeExisting(formId) {
  const rules = await get(`qdb_form_business_rules?$select=qdb_form_business_ruleid&$filter=_qdb_form_definition_id_value eq ${formId}`);
  for (const rule of rules.value) await del('qdb_form_business_rules', rule.qdb_form_business_ruleid);
  const caches = await get(`qdb_form_render_caches?$select=qdb_form_render_cacheid&$filter=qdb_form_code eq '${FORM_CODE}'`);
  for (const cache of caches.value) await del('qdb_form_render_caches', cache.qdb_form_render_cacheid);
  await del('qdb_form_definitions', formId);
}

async function seed() {
  const form = await post('qdb_form_definitions', {
    qdb_form_code: FORM_CODE, qdb_title: 'Summary Section Rule Demo',
    qdb_description: 'A legacy-format rule shows a hidden section on the summary tab for two statuses.',
    qdb_status: STATUS_ACTIVE, qdb_version: 1, qdb_allow_save_draft: false,
  });
  const formId = form.qdb_form_definitionid;

  const makeTab = (label, order, extra = {}) => post('qdb_form_tabs', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_label: label, qdb_display_order: order, qdb_is_visible: true, ...extra,
  });
  const makeSection = (tabId, label, order, extra = {}) => post('qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tabId})`,
    qdb_label: label, qdb_display_order: order, qdb_columns: SECTION_ONE_COLUMN, qdb_is_visible: true, ...extra,
  });
  const makeField = (sectionId, attributes) => post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${sectionId})`,
    qdb_column_span: COLUMN_SPAN_TWO, qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
    ...attributes,
  });
  const makeOption = (fieldId, value, label, order) => post('qdb_form_option_values', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fieldId})`,
    qdb_value: value, qdb_label: label, qdb_display_order: order, qdb_is_active: true,
  });

  const tabMain = await makeTab('1 - Application', 1);
  const secMain = await makeSection(tabMain.qdb_form_tabid, 'Application', 1);
  const status = await makeField(secMain.qdb_form_sectionid, {
    qdb_schema_name: 'ssr_status', qdb_label: 'Application status', qdb_field_type: FIELD_TYPE.dropdown, qdb_display_order: 1,
  });
  let order = 1;
  for (const label of [...OTHER_STATUSES, ...STATUSES_THAT_SHOW]) await makeOption(status.qdb_form_fieldid, label, label, order++);
  await makeField(secMain.qdb_form_sectionid, {
    qdb_schema_name: 'ssr_applicant', qdb_label: 'Applicant', qdb_field_type: FIELD_TYPE.text, qdb_display_order: 2,
  });

  const tabSummary = await makeTab('Summary', 3, { qdb_is_summary_tab: true });
  const secReview = await makeSection(tabSummary.qdb_form_tabid, 'Review', 1);
  await makeField(secReview.qdb_form_sectionid, {
    qdb_schema_name: 'ssr_reference', qdb_label: 'Reference', qdb_field_type: FIELD_TYPE.text, qdb_display_order: 1,
  });
  const secDocs = await makeSection(tabSummary.qdb_form_tabid, 'Additional Documents', 3, { qdb_is_visible: false });
  await makeField(secDocs.qdb_form_sectionid, {
    qdb_schema_name: 'ssr_document_note', qdb_label: 'Document note', qdb_field_type: FIELD_TYPE.text, qdb_display_order: 1,
  });

  // The legacy shape exactly as the model-driven form stores it: conditions keyed by the
  // trigger field's RECORD ID, logic in qdb_conditions_logic, action + target in columns.
  const conditions = STATUSES_THAT_SHOW.map((value) => ({ fieldId: status.qdb_form_fieldid, operator: 'equals', value }));
  const rule = await post('qdb_form_business_rules', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_name: 'Show Additional Documents when documents are pending or returned',
    qdb_conditions_json: JSON.stringify(conditions),
    qdb_conditions_logic: LOGIC_OR,
    qdb_action: ACTION_SHOW_SECTION,
    'qdb_target_section_id@odata.bind': `/qdb_form_sections(${secDocs.qdb_form_sectionid})`,
    qdb_priority: 100, qdb_is_active: true,
  });
  return { formId, triggerFieldId: status.qdb_form_fieldid, sectionId: secDocs.qdb_form_sectionid, ruleId: rule.qdb_form_business_ruleid };
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

function report(json, ids) {
  const fields = json.tabs.flatMap((t) => t.sections.flatMap((s) => s.fields));
  const trigger = fields.find((f) => f.schemaName === 'ssr_status');
  const summaryTab = json.tabs.find((t) => t.isSummaryTab);
  const docs = summaryTab.sections.find((s) => s.id === ids.sectionId);
  console.log(`summary tab "${summaryTab.label}" -> section "${docs.label}" isVisible=${docs.isVisible}`);
  console.log(`rules on the trigger field ssr_status: ${trigger.businessRules.length}`);
  for (const r of trigger.businessRules) {
    console.log(`  "${r.name}" action=${r.action} logic=${r.conditionsLogic} targetSectionId=${r.targetSectionId}`);
    console.log(`  conditions=${JSON.stringify(r.conditions)}`);
  }
  const ok = trigger.businessRules.some((r) => r.action === 'showSection' && r.targetSectionId === ids.sectionId && r.conditionsLogic === 'OR');
  console.log(ok ? 'RESULT: the legacy section rule IS in the published JSON' : 'RESULT: the rule is MISSING from the published JSON');
  return ok;
}

async function run() {
  H = { Authorization: `Bearer ${await token()}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json' };
  const existing = await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`);
  if (existing.value.length > 0) {
    if (!FORCE) { console.log(`Form '${FORM_CODE}' already exists. Pass --force to reseed.`); return; }
    await removeExisting(existing.value[0].qdb_form_definitionid);
  }
  const ids = await seed();
  console.log(`seeded ${FORM_CODE}: form ${ids.formId}, trigger field ${ids.triggerFieldId}, section ${ids.sectionId}, rule ${ids.ruleId}`);
  const json = await publishAndRead();
  const ok = report(json, ids);
  process.exit(ok ? 0 : 1);
}

run().catch((error) => { console.error(error.message); process.exit(1); });
