/**
 * Seed: Grid Filter Demo
 *
 * Demonstrates the three column filter types introduced in the grid-filter feature:
 *   text     → fullname column     (LIKE search)
 *   optionset→ gendercode column   (dropdown EQ filter)
 *   lookup   → parentcustomerid    (link-entity LIKE on account.name)
 *
 * Creates:
 *   1. Form "grid-filter-demo" with one tab + section + interactive-grid field
 *   2. Three grid column configs (fullname, gendercode, parentcustomerid)
 *   3. 3 Account records
 *   4. 8 Contact records spread across accounts with mixed genders
 *
 * Run:  node scripts/seed-grid-filter-demo.mjs
 * Safe: guard on form code — re-run is a no-op for the form; accounts/contacts
 *       are also guarded by name so re-runs won't duplicate them.
 */

// ── Credentials ───────────────────────────────────────────────────────────────

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;
const FORM_CODE     = 'grid-filter-demo';

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

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function post(entity, body) {
  const r = await fetch(`${BASE}/${entity}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`POST ${entity}: ${j.error?.message ?? r.status}`);
  return j;
}

async function get(path) {
  const r = await fetch(`${BASE}/${path}`, { headers: H });
  const j = await r.json();
  if (!r.ok) throw new Error(`GET ${path}: ${j.error?.message ?? r.status}`);
  return j;
}

async function findOrCreate(entitySet, filterQuery, body, idAttr) {
  const existing = await get(`${entitySet}?$filter=${filterQuery}&$select=${idAttr}&$top=1`);
  if (existing.value?.length) {
    const id = existing.value[0][idAttr];
    console.log(`  ↩ already exists — ${id}`);
    return { [idAttr]: id };
  }
  const created = await post(entitySet, body);
  console.log(`  ✓ created — ${created[idAttr]}`);
  return created;
}

// ── Picklist constants ────────────────────────────────────────────────────────

const FT  = { interactiveGrid: 100000021 };
const COL = { two: 100000002 };
const CS  = { two: 100000002 };
const GRD = { selection: 100000000 };
const SEL = { single: 100000000 };

// ── Header ────────────────────────────────────────────────────────────────────

console.log('\n╔═══════════════════════════════════════════════════════╗');
console.log('║   Grid Filter Demo — text / optionset / lookup       ║');
console.log('╚═══════════════════════════════════════════════════════╝\n');
console.log('✓ Token acquired');

// ── [0] Guard: skip form creation if already seeded ──────────────────────────

const existingForm = await get(
  `qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}' and statecode eq 0&$select=qdb_form_definitionid&$top=1`,
);
let form;
if (existingForm.value?.length) {
  form = existingForm.value[0];
  console.log(`\n⚠  Form '${FORM_CODE}' already exists (${form.qdb_form_definitionid}). Skipping form/grid creation.\n`);
} else {
  form = null;
}

// ── [1] Discover "Active Contacts" system view ────────────────────────────────

console.log('\n[1] Resolving contact system view…');
// returnedtypecode is a string in this Dataverse env ('contact', not numeric 2)
const viewsRes = await get(
  `savedqueries?$filter=returnedtypecode eq 'contact' and querytype eq 0 and statecode eq 0&$select=savedqueryid,name&$top=20`,
);

let contactViewId = viewsRes.value?.find(v => v.name === 'Active Contacts')?.savedqueryid
  ?? viewsRes.value?.find(v => v.name?.toLowerCase().includes('active'))?.savedqueryid
  ?? viewsRes.value?.[0]?.savedqueryid;

if (!contactViewId) throw new Error('No active system view found for contact entity. Create an "Active Contacts" view first.');
console.log(`  ✓ View: "${viewsRes.value?.find(v => v.savedqueryid === contactViewId)?.name}" — ${contactViewId}`);

// ── [2] Form + structure ──────────────────────────────────────────────────────

if (!form) {
  console.log('\n[2] Form Definition…');
  form = await post('qdb_form_definitions', {
    qdb_form_code:            FORM_CODE,
    qdb_title:                'Grid Filter Demo',
    qdb_description:          'Demonstrates text, optionset, and lookup column filters on a selection grid.',
    qdb_status:               100000000, // draft
    qdb_version:              1,
    qdb_allow_save_draft:     false,
    qdb_draft_expiry_days:    7,
    qdb_confirmation_message: 'Contact selected.',
    qdb_show_summary_step:    false,
    qdb_allow_infocard_skip:  false,
    qdb_infocard_counts_in_progress: false,
  });
  console.log(`  ✓ form — ${form.qdb_form_definitionid}`);

  console.log('\n[3] Tab…');
  const tab = await post('qdb_form_tabs', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${form.qdb_form_definitionid})`,
    qdb_label:                           'Select Contact',
    qdb_display_order:                   1,
    qdb_is_visible:                      true,
    qdb_requires_previous_tab_complete:  false,
  });
  console.log(`  ✓ tab — ${tab.qdb_form_tabid}`);

  console.log('\n[4] Section…');
  const section = await post('qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tab.qdb_form_tabid})`,
    qdb_label:                    'Contact Lookup',
    qdb_description:              'Use the column filters below to narrow contacts by name, gender, or company',
    qdb_display_order:            1,
    qdb_columns:                  COL.two,
    qdb_is_collapsible:           false,
    qdb_is_collapsed_by_default:  false,
    qdb_is_visible:               true,
  });
  console.log(`  ✓ section — ${section.qdb_form_sectionid}`);

  console.log('\n[5] Interactive Grid field…');
  const gridField = await post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${section.qdb_form_sectionid})`,
    qdb_schema_name:       'demo_contact_grid',
    qdb_field_type:        FT.interactiveGrid,
    qdb_label:             'Contacts',
    qdb_tooltip:           'Use the column filters to narrow the list: name (text), gender (dropdown), or company (lookup)',
    qdb_display_order:     1,
    qdb_column_span:       CS.two,
    qdb_is_required:       false,
    qdb_is_readonly:       false,
    qdb_is_hidden:         false,
    qdb_grid_mode:         GRD.selection,
    qdb_selection_mode:    SEL.single,
    qdb_grid_entity_name:  'contact',
    qdb_saved_view_id:     contactViewId,
    qdb_max_rows:          100,
  });
  console.log(`  ✓ field — ${gridField.qdb_form_fieldid}`);

  // ── [6] Grid column configs ─────────────────────────────────────────────────
  // optionsJson uses the v2 extended format so the backend reads filterType
  // and lookup metadata without any Dataverse schema changes.

  console.log('\n[6] Grid column configs…');

  // Column 1: fullname — text filter (inferred from columnFieldType 'text')
  await post('qdb_grid_column_configs', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${gridField.qdb_form_fieldid})`,
    qdb_grid_column_configname: 'demo-col-fullname',
    qdb_column_label:           'Full Name',
    qdb_column_attribute:       'fullname',
    qdb_column_field_type:      'text',
    qdb_display_order:          1,
    qdb_is_visible:             true,
    qdb_is_editable:            false,
    // No optionsJson — filterType 'text' is inferred from columnFieldType 'text'
  });
  console.log('  ✓ fullname (text filter)');

  // Column 2: gendercode — optionset filter with dropdown options
  await post('qdb_grid_column_configs', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${gridField.qdb_form_fieldid})`,
    qdb_grid_column_configname: 'demo-col-gendercode',
    qdb_column_label:           'Gender',
    qdb_column_attribute:       'gendercode',
    qdb_column_field_type:      'dropdown',
    qdb_display_order:          2,
    qdb_is_visible:             true,
    qdb_is_editable:            false,
    // v2 format: explicit filterType + options list for the dropdown UI
    qdb_column_options_json: JSON.stringify({
      v: 2,
      filterType: 'optionset',
      options: [
        { value: '1', label: 'Male' },
        { value: '2', label: 'Female' },
      ],
    }),
  });
  console.log('  ✓ gendercode (optionset filter)');

  // Column 3: parentcustomerid — lookup filter via link-entity join on account.name
  await post('qdb_grid_column_configs', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${gridField.qdb_form_fieldid})`,
    qdb_grid_column_configname: 'demo-col-parentcustomerid',
    qdb_column_label:           'Company',
    qdb_column_attribute:       'parentcustomerid',
    qdb_column_field_type:      'lookup',
    qdb_display_order:          3,
    qdb_is_visible:             true,
    qdb_is_editable:            false,
    // v2 format: filterType 'lookup' + entity/attribute for link-entity FetchXML join
    qdb_column_options_json: JSON.stringify({
      v: 2,
      filterType: 'lookup',
      lookupTargetEntity:    'account',
      lookupDisplayAttribute: 'name',
    }),
  });
  console.log('  ✓ parentcustomerid (lookup filter → account.name)');
}

// ── [7] Seed Accounts ─────────────────────────────────────────────────────────

console.log('\n[7] Accounts…');

const ACCOUNTS = [
  { name: 'Qatar National Bank',           telephone1: '+974-4440-7407' },
  { name: 'QDB Enterprise Solutions',      telephone1: '+974-4494-7777' },
  { name: 'Al Khalij Commercial Bank',     telephone1: '+974-4494-0000' },
];

const accountIds = {};
for (const acc of ACCOUNTS) {
  process.stdout.write(`  • ${acc.name} … `);
  const r = await findOrCreate(
    'accounts',
    `name eq '${acc.name}'`,
    { name: acc.name, telephone1: acc.telephone1 },
    'accountid',
  );
  accountIds[acc.name] = r.accountid;
}

// ── [8] Seed Contacts ─────────────────────────────────────────────────────────

console.log('\n[8] Contacts…');

const CONTACTS = [
  // Qatar National Bank — 3 contacts
  { firstname: 'Ahmed',   lastname: 'Al-Mansoor',  gendercode: 1, company: 'Qatar National Bank' },
  { firstname: 'Fatima',  lastname: 'Al-Khalifa',  gendercode: 2, company: 'Qatar National Bank' },
  { firstname: 'Yusuf',   lastname: 'Al-Dosari',   gendercode: 1, company: 'Qatar National Bank' },
  // QDB Enterprise — 2 contacts
  { firstname: 'Mohammed', lastname: 'Hassan',     gendercode: 1, company: 'QDB Enterprise Solutions' },
  { firstname: 'Aisha',    lastname: 'Rahman',     gendercode: 2, company: 'QDB Enterprise Solutions' },
  // Al Khalij — 2 contacts
  { firstname: 'Omar',    lastname: 'Saeed',       gendercode: 1, company: 'Al Khalij Commercial Bank' },
  { firstname: 'Noura',   lastname: 'Al-Thani',    gendercode: 2, company: 'Al Khalij Commercial Bank' },
  // No company — 1 contact
  { firstname: 'Khalid',  lastname: 'Al-Attiyah',  gendercode: 1, company: null },
];

for (const c of CONTACTS) {
  const fullname = `${c.firstname} ${c.lastname}`;
  process.stdout.write(`  • ${fullname} … `);
  const body = {
    firstname:    c.firstname,
    lastname:     c.lastname,
    gendercode:   c.gendercode,
  };
  if (c.company) {
    const accId = accountIds[c.company];
    if (accId) body['parentcustomerid_account@odata.bind'] = `/accounts(${accId})`;
  }
  await findOrCreate(
    'contacts',
    `fullname eq '${fullname}' and statecode eq 0`,
    body,
    'contactid',
  );
}

// ── Done ──────────────────────────────────────────────────────────────────────

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  Seed complete!                                              ║');
console.log('╠══════════════════════════════════════════════════════════════╣');
console.log(`║  Form code:  ${FORM_CODE.padEnd(48)}║`);
console.log('║                                                              ║');
console.log('║  Grid columns seeded:                                        ║');
console.log('║    fullname          → text filter (LIKE search)             ║');
console.log('║    gendercode        → optionset filter (Male / Female)      ║');
console.log('║    parentcustomerid  → lookup filter (link-entity on account)║');
console.log('║                                                              ║');
console.log('║  Test data:                                                  ║');
console.log('║    3 accounts × 2–3 contacts each + 1 unlinked contact      ║');
console.log('║                                                              ║');
console.log('║  To test:                                                    ║');
console.log('║    1. Start backend + frontend                               ║');
console.log('║    2. Open http://localhost:3000/forms/grid-filter-demo      ║');
console.log('║    3. Filter by name: "al" → 5 matches                      ║');
console.log('║    4. Filter gender: Female → Fatima, Aisha, Noura          ║');
console.log('║    5. Filter company: "QDB" → Mohammed, Aisha               ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
