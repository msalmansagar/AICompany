/**
 * Adds two capabilities to the existing `three-changes-demo` form:
 *
 *  1. LOOKUP TEXT SEARCH — a new plain text field, `demo3_company_text`, searches the
 *     grid's Company LOOKUP column by display text. The grid template keeps its GUID
 *     branch and gains a text branch:
 *        … and (_parentcustomerid_value eq '{demo3_company}'
 *                or parentcustomerid/name like '%{demo3_company_text}%')
 *     A lookup attribute only ever compares by GUID, so the text branch compiles to a
 *     join on the related account — see docs/DEVELOPER-GUIDE-lookup-binding.md §5.
 *
 *  2. TAB CONFIRMATION — tab 2 gains an acknowledgement gate: Next is blocked until it is
 *     ticked, and Submit re-checks it.
 *
 * Run: node --env-file=scripts/.env scripts/augment-demo-search-and-confirm.mjs
 * Idempotent: re-running updates in place and never duplicates the field.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API = `${DATAVERSE_URL}/api/data/v9.2`;

const FORM_CODE = 'three-changes-demo';
const SEARCH_FIELD = 'demo3_company_text';
const GRID_FIELD = 'demo3_results';
const TEXT_FIELD_TYPE = 100000001;
const COLUMN_SPAN_TWO = 100000002;

const FILTER_TEMPLATE =
  "fullname like '%{demo3_name}%'"
  + ' and gendercode eq {demo3_service_type}'
  + " and (_parentcustomerid_value eq '{demo3_company}'"
  + " or parentcustomerid/name like '%{demo3_company_text}%')";

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
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function post(entity, body) {
  const r = await fetch(`${API}/${entity}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`POST ${entity} → ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function patch(entity, id, body) {
  const r = await fetch(`${API}/${entity}(${id})`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PATCH ${entity} → ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.status;
}

async function run() {
  const accessToken = await token();
  H = { Authorization: `Bearer ${accessToken}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json' };

  const forms = await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`);
  if (forms.value.length === 0) throw new Error(`Form '${FORM_CODE}' not found — run seed-three-changes-demo.mjs first.`);
  const formId = forms.value[0].qdb_form_definitionid;
  console.log(`form ${FORM_CODE} → ${formId}\n${'─'.repeat(64)}`);

  // ── 1. The text search field, beside the existing company picker ──
  const gridFields = await get(
    `qdb_form_fields?$filter=qdb_schema_name eq '${GRID_FIELD}'`
    + '&$select=qdb_form_fieldid,_qdb_form_section_id_value,qdb_grid_depends_on_field_schema,qdb_display_order',
  );
  if (gridFields.value.length === 0) throw new Error(`Grid field '${GRID_FIELD}' not found.`);
  const grid = gridFields.value[0];
  const sectionId = grid._qdb_form_section_id_value;

  const existing = await get(`qdb_form_fields?$filter=qdb_schema_name eq '${SEARCH_FIELD}'&$select=qdb_form_fieldid`);
  if (existing.value.length > 0) {
    console.log(`  ${SEARCH_FIELD} already exists — leaving it in place`);
  } else {
    await post('qdb_form_fields', {
      'qdb_form_section_id@odata.bind': `/qdb_form_sections(${sectionId})`,
      qdb_schema_name: SEARCH_FIELD,
      qdb_label: 'Company name contains',
      qdb_field_type: TEXT_FIELD_TYPE,
      // Sits directly above the grid, after the three existing filter controls.
      qdb_display_order: grid.qdb_display_order,
      qdb_column_span: COLUMN_SPAN_TWO,
      qdb_is_required: false,
      qdb_is_readonly: false,
      qdb_is_hidden: false,
      qdb_placeholder: 'e.g. Qatar',
    });
    console.log(`  created ${SEARCH_FIELD}`);
    await patch('qdb_form_fields', grid.qdb_form_fieldid, {
      qdb_display_order: grid.qdb_display_order + 1,
    });
  }

  // ── 2. The grid template + depends-on list ────────────────────────
  const dependsOn = 'demo3_name,demo3_service_type,demo3_company,demo3_company_text';
  await patch('qdb_form_fields', grid.qdb_form_fieldid, {
    qdb_grid_depends_on_field_schema: dependsOn,
    qdb_grid_depends_on_filter_template: FILTER_TEMPLATE,
  });
  console.log('  grid template now searches the lookup by GUID or by name');

  // ── 3. Tab-level confirmation on tab 2 ────────────────────────────
  const tabs = await get(
    `qdb_form_tabs?$filter=_qdb_form_definition_id_value eq ${formId}`
    + '&$select=qdb_form_tabid,qdb_label,qdb_display_order&$orderby=qdb_display_order asc',
  );
  const target = tabs.value[1] ?? tabs.value[0];
  if (!target) throw new Error('No tabs found on the form.');

  await patch('qdb_form_tabs', target.qdb_form_tabid, {
    qdb_require_submit_confirmation: true,
    qdb_submit_confirmation_label: 'I confirm the documents attached on this tab are correct.',
    qdb_submit_confirmation_message:
      'Attached documents cannot be replaced after submission. Please check them before continuing.',
  });
  console.log(`  tab "${target.qdb_label}" now requires an acknowledgement`);

  console.log(`${'─'.repeat(64)}`);
  console.log('Republish the form so the in-CRM render cache picks this up:');
  console.log('  node --env-file=scripts/.env scripts/republish-cached-forms.mjs');
}

run().catch((e) => { console.error('\nAUGMENT FAILED:', e.message); process.exit(1); });
