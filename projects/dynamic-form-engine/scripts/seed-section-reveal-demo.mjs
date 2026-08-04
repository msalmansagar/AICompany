/**
 * Section-reveal demo — one form showing both ways a tab can present its sections.
 *
 *   Tab 1 "All at once"    every section down the page. The behaviour every existing form has.
 *   Tab 2 "One at a time"  one section on screen; Continue advances, Back returns.
 *
 * Tab 2's first section has a REQUIRED field, so Continue refuses to advance while it is
 * empty — that is the gate, not a cosmetic disable. Its last section carries only Back,
 * because the last section is exempt from needing a way forward.
 *
 * Run: node --env-file=scripts/.env scripts/seed-section-reveal-demo.mjs
 * Idempotent: guards on the form code. Publishes at the end so it is usable immediately.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API = `${DATAVERSE_URL}/api/data/v9.2`;
const FORM_CODE = 'section-reveal-demo';

const FT = { text: 100000001, textarea: 100000002 };
const SECTION_COLUMNS_ONE = 100000001;
const COLUMN_SPAN_TWO = 100000002;
const STATUS_ACTIVE = 100000001;

let H;

async function token() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
  });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description ?? 'token failed');
  return j.access_token;
}

async function get(path) {
  const r = await fetch(`${API}/${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function post(entitySet, body) {
  const r = await fetch(`${API}/${entitySet}`, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`POST ${entitySet} → ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** Publishes the form so the runtime serves it — importing config alone changes nothing. */
async function publish(formId, formCode) {
  const job = await post('qdb_publish_jobs', {
    'qdb_Form_Definition_Id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_form_code: formCode,
    qdb_target_version: '1',
    qdb_status: 1,
    qdb_trigger_reason: 1,
  });
  // Only FormCode, PublishJobId and TargetVersion are declared on the custom API.
  const r = await fetch(`${API}/qdb_PublishForm`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ FormCode: formCode, PublishJobId: job.qdb_publish_jobid, TargetVersion: 1 }),
  });
  if (!r.ok) throw new Error(`publish → ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

async function run() {
  H = {
    Authorization: `Bearer ${await token()}`,
    'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
    Accept: 'application/json', 'Content-Type': 'application/json',
  };

  const existing = await get(
    `qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`,
  );
  if (existing.value.length > 0) {
    console.log(`Form '${FORM_CODE}' already exists (${existing.value[0].qdb_form_definitionid}) — nothing to do.`);
    return;
  }

  console.log(`Seeding '${FORM_CODE}'\n${'─'.repeat(66)}`);

  const form = await post('qdb_form_definitions', {
    qdb_form_code: FORM_CODE,
    qdb_title: 'Section Reveal Demo',
    qdb_description: 'Tab 1 shows every section at once. Tab 2 shows one at a time, advanced by a button.',
    qdb_status: STATUS_ACTIVE,
    qdb_version: 1,
    qdb_allow_save_draft: false,
  });
  const formId = form.qdb_form_definitionid;

  const makeTab = (label, order, revealsOneAtATime) => post('qdb_form_tabs', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_label: label, qdb_display_order: order, qdb_is_visible: true,
    qdb_reveal_sections_one_at_a_time: revealsOneAtATime,
  });

  const makeSection = (tabId, label, order) => post('qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tabId})`,
    qdb_label: label, qdb_display_order: order,
    qdb_columns: SECTION_COLUMNS_ONE, qdb_is_visible: true,
  });

  const makeField = (sectionId, attributes) => post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${sectionId})`,
    qdb_column_span: COLUMN_SPAN_TWO,
    qdb_field_type: FT.text,
    qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
    ...attributes,
  });

  const makeButton = (sectionId, label, target, order, isPrimary) => post('qdb_form_scoped_buttons', {
    'qdb_Form_Definition_Id@odata.bind': `/qdb_form_definitions(${formId})`,
    'qdb_Section_Id@odata.bind': `/qdb_form_sections(${sectionId})`,
    qdb_label: label,
    qdb_placement_scope: 'section',
    qdb_display_order: order,
    qdb_is_primary: isPrimary,
    qdb_is_visible: true,
    qdb_action_type: 'navigate',
    qdb_action_config_json: JSON.stringify({ target }),
  });

  // ── Tab 1 — every section at once ─────────────────────────────────────────
  const tabAll = await makeTab('1 · All at once', 1, false);
  const allTabId = tabAll.qdb_form_tabid;

  const contact = await makeSection(allTabId, 'Contact', 1);
  await makeField(contact.qdb_form_sectionid, { qdb_schema_name: 'srd_name', qdb_label: 'Full name', qdb_display_order: 1 });
  await makeField(contact.qdb_form_sectionid, { qdb_schema_name: 'srd_email', qdb_label: 'Email', qdb_display_order: 2 });

  const address = await makeSection(allTabId, 'Address', 2);
  await makeField(address.qdb_form_sectionid, { qdb_schema_name: 'srd_street', qdb_label: 'Street', qdb_display_order: 1 });
  await makeField(address.qdb_form_sectionid, { qdb_schema_name: 'srd_city', qdb_label: 'City', qdb_display_order: 2 });

  const notes = await makeSection(allTabId, 'Notes', 3);
  await makeField(notes.qdb_form_sectionid, {
    qdb_schema_name: 'srd_notes', qdb_label: 'Anything else', qdb_display_order: 1,
    qdb_field_type: FT.textarea,
  });
  console.log('  Tab 1 · All at once      3 sections, all on screen together');

  // ── Tab 2 — one section at a time ─────────────────────────────────────────
  const tabStep = await makeTab('2 · One at a time', 2, true);
  const stepTabId = tabStep.qdb_form_tabid;

  const applicant = await makeSection(stepTabId, 'Applicant', 1);
  await makeField(applicant.qdb_form_sectionid, {
    qdb_schema_name: 'srd_applicant_name', qdb_label: 'Applicant name', qdb_display_order: 1,
    // Required on purpose: Continue refuses to advance until this has a value.
    qdb_is_required: true,
  });
  await makeButton(applicant.qdb_form_sectionid, 'Continue', 'nextSection', 1, true);

  const employment = await makeSection(stepTabId, 'Employment', 2);
  await makeField(employment.qdb_form_sectionid, { qdb_schema_name: 'srd_employer', qdb_label: 'Employer', qdb_display_order: 1 });
  await makeButton(employment.qdb_form_sectionid, 'Back', 'previousSection', 1, false);
  await makeButton(employment.qdb_form_sectionid, 'Continue', 'nextSection', 2, true);

  const review = await makeSection(stepTabId, 'Review', 3);
  await makeField(review.qdb_form_sectionid, {
    qdb_schema_name: 'srd_confirm_notes', qdb_label: 'Confirm anything', qdb_display_order: 1,
    qdb_field_type: FT.textarea,
  });
  // Last section: Back only. It is exempt from needing a way forward, which is what the
  // publish lint (PV-013) checks for.
  await makeButton(review.qdb_form_sectionid, 'Back', 'previousSection', 1, false);
  console.log('  Tab 2 · One at a time    3 sections, one on screen, Continue/Back');
  console.log('                           first section required → Continue is gated');

  await publish(formId, FORM_CODE);

  console.log(`${'─'.repeat(66)}`);
  console.log(`form id ${formId}`);
  console.log('Published. Open the in-CRM runtime with:');
  console.log(`  ${DATAVERSE_URL}/main.aspx?pagetype=webresource&webresourceName=qdb_form_runtime.html&data=${formId}`);
}

run().catch((e) => { console.error('\nSEED FAILED:', e.message); process.exit(1); });
