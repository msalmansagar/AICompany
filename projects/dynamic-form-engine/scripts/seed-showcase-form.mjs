/**
 * Seeds a "Feature Showcase" form demonstrating info-card fields,
 * selection grid, and entry grid.
 * Run: node scripts/seed-showcase-form.mjs
 */
const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;

// Picklist codes
const FT = {
  text: 100000001, decimal: 100000012, phone: 100000014,
  boolean: 100000019, infoCard: 100000020, interactiveGrid: 100000021,
};
const BA  = { submit: 100000001, saveDraft: 100000002, cancel: 100000003 };
const COL = { two: 100000002 };
const CS  = { one: 100000001, two: 100000002 };
const IC_STYLE  = { info: 100000000, warning: 100000001, success: 100000002, error: 100000003 };
const GRID_MODE = { selection: 100000000, entry: 100000001 };
const SEL_MODE  = { single: 100000000, multi: 100000001 };

// Saved view IDs (System Views — not User Views, per BC-011)
const VIEW_FORM_DEFINITIONS = '0448a02f-deed-4410-8a7d-aba72b7802d7'; // Active Form Definitions
const VIEW_FORM_FIELDS      = 'db3e8a5e-1e11-4117-ad7c-d056854c2a2f'; // Active Form Fields

async function acquireToken() {
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default` });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json(); if (!r.ok) throw new Error(j.error_description); return j.access_token;
}

function headers(token) {
  return { Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json', Prefer: 'return=representation' };
}

async function post(t, entity, body) {
  const r = await fetch(`${API_BASE}/${entity}`, { method: 'POST', headers: headers(t), body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`POST ${entity}: ${j.error?.message}`);
  return j;
}

async function main() {
  console.log('\n=== Seeding Feature Showcase form ===\n');
  const t = await acquireToken(); console.log('✓ Token\n');

  // Guard
  const check = await fetch(`${API_BASE}/qdb_form_definitions?$filter=qdb_form_code eq 'feature-showcase' and statecode eq 0&$select=qdb_form_definitionid&$top=1`, { headers: headers(t) }).then(r => r.json());
  if (check.value?.length) { console.log('⚠ Already exists. Delete first to re-seed.\n'); process.exit(0); }

  // ── 1. Form Definition ────────────────────────────────────────────────────
  console.log('[1] Form definition…');
  const form = await post(t, 'qdb_form_definitions', {
    qdb_form_code:    'feature-showcase',
    qdb_title:        'Feature Showcase',
    qdb_description:  'Demonstrates info-card fields, selection grid, and entry grid',
    qdb_status:       100000001,
    qdb_version:      1,
    qdb_allow_save_draft: true,
    qdb_confirmation_message: 'Feature Showcase submitted successfully.',
    qdb_allow_infocard_skip: true,
  });
  const fid = form.qdb_form_definitionid;
  console.log(`  ✓ ${fid}`);

  const fd = `/qdb_form_definitions(${fid})`;
  const tabDef = (label, order) => ({ 'qdb_form_definition_id@odata.bind': fd, qdb_label: label, qdb_display_order: order, qdb_is_visible: true });
  const secDef = (tabId, label, desc, order) => ({ 'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tabId})`, qdb_label: label, qdb_description: desc, qdb_display_order: order, qdb_columns: COL.two, qdb_is_collapsible: false, qdb_is_collapsed_by_default: false, qdb_is_visible: true });
  const fldBase = (secId, schema, type, label, order, span, req = false) => ({ 'qdb_form_section_id@odata.bind': `/qdb_form_sections(${secId})`, qdb_schema_name: schema, qdb_field_type: type, qdb_label: label, qdb_display_order: order, qdb_column_span: span, qdb_is_required: req, qdb_is_readonly: false, qdb_is_hidden: false });

  // ── 2. Tab 1: Guidance Cards ──────────────────────────────────────────────
  console.log('\n[2] Tab 1 – Guidance Cards…');
  const tab1 = await post(t, 'qdb_form_tabs', tabDef('Guidance Cards', 1));
  const sec1 = await post(t, 'qdb_form_sections', secDef(tab1.qdb_form_tabid, 'Inline Info Cards', 'Examples of all four info-card styles available as form fields', 1));
  const s1 = sec1.qdb_form_sectionid;

  // INFO card
  await post(t, 'qdb_form_fields', { ...fldBase(s1, 'qdb_card_info', FT.infoCard, 'Info Card (Info Style)', 1, CS.two), qdb_info_card_style: IC_STYLE.info, qdb_info_card_title: 'Application Guidance', qdb_info_card_body: 'Please ensure all details match your official QID documents. Inaccurate information may delay processing of your application.', qdb_info_card_icon: 'InfoRegular' });
  console.log('  ✓ info-card: Info style');

  // WARNING card
  await post(t, 'qdb_form_fields', { ...fldBase(s1, 'qdb_card_warning', FT.infoCard, 'Info Card (Warning Style)', 2, CS.two), qdb_info_card_style: IC_STYLE.warning, qdb_info_card_title: 'Important Notice', qdb_info_card_body: 'Your session will expire in 30 minutes. Make sure to save your progress before the session ends to avoid losing your data.', qdb_info_card_icon: 'WarningRegular' });
  console.log('  ✓ info-card: Warning style');

  // SUCCESS card
  await post(t, 'qdb_form_fields', { ...fldBase(s1, 'qdb_card_success', FT.infoCard, 'Info Card (Success Style)', 3, CS.two), qdb_info_card_style: IC_STYLE.success, qdb_info_card_title: 'Eligibility Confirmed', qdb_info_card_body: 'Your eligibility for this programme has been pre-verified. You may proceed to complete the remaining sections of this form.', qdb_info_card_icon: 'CheckmarkCircleRegular' });
  console.log('  ✓ info-card: Success style');

  // ERROR card
  await post(t, 'qdb_form_fields', { ...fldBase(s1, 'qdb_card_error', FT.infoCard, 'Info Card (Error Style)', 4, CS.two), qdb_info_card_style: IC_STYLE.error, qdb_info_card_title: 'Required Action', qdb_info_card_body: 'One or more documents are missing or expired. Please upload valid copies before submitting this application.', qdb_info_card_icon: 'DismissCircleRegular' });
  console.log('  ✓ info-card: Error style');

  // ── 3. Tab 2: Selection Grid ──────────────────────────────────────────────
  console.log('\n[3] Tab 2 – Selection Grid…');
  const tab2 = await post(t, 'qdb_form_tabs', tabDef('Select Form', 2));

  // Guidance card at top of tab
  const sec2a = await post(t, 'qdb_form_sections', secDef(tab2.qdb_form_tabid, 'Instructions', 'How to use the selection grid', 1));
  await post(t, 'qdb_form_fields', { ...fldBase(sec2a.qdb_form_sectionid, 'qdb_sel_guide', FT.infoCard, 'Selection Guide', 1, CS.two), qdb_info_card_style: IC_STYLE.info, qdb_info_card_title: 'Select a Form Definition', qdb_info_card_body: 'Browse the active form definitions below. Click a row to select it. The selected form will be linked to this submission.', qdb_info_card_icon: 'InfoRegular' });
  console.log('  ✓ guidance card');

  // Selection grid field
  const sec2b = await post(t, 'qdb_form_sections', secDef(tab2.qdb_form_tabid, 'Available Forms', 'Select from active form definitions', 2));
  await post(t, 'qdb_form_fields', {
    ...fldBase(sec2b.qdb_form_sectionid, 'qdb_selected_form_id', FT.interactiveGrid, 'Form Definition', 1, CS.two, true),
    qdb_grid_mode:        GRID_MODE.selection,
    qdb_grid_entity_name: 'qdb_form_definition',
    qdb_saved_view_id:    VIEW_FORM_DEFINITIONS,
    qdb_selection_mode:   SEL_MODE.single,
    qdb_grid_max_rows:    50,
  });
  console.log('  ✓ selection grid (qdb_form_definition, single select)');

  // ── 4. Tab 3: Entry Grid ──────────────────────────────────────────────────
  console.log('\n[4] Tab 3 – Entry Grid…');
  const tab3 = await post(t, 'qdb_form_tabs', tabDef('Add Fields', 3));

  // Guidance card
  const sec3a = await post(t, 'qdb_form_sections', secDef(tab3.qdb_form_tabid, 'Instructions', 'Entry grid guidance', 1));
  await post(t, 'qdb_form_fields', { ...fldBase(sec3a.qdb_form_sectionid, 'qdb_entry_guide', FT.infoCard, 'Entry Guide', 1, CS.two), qdb_info_card_style: IC_STYLE.warning, qdb_info_card_title: 'Adding Form Fields', qdb_info_card_body: 'Use the grid below to define new form fields inline. Each row represents one field that will be created when this form is submitted. Maximum 20 rows allowed.', qdb_info_card_icon: 'WarningRegular' });
  console.log('  ✓ guidance card');

  // Entry grid field
  const sec3b = await post(t, 'qdb_form_sections', secDef(tab3.qdb_form_tabid, 'Field Entries', 'Define new fields inline', 2));
  await post(t, 'qdb_form_fields', {
    ...fldBase(sec3b.qdb_form_sectionid, 'qdb_field_entries', FT.interactiveGrid, 'Field Entries', 1, CS.two, true),
    qdb_grid_mode:        GRID_MODE.entry,
    qdb_grid_entity_name: 'qdb_form_field',
    qdb_saved_view_id:    VIEW_FORM_FIELDS,
    qdb_grid_min_rows:    1,
    qdb_grid_max_rows:    20,
  });
  console.log('  ✓ entry grid (qdb_form_field, max 20 rows)');

  // ── 5. Seed grid column configs ───────────────────────────────────────────
  console.log('\n[5] Grid column configs…');
  // Find the selection grid field
  const selFieldRes = await fetch(`${API_BASE}/qdb_form_fields?$filter=qdb_schema_name eq 'qdb_selected_form_id' and _qdb_form_section_id_value ne null&$select=qdb_form_fieldid&$top=1`, { headers: headers(t) }).then(r => r.json());
  const selFieldId = selFieldRes.value?.[0]?.qdb_form_fieldid;

  // Find the entry grid field
  const entFieldRes = await fetch(`${API_BASE}/qdb_form_fields?$filter=qdb_schema_name eq 'qdb_field_entries' and _qdb_form_section_id_value ne null&$select=qdb_form_fieldid&$top=1`, { headers: headers(t) }).then(r => r.json());
  const entFieldId = entFieldRes.value?.[0]?.qdb_form_fieldid;

  if (selFieldId) {
    for (const [i, col] of [
      { schema: 'qdb_form_code', label: 'Form Code',   width: 200, order: 1 },
      { schema: 'qdb_title',     label: 'Title',        width: 300, order: 2 },
      { schema: 'qdb_status',    label: 'Status',       width: 120, order: 3 },
      { schema: 'modifiedon',    label: 'Modified',     width: 160, order: 4 },
    ].entries()) {
      await post(t, 'qdb_grid_column_configs', {
        qdb_grid_column_configname: `showcase-sel-${col.schema}`,
        'qdb_form_field_id@odata.bind': `/qdb_form_fields(${selFieldId})`,
        qdb_column_attribute: col.schema, qdb_column_label: col.label,
        qdb_display_order: col.order, qdb_column_width: col.width,
        qdb_is_visible: true, qdb_is_sortable: true,
      });
      console.log(`  ✓ selection col: ${col.label}`);
    }
  }

  if (entFieldId) {
    for (const col of [
      { schema: 'qdb_schema_name', label: 'Schema Name', width: 200, order: 1 },
      { schema: 'qdb_label',       label: 'Label',       width: 250, order: 2 },
      { schema: 'qdb_field_type',  label: 'Field Type',  width: 140, order: 3 },
      { schema: 'qdb_is_required', label: 'Required',    width: 100, order: 4 },
    ]) {
      await post(t, 'qdb_grid_column_configs', {
        qdb_grid_column_configname: `showcase-ent-${col.schema}`,
        'qdb_form_field_id@odata.bind': `/qdb_form_fields(${entFieldId})`,
        qdb_column_attribute: col.schema, qdb_column_label: col.label,
        qdb_display_order: col.order, qdb_column_width: col.width,
        qdb_is_visible: true, qdb_is_sortable: true,
      });
      console.log(`  ✓ entry col: ${col.label}`);
    }
  }

  // ── 6. Buttons ────────────────────────────────────────────────────────────
  console.log('\n[6] Buttons…');
  const btn = (label, action, order, primary) => ({ 'qdb_form_definition_id@odata.bind': fd, qdb_label: label, qdb_action: action, qdb_display_order: order, qdb_is_visible: true, qdb_is_primary: primary, qdb_confirmation_required: false, qdb_is_active: true });
  await post(t, 'qdb_form_buttons', btn('Back',         BA.cancel,    1, false));
  await post(t, 'qdb_form_buttons', btn('Save Draft',   BA.saveDraft, 2, false));
  await post(t, 'qdb_form_buttons', btn('Submit',       BA.submit,    3, true));
  console.log('  ✓ Back, Save Draft, Submit');

  console.log(`\n=== Done ✓ ===`);
  console.log(`\n  Form code : feature-showcase`);
  console.log(`  Form ID   : ${fid}`);
  console.log('\n  Open portal → Feature Showcase → 3 tabs:');
  console.log('    Tab 1: Guidance Cards — 4 info-card field styles');
  console.log('    Tab 2: Select Form — selection grid (qdb_form_definition)');
  console.log('    Tab 3: Add Fields — entry grid (qdb_form_field)\n');
}

main().catch(e => { console.error('\n✗', e.message); process.exit(1); });
