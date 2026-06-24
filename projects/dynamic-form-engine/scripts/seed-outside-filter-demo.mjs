/**
 * Seed: Outside-Field → Grid Filter Demo
 *
 * Demonstrates the dependsOn pattern: a regular form field sits ABOVE the grid
 * and when the user changes it the grid auto-re-queries with that value as a filter.
 *
 * Three sections, one form — all three field types:
 *
 *  Section 1 — Text field   → contacts grid filtered by fullname LIKE '%{value}%'
 *  Section 2 — Dropdown     → contacts grid filtered by gendercode eq {value}
 *               (1 = Consulting / Male, 2 = Technology / Female in our demo data)
 *  Section 3 — Dropdown (account GUIDs) → contacts grid filtered by parentcustomerid
 *               Simulates a lookup: pick a company, see its specialists.
 *
 * Test data: reuses accounts + contacts from seed-grid-filter-demo.mjs
 *
 * Run:  node scripts/seed-outside-filter-demo.mjs
 * Safe: guards on form code — re-run is a no-op.
 */

// ── Credentials ───────────────────────────────────────────────────────────────

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;
const FORM_CODE     = 'outside-filter-demo';

// ── Auth ──────────────────────────────────────────────────────────────────────

const tokenJson = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope:         `${DV}/.default`,
    }),
  },
).then(r => r.json());

if (!tokenJson.access_token) throw new Error(tokenJson.error_description ?? 'Token request failed');
const token = tokenJson.access_token;

const H = {
  Authorization:      `Bearer ${token}`,
  'OData-MaxVersion': '4.0',
  'OData-Version':    '4.0',
  Accept:             'application/json',
  'Content-Type':     'application/json',
  Prefer:             'return=representation',
};

const post = async (entity, body) => {
  const r = await fetch(`${BASE}/${entity}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`POST ${entity}: ${j.error?.message ?? r.status}`);
  return j;
};

const get = async path => {
  const r = await fetch(`${BASE}/${path}`, { headers: H });
  const j = await r.json();
  if (!r.ok) throw new Error(`GET ${path}: ${j.error?.message ?? r.status}`);
  return j;
};

// ── Picklist constants ────────────────────────────────────────────────────────

const FT  = { text: 100000001, dropdown: 100000006, interactiveGrid: 100000021 };
const COL = { one: 100000001, two: 100000002 };
const CS  = { two: 100000002 };
const GRD = { selection: 100000000 };
const SEL = { single: 100000000 };

// ── Header ────────────────────────────────────────────────────────────────────

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║   Outside-Field → Grid Filter Demo                           ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');
console.log('✓ Token acquired');

// ── Guard ─────────────────────────────────────────────────────────────────────

const existingForm = await get(
  `qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}' and statecode eq 0&$select=qdb_form_definitionid&$top=1`,
);
if (existingForm.value?.length) {
  const fid = existingForm.value[0].qdb_form_definitionid;
  console.log(`⚠  Form '${FORM_CODE}' already exists (${fid}). Delete it first to re-seed.`);
  process.exit(0);
}

// ── [0] Resolve Active Contacts view ─────────────────────────────────────────

console.log('\n[0] Resolving Active Contacts system view…');
const viewsRes = await get(
  `savedqueries?$filter=returnedtypecode eq 'contact' and querytype eq 0 and statecode eq 0&$select=savedqueryid,name&$top=20`,
);
const contactViewId =
  viewsRes.value?.find(v => v.name === 'Active Contacts')?.savedqueryid ??
  viewsRes.value?.[0]?.savedqueryid;
if (!contactViewId) throw new Error('No active contact view found');
console.log(`  ✓ "${viewsRes.value?.find(v => v.savedqueryid === contactViewId)?.name}" — ${contactViewId}`);

// ── [1] Load existing accounts (seeded by seed-grid-filter-demo.mjs) ─────────

console.log('\n[1] Loading existing account records…');
const accountsRes = await get(
  `accounts?$filter=name eq 'Qatar National Bank' or name eq 'QDB Enterprise Solutions' or name eq 'Al Khalij Commercial Bank'&$select=accountid,name`,
);
if (!accountsRes.value?.length) {
  throw new Error('Accounts not found — run seed-grid-filter-demo.mjs first to seed the test data.');
}
const accounts = accountsRes.value.map(a => ({ id: a.accountid, name: a.name }));
accounts.forEach(a => console.log(`  ✓ ${a.name} — ${a.id}`));

// ── [2] Form Definition ───────────────────────────────────────────────────────

console.log('\n[2] Form Definition…');
const form = await post('qdb_form_definitions', {
  qdb_form_code:            FORM_CODE,
  qdb_title:                'Outside Filter Demo',
  qdb_description:          'Demonstrates dependsOn: external fields (text, dropdown, company picker) automatically filter a selection grid below them.',
  qdb_status:               100000000, // draft
  qdb_version:              1,
  qdb_allow_save_draft:     false,
  qdb_draft_expiry_days:    7,
  qdb_confirmation_message: 'Selection confirmed.',
  qdb_show_summary_step:    false,
  qdb_allow_infocard_skip:  false,
  qdb_infocard_counts_in_progress: false,
});
console.log(`  ✓ form — ${form.qdb_form_definitionid}`);

// ── [3] Tab ───────────────────────────────────────────────────────────────────

console.log('\n[3] Tab…');
const tab = await post('qdb_form_tabs', {
  'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${form.qdb_form_definitionid})`,
  qdb_label:                           'Select Service',
  qdb_display_order:                   1,
  qdb_is_visible:                      true,
  qdb_requires_previous_tab_complete:  false,
});
console.log(`  ✓ tab — ${tab.qdb_form_tabid}`);

// ── Helper: create section ────────────────────────────────────────────────────

const mkSection = async (label, desc, order) => {
  const s = await post('qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tab.qdb_form_tabid})`,
    qdb_label:                    label,
    qdb_description:              desc,
    qdb_display_order:            order,
    qdb_columns:                  COL.two,
    qdb_is_collapsible:           false,
    qdb_is_collapsed_by_default:  false,
    qdb_is_visible:               true,
  });
  console.log(`  ✓ section "${label}" — ${s.qdb_form_sectionid}`);
  return s;
};

// Helper: add a fullname column to a grid field
const addFullnameColumn = async fieldId => {
  await post('qdb_grid_column_configs', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fieldId})`,
    qdb_grid_column_configname: `col-fn-${fieldId.slice(0, 8)}`,
    qdb_column_label:           'Full Name',
    qdb_column_attribute:       'fullname',
    qdb_column_field_type:      'text',
    qdb_display_order:          1,
    qdb_is_visible:             true,
    qdb_is_editable:            false,
  });
};

const addCompanyColumn = async fieldId => {
  await post('qdb_grid_column_configs', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fieldId})`,
    qdb_grid_column_configname: `col-co-${fieldId.slice(0, 8)}`,
    qdb_column_label:           'Company',
    qdb_column_attribute:       'parentcustomerid',
    qdb_column_field_type:      'lookup',
    qdb_display_order:          2,
    qdb_is_visible:             true,
    qdb_is_editable:            false,
    qdb_column_options_json: JSON.stringify({
      v: 2, filterType: 'none',  // display only — filtering done by the outside field
    }),
  });
};

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — Text field → grid (fullname LIKE search)
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n── SECTION 1: Text Field Filter ─────────────────────────────────');
const sec1 = await mkSection(
  'Text Field Filter',
  'Type a name in the text box. The grid below re-queries automatically as you type.',
  1,
);

// 1a. Text field (the filter control)
const fNameSearch = await post('qdb_form_fields', {
  'qdb_form_section_id@odata.bind': `/qdb_form_sections(${sec1.qdb_form_sectionid})`,
  qdb_schema_name:   'demo_name_search',
  qdb_field_type:    FT.text,
  qdb_label:         'Search by Specialist Name',
  qdb_placeholder:   'Type any part of a name, e.g. "Al" or "Mohammed"',
  qdb_tooltip:       'The grid below filters in real-time as you type',
  qdb_display_order: 1,
  qdb_column_span:   CS.two,
  qdb_is_required:   false,
  qdb_is_readonly:   false,
  qdb_is_hidden:     false,
});
console.log(`  ✓ text field — ${fNameSearch.qdb_form_fieldid}`);

// 1b. Grid depending on the text field
const gNameFilter = await post('qdb_form_fields', {
  'qdb_form_section_id@odata.bind': `/qdb_form_sections(${sec1.qdb_form_sectionid})`,
  qdb_schema_name:                      'demo_name_results',
  qdb_field_type:                       FT.interactiveGrid,
  qdb_label:                            'Matching Specialists',
  qdb_tooltip:                          'Shows contacts whose name contains what you typed above',
  qdb_display_order:                    2,
  qdb_column_span:                      CS.two,
  qdb_is_required:                      false,
  qdb_is_readonly:                      false,
  qdb_is_hidden:                        false,
  qdb_grid_mode:                        GRD.selection,
  qdb_selection_mode:                   SEL.single,
  qdb_grid_entity_name:                 'contact',
  qdb_saved_view_id:                    contactViewId,
  qdb_max_rows:                         50,
  // ↓ depends on the text field above
  qdb_grid_depends_on_field_schema:     'demo_name_search',
  qdb_grid_depends_on_filter_template:  "fullname like '%{dependsOnValue}%'",
});
console.log(`  ✓ name-filter grid — ${gNameFilter.qdb_form_fieldid}`);
await addFullnameColumn(gNameFilter.qdb_form_fieldid);
await addCompanyColumn(gNameFilter.qdb_form_fieldid);
console.log('  ✓ grid columns added');

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Dropdown → grid (service type / gendercode filter)
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n── SECTION 2: Dropdown Filter ───────────────────────────────────');
const sec2 = await mkSection(
  'Dropdown Filter',
  'Select a service type from the dropdown. The grid below immediately re-filters.',
  2,
);

// 2a. Dropdown field
const fServiceType = await post('qdb_form_fields', {
  'qdb_form_section_id@odata.bind': `/qdb_form_sections(${sec2.qdb_form_sectionid})`,
  qdb_schema_name:   'demo_service_type',
  qdb_field_type:    FT.dropdown,
  qdb_label:         'Select Service Type',
  qdb_placeholder:   '— All Types —',
  qdb_tooltip:       'Choosing a type filters the specialists grid below',
  qdb_display_order: 1,
  qdb_column_span:   CS.two,
  qdb_is_required:   false,
  qdb_is_readonly:   false,
  qdb_is_hidden:     false,
});
console.log(`  ✓ service-type dropdown — ${fServiceType.qdb_form_fieldid}`);

// 2b. Dropdown options (map to gendercode on contact: 1=Consulting, 2=Technology)
for (const [val, label, order] of [['1', 'Consulting (Male)', 1], ['2', 'Technology (Female)', 2]]) {
  await post('qdb_form_option_values', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fServiceType.qdb_form_fieldid})`,
    qdb_value:         val,
    qdb_label:         label,
    qdb_display_order: order,
    qdb_is_active:     true,
  });
}
console.log('  ✓ dropdown options: Consulting / Technology');

// 2c. Grid depending on the dropdown
const gTypeFilter = await post('qdb_form_fields', {
  'qdb_form_section_id@odata.bind': `/qdb_form_sections(${sec2.qdb_form_sectionid})`,
  qdb_schema_name:                      'demo_type_results',
  qdb_field_type:                       FT.interactiveGrid,
  qdb_label:                            'Specialists of Selected Type',
  qdb_tooltip:                          'Shows contacts matching the service type selected above',
  qdb_display_order:                    2,
  qdb_column_span:                      CS.two,
  qdb_is_required:                      false,
  qdb_is_readonly:                      false,
  qdb_is_hidden:                        false,
  qdb_grid_mode:                        GRD.selection,
  qdb_selection_mode:                   SEL.single,
  qdb_grid_entity_name:                 'contact',
  qdb_saved_view_id:                    contactViewId,
  qdb_max_rows:                         50,
  // ↓ depends on the service-type dropdown: gendercode 1 or 2
  qdb_grid_depends_on_field_schema:     'demo_service_type',
  qdb_grid_depends_on_filter_template:  'gendercode eq {dependsOnValue}',
});
console.log(`  ✓ type-filter grid — ${gTypeFilter.qdb_form_fieldid}`);
await addFullnameColumn(gTypeFilter.qdb_form_fieldid);
await addCompanyColumn(gTypeFilter.qdb_form_fieldid);
console.log('  ✓ grid columns added');

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Company picker (dropdown with GUID values) → grid
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n── SECTION 3: Company Picker Filter (lookup-style) ──────────────');
const sec3 = await mkSection(
  'Company / Service Provider Filter',
  'Pick a service provider company. The grid immediately shows only their specialists.',
  3,
);

// 3a. Company picker dropdown (options = account GUIDs)
const fCompany = await post('qdb_form_fields', {
  'qdb_form_section_id@odata.bind': `/qdb_form_sections(${sec3.qdb_form_sectionid})`,
  qdb_schema_name:   'demo_company_picker',
  qdb_field_type:    FT.dropdown,
  qdb_label:         'Select Service Provider Company',
  qdb_placeholder:   '— All Companies —',
  qdb_tooltip:       'Selecting a company filters the specialists grid to that company only',
  qdb_display_order: 1,
  qdb_column_span:   CS.two,
  qdb_is_required:   false,
  qdb_is_readonly:   false,
  qdb_is_hidden:     false,
});
console.log(`  ✓ company picker dropdown — ${fCompany.qdb_form_fieldid}`);

// Dropdown options: account GUIDs as values, account names as labels
for (const [i, acc] of accounts.entries()) {
  await post('qdb_form_option_values', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fCompany.qdb_form_fieldid})`,
    qdb_value:         acc.id,
    qdb_label:         acc.name,
    qdb_display_order: i + 1,
    qdb_is_active:     true,
  });
  console.log(`  ✓ option: ${acc.name} → ${acc.id.slice(0, 8)}…`);
}

// 3b. Grid depending on the company picker
const gCompanyFilter = await post('qdb_form_fields', {
  'qdb_form_section_id@odata.bind': `/qdb_form_sections(${sec3.qdb_form_sectionid})`,
  qdb_schema_name:                      'demo_company_results',
  qdb_field_type:                       FT.interactiveGrid,
  qdb_label:                            'Specialists at Selected Company',
  qdb_tooltip:                          'Shows contacts whose company matches the selection above',
  qdb_display_order:                    2,
  qdb_column_span:                      CS.two,
  qdb_is_required:                      false,
  qdb_is_readonly:                      false,
  qdb_is_hidden:                        false,
  qdb_grid_mode:                        GRD.selection,
  qdb_selection_mode:                   SEL.single,
  qdb_grid_entity_name:                 'contact',
  qdb_saved_view_id:                    contactViewId,
  qdb_max_rows:                         50,
  // ↓ template uses the Dataverse navigation property form of a lookup attribute
  qdb_grid_depends_on_field_schema:     'demo_company_picker',
  qdb_grid_depends_on_filter_template:  "_parentcustomerid_value eq '{dependsOnValue}'",
});
console.log(`  ✓ company-filter grid — ${gCompanyFilter.qdb_form_fieldid}`);
await addFullnameColumn(gCompanyFilter.qdb_form_fieldid);

// Add a gender display column so you can see consultant types
await post('qdb_grid_column_configs', {
  'qdb_form_field_id@odata.bind': `/qdb_form_fields(${gCompanyFilter.qdb_form_fieldid})`,
  qdb_grid_column_configname: `col-gn-${gCompanyFilter.qdb_form_fieldid.slice(0, 8)}`,
  qdb_column_label:           'Service Type',
  qdb_column_attribute:       'gendercode',
  qdb_column_field_type:      'dropdown',
  qdb_display_order:          2,
  qdb_is_visible:             true,
  qdb_is_editable:            false,
  qdb_column_options_json: JSON.stringify({
    v: 2, filterType: 'none',
    options: [{ value: '1', label: 'Consulting' }, { value: '2', label: 'Technology' }],
  }),
});
console.log('  ✓ grid columns added');

// ── Done ──────────────────────────────────────────────────────────────────────

console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
console.log('║  Seed complete!                                                   ║');
console.log('╠═══════════════════════════════════════════════════════════════════╣');
console.log(`║  Form:  ${FORM_CODE.padEnd(58)}║`);
console.log('║                                                                   ║');
console.log('║  Sections:                                                        ║');
console.log('║    1. Text Field Filter                                           ║');
console.log('║       Type a name → grid filters by fullname LIKE %value%        ║');
console.log('║       Try: "Al" → 5 contacts | "Mohammed" → 1 contact            ║');
console.log('║                                                                   ║');
console.log('║    2. Dropdown Filter                                             ║');
console.log('║       Select service type → grid filters by gendercode           ║');
console.log('║       Try: Consulting → 5 contacts | Technology → 3 contacts     ║');
console.log('║                                                                   ║');
console.log('║    3. Company Picker (lookup-style)                               ║');
console.log('║       Pick a company → grid shows ONLY that company\'s contacts   ║');
console.log('║       Try: Qatar National Bank → Ahmed, Fatima, Yusuf (3)        ║');
console.log('║            QDB Enterprise Solutions → Mohammed, Aisha (2)        ║');
console.log('║            Al Khalij → Omar, Noura (2)                           ║');
console.log('║                                                                   ║');
console.log('║  URL: http://localhost:3001/forms/outside-filter-demo             ║');
console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
