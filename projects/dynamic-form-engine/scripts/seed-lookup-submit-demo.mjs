/**
 * Seed: a form that submits a LOOKUP through the portal.
 *
 * Exercises the fix for the portal lookup write: a form field of type lookup (account)
 * mapped onto contact.parentcustomerid — a POLYMORPHIC lookup, so the navigation property
 * is parentcustomerid_account, not the column name. Writing the column returns 400.
 *
 * Form is created ACTIVE because the portal's live-metadata path refuses inactive forms.
 *
 * Run:  node --env-file=scripts/.env scripts/seed-lookup-submit-demo.mjs
 * Safe: guards on form code — re-run is a no-op.
 */

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;
const FORM_CODE     = 'lookup-submit-demo';

const tokenJson = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET, scope: `${DV}/.default`,
    }) },
).then((r) => r.json());
if (!tokenJson.access_token) throw new Error(tokenJson.error_description ?? 'Token request failed');

const H = {
  Authorization: `Bearer ${tokenJson.access_token}`,
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  Accept: 'application/json',
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

const get = async (path) => {
  const r = await fetch(`${BASE}/${path}`, { headers: H });
  const j = await r.json();
  if (!r.ok) throw new Error(`GET ${path}: ${j.error?.message ?? r.status}`);
  return j;
};

const post = async (entity, body) => {
  const r = await fetch(`${BASE}/${entity}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`POST ${entity}: ${text}`);
  return JSON.parse(text);
};

const FT  = { text: 100000001, lookup: 100000008 };
const CS  = { two: 100000002 };
const COL = { one: 100000001 };
const STATUS_ACTIVE = 100000001;

console.log('\n== Lookup submit demo — seed ==\n');

const existing = await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid&$top=1`);
if (existing.value?.length) {
  console.log(`${FORM_CODE} already exists (${existing.value[0].qdb_form_definitionid}) — nothing to do`);
  process.exit(0);
}

const form = await post('qdb_form_definitions', {
  qdb_form_code: FORM_CODE,
  qdb_title: 'Lookup Submit Demo',
  qdb_description: 'Submits a lookup field onto contact.parentcustomerid (polymorphic).',
  qdb_status: STATUS_ACTIVE,
  qdb_version: 1,
  qdb_allow_save_draft: false,
  qdb_draft_expiry_days: 7,
  qdb_confirmation_message: 'Submitted.',
  qdb_show_summary_step: false,
  qdb_allow_infocard_skip: false,
  qdb_infocard_counts_in_progress: false,
});
console.log(`form    ${form.qdb_form_definitionid}`);

const tab = await post('qdb_form_tabs', {
  'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${form.qdb_form_definitionid})`,
  qdb_label: 'Applicant', qdb_display_order: 1, qdb_is_visible: true,
  qdb_requires_previous_tab_complete: false,
});

const section = await post('qdb_form_sections', {
  'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tab.qdb_form_tabid})`,
  qdb_label: 'Details', qdb_display_order: 1, qdb_columns: COL.one,
  qdb_is_collapsible: false, qdb_is_collapsed_by_default: false, qdb_is_visible: true,
});

const nameField = await post('qdb_form_fields', {
  'qdb_form_section_id@odata.bind': `/qdb_form_sections(${section.qdb_form_sectionid})`,
  qdb_schema_name: 'lsd_last_name', qdb_field_type: FT.text, qdb_label: 'Last Name',
  qdb_display_order: 1, qdb_column_span: CS.two,
  qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
});

const companyField = await post('qdb_form_fields', {
  'qdb_form_section_id@odata.bind': `/qdb_form_sections(${section.qdb_form_sectionid})`,
  qdb_schema_name: 'lsd_company', qdb_field_type: FT.lookup, qdb_label: 'Company',
  qdb_display_order: 2, qdb_column_span: CS.two,
  qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
});

// The lookup field needs a lookup config so the engine knows which table it points at —
// that target is also what disambiguates a polymorphic navigation property.
await post('qdb_form_lookup_configs', {
  'qdb_form_field_id@odata.bind': `/qdb_form_fields(${companyField.qdb_form_fieldid})`,
  qdb_entity_logical_name: 'account',
  qdb_display_attribute: 'name',
  qdb_value_attribute: 'accountid',
  qdb_search_min_chars: 2,
  qdb_max_results: 20,
});
console.log(`fields  lsd_last_name (text), lsd_company (lookup -> account)`);

for (const [field, targetAttribute] of [
  [nameField, 'lastname'],
  [companyField, 'parentcustomerid'],   // polymorphic: nav prop is parentcustomerid_account
]) {
  await post('qdb_form_submission_mappings', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${form.qdb_form_definitionid})`,
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${field.qdb_form_fieldid})`,
    qdb_target_entity_logical_name: 'contact',
    qdb_target_attribute_logical_name: targetAttribute,
    qdb_is_active: true,
    qdb_is_child_entity: false,
  });
  console.log(`mapping ${field.qdb_schema_name} -> contact.${targetAttribute}`);
}

console.log(`\nseeded ${FORM_CODE}. Submit with:`);
console.log(`  POST http://localhost:4000/api/forms/${FORM_CODE}/submit\n`);
