/**
 * Seeds a Dataverse demo form (org5869857f) for the new features:
 *   - fields placed in the tab HEADER and FOOTER zones (DFE-TABZONE-001)
 *   - an entry grid with a DOCUMENT-UPLOAD column (DFE-GRIDFILE)
 *   - a manual SUBMIT-CONFIRMATION gate (DFE-SUBMITCONFIRM-001)
 * Re-running on an already-seeded form just adds/refreshes the gate columns.
 *
 * Run: node scripts/seed-tabzone-grid-demo.mjs   (requires DV_CLIENT_SECRET)
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;
const FORM_CODE = 'tabzone-grid-demo';

async function acquireToken() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
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
async function patch(token, path, body) {
  const res = await fetch(`${API_BASE}/${path}`, { method: 'PATCH', headers: h(token), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}: ${(await res.json().catch(() => ({}))).error?.message}`);
}

// DFE-SUBMITCONFIRM-001: acknowledgement gate columns on the form definition.
const SUBMIT_CONFIRMATION = {
  qdb_submit_confirmation_label: 'I confirm the information above is accurate and complete',
  qdb_submit_confirmation_message: 'You are about to submit this application. Do you want to continue?',
};

// Picklist codes (from CrmMetadataService + provision-tabzone-schema).
const FT = { text: 100000001, number: 100000003, interactiveGrid: 100000021 };
const CS = { one: 100000001, two: 100000002 };
const COL = { one: 100000001, two: 100000002 };
const BA = { submit: 100000001 };
const GRID_ENTRY = 100000001;
const GRID_SELECTION = 100000000;
const PL = { header: 100000000, footer: 100000001 };

// DFE-GRIDSRC-001: a JSON-source, read-only, info-card display grid.
const TEAM_JSON = JSON.stringify([
  { id: 't1', name: 'Alice Rahman', role: 'Lead Engineer', email: 'alice@qdb.qa' },
  { id: 't2', name: 'Omar Farouk', role: 'Product Designer', email: 'omar@qdb.qa' },
  { id: 't3', name: 'Sara Khan', role: 'QA Analyst', email: 'sara@qdb.qa' },
]);

async function seedJsonGrid(t, tabId) {
  const sec = await post(t, 'qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tabId})`,
    qdb_label: 'Team Directory', qdb_display_order: 3, qdb_columns: COL.one,
    qdb_is_collapsible: false, qdb_is_collapsed_by_default: false, qdb_is_visible: true,
  });
  const grid = await post(t, 'qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${sec.qdb_form_sectionid})`,
    qdb_schema_name: 'qdb_team', qdb_field_type: FT.interactiveGrid,
    qdb_label: 'Project Team (JSON source → InfoCard display)', qdb_display_order: 1, qdb_column_span: CS.two,
    qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
    qdb_grid_mode: GRID_SELECTION,
    qdb_grid_data_source: 'json', qdb_grid_json_data: TEAM_JSON,
    qdb_grid_display_mode: 'infocard', qdb_grid_selectable: false, qdb_grid_card_icon: 'PersonRegular',
  });
  const gid = grid.qdb_form_fieldid;
  const col = (name, l, a, o) => post(t, 'qdb_grid_column_configs', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${gid})`,
    qdb_grid_column_configname: name, qdb_column_label: l, qdb_column_attribute: a,
    qdb_column_field_type: 'text', qdb_display_order: o, qdb_is_visible: true, qdb_is_editable: false,
  });
  await col('team-col-name', 'Name', 'name', 1);
  await col('team-col-role', 'Role', 'role', 2);
  await col('team-col-email', 'Email', 'email', 3);
  console.log('  ✓ Team Directory (JSON → InfoCard) grid');
}

async function main() {
  console.log(`\n=== Seeding "${FORM_CODE}" (tab header/footer + grid upload) ===\n`);
  const t = await acquireToken();
  console.log('✓ Token acquired');

  const existing = await get(t, `qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}' and statecode eq 0&$select=qdb_form_definitionid&$top=1`);
  if (existing.value?.length) {
    // Already seeded — refresh the submit-confirmation gate and ensure the JSON grid.
    const id = existing.value[0].qdb_form_definitionid;
    await patch(t, `qdb_form_definitions(${id})`, SUBMIT_CONFIRMATION);
    console.log(`✓ Form already existed (${id}) — refreshed submit-confirmation gate.`);
    const tabs = await get(t, `qdb_form_tabs?$filter=_qdb_form_definition_id_value eq ${id}&$select=qdb_form_tabid&$orderby=qdb_display_order asc&$top=1`);
    const firstTabId = tabs.value?.[0]?.qdb_form_tabid;
    if (firstTabId) {
      const secs = await get(t, `qdb_form_sections?$filter=_qdb_form_tab_id_value eq ${firstTabId} and qdb_label eq 'Team Directory'&$select=qdb_form_sectionid&$top=1`);
      if (secs.value?.length) console.log('  ↷ Team Directory grid already present');
      else await seedJsonGrid(t, firstTabId);
    }
    console.log('\nDone.\n');
    process.exit(0);
  }

  // Resolve the field→tab lookup navigation property (used for @odata.bind).
  const rel = await get(t, `EntityDefinitions(LogicalName='qdb_form_field')/ManyToOneRelationships?$filter=ReferencingAttribute eq 'qdb_form_tab_id'&$select=ReferencingEntityNavigationPropertyName`);
  const tabNav = rel.value?.[0]?.ReferencingEntityNavigationPropertyName;
  if (!tabNav) throw new Error('qdb_form_tab_id lookup not found on qdb_form_field — run provision-tabzone-schema.mjs first.');
  console.log(`✓ Field→tab navigation property: ${tabNav}`);

  // 1. Form definition
  const form = await post(t, 'qdb_form_definitions', {
    qdb_form_code: FORM_CODE,
    qdb_title: 'Tab Zones & Grid Upload Demo',
    qdb_description: 'Fields in the tab header/footer zones + an entry grid with a document-upload column.',
    qdb_status: 100000001,
    qdb_version: 1,
    qdb_allow_save_draft: false,
    qdb_confirmation_message: 'Your application has been submitted.',
    qdb_allow_infocard_skip: false,
    ...SUBMIT_CONFIRMATION,
  });
  const fid = form.qdb_form_definitionid;
  console.log(`[1] Form: ${fid}`);

  // 2. Tab
  const tab = await post(t, 'qdb_form_tabs', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
    qdb_label: 'Application', qdb_display_order: 1, qdb_is_visible: true,
  });
  const tabId = tab.qdb_form_tabid;
  console.log(`[2] Tab: ${tabId}`);

  // 3. Sections
  const secDef = (label, order, cols) => post(t, 'qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tabId})`,
    qdb_label: label, qdb_display_order: order, qdb_columns: cols,
    qdb_is_collapsible: false, qdb_is_collapsed_by_default: false, qdb_is_visible: true,
  });
  const secDetails = await secDef('Loan Details', 1, COL.two);
  const secDocs = await secDef('Documents', 2, COL.one);
  console.log(`[3] Sections: details=${secDetails.qdb_form_sectionid} docs=${secDocs.qdb_form_sectionid}`);

  // 4. Header-zone fields (target the tab directly; no section).
  const zoneField = (body) => post(t, 'qdb_form_fields', {
    [`${tabNav}@odata.bind`]: `/qdb_form_tabs(${tabId})`,
    qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
    ...body,
  });
  await zoneField({ qdb_schema_name: 'qdb_app_ref', qdb_field_type: FT.text, qdb_label: 'Application Reference', qdb_placement: PL.header, qdb_is_readonly: true, qdb_default_value: 'APP-2026-0042', qdb_display_order: 1, qdb_column_span: CS.two });
  await zoneField({ qdb_schema_name: 'qdb_branch', qdb_field_type: FT.text, qdb_label: 'Branch', qdb_placement: PL.header, qdb_display_order: 2, qdb_column_span: CS.two });
  console.log('[4] Header fields: Application Reference, Branch');

  // 5. Body fields (in the Loan Details section)
  const bodyField = (body) => post(t, 'qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${secDetails.qdb_form_sectionid})`,
    qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
    ...body,
  });
  await bodyField({ qdb_schema_name: 'qdb_requested_amount', qdb_field_type: FT.number, qdb_label: 'Requested Amount (QAR)', qdb_display_order: 1, qdb_column_span: CS.one });
  await bodyField({ qdb_schema_name: 'qdb_purpose', qdb_field_type: FT.text, qdb_label: 'Purpose of Loan', qdb_display_order: 2, qdb_column_span: CS.two });
  console.log('[5] Body fields: Requested Amount, Purpose');

  // 6. Entry grid with a document-upload column (in the Documents section)
  const grid = await post(t, 'qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${secDocs.qdb_form_sectionid})`,
    qdb_schema_name: 'qdb_documents', qdb_field_type: FT.interactiveGrid,
    qdb_label: 'Supporting Documents', qdb_display_order: 1, qdb_column_span: CS.two,
    qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
    qdb_grid_mode: GRID_ENTRY, qdb_max_rows: 10, qdb_grid_min_rows: 0,
  });
  const gridId = grid.qdb_form_fieldid;
  const col = (name, label, attr, type, order) => post(t, 'qdb_grid_column_configs', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${gridId})`,
    qdb_grid_column_configname: name, qdb_column_label: label, qdb_column_attribute: attr,
    qdb_column_field_type: type, qdb_display_order: order, qdb_is_visible: true, qdb_is_editable: true,
  });
  await col('tabzone-col-desc', 'Description', 'qdb_desc', 'text', 1);
  await col('tabzone-col-file', 'Document', 'qdb_file', 'file', 2);
  console.log(`[6] Entry grid ${gridId} with Description (text) + Document (file) columns`);

  // 7. Footer-zone field
  await zoneField({ qdb_schema_name: 'qdb_reviewer_notes', qdb_field_type: FT.text, qdb_label: 'Reviewer Notes', qdb_placement: PL.footer, qdb_display_order: 1, qdb_column_span: CS.two });
  console.log('[7] Footer field: Reviewer Notes');

  // 7b. JSON-source, read-only, info-card display grid.
  await seedJsonGrid(t, tabId);

  // 8. Submit button
  await post(t, 'qdb_form_buttons', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
    qdb_label: 'Submit', qdb_action: BA.submit, qdb_display_order: 1,
    qdb_is_primary: true, qdb_is_visible: true, qdb_is_active: true, qdb_confirmation_required: false,
  });
  console.log('[8] Submit button');

  console.log(`\n=== Done. Form "${FORM_CODE}" seeded. ===`);
  console.log(`Open in the runtime as form code: ${FORM_CODE}`);
}

main().catch((e) => { console.error('\nSEED FAILED:', e.message); process.exit(1); });
