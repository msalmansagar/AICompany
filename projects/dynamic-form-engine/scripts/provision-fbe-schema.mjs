/**
 * DFE-FBE-001 — Form Builder Enhancements schema provisioning (cloud org).
 * Additive & nullable — safe to re-run (each attribute is checked before creation).
 *
 *   Feature 1 — Section icon:       qdb_form_section.qdb_icon_name (String)
 *   Feature 2 — Tab description:     qdb_form_tab.qdb_description (Memo)
 *   Feature 4 — Summary tab flag:    qdb_form_tab.qdb_is_summary_tab (Boolean)
 *   Feature 3 — Label field:         qdb_form_field.qdb_static_content (Memo),
 *                                    qdb_form_field.qdb_source_field_schema_name (String),
 *                                    qdb_field_type option value 'label' = 100000022
 *   Feature 4 — Summary mode:        qdb_form_definition.qdb_summary_mode (Picklist
 *                                    None/SystemGenerated/Manual)
 *
 * NOTE: cloud-only (Azure AD client-credentials). For on-prem, add these attributes to a
 * solution on cloud, export, and import on-prem (attrs created by Web API do not travel otherwise).
 *
 * Run: node --env-file=scripts/.env scripts/provision-fbe-schema.mjs
 */

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;

if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET not set (pass --env-file=scripts/.env)');

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

async function attrExists(t, entity, schema) {
  const r = await fetch(
    `${API_BASE}/EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${schema}')?$select=LogicalName`,
    { headers: h(t) },
  );
  return r.ok;
}

async function post(t, path, payload) {
  const r = await fetch(`${API_BASE}/${path}`, { method: 'POST', headers: h(t), body: JSON.stringify(payload) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`${path}: ${j.error?.message ?? r.status}`); }
  return r;
}

async function addString(t, entity, schema, display, maxLen = 100) {
  if (await attrExists(t, entity, schema)) { console.log(`  ↷ ${entity}.${schema} (exists)`); return; }
  await post(t, `EntityDefinitions(LogicalName='${entity}')/Attributes`, {
    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    SchemaName: schema, LogicalName: schema, MaxLength: maxLen,
    RequiredLevel: { Value: 'None' }, DisplayName: lbl(display),
  });
  console.log(`  ✓ ${entity}.${schema}`);
}

async function addMemo(t, entity, schema, display, maxLen = 2000) {
  if (await attrExists(t, entity, schema)) { console.log(`  ↷ ${entity}.${schema} (exists)`); return; }
  await post(t, `EntityDefinitions(LogicalName='${entity}')/Attributes`, {
    '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
    SchemaName: schema, LogicalName: schema, MaxLength: maxLen,
    RequiredLevel: { Value: 'None' }, DisplayName: lbl(display),
  });
  console.log(`  ✓ ${entity}.${schema}`);
}

async function addBoolean(t, entity, schema, display) {
  if (await attrExists(t, entity, schema)) { console.log(`  ↷ ${entity}.${schema} (exists)`); return; }
  await post(t, `EntityDefinitions(LogicalName='${entity}')/Attributes`, {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
    SchemaName: schema, LogicalName: schema, DefaultValue: false,
    RequiredLevel: { Value: 'None' }, DisplayName: lbl(display),
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
      TrueOption: { Value: 1, Label: lbl('Yes') },
      FalseOption: { Value: 0, Label: lbl('No') },
    },
  });
  console.log(`  ✓ ${entity}.${schema}`);
}

async function addPicklist(t, entity, schema, display, options) {
  if (await attrExists(t, entity, schema)) { console.log(`  ↷ ${entity}.${schema} (exists)`); return; }
  await post(t, `EntityDefinitions(LogicalName='${entity}')/Attributes`, {
    '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    SchemaName: schema, LogicalName: schema,
    RequiredLevel: { Value: 'None' }, DisplayName: lbl(display),
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
      IsGlobal: false, OptionSetType: 'Picklist',
      Options: options.map(([v, l]) => ({ Value: v, Label: lbl(l) })),
    },
  });
  console.log(`  ✓ ${entity}.${schema}`);
}

async function insertOption(t, entity, attr, value, label) {
  // InsertOptionValue is idempotent-ish: it errors if the value exists; we tolerate that.
  const r = await fetch(`${API_BASE}/InsertOptionValue`, {
    method: 'POST', headers: h(t),
    body: JSON.stringify({ EntityLogicalName: entity, AttributeLogicalName: attr, Value: value, Label: lbl(label) }),
  });
  if (r.ok) { console.log(`  ✓ ${entity}.${attr} += ${value} '${label}'`); return; }
  const j = await r.json().catch(() => ({}));
  if ((j.error?.message ?? '').match(/already exists|duplicate/i)) { console.log(`  ↷ ${entity}.${attr} ${value} (exists)`); return; }
  throw new Error(`InsertOptionValue ${attr}=${value}: ${j.error?.message ?? r.status}`);
}

async function publish(t, entities) {
  const xml = `<importexportxml><entities>${entities.map((e) => `<entity>${e}</entity>`).join('')}</entities></importexportxml>`;
  await post(t, 'PublishXml', { ParameterXml: xml });
  console.log(`  ✓ Published: ${entities.join(', ')}`);
}

async function main() {
  console.log('\n== DFE-FBE-001 schema provisioning ==\n');
  const t = await acquireToken();
  console.log('✓ Token acquired\n');

  console.log('[1] Section icon');
  await addString(t, 'qdb_form_section', 'qdb_icon_name', 'Icon Name', 100);

  console.log('\n[2] Tab description + summary flag');
  await addMemo(t, 'qdb_form_tab', 'qdb_description', 'Description', 2000);
  await addBoolean(t, 'qdb_form_tab', 'qdb_is_summary_tab', 'Is Summary Tab');

  console.log('\n[3] Label field attributes + field-type option');
  await addMemo(t, 'qdb_form_field', 'qdb_static_content', 'Static Content', 4000);
  await addString(t, 'qdb_form_field', 'qdb_source_field_schema_name', 'Source Field Schema Name', 100);
  await insertOption(t, 'qdb_form_field', 'qdb_field_type', 100000022, 'label');

  console.log('\n[4] Summary mode');
  await addPicklist(t, 'qdb_form_definition', 'qdb_summary_mode', 'Summary Mode', [
    [100000001, 'None'],
    [100000002, 'SystemGenerated'],
    [100000003, 'Manual'],
  ]);

  console.log('\n[Publish]');
  await publish(t, ['qdb_form_section', 'qdb_form_tab', 'qdb_form_field', 'qdb_form_definition']);

  console.log('\n✓ DFE-FBE-001 schema provisioned (additive, nullable).\n');
}

main().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
