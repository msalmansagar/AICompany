// seed-test-design.mjs — DFE-STYLE-001 test data.
// Seeds a vibrant theme + a form design (linking the theme) + a styled section on the
// 'loan-application' form so the design/styling features can be seen in the portal.
// Idempotent: removes the form's existing form/section design + the TEST theme first.
//
// Run: node --env-file=scripts/.env scripts/seed-test-design.mjs

const T = process.env.DV_TENANT_ID, C = process.env.DV_CLIENT_ID, S = process.env.DV_CLIENT_SECRET, U = process.env.DV_DATAVERSE_URL;
const FORM_CODE = 'loan-application';
const THEME_CODE = 'TEST-VIBRANT';

const tok = (await (await fetch(`https://login.microsoftonline.com/${T}/oauth2/v2.0/token`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: C, client_secret: S, scope: `${U}/.default` }),
})).json()).access_token;
const base = `${U}/api/data/v9.2`;
const h = { Authorization: `Bearer ${tok}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' };
const get = async (p) => (await (await fetch(`${base}/${p}`, { headers: h })).json()).value || [];
const del = async (set, id) => fetch(`${base}/${set}(${id})`, { method: 'DELETE', headers: h });
async function create(set, body) {
  const r = await fetch(`${base}/${set}`, { method: 'POST', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`create ${set} failed ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

const form = (await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`))[0];
const formId = form.qdb_form_definitionid;
const tabs = await get(`qdb_form_tabs?$filter=_qdb_form_definition_id_value eq ${formId}&$select=qdb_form_tabid&$orderby=qdb_display_order asc`);
const section = (await get(`qdb_form_sections?$filter=_qdb_form_tab_id_value eq ${tabs[0].qdb_form_tabid}&$select=qdb_form_sectionid,qdb_label&$top=1`))[0];
console.log(`form ${FORM_CODE} (${formId}); styling section "${section.qdb_label}"`);

// --- idempotent cleanup ---
for (const fd of await get(`qdb_form_designs?$filter=_qdb_form_definition_id_value eq ${formId}&$select=qdb_form_designid`)) await del('qdb_form_designs', fd.qdb_form_designid);
for (const sd of await get(`qdb_section_designs?$filter=_qdb_form_section_id_value eq ${section.qdb_form_sectionid}&$select=qdb_section_designid`)) await del('qdb_section_designs', sd.qdb_section_designid);
for (const t of await get(`qdb_themes?$filter=qdb_theme_code eq '${THEME_CODE}'&$select=qdb_themeid`)) await del('qdb_themes', t.qdb_themeid);
console.log('cleared prior TEST design records');

// --- 1) vibrant theme (string colours/fonts; picklists left to defaults) ---
const theme = await create('qdb_themes', {
  qdb_theme_code: THEME_CODE,
  qdb_primary_color: '#7c3aed', qdb_secondary_color: '#db2777',
  qdb_background_color: '#f5f3ff', qdb_surface_color: '#ffffff',
  qdb_border_color: '#c4b5fd', qdb_text_primary_color: '#1e1b4b', qdb_text_secondary_color: '#6d28d9',
  qdb_error_color: '#dc2626', qdb_success_color: '#16a34a', qdb_warning_color: '#d97706',
  qdb_font_family: 'Georgia, "Times New Roman", serif',
  qdb_base_font_size: '16px', qdb_heading_font_size: '26px', qdb_label_font_size: '14px', qdb_input_font_size: '15px',
  qdb_border_radius: '10px', qdb_is_dark_mode: false, qdb_is_active: true,
});
console.log('+ theme', THEME_CODE, theme.qdb_themeid);

// --- 2) form design linking the theme (+ a safe scoped custom CSS) ---
await create('qdb_form_designs', {
  qdb_is_active: true,
  qdb_max_width: '780px',
  qdb_custom_css: '.qdb-demo-section { box-shadow: 0 4px 14px rgba(124,58,237,0.18); }',
  'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
  'qdb_theme_id@odata.bind': `/qdb_themes(${theme.qdb_themeid})`,
});
console.log('+ form design (theme linked, max-width 780, custom CSS)');

// --- 3) styled section (tinted background, padding, css class) ---
await create('qdb_section_designs', {
  qdb_is_active: true,
  qdb_background_color: '#ede9fe', qdb_padding: '20px', qdb_margin: '12px',
  qdb_css_class: 'qdb-demo-section',
  'qdb_form_section_id@odata.bind': `/qdb_form_sections(${section.qdb_form_sectionid})`,
});
console.log(`+ section design on "${section.qdb_label}" (lavender bg, padding)`);

console.log('\nDONE — run the portal with USE_RENDER_CACHE=false and reload loan-application to see the theme + section styling.');
