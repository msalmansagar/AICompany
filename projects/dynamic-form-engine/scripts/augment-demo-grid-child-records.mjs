/**
 * Adds a ONE-TO-MANY entry grid to `custom-entity-lookup-demo`: the rows the user types
 * become one child record each.
 *
 *   parent : qdb_nfgapplication                    (the form's target)
 *   child  : qdb_nfgapplicationshareholders        (empty in this org — safe to seed)
 *            entity set = qdb_nfgapplicationshareholderses   ← irregular again
 *            parent link = qdb_NFGApplicationRef   ← NAVIGATION PROPERTY, not the column
 *                                                    'qdb_nfgapplicationref'
 *
 * One submission mapping PER GRID COLUMN, each naming its column in
 * qdb_grid_column_attribute. Three columns → three mappings → N rows produce N children.
 *
 * Before this, a child mapping created exactly ONE child record no matter how many rows the
 * grid held, and the only way to persist rows was a JSON blob in a text column.
 *
 * Run: node --env-file=scripts/.env scripts/augment-demo-grid-child-records.mjs
 * Idempotent: guards on the grid field; re-running is a no-op.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API = `${DATAVERSE_URL}/api/data/v9.2`;

const FORM_CODE = 'custom-entity-lookup-demo';
const GRID_SCHEMA = 'cel_shareholders';
const CHILD_ENTITY = 'qdb_nfgapplicationshareholders';
const PARENT_NAV_PROPERTY = 'qdb_NFGApplicationRef';

const FIELD_TYPE_INTERACTIVE_GRID = 100000021;
const GRID_MODE_ENTRY = 100000001;
const SECTION_COLUMNS_ONE = 100000001;
const COLUMN_SPAN_TWO = 100000002;

/** grid column → child attribute. The grid stores each cell under the column attribute. */
const COLUMNS = [
  { attribute: 'qdb_name', label: 'Shareholder name', type: 'text' },
  { attribute: 'qdb_idnumber', label: 'ID number', type: 'text' },
  { attribute: 'qdb_ofholding', label: '% holding', type: 'text' },
];

let H;

async function acquireToken() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default` });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description ?? 'token request failed');
  return j.access_token;
}

async function get(path) {
  const r = await fetch(`${API}/${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function post(entitySet, body) {
  const r = await fetch(`${API}/${entitySet}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`POST ${entitySet} → ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function run() {
  const accessToken = await acquireToken();
  H = { Authorization: `Bearer ${accessToken}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json' };

  const forms = await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`);
  if (forms.value.length === 0) {
    throw new Error(`Form '${FORM_CODE}' not found — run seed-custom-entity-lookup-demo.mjs first.`);
  }
  const formId = forms.value[0].qdb_form_definitionid;

  const existingGrid = await get(`qdb_form_fields?$filter=qdb_schema_name eq '${GRID_SCHEMA}'&$select=qdb_form_fieldid`);
  if (existingGrid.value.length > 0) {
    console.log(`Grid '${GRID_SCHEMA}' already present — nothing to do.`);
    return;
  }

  console.log(`Adding a 1:N entry grid to '${FORM_CODE}'\n${'─'.repeat(66)}`);

  const tabs = await get(
    `qdb_form_tabs?$filter=_qdb_form_definition_id_value eq ${formId}&$select=qdb_form_tabid&$orderby=qdb_display_order asc`,
  );
  const tabId = tabs.value[0].qdb_form_tabid;

  const section = await post('qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tabId})`,
    qdb_label: 'Shareholders (one child record per row)',
    qdb_display_order: 2,
    qdb_columns: SECTION_COLUMNS_ONE,
    qdb_is_visible: true,
  });

  const grid = await post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${section.qdb_form_sectionid})`,
    qdb_schema_name: GRID_SCHEMA,
    qdb_label: 'Shareholders',
    qdb_field_type: FIELD_TYPE_INTERACTIVE_GRID,
    qdb_grid_mode: GRID_MODE_ENTRY,
    qdb_display_order: 1,
    qdb_column_span: COLUMN_SPAN_TWO,
    qdb_is_required: false,
    qdb_is_readonly: false,
    qdb_is_hidden: false,
    qdb_max_rows: 20,
  });
  console.log(`  grid field ${GRID_SCHEMA} (entry mode)`);

  for (const [index, column] of COLUMNS.entries()) {
    await post('qdb_grid_column_configs', {
      'qdb_form_field_id@odata.bind': `/qdb_form_fields(${grid.qdb_form_fieldid})`,
      qdb_grid_column_configname: `col-${column.attribute}-${grid.qdb_form_fieldid.slice(0, 8)}`,
      qdb_column_label: column.label,
      qdb_column_attribute: column.attribute,
      qdb_column_field_type: column.type,
      qdb_display_order: index + 1,
      qdb_is_visible: true,
      qdb_is_editable: true,
    });
  }
  console.log(`  ${COLUMNS.length} grid columns`);

  // One mapping per column. qdb_grid_column_attribute is what switches the engine from
  // "one child per group" to "one child per row".
  for (const column of COLUMNS) {
    await post('qdb_form_submission_mappings', {
      'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
      'qdb_form_field_id@odata.bind': `/qdb_form_fields(${grid.qdb_form_fieldid})`,
      qdb_grid_column_attribute: column.attribute,
      qdb_target_entity_logical_name: CHILD_ENTITY,
      qdb_target_attribute_logical_name: column.attribute,
      qdb_is_child_entity: true,
      qdb_child_entity_relationship_name: PARENT_NAV_PROPERTY,
      qdb_is_active: true,
    });
    console.log(`  mapping: grid column '${column.attribute}' → ${CHILD_ENTITY}.${column.attribute}`);
  }

  console.log(`${'─'.repeat(66)}`);
  console.log(`Portal: http://localhost:3000/forms/${FORM_CODE}`);
  console.log(`3 rows entered → 3 ${CHILD_ENTITY} records, each bound via ${PARENT_NAV_PROPERTY}.`);
}

run().catch((e) => { console.error('\nAUGMENT FAILED:', e.message); process.exit(1); });
