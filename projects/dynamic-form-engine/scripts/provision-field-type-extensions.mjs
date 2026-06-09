/**
 * Provisions all new qdb_form_field attributes introduced in the 5-feature batch:
 *   Item 1 — Radio card list:           qdb_radio_render_style
 *   Item 2 — Document file types:       qdb_allowed_mime_types, qdb_max_file_size_mb, qdb_max_files
 *   Item 3 — Grid entity filters:       qdb_grid_filter_expression, qdb_grid_depends_on_field_schema,
 *                                        qdb_grid_depends_on_filter_template
 *   Item 4 — Checkboxes multiselect:    qdb_multiselect_render_style
 *   Item 5 — Options from CRM optionset: qdb_option_source_entity, qdb_option_source_attribute
 *
 * Safe to re-run — each attribute is checked for existence before creation.
 * Run: node scripts/provision-field-type-extensions.mjs
 */

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = 'zMp8Q~~kJW3l3h_HOKbkYdH56c5ALU-Pxc3X_ct6';
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;
const ENTITY        = 'qdb_form_field';

async function acquireToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
  });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description);
  return j.access_token;
}

const lbl = (text) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }],
});
const h = (t) => ({
  Authorization: `Bearer ${t}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
  Accept: 'application/json', 'Content-Type': 'application/json',
});

async function exists(t, schema) {
  const r = await fetch(
    `${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${schema}')?$select=LogicalName`,
    { headers: h(t) },
  );
  return r.ok;
}

async function addPicklist(t, schema, display, options) {
  if (await exists(t, schema)) { console.log(`  ↷ ${schema} (already exists)`); return; }
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`, {
    method: 'POST', headers: h(t),
    body: JSON.stringify({
      '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
      SchemaName: schema, LogicalName: schema,
      RequiredLevel: { Value: 'None' }, DisplayName: lbl(display),
      OptionSet: {
        '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
        IsGlobal: false, OptionSetType: 'Picklist',
        Options: options.map(([v, l]) => ({ Value: v, Label: lbl(l) })),
      },
    }),
  });
  if (!r.ok) { const j = await r.json(); throw new Error(`addPicklist ${schema}: ${j.error?.message}`); }
  console.log(`  ✓ ${schema}`);
}

async function addMemo(t, schema, display, maxLen = 500) {
  if (await exists(t, schema)) { console.log(`  ↷ ${schema} (already exists)`); return; }
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`, {
    method: 'POST', headers: h(t),
    body: JSON.stringify({
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: schema, LogicalName: schema,
      MaxLength: maxLen, RequiredLevel: { Value: 'None' }, DisplayName: lbl(display),
    }),
  });
  if (!r.ok) { const j = await r.json(); throw new Error(`addMemo ${schema}: ${j.error?.message}`); }
  console.log(`  ✓ ${schema}`);
}

async function addInt(t, schema, display, min = 0, max = 2147483647) {
  if (await exists(t, schema)) { console.log(`  ↷ ${schema} (already exists)`); return; }
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`, {
    method: 'POST', headers: h(t),
    body: JSON.stringify({
      '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
      SchemaName: schema, LogicalName: schema,
      MinValue: min, MaxValue: max, RequiredLevel: { Value: 'None' }, DisplayName: lbl(display),
    }),
  });
  if (!r.ok) { const j = await r.json(); throw new Error(`addInt ${schema}: ${j.error?.message}`); }
  console.log(`  ✓ ${schema}`);
}

async function addString(t, schema, display, maxLen = 200) {
  if (await exists(t, schema)) { console.log(`  ↷ ${schema} (already exists)`); return; }
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`, {
    method: 'POST', headers: h(t),
    body: JSON.stringify({
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: schema, LogicalName: schema,
      MaxLength: maxLen, RequiredLevel: { Value: 'None' }, DisplayName: lbl(display),
    }),
  });
  if (!r.ok) { const j = await r.json(); throw new Error(`addString ${schema}: ${j.error?.message}`); }
  console.log(`  ✓ ${schema}`);
}

async function publish(t) {
  const xml = `<importexportxml><entities><entity>${ENTITY}</entity></entities></importexportxml>`;
  const r = await fetch(`${API_BASE}/PublishXml`, {
    method: 'POST', headers: h(t),
    body: JSON.stringify({ ParameterXml: xml }),
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`PublishXml: ${j.error?.message ?? r.status}`); }
  console.log(`  ✓ Published ${ENTITY}`);
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  DFE Field-Type Extensions — Provision All 5 Items ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const t = await acquireToken();
  console.log('✓ Token acquired\n');

  // ── Item 1: Radio card list ───────────────────────────────────────────────
  console.log('[Item 1] Radio render style…');
  await addPicklist(t, 'qdb_radio_render_style', 'Radio Render Style', [
    [100000000, 'List'],    // default — vertical radio buttons
    [100000001, 'Cards'],   // clickable card grid
  ]);

  // ── Item 2: Document file types ───────────────────────────────────────────
  console.log('\n[Item 2] File upload config…');
  await addMemo(  t, 'qdb_allowed_mime_types', 'Allowed MIME Types (JSON)', 2000);
  await addInt(   t, 'qdb_max_file_size_mb',   'Max File Size (MB)', 0, 500);
  await addInt(   t, 'qdb_max_files',          'Max Files',          0, 100);

  // ── Item 3: Grid entity filters ───────────────────────────────────────────
  console.log('\n[Item 3] Grid filter attributes…');
  await addMemo(  t, 'qdb_grid_filter_expression',          'Grid Filter Expression',          500);
  await addString(t, 'qdb_grid_depends_on_field_schema',    'Grid Depends-On Field Schema',    100);
  await addMemo(  t, 'qdb_grid_depends_on_filter_template', 'Grid Depends-On Filter Template', 500);

  // ── Item 4: Checkboxes multiselect ────────────────────────────────────────
  console.log('\n[Item 4] Multiselect render style…');
  await addPicklist(t, 'qdb_multiselect_render_style', 'Multiselect Render Style', [
    [100000000, 'Dropdown'],    // default — Combobox dropdown
    [100000001, 'Checkboxes'],  // visible checkbox list
  ]);

  // ── Item 5: Options from CRM optionset ────────────────────────────────────
  console.log('\n[Item 5] Option source from CRM…');
  await addString(t, 'qdb_option_source_entity',    'Option Source Entity',    100);
  await addString(t, 'qdb_option_source_attribute', 'Option Source Attribute', 100);

  // ── Publish ───────────────────────────────────────────────────────────────
  console.log('\n[Publish]');
  await publish(t);

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  All 10 attributes provisioned on qdb_form_field           ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  qdb_radio_render_style            Picklist  Item 1        ║');
  console.log('║  qdb_allowed_mime_types             Memo     Item 2        ║');
  console.log('║  qdb_max_file_size_mb               Integer  Item 2        ║');
  console.log('║  qdb_max_files                      Integer  Item 2        ║');
  console.log('║  qdb_grid_filter_expression         Memo     Item 3        ║');
  console.log('║  qdb_grid_depends_on_field_schema   String   Item 3        ║');
  console.log('║  qdb_grid_depends_on_filter_template Memo    Item 3        ║');
  console.log('║  qdb_multiselect_render_style       Picklist  Item 4       ║');
  console.log('║  qdb_option_source_entity           String   Item 5        ║');
  console.log('║  qdb_option_source_attribute        String   Item 5        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
}

main().catch(e => { console.error('\n✗', e.message); process.exit(1); });
