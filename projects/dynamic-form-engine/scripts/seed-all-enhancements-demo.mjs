/**
 * seed-all-enhancements-demo.mjs — ONE form that exercises every recent DFE
 * enhancement so they can be tested together in the runtime.
 *
 * Covers:
 *   • DFE-INFOLIST-001    info-card body list styles (bullet / roman+circle / arabic / legacy plain)
 *   • DFE-TABZONE-001     fields placed in the tab HEADER and FOOTER zones
 *   • DFE-SUBMITCONFIRM   manual submit-confirmation acknowledgement gate
 *   • DFE-GRIDSRC-001     JSON-source grid, InfoCard display, row layout, read-only
 *   •                     Entity-source grid, columns display, selectable, lookup column
 *   • DFE-GRIDFILE        entry grid with a document-upload column
 *   • entry-grid lookup   editable lookup cell (fetched from an entity)
 *   • lookup value/ID     lookup column whose stored value is a chosen attribute (accountnumber)
 *   • DFE-CBTN-001        conditional buttons (show/hide + enable/disable by field value)
 *
 * Idempotent: deletes any prior copy of this form first.
 * Run: node --env-file=scripts/.env scripts/seed-all-enhancements-demo.mjs
 */

const T = process.env.DV_TENANT_ID;
const C = process.env.DV_CLIENT_ID;
const S = process.env.DV_CLIENT_SECRET;
const U = process.env.DV_DATAVERSE_URL;
const API = `${U}/api/data/v9.2`;

const FORM_CODE = 'all-enhancements-demo';
const ACCOUNT_VIEW_ID = '00000000-0000-0000-00aa-000010001001'; // "My Active Accounts" public view

const FT  = { text: 100000001, number: 100000003, infoCard: 100000020, interactiveGrid: 100000021 };
const CS  = { one: 100000001, two: 100000002 };
const COL = { one: 100000001, two: 100000002 };
const ICS = { info: 100000000, warning: 100000001, success: 100000002, error: 100000003 };
const GRID = { selection: 100000000, entry: 100000001 };
const SEL = { single: 100000000 };
const PL  = { header: 100000000, footer: 100000001 };

async function token() {
  if (!S) throw new Error('DV_CLIENT_SECRET not set.');
  const r = await fetch(`https://login.microsoftonline.com/${T}/oauth2/v2.0/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: C, client_secret: S, scope: `${U}/.default` }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`token: ${j.error_description}`);
  return j.access_token;
}

function makeClient(tok) {
  const h = {
    Authorization: `Bearer ${tok}`, Accept: 'application/json', 'Content-Type': 'application/json',
    'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: 'return=representation',
  };
  return {
    async get(path) {
      const r = await fetch(`${API}/${path}`, { headers: h });
      const j = await r.json();
      if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${j.error?.message}`);
      return j;
    },
    async post(entity, body) {
      const r = await fetch(`${API}/${entity}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(`POST ${entity} → ${r.status}: ${j.error?.message}`);
      return j;
    },
    async del(path) {
      await fetch(`${API}/${path}`, { method: 'DELETE', headers: h });
    },
  };
}

const TEAM_JSON = JSON.stringify([
  { id: 't1', name: 'Alice Rahman', role: 'Lead Engineer', email: 'alice@qdb.qa' },
  { id: 't2', name: 'Omar Farouk', role: 'Product Designer', email: 'omar@qdb.qa' },
  { id: 't3', name: 'Sara Khan', role: 'QA Analyst', email: 'sara@qdb.qa' },
]);

async function main() {
  const db = makeClient(await token());
  console.log('✓ Token acquired');

  // Idempotency — drop prior copies.
  const prior = await db.get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`);
  for (const f of prior.value) { await db.del(`qdb_form_definitions(${f.qdb_form_definitionid})`); console.log(`  ✓ removed prior form ${f.qdb_form_definitionid}`); }

  // Navigation properties needed for @odata.bind on field→tab and scoped-button.
  const fieldTabRel = await db.get(`EntityDefinitions(LogicalName='qdb_form_field')/ManyToOneRelationships?$filter=ReferencingAttribute eq 'qdb_form_tab_id'&$select=ReferencingEntityNavigationPropertyName`);
  const FIELD_TAB_NAV = fieldTabRel.value[0].ReferencingEntityNavigationPropertyName;
  const btnRel = await db.get(`EntityDefinitions(LogicalName='qdb_form_scoped_button')/ManyToOneRelationships?$select=ReferencingEntityNavigationPropertyName,ReferencedEntity`);
  const BTN_FORM_NAV = btnRel.value.find((r) => r.ReferencedEntity === 'qdb_form_definition').ReferencingEntityNavigationPropertyName;
  const BTN_TAB_NAV = btnRel.value.find((r) => r.ReferencedEntity === 'qdb_form_tab').ReferencingEntityNavigationPropertyName;

  // ── Form ─────────────────────────────────────────────────────────────────
  const form = await db.post('qdb_form_definitions', {
    qdb_form_code: FORM_CODE,
    qdb_title: 'All Enhancements — Test Form',
    qdb_description: 'One form exercising every recent DFE enhancement.',
    qdb_status: 100000001,
    qdb_version: 1,
    qdb_allow_save_draft: true,
    qdb_confirmation_message: 'Thank you — your test submission was received.',
    qdb_submit_confirmation_label: 'I confirm the information above is accurate and complete',
    qdb_submit_confirmation_message: 'You are about to submit this test form. Continue?',
  });
  const fid = form.qdb_form_definitionid;
  console.log(`\n[Form] ${FORM_CODE} → ${fid}`);

  // ── Tab 1: Overview & Guidance ───────────────────────────────────────────
  const tab1 = await db.post('qdb_form_tabs', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
    qdb_label: 'Overview & Guidance', qdb_display_order: 1, qdb_is_visible: true,
  });
  const tab1Id = tab1.qdb_form_tabid;

  // Header-zone fields (target the tab directly; no section) — DFE-TABZONE-001.
  const zoneField = (body) => db.post('qdb_form_fields', {
    [`${FIELD_TAB_NAV}@odata.bind`]: `/qdb_form_tabs(${tab1Id})`,
    qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false, ...body,
  });
  await zoneField({ qdb_schema_name: 'qdb_app_ref', qdb_field_type: FT.text, qdb_label: 'Application Reference', qdb_placement: PL.header, qdb_is_readonly: true, qdb_default_value: 'APP-2026-0042', qdb_display_order: 1, qdb_column_span: CS.two });
  await zoneField({ qdb_schema_name: 'qdb_branch', qdb_field_type: FT.text, qdb_label: 'Branch (type "Doha" to reveal Approve)', qdb_placement: PL.header, qdb_display_order: 2, qdb_column_span: CS.two });
  console.log('  ✓ header-zone fields (Application Reference, Branch)');

  // Info-card list section — DFE-INFOLIST-001.
  const secGuide = await db.post('qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tab1Id})`,
    qdb_label: 'Getting Started', qdb_display_order: 1, qdb_columns: COL.one, qdb_is_visible: true,
  });
  const infoField = (body) => db.post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${secGuide.qdb_form_sectionid})`,
    qdb_field_type: FT.infoCard, qdb_column_span: CS.two,
    qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false, ...body,
  });
  await infoField({ qdb_schema_name: 'il_bullet', qdb_display_order: 1, qdb_label: 'Eligibility (bullet)', qdb_info_card_style: ICS.info, qdb_info_card_title: 'Before you start', qdb_info_card_body: 'You must be a Qatari national\nYou must be over 21 years of age\nYou must hold an active bank account', qdb_info_card_list_type: 'bullet', qdb_info_card_list_marker: 'plain', qdb_info_card_icon: 'InfoRegular' });
  await infoField({ qdb_schema_name: 'il_roman', qdb_display_order: 2, qdb_label: 'Process (roman + circle)', qdb_info_card_style: ICS.success, qdb_info_card_title: 'How it works', qdb_info_card_body: 'Complete every required section\nUpload your supporting documents\nReview the summary\nSubmit for approval', qdb_info_card_list_type: 'numbered-roman', qdb_info_card_list_marker: 'circle', qdb_info_card_icon: 'CheckmarkCircleRegular' });
  await infoField({ qdb_schema_name: 'il_arabic', qdb_display_order: 3, qdb_label: 'Documents (numbered)', qdb_info_card_style: ICS.warning, qdb_info_card_title: 'Have these ready', qdb_info_card_body: 'Copy of your Qatari ID\nProof of income for the last 3 months\nRecent bank statement', qdb_info_card_list_type: 'numbered-arabic', qdb_info_card_list_marker: 'plain', qdb_info_card_icon: 'WarningRegular' });
  await infoField({ qdb_schema_name: 'il_legacy', qdb_display_order: 4, qdb_label: 'Legacy plain card', qdb_info_card_style: ICS.info, qdb_info_card_title: 'Plain text (unchanged)', qdb_info_card_body: 'This card sets no list type and renders exactly as before.', qdb_info_card_icon: 'InfoRegular' });
  console.log('  ✓ info-card list section (bullet / roman+circle / arabic / legacy)');

  // Footer-zone field — DFE-TABZONE-001.
  await zoneField({ qdb_schema_name: 'qdb_reviewer_notes', qdb_field_type: FT.text, qdb_label: 'Reviewer Notes', qdb_placement: PL.footer, qdb_display_order: 1, qdb_column_span: CS.two });
  console.log('  ✓ footer-zone field (Reviewer Notes)');

  // ── Tab 2: Data & Documents ──────────────────────────────────────────────
  const tab2 = await db.post('qdb_form_tabs', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
    qdb_label: 'Data & Documents', qdb_display_order: 2, qdb_is_visible: true,
  });
  const tab2Id = tab2.qdb_form_tabid;

  const section = (tabId, label, order) => db.post('qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tabId})`,
    qdb_label: label, qdb_display_order: order, qdb_columns: COL.one, qdb_is_visible: true,
  });
  const gridColumn = (gid, body) => db.post('qdb_grid_column_configs', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${gid})`,
    qdb_display_order: 1, qdb_is_visible: true, qdb_is_editable: false, ...body,
  });

  // (a) JSON-source → InfoCard display, row layout, read-only — DFE-GRIDSRC-001.
  const secTeam = await section(tab2Id, 'Project Team (JSON → InfoCard)', 1);
  const teamGrid = await db.post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${secTeam.qdb_form_sectionid})`,
    qdb_schema_name: 'qdb_team', qdb_field_type: FT.interactiveGrid, qdb_label: 'Project Team', qdb_display_order: 1, qdb_column_span: CS.two,
    qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false, qdb_grid_mode: GRID.selection,
    qdb_grid_data_source: 'json', qdb_grid_json_data: TEAM_JSON,
    qdb_grid_display_mode: 'infocard', qdb_grid_card_layout: 'row', qdb_grid_selectable: false, qdb_grid_card_icon: 'PersonRegular',
  });
  await gridColumn(teamGrid.qdb_form_fieldid, { qdb_grid_column_configname: 'team-name', qdb_column_label: 'Name', qdb_column_attribute: 'name', qdb_column_field_type: 'text', qdb_display_order: 1 });
  await gridColumn(teamGrid.qdb_form_fieldid, { qdb_grid_column_configname: 'team-role', qdb_column_label: 'Role', qdb_column_attribute: 'role', qdb_column_field_type: 'text', qdb_display_order: 2 });
  await gridColumn(teamGrid.qdb_form_fieldid, { qdb_grid_column_configname: 'team-email', qdb_column_label: 'Email', qdb_column_attribute: 'email', qdb_column_field_type: 'text', qdb_display_order: 3 });
  console.log('  ✓ JSON → InfoCard grid (Project Team)');

  // (b) Entity-source → Columns display, selectable, with a lookup column — DFE-GRIDSRC-001.
  const secAcct = await section(tab2Id, 'Select Account (Entity → Columns)', 2);
  const acctGrid = await db.post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${secAcct.qdb_form_sectionid})`,
    qdb_schema_name: 'qdb_account_pick', qdb_field_type: FT.interactiveGrid, qdb_label: 'Choose an account', qdb_display_order: 1, qdb_column_span: CS.two,
    qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
    qdb_grid_mode: GRID.selection, qdb_selection_mode: SEL.single,
    qdb_grid_data_source: 'entity', qdb_grid_entity_name: 'account', qdb_saved_view_id: ACCOUNT_VIEW_ID,
    qdb_grid_display_mode: 'columns', qdb_grid_selectable: true, qdb_max_rows: 50,
  });
  await gridColumn(acctGrid.qdb_form_fieldid, { qdb_grid_column_configname: 'acct-name', qdb_column_label: 'Account', qdb_column_attribute: 'name', qdb_column_field_type: 'text', qdb_display_order: 1 });
  await gridColumn(acctGrid.qdb_form_fieldid, { qdb_grid_column_configname: 'acct-number', qdb_column_label: 'Account #', qdb_column_attribute: 'accountnumber', qdb_column_field_type: 'text', qdb_display_order: 2 });
  await gridColumn(acctGrid.qdb_form_fieldid, {
    qdb_grid_column_configname: 'acct-contact', qdb_column_label: 'Primary Contact', qdb_column_attribute: 'primarycontactid', qdb_column_field_type: 'lookup', qdb_display_order: 3,
    qdb_column_options_json: JSON.stringify({ v: 2, filterType: 'lookup', lookupTargetEntity: 'contact', lookupDisplayAttribute: 'fullname' }),
  });
  console.log('  ✓ Entity → Columns grid (Select Account, lookup column)');

  // (c) Entry grid: file-upload column + editable lookup cell with a custom value attribute.
  const secDocs = await section(tab2Id, 'Supporting Documents (Entry Grid)', 3);
  const docGrid = await db.post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${secDocs.qdb_form_sectionid})`,
    qdb_schema_name: 'qdb_documents', qdb_field_type: FT.interactiveGrid, qdb_label: 'Add documents', qdb_display_order: 1, qdb_column_span: CS.two,
    qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
    qdb_grid_mode: GRID.entry, qdb_max_rows: 10, qdb_grid_min_rows: 0,
  });
  await gridColumn(docGrid.qdb_form_fieldid, { qdb_grid_column_configname: 'doc-desc', qdb_column_label: 'Description', qdb_column_attribute: 'qdb_desc', qdb_column_field_type: 'text', qdb_display_order: 1, qdb_is_editable: true });
  await gridColumn(docGrid.qdb_form_fieldid, { qdb_grid_column_configname: 'doc-file', qdb_column_label: 'Document', qdb_column_attribute: 'qdb_file', qdb_column_field_type: 'file', qdb_display_order: 2, qdb_is_editable: true });
  await gridColumn(docGrid.qdb_form_fieldid, {
    qdb_grid_column_configname: 'doc-acct', qdb_column_label: 'Related Account', qdb_column_attribute: 'qdb_account', qdb_column_field_type: 'lookup', qdb_display_order: 3, qdb_is_editable: true,
    // Editable lookup cell fetched from account; STORED value = accountnumber (not the GUID).
    qdb_column_options_json: JSON.stringify({ v: 2, filterType: 'lookup', lookupTargetEntity: 'account', lookupDisplayAttribute: 'name', lookupValueAttribute: 'accountnumber' }),
  });
  console.log('  ✓ Entry grid (Description + file upload + editable lookup w/ value=accountnumber)');

  // ── Conditional scoped buttons on Tab 1 — DFE-CBTN-001. ───────────────────
  const scopedButton = (label, order, extra) => db.post('qdb_form_scoped_buttons', {
    [`${BTN_FORM_NAV}@odata.bind`]: `/qdb_form_definitions(${fid})`,
    [`${BTN_TAB_NAV}@odata.bind`]: `/qdb_form_tabs(${tab1Id})`,
    qdb_label: label, qdb_placement_scope: 'tab', qdb_display_order: order, qdb_is_primary: false,
    qdb_is_visible: true, qdb_confirm_required: false, qdb_is_active: true,
    qdb_action_type: 'saveDraft', qdb_action_config_json: '{}', ...extra,
  });
  await scopedButton('Approve', 1, { qdb_visible_conditions_json: JSON.stringify({ conditions: [{ fieldId: 'qdb_branch', operator: 'equals', value: 'Doha' }], logic: 'AND' }) });
  await scopedButton('Submit for Review', 2, { qdb_enabled_conditions_json: JSON.stringify({ conditions: [{ fieldId: 'qdb_branch', operator: 'isNotEmpty' }], logic: 'AND' }) });
  console.log('  ✓ conditional buttons (Approve visible@Branch=Doha, Submit-for-Review enabled@Branch not empty)');

  console.log(`\n=== Done. Open form code: ${FORM_CODE} (id ${fid}) ===`);
}

main().catch((e) => { console.error('\nSEED FAILED:', e.message); process.exit(1); });
