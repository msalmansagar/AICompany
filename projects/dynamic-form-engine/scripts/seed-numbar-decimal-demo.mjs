/**
 * Seeds a small "NUMBAR Decimal Bar Demo" form in Dataverse.
 * Demonstrates decimal fields rendered as read-only utilization bars against an
 * editable numeric max field. Run: node scripts/seed-numbar-decimal-demo.mjs
 * Requires DV_CLIENT_SECRET in the environment (see scripts/.env).
 */
const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;

async function acquireToken() {
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default` });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await res.json();
  if (!res.ok) throw new Error(`Token: ${j.error_description}`);
  return j.access_token;
}

function h(token) {
  return { Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json', Prefer: 'return=representation' };
}

async function post(token, entity, body) {
  const res = await fetch(`${API_BASE}/${entity}`, { method: 'POST', headers: h(token), body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) throw new Error(`POST ${entity} → ${res.status}: ${j.error?.message}`);
  return j;
}

async function get(token, path) {
  const res = await fetch(`${API_BASE}/${path}`, { headers: h(token) });
  const j = await res.json();
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${j.error?.message}`);
  return j;
}

// Picklist codes from CrmMetadataService
const FT  = { number: 100000003, decimal: 100000012 };
const NDS = { textBox: 100000001, bar: 100000002 };
const COL = { two: 100000002 };
const CS  = { two: 100000002 };
const STATUS_ACTIVE = 100000001;
const FORM_CODE = 'numbar-decimal-demo';

async function main() {
  console.log('\n=== Seeding "NUMBAR Decimal Bar Demo" form ===\n');
  const t = await acquireToken();
  console.log('✓ Token acquired');

  const check = await get(t, `qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}' and statecode eq 0&$select=qdb_form_definitionid&$top=1`);
  if (check.value?.length) {
    console.log(`\n⚠  Already exists (${check.value[0].qdb_form_definitionid}). Delete first to re-seed.\n`);
    process.exit(0);
  }

  console.log('\n[1] Form definition…');
  const form = await post(t, 'qdb_form_definitions', {
    qdb_form_code:            FORM_CODE,
    qdb_title:                'NUMBAR Decimal Bar Demo',
    qdb_description:          'Decimal fields rendered as read-only utilization bars against an editable numeric max.',
    qdb_status:               STATUS_ACTIVE,
    qdb_version:              1,
    qdb_allow_save_draft:     false,
    qdb_confirmation_message: 'Done.',
  });
  const fid = form.qdb_form_definitionid;
  console.log(`  ✓ Form: ${fid}`);

  console.log('\n[2] Tab…');
  const tab = await post(t, 'qdb_form_tabs', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
    qdb_is_visible: true, qdb_label: 'Credit Facility', qdb_display_order: 1,
  });
  console.log(`  ✓ Tab: ${tab.qdb_form_tabid}`);

  console.log('\n[3] Section…');
  const section = await post(t, 'qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tab.qdb_form_tabid})`,
    qdb_display_order: 1, qdb_columns: COL.two,
    qdb_is_collapsible: false, qdb_is_collapsed_by_default: false, qdb_is_visible: true,
    qdb_label: 'Utilization',
    qdb_description: 'Edit the max below and watch each decimal bar recompute.',
  });
  const sb = `/qdb_form_sections(${section.qdb_form_sectionid})`;
  console.log(`  ✓ Section: ${section.qdb_form_sectionid}`);

  console.log('\n[4] Fields…');
  const fld = (body) => ({ 'qdb_form_section_id@odata.bind': sb, qdb_is_required: false, qdb_is_hidden: false, qdb_column_span: CS.two, ...body });

  const fields = [
    {
      qdb_schema_name: 'qdb_facility_max', qdb_field_type: FT.number,
      qdb_label: 'Approved Facility — editable max', qdb_display_order: 1,
      qdb_is_readonly: false, qdb_default_value: '100000',
      qdb_tooltip: 'Edit this and every decimal bar below recomputes live.',
    },
    {
      qdb_schema_name: 'qdb_amount_drawn', qdb_field_type: FT.decimal,
      qdb_label: 'Amount Drawn (decimal bar — amber)', qdb_display_order: 2,
      qdb_is_readonly: true, qdb_decimal_places: 2, qdb_default_value: '82500.50',
      qdb_number_display_style: NDS.bar, qdb_bar_max_field_schema: 'qdb_facility_max',
    },
    {
      qdb_schema_name: 'qdb_overdue_ratio', qdb_field_type: FT.decimal,
      qdb_label: 'Overdue Exposure (decimal bar — red)', qdb_display_order: 3,
      qdb_is_readonly: true, qdb_decimal_places: 2, qdb_default_value: '93750.25',
      qdb_number_display_style: NDS.bar, qdb_bar_max_field_schema: 'qdb_facility_max',
    },
    {
      qdb_schema_name: 'qdb_headroom', qdb_field_type: FT.decimal,
      qdb_label: 'Committed Headroom (decimal bar — green)', qdb_display_order: 4,
      qdb_is_readonly: true, qdb_decimal_places: 2, qdb_default_value: '61200.75',
      qdb_number_display_style: NDS.bar, qdb_bar_max_field_schema: 'qdb_facility_max',
    },
  ];

  for (const f of fields) {
    await post(t, 'qdb_form_fields', fld(f));
    console.log(`  ✓ ${f.qdb_label}`);
  }

  console.log(`\n=== Done ✓ ===`);
  console.log(`\n  Form code : ${FORM_CODE}`);
  console.log(`  Form ID   : ${fid}`);
  console.log(`\n  Open: http://localhost:3000/forms/${FORM_CODE}`);
  console.log('  Expect: editable max + 3 decimal utilization bars (amber 82.5%, red 93.75%, green 61.2%).\n');
}

main().catch(err => { console.error('\n✗', err.message); process.exit(1); });
