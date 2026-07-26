/**
 * Seed: Three Changes Demo — one form that exercises all three 2026-07-25 changes.
 *
 *  Tab 1 "Facility"  — NUMBAR bars whose source fields are HIDDEN.
 *      Bar A: both value + max hidden  → proves hidden sources still feed the bar.
 *      Bar B: value hidden, max VISIBLE → edit the limit, watch the bar recompute.
 *  Tab 2 "Documents" — file upload fields.
 *      Multi (maxFiles 5) → command button first, placeholder revealed on click.
 *      Single (maxFiles 1) → unchanged always-visible dropzone (control case).
 *  Tab 3 "Find a specialist" — grid filtered live by THREE outside fields
 *      (text + two dropdowns) through one AND template; empty inputs are pruned.
 *
 * Reuses the accounts/contacts seeded by seed-grid-filter-demo.mjs.
 *
 * Run:  node --env-file=scripts/.env scripts/seed-three-changes-demo.mjs
 * Safe: guards on form code — re-run is a no-op.
 */

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;
const FORM_CODE     = 'three-changes-demo';

// ── Auth ──────────────────────────────────────────────────────────────────────

const tokenJson = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET, scope: `${DV}/.default`,
    }),
  },
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

const post = async (entity, body) => {
  const r = await fetch(`${BASE}/${entity}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`POST ${entity}: ${j.error?.message ?? r.status}`);
  return j;
};

const get = async (path) => {
  const r = await fetch(`${BASE}/${path}`, { headers: H });
  const j = await r.json();
  if (!r.ok) throw new Error(`GET ${path}: ${j.error?.message ?? r.status}`);
  return j;
};

// ── Picklist constants ────────────────────────────────────────────────────────

const FT  = { text: 100000001, dropdown: 100000006, number: 100000003, currency: 100000011, file: 100000015, interactiveGrid: 100000021 };
const COL = { one: 100000001, two: 100000002 };
const CS  = { two: 100000002 };
const GRD = { selection: 100000000 };
const SEL = { single: 100000000 };
const BAR = 100000002;            // qdb_number_display_style = Bar
const EXT_PDF_JPEG_PNG = '100000000,100000001,100000002';

console.log('\n== Three Changes Demo — seed ==\n');

// ── Guard ─────────────────────────────────────────────────────────────────────

const existingForm = await get(
  `qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}' and statecode eq 0&$select=qdb_form_definitionid&$top=1`,
);
if (existingForm.value?.length) {
  console.log(`Form '${FORM_CODE}' already exists (${existingForm.value[0].qdb_form_definitionid}). Delete it first to re-seed.`);
  process.exit(0);
}

// ── Reference data ────────────────────────────────────────────────────────────

const viewsRes = await get(
  `savedqueries?$filter=returnedtypecode eq 'contact' and querytype eq 0 and statecode eq 0&$select=savedqueryid,name&$top=20`,
);
const contactViewId = viewsRes.value?.find((v) => v.name === 'Active Contacts')?.savedqueryid ?? viewsRes.value?.[0]?.savedqueryid;
if (!contactViewId) throw new Error('No active contact view found');

const accountsRes = await get(
  `accounts?$filter=name eq 'Qatar National Bank' or name eq 'QDB Enterprise Solutions' or name eq 'Al Khalij Commercial Bank'&$select=accountid,name`,
);
if (!accountsRes.value?.length) throw new Error('Accounts not found — run seed-grid-filter-demo.mjs first.');
const accounts = accountsRes.value.map((a) => ({ id: a.accountid, name: a.name }));
console.log(`reference data: contact view + ${accounts.length} accounts`);

// ── Form + helpers ────────────────────────────────────────────────────────────

const form = await post('qdb_form_definitions', {
  qdb_form_code: FORM_CODE,
  qdb_title: 'Three Changes Demo',
  qdb_description: 'Hidden bar sources, button-first multi-document upload, and live multi-field grid filtering.',
  qdb_status: 100000000,
  qdb_version: 1,
  qdb_allow_save_draft: false,
  qdb_draft_expiry_days: 7,
  qdb_confirmation_message: 'Demo submitted.',
  qdb_show_summary_step: false,
  qdb_allow_infocard_skip: false,
  qdb_infocard_counts_in_progress: false,
});
console.log(`form ${form.qdb_form_definitionid}`);

const mkTab = async (label, order) => post('qdb_form_tabs', {
  'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${form.qdb_form_definitionid})`,
  qdb_label: label,
  qdb_display_order: order,
  qdb_is_visible: true,
  qdb_requires_previous_tab_complete: false,
});

const mkSection = async (tabId, label, description, order) => post('qdb_form_sections', {
  'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tabId})`,
  qdb_label: label,
  qdb_description: description,
  qdb_display_order: order,
  qdb_columns: COL.one,
  qdb_is_collapsible: false,
  qdb_is_collapsed_by_default: false,
  qdb_is_visible: true,
});

const mkField = async (sectionId, attributes) => post('qdb_form_fields', {
  'qdb_form_section_id@odata.bind': `/qdb_form_sections(${sectionId})`,
  qdb_column_span: CS.two,
  qdb_is_required: false,
  qdb_is_readonly: false,
  qdb_is_hidden: false,
  ...attributes,
});

const mkGridColumn = async (fieldId, attributes) => post('qdb_grid_column_configs', {
  'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fieldId})`,
  qdb_grid_column_configname: `col-${attributes.qdb_column_attribute}-${fieldId.slice(0, 8)}`,
  qdb_is_visible: true,
  qdb_is_editable: false,
  ...attributes,
});

// ══ TAB 1 — hidden bar sources ═══════════════════════════════════════════════

const tabBar = await mkTab('1 · Utilization bar', 1);

const secBarA = await mkSection(
  tabBar.qdb_form_tabid,
  'Both sources hidden',
  'Neither the drawn amount nor the limit is on the form — the bar still reads them. Before the fix the published JSON dropped both and the bar showed 0% / "—".',
  1,
);
await mkField(secBarA.qdb_form_sectionid, {
  qdb_schema_name: 'demo3_drawn_a', qdb_field_type: FT.number, qdb_label: 'Amount Drawn (hidden)',
  qdb_default_value: '187500', qdb_display_order: 1, qdb_is_hidden: true,
});
await mkField(secBarA.qdb_form_sectionid, {
  qdb_schema_name: 'demo3_limit_a', qdb_field_type: FT.number, qdb_label: 'Facility Limit (hidden)',
  qdb_default_value: '250000', qdb_display_order: 2, qdb_is_hidden: true,
});
await mkField(secBarA.qdb_form_sectionid, {
  qdb_schema_name: 'demo3_util_a', qdb_field_type: FT.currency, qdb_label: 'Facility utilization',
  qdb_tooltip: 'Reads demo3_drawn_a / demo3_limit_a — both hidden.',
  qdb_display_order: 3, qdb_currency_code: 'QAR', qdb_decimal_places: 2,
  qdb_number_display_style: BAR,
  qdb_bar_value_field_schema: 'demo3_drawn_a',
  qdb_bar_max_field_schema: 'demo3_limit_a',
});
console.log('tab 1 section A: 2 hidden sources + bar (expect 75%, amber)');

const secBarB = await mkSection(
  tabBar.qdb_form_tabid,
  'Hidden value, visible limit',
  'The drawn amount is hidden; the limit is editable. Change the limit and the bar recomputes live — proof the hidden value is really in the payload.',
  2,
);
await mkField(secBarB.qdb_form_sectionid, {
  qdb_schema_name: 'demo3_drawn_b', qdb_field_type: FT.number, qdb_label: 'Amount Drawn (hidden)',
  qdb_default_value: '92000', qdb_display_order: 1, qdb_is_hidden: true,
});
await mkField(secBarB.qdb_form_sectionid, {
  qdb_schema_name: 'demo3_limit_b', qdb_field_type: FT.number, qdb_label: 'Facility Limit (editable)',
  qdb_tooltip: 'Try 100000 (92% red), 200000 (46% green).',
  qdb_default_value: '100000', qdb_display_order: 2,
});
await mkField(secBarB.qdb_form_sectionid, {
  qdb_schema_name: 'demo3_util_b', qdb_field_type: FT.currency, qdb_label: 'Live utilization',
  qdb_display_order: 3, qdb_currency_code: 'QAR', qdb_decimal_places: 2,
  qdb_number_display_style: BAR,
  qdb_bar_value_field_schema: 'demo3_drawn_b',
  qdb_bar_max_field_schema: 'demo3_limit_b',
});
console.log('tab 1 section B: hidden value + editable max + bar (expect 92%, red)');

// ══ TAB 2 — upload UX ════════════════════════════════════════════════════════

const tabDocs = await mkTab('2 · Documents', 2);

const secDocs = await mkSection(
  tabDocs.qdb_form_tabid,
  'Upload behaviour',
  'The multi-document field opens with a command button only. The single-document field keeps the old always-visible dropzone.',
  1,
);
await mkField(secDocs.qdb_form_sectionid, {
  qdb_schema_name: 'demo3_supporting_docs', qdb_field_type: FT.file, qdb_label: 'Supporting Documents (up to 5)',
  qdb_tooltip: 'Click "Add Document" to reveal the upload placeholder; it collapses again after each file.',
  qdb_display_order: 1, qdb_max_files: 5, qdb_max_file_size_mb: 10,
  qdb_allowed_file_extensions: EXT_PDF_JPEG_PNG,
});
await mkField(secDocs.qdb_form_sectionid, {
  qdb_schema_name: 'demo3_id_copy', qdb_field_type: FT.file, qdb_label: 'ID Copy (single document)',
  qdb_tooltip: 'Control case — unchanged behaviour.',
  qdb_display_order: 2, qdb_max_files: 1, qdb_max_file_size_mb: 10,
  qdb_allowed_file_extensions: EXT_PDF_JPEG_PNG,
});
console.log('tab 2: multi-doc (5) + single-doc upload fields');

// ══ TAB 3 — live multi-field grid filter ═════════════════════════════════════

const tabSearch = await mkTab('3 · Find a specialist', 3);

const secSearch = await mkSection(
  tabSearch.qdb_form_tabid,
  'Three filters, one grid',
  'Type a name, pick a service type, pick a company. Every change re-queries the grid; fields you leave empty drop out of the filter.',
  1,
);

await mkField(secSearch.qdb_form_sectionid, {
  qdb_schema_name: 'demo3_name', qdb_field_type: FT.text, qdb_label: 'Name contains',
  qdb_placeholder: 'e.g. Al, Mohammed', qdb_tooltip: 'Re-queries on every keystroke.',
  qdb_display_order: 1,
});

const serviceType = await mkField(secSearch.qdb_form_sectionid, {
  qdb_schema_name: 'demo3_service_type', qdb_field_type: FT.dropdown, qdb_label: 'Service type',
  qdb_placeholder: '— Any —', qdb_display_order: 2,
});
// Labels name the underlying gendercode so the grid's own "Service Type" column
// (which renders Dataverse's formatted value) reads consistently.
for (const [value, label, order] of [['1', 'Consulting (Male)', 1], ['2', 'Technology (Female)', 2]]) {
  await post('qdb_form_option_values', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${serviceType.qdb_form_fieldid})`,
    qdb_value: value, qdb_label: label, qdb_display_order: order, qdb_is_active: true,
  });
}

const company = await mkField(secSearch.qdb_form_sectionid, {
  qdb_schema_name: 'demo3_company', qdb_field_type: FT.dropdown, qdb_label: 'Company',
  qdb_placeholder: '— Any —', qdb_display_order: 3,
});
for (const [index, account] of accounts.entries()) {
  await post('qdb_form_option_values', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${company.qdb_form_fieldid})`,
    qdb_value: account.id, qdb_label: account.name, qdb_display_order: index + 1, qdb_is_active: true,
  });
}

const grid = await mkField(secSearch.qdb_form_sectionid, {
  qdb_schema_name: 'demo3_results', qdb_field_type: FT.interactiveGrid, qdb_label: 'Matching specialists',
  qdb_display_order: 4,
  qdb_grid_mode: GRD.selection,
  qdb_selection_mode: SEL.single,
  qdb_grid_entity_name: 'contact',
  qdb_saved_view_id: contactViewId,
  qdb_max_rows: 50,
  qdb_grid_page_size: 10,
  qdb_grid_paging_style: 'numbered',
  qdb_grid_depends_on_field_schema: 'demo3_name,demo3_service_type,demo3_company',
  qdb_grid_depends_on_filter_template:
    "fullname like '%{demo3_name}%' and gendercode eq {demo3_service_type} and _parentcustomerid_value eq '{demo3_company}'",
});
await mkGridColumn(grid.qdb_form_fieldid, {
  qdb_column_label: 'Full Name', qdb_column_attribute: 'fullname', qdb_column_field_type: 'text', qdb_display_order: 1,
});
await mkGridColumn(grid.qdb_form_fieldid, {
  qdb_column_label: 'Company', qdb_column_attribute: 'parentcustomerid', qdb_column_field_type: 'lookup', qdb_display_order: 2,
  qdb_column_options_json: JSON.stringify({ v: 2, filterType: 'none' }),
});
await mkGridColumn(grid.qdb_form_fieldid, {
  qdb_column_label: 'Service Type', qdb_column_attribute: 'gendercode', qdb_column_field_type: 'dropdown', qdb_display_order: 3,
  qdb_column_options_json: JSON.stringify({
    v: 2, filterType: 'none',
    options: [{ value: '1', label: 'Consulting' }, { value: '2', label: 'Technology' }],
  }),
});
console.log('tab 3: text + 2 dropdowns + grid (3-field AND template)');

console.log(`\nseeded ${FORM_CODE} — http://localhost:3000/forms/${FORM_CODE}`);
console.log('publish + cache check: node scripts/inspect-render-cache-fields.mjs three-changes-demo --publish\n');
