// seed-grid-fileupload-demo.mjs — demo of an EDITABLE entry grid combining a
// text column, a dropdown column, and a file-upload column (one document per cell).
// Form code: grid-fileupload-demo. Idempotent: skips if the form already exists.
//
// Run: node --env-file=scripts/.env scripts/seed-grid-fileupload-demo.mjs
const TENANT = process.env.DV_TENANT_ID, CLIENT = process.env.DV_CLIENT_ID, SECRET = process.env.DV_CLIENT_SECRET, URL = process.env.DV_DATAVERSE_URL;
const API = `${URL}/api/data/v9.2`;
const FORM_CODE = 'grid-lookup-valattr-demo';

const FT = { text: 100000001, interactiveGrid: 100000021 };
const CS = { one: 100000001, two: 100000002 };
const COL = { one: 100000001 };
const GRID_ENTRY = 100000001;
const STATUS_ACTIVE = 100000001;
const BTN_SUBMIT = 100000001;

const tok = (await (await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT, client_secret: SECRET, scope: `${URL}/.default` }),
})).json()).access_token;
const h = { Authorization: `Bearer ${tok}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: 'return=representation' };
const post = async (entity, body) => {
  const r = await fetch(`${API}/${entity}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`POST ${entity} → ${r.status}: ${j.error?.message}`);
  return j;
};
const get = async (p) => (await (await fetch(`${API}/${p}`, { headers: h })).json()).value || [];

const existing = await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}' and statecode eq 0&$select=qdb_form_definitionid&$top=1`);
if (existing.length) { console.log(`Form '${FORM_CODE}' already exists (${existing[0].qdb_form_definitionid}). Skipping.`); process.exit(0); }

const form = await post('qdb_form_definitions', {
  qdb_form_code: FORM_CODE, qdb_title: 'Grid: File Upload + Dropdown Demo',
  qdb_description: 'An editable entry grid with a text, a dropdown, and a document-upload column.',
  qdb_status: STATUS_ACTIVE, qdb_version: 1, qdb_allow_save_draft: false,
  qdb_confirmation_message: 'Your documents have been submitted.', qdb_allow_infocard_skip: false,
});
const fid = form.qdb_form_definitionid;
const tab = await post('qdb_form_tabs', { 'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`, qdb_label: 'Documents', qdb_display_order: 1, qdb_is_visible: true });
const sec = await post('qdb_form_sections', { 'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tab.qdb_form_tabid})`, qdb_label: 'Upload Documents', qdb_display_order: 1, qdb_columns: COL.one, qdb_is_collapsible: false, qdb_is_collapsed_by_default: false, qdb_is_visible: true });

const grid = await post('qdb_form_fields', {
  'qdb_form_section_id@odata.bind': `/qdb_form_sections(${sec.qdb_form_sectionid})`,
  qdb_schema_name: 'qdb_docgrid', qdb_field_type: FT.interactiveGrid,
  qdb_label: 'Documents', qdb_display_order: 1, qdb_column_span: CS.two,
  qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
  qdb_grid_mode: GRID_ENTRY, qdb_max_rows: 10, qdb_grid_min_rows: 1,
});
const gid = grid.qdb_form_fieldid;
const col = (name, label, attr, type, order, optionsJson) => post('qdb_grid_column_configs', {
  'qdb_form_field_id@odata.bind': `/qdb_form_fields(${gid})`,
  qdb_grid_column_configname: name, qdb_column_label: label, qdb_column_attribute: attr,
  qdb_column_field_type: type, qdb_display_order: order, qdb_is_visible: true, qdb_is_editable: true,
  ...(optionsJson ? { qdb_column_options_json: optionsJson } : {}),
});
await col('fud-col-desc', 'Description', 'qdb_desc', 'text', 1);
await col('fud-col-cat', 'Category', 'qdb_category', 'dropdown', 2,
  JSON.stringify([{ value: 'legal', label: 'Legal' }, { value: 'financial', label: 'Financial' }, { value: 'technical', label: 'Technical' }]));
// DFE — editable entity-sourced lookup column (fetches account records).
await col('fud-col-company', 'Company', 'qdb_company', 'lookup', 3,
  JSON.stringify({ v: 2, filterType: "lookup", lookupTargetEntity: "account", lookupDisplayAttribute: "name", lookupValueAttribute: "accountnumber" }));
await col('fud-col-file', 'Document', 'qdb_file', 'file', 4);

await post('qdb_form_buttons', { 'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`, qdb_label: 'Submit', qdb_action: BTN_SUBMIT, qdb_display_order: 1, qdb_is_primary: true, qdb_is_visible: true, qdb_is_active: true, qdb_confirmation_required: false });

console.log(`\nDONE — seeded '${FORM_CODE}' (${fid}): entry grid with Description (text) + Category (dropdown) + Document (file).`);
