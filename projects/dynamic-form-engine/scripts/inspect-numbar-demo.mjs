// Diagnostic: dump the NUMBAR demo forms' field config (hidden flag, defaults, bar refs)
// so we can see why a bar stops reading its source fields once they are hidden.
const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;

const token = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DV}/.default` }) }
).then((r) => r.json());

const H = { Authorization: `Bearer ${token.access_token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json' };
const get = async (p) => (await fetch(`${BASE}/${p}`, { headers: H })).json();

const FORM_CODES = process.argv.slice(2);
const codes = FORM_CODES.length ? FORM_CODES : ['numbar-value-ref-demo', 'numbar-decimal-demo'];

for (const code of codes) {
  const form = await get(`qdb_form_definitions?$filter=qdb_form_code eq '${code}'&$select=qdb_form_definitionid,qdb_title,qdb_status`);
  const definition = form.value[0];
  if (!definition) { console.log(`\n### ${code}: NOT FOUND`); continue; }

  console.log(`\n### ${code} — ${definition.qdb_title} (status ${definition.qdb_status})`);

  const tabs = await get(`qdb_form_tabs?$filter=_qdb_form_definition_id_value eq ${definition.qdb_form_definitionid}&$select=qdb_form_tabid,qdb_label`);
  for (const tab of tabs.value) {
    const sections = await get(`qdb_form_sections?$filter=_qdb_form_tab_id_value eq ${tab.qdb_form_tabid}&$select=qdb_form_sectionid,qdb_label,qdb_is_visible`);
    for (const section of sections.value) {
      console.log(`  section "${section.qdb_label}" visible=${section.qdb_is_visible}`);
      const fields = await get(
        `qdb_form_fields?$filter=_qdb_form_section_id_value eq ${section.qdb_form_sectionid}` +
        `&$select=qdb_form_fieldid,qdb_schema_name,qdb_label,qdb_field_type,qdb_is_hidden,qdb_is_readonly,qdb_default_value,qdb_number_display_style,qdb_bar_max_field_schema,qdb_bar_value_field_schema&$orderby=qdb_display_order asc`,
      );
      for (const f of fields.value) {
        console.log(
          `    ${f.qdb_schema_name} | type=${f.qdb_field_type} hidden=${f.qdb_is_hidden} default=${JSON.stringify(f.qdb_default_value)} ` +
          `style=${f.qdb_number_display_style} barValue=${f.qdb_bar_value_field_schema ?? '-'} barMax=${f.qdb_bar_max_field_schema ?? '-'}`,
        );
      }
    }
  }
}
