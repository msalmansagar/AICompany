const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;

const t = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DV}/.default` }) }
).then(r => r.json());

const H = { Authorization: `Bearer ${t.access_token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json' };
const get = async p => (await fetch(`${BASE}/${p}`, { headers: H })).json();

// Form
const form = await get(`qdb_form_definitions?$filter=qdb_form_code eq 'grid-filter-demo'&$select=qdb_form_definitionid,qdb_title,qdb_status,qdb_form_code`);
console.log('\n── FORM ─────────────────────────────────────────');
console.log(JSON.stringify(form.value, null, 2));

const fid = form.value[0]?.qdb_form_definitionid;
if (!fid) { console.log('NO FORM FOUND'); process.exit(1); }

// Tabs
const tabs = await get(`qdb_form_tabs?$filter=_qdb_form_definition_id_value eq ${fid}&$select=qdb_form_tabid,qdb_label,qdb_display_order,qdb_is_visible`);
console.log('\n── TABS ─────────────────────────────────────────');
console.log(JSON.stringify(tabs.value, null, 2));

for (const tab of tabs.value) {
  const secs = await get(`qdb_form_sections?$filter=_qdb_form_tab_id_value eq ${tab.qdb_form_tabid}&$select=qdb_form_sectionid,qdb_label,qdb_display_order,qdb_is_visible,qdb_columns`);
  console.log(`\n── SECTIONS in tab "${tab.qdb_label}" ─────────────────`);
  console.log(JSON.stringify(secs.value, null, 2));

  for (const sec of secs.value) {
    const fields = await get(`qdb_form_fields?$filter=_qdb_form_section_id_value eq ${sec.qdb_form_sectionid}&$select=qdb_form_fieldid,qdb_schema_name,qdb_field_type,qdb_label,qdb_is_hidden,qdb_is_readonly,qdb_grid_entity_name,qdb_saved_view_id,qdb_grid_mode,qdb_selection_mode,qdb_max_rows`);
    console.log(`\n── FIELDS in section "${sec.qdb_label}" ──────────────`);
    console.log(JSON.stringify(fields.value, null, 2));

    for (const f of fields.value) {
      const cols = await get(`qdb_grid_column_configs?$filter=_qdb_form_field_id_value eq ${f.qdb_form_fieldid}&$select=qdb_grid_column_configname,qdb_column_label,qdb_column_attribute,qdb_column_field_type,qdb_column_options_json,qdb_display_order,qdb_is_visible&$orderby=qdb_display_order asc`);
      if (cols.value.length) {
        console.log(`\n  GRID COLUMNS for field "${f.qdb_label}":`);
        cols.value.forEach(c => {
          console.log(`    [${c.qdb_display_order}] ${c.qdb_column_attribute} (${c.qdb_column_field_type}) — options: ${c.qdb_column_options_json ?? 'null'}`);
        });
      }
    }
  }
}
