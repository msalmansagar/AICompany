/**
 * Provisions info-card and interactive-grid field types + their metadata attributes.
 * Run: node scripts/provision-infocard-grid-field-types.mjs
 */
const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;

async function acquireToken() {
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default` });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json(); if (!r.ok) throw new Error(j.error_description); return j.access_token;
}
const lbl = (text) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }] });

function h(t) { return { Authorization: `Bearer ${t}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json' }; }

async function attrExists(t, entity, attr) {
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${attr}')?$select=LogicalName`, { headers: h(t) });
  return r.ok;
}
async function insertOption(t, entity, attr, value, label) {
  const r = await fetch(`${API_BASE}/InsertOptionValue`, { method: 'POST', headers: h(t), body: JSON.stringify({ EntityLogicalName: entity, AttributeLogicalName: attr, Value: value, Label: lbl(label) }) });
  if (!r.ok) { const j = await r.json(); if (!j.error?.message?.includes('already exists')) throw new Error(j.error?.message); console.log(`  ↷ option ${value} already exists`); } else console.log(`  ✓ option ${value} = ${label}`);
}
async function addStringAttr(t, entity, schema, display, maxLen = 200) {
  if (await attrExists(t, entity, schema)) { console.log(`  ↷ ${schema} already exists`); return; }
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${entity}')/Attributes`, { method: 'POST', headers: h(t), body: JSON.stringify({ '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', SchemaName: schema, LogicalName: schema, MaxLength: maxLen, RequiredLevel: { Value: 'None' }, DisplayName: lbl(display) }) });
  if (!r.ok) { const j = await r.json(); throw new Error(`addString ${schema}: ${j.error?.message}`); }
  console.log(`  ✓ ${schema}`);
}
async function addPicklistAttr(t, entity, schema, display, options) {
  if (await attrExists(t, entity, schema)) { console.log(`  ↷ ${schema} already exists`); return; }
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${entity}')/Attributes`, { method: 'POST', headers: h(t), body: JSON.stringify({ '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata', SchemaName: schema, LogicalName: schema, RequiredLevel: { Value: 'None' }, DisplayName: lbl(display), OptionSet: { '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata', IsGlobal: false, OptionSetType: 'Picklist', Options: options.map(([v, l]) => ({ Value: v, Label: lbl(l) })) } }) });
  if (!r.ok) { const j = await r.json(); throw new Error(`addPicklist ${schema}: ${j.error?.message}`); }
  console.log(`  ✓ ${schema}`);
}
async function addIntAttr(t, entity, schema, display) {
  if (await attrExists(t, entity, schema)) { console.log(`  ↷ ${schema} already exists`); return; }
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${entity}')/Attributes`, { method: 'POST', headers: h(t), body: JSON.stringify({ '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata', SchemaName: schema, LogicalName: schema, RequiredLevel: { Value: 'None' }, DisplayName: lbl(display), MinValue: 0, MaxValue: 2147483647 }) });
  if (!r.ok) { const j = await r.json(); throw new Error(`addInt ${schema}: ${j.error?.message}`); }
  console.log(`  ✓ ${schema}`);
}
async function publish(t, entities) {
  const xml = `<importexportxml><entities>${entities.map(e => `<entity>${e}</entity>`).join('')}</entities></importexportxml>`;
  await fetch(`${API_BASE}/PublishXml`, { method: 'POST', headers: h(t), body: JSON.stringify({ ParameterXml: xml }) });
  console.log(`  ✓ Published: ${entities.join(', ')}`);
}

async function main() {
  console.log('\n=== Provisioning info-card + interactive-grid field types ===\n');
  const t = await acquireToken(); console.log('✓ Token\n');

  // ── 1. Add picklist options to qdb_field_type ────────────────────────────
  console.log('[1] qdb_field_type picklist options');
  await insertOption(t, 'qdb_form_field', 'qdb_field_type', 100000020, 'info-card');
  await insertOption(t, 'qdb_form_field', 'qdb_field_type', 100000021, 'interactive-grid');

  // ── 2. Info-card field attributes ────────────────────────────────────────
  console.log('\n[2] Info-card metadata attributes on qdb_form_field');
  await addPicklistAttr(t, 'qdb_form_field', 'qdb_info_card_style', 'Info Card Style', [
    [100000000, 'info'], [100000001, 'warning'], [100000002, 'success'], [100000003, 'error'],
  ]);
  await addStringAttr(t, 'qdb_form_field', 'qdb_info_card_title', 'Info Card Title', 200);
  await addStringAttr(t, 'qdb_form_field', 'qdb_info_card_body',  'Info Card Body',  2000);
  await addStringAttr(t, 'qdb_form_field', 'qdb_info_card_icon',  'Info Card Icon',  100);

  // ── 3. Grid field attributes ──────────────────────────────────────────────
  console.log('\n[3] Grid metadata attributes on qdb_form_field');
  await addStringAttr(t, 'qdb_form_field', 'qdb_saved_view_id',    'Grid Saved View ID',  100);
  await addStringAttr(t, 'qdb_form_field', 'qdb_grid_entity_name', 'Grid Entity Name',    100);
  await addPicklistAttr(t, 'qdb_form_field', 'qdb_selection_mode', 'Grid Selection Mode', [
    [100000000, 'single'], [100000001, 'multi'],
  ]);
  await addIntAttr(t, 'qdb_form_field', 'qdb_grid_min_rows', 'Grid Min Rows');

  // ── 4. Publish ───────────────────────────────────────────────────────────
  console.log('\n[4] Publishing');
  await publish(t, ['qdb_form_field']);

  console.log('\n=== Done ✓ ===\n');
}

main().catch(e => { console.error('✗', e.message); process.exit(1); });
