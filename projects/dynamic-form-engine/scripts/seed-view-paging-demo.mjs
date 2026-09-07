/**
 * Seed: second grid on three-changes-demo, pointed at a PURPOSE-BUILT system view.
 *
 * The first grid uses "Active Contacts" (everything), so it cannot show whether the
 * configured view is actually driving the query. This adds:
 *   · a custom system view "DFE Demo — Al-Thani Contacts" — filters fullname to Al-Thani,
 *     sorts DESCENDING, and selects a different column (email) than the grid displays;
 *   · a second grid field bound to that view, page size 5, numbered pager.
 *
 * Side by side the two grids read the same entity and return different data, different
 * order and different totals — purely because of the view id in configuration.
 *
 * Run:  node --env-file=scripts/.env scripts/seed-view-paging-demo.mjs
 * Safe: guards on both the view name and the field schema name — re-run is a no-op.
 */

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;
const FORM_CODE     = 'three-changes-demo';
const VIEW_NAME     = 'DFE Demo — Al-Thani Contacts';
const FIELD_SCHEMA  = 'demo3_view_results';

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
  return text ? JSON.parse(text) : {};
};

const SYSTEM_VIEW_QUERY_TYPE = 0;
const FT  = { interactiveGrid: 100000021 };
const CS  = { two: 100000002 };
const GRD = { selection: 100000000 };
const SEL = { single: 100000000 };
const COL = { one: 100000001 };

console.log('\n== View + paging demo — seed ==\n');

// ── 1. The custom system view ────────────────────────────────────────────────

const existingView = await get(
  `savedqueries?$filter=name eq '${VIEW_NAME.replace(/'/g, "''")}'&$select=savedqueryid&$top=1`,
);

let viewId = existingView.value?.[0]?.savedqueryid;
if (viewId) {
  console.log(`view already exists — ${viewId}`);
} else {
  const fetchXml =
    '<fetch version="1.0" output-format="xml-platform" mapping="logical">' +
    '<entity name="contact">' +
    '<attribute name="fullname"/>' +
    '<attribute name="emailaddress1"/>' +
    '<attribute name="contactid"/>' +
    '<order attribute="fullname" descending="true"/>' +
    '<filter type="and">' +
    '<condition attribute="statecode" operator="eq" value="0"/>' +
    '<condition attribute="fullname" operator="like" value="%Al-Thani%"/>' +
    '</filter>' +
    '</entity></fetch>';

  const layoutXml =
    '<grid name="resultset" object="2" jump="fullname" select="1" icon="1" preview="1">' +
    '<row name="result" id="contactid">' +
    '<cell name="fullname" width="220"/>' +
    '<cell name="emailaddress1" width="220"/>' +
    '</row></grid>';

  const view = await post('savedqueries', {
    name: VIEW_NAME,
    description: 'Purpose-built view proving the grid queries the configured view: Al-Thani only, descending.',
    returnedtypecode: 'contact',
    querytype: SYSTEM_VIEW_QUERY_TYPE,
    fetchxml: fetchXml,
    layoutxml: layoutXml,
    isdefault: false,
  });
  viewId = view.savedqueryid;
  console.log(`view created — ${viewId}`);

  const publish = await fetch(`${BASE}/PublishXml`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      ParameterXml: `<importexportxml><savedqueries><savedquery>${viewId}</savedquery></savedqueries></importexportxml>`,
    }),
  });
  console.log(`view published → ${publish.status}`);
}

// ── 2. The grid bound to it ──────────────────────────────────────────────────

const existingField = await get(
  `qdb_form_fields?$filter=qdb_schema_name eq '${FIELD_SCHEMA}'&$select=qdb_form_fieldid&$top=1`,
);
if (existingField.value?.length) {
  console.log(`field ${FIELD_SCHEMA} already exists — nothing to do`);
  process.exit(0);
}

const form = await get(
  `qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid&$top=1`,
);
const formId = form.value?.[0]?.qdb_form_definitionid;
if (!formId) throw new Error(`form ${FORM_CODE} not found — run seed-three-changes-demo.mjs first`);

const tabs = await get(
  `qdb_form_tabs?$filter=_qdb_form_definition_id_value eq ${formId}&$select=qdb_form_tabid,qdb_label,qdb_display_order&$orderby=qdb_display_order asc`,
);
const searchTab = tabs.value.find((tab) => tab.qdb_label.includes('Find a specialist'));
if (!searchTab) throw new Error('search tab not found on the demo form');

const section = await post('qdb_form_sections', {
  'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${searchTab.qdb_form_tabid})`,
  qdb_label: 'Same entity, a different configured view',
  qdb_description:
    'This grid is bound to the "DFE Demo — Al-Thani Contacts" system view: Al-Thani only, sorted Z→A, 5 per page. '
    + 'The grid above reads the same contacts through "Active Contacts". Only the configured view id differs.',
  qdb_display_order: 2,
  qdb_columns: COL.one,
  qdb_is_collapsible: false,
  qdb_is_collapsed_by_default: false,
  qdb_is_visible: true,
});
console.log(`section created — ${section.qdb_form_sectionid}`);

const grid = await post('qdb_form_fields', {
  'qdb_form_section_id@odata.bind': `/qdb_form_sections(${section.qdb_form_sectionid})`,
  qdb_schema_name: FIELD_SCHEMA,
  qdb_field_type: FT.interactiveGrid,
  qdb_label: 'Al-Thani contacts (from the view)',
  qdb_display_order: 1,
  qdb_column_span: CS.two,
  qdb_is_required: false,
  qdb_is_readonly: false,
  qdb_is_hidden: false,
  qdb_grid_mode: GRD.selection,
  qdb_selection_mode: SEL.single,
  qdb_grid_entity_name: 'contact',
  qdb_saved_view_id: viewId,
  qdb_max_rows: 50,
  qdb_grid_page_size: 5,
  qdb_grid_paging_style: 'numbered',
});
console.log(`grid field created — ${grid.qdb_form_fieldid}`);

for (const [label, attribute, type, order] of [
  ['Full Name', 'fullname', 'text', 1],
  ['Company', 'parentcustomerid', 'lookup', 2],
]) {
  await post('qdb_grid_column_configs', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${grid.qdb_form_fieldid})`,
    qdb_grid_column_configname: `col-${attribute}-${grid.qdb_form_fieldid.slice(0, 8)}`,
    qdb_column_label: label,
    qdb_column_attribute: attribute,
    qdb_column_field_type: type,
    qdb_display_order: order,
    qdb_is_visible: true,
    qdb_is_editable: false,
    qdb_column_options_json: JSON.stringify({ v: 2, filterType: 'none' }),
  });
}
console.log('grid columns created');

console.log(`\nseeded. Republish the form, then compare the two grids on tab 3.\n`);
