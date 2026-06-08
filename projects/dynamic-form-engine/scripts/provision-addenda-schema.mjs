/**
 * Provisions Dataverse schema for DFE-ADD-001 and DFE-ADD-002.
 * Run: node scripts/provision-addenda-schema.mjs
 */

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = 'zMp8Q~~kJW3l3h_HOKbkYdH56c5ALU-Pxc3X_ct6';
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;

// ── Token ─────────────────────────────────────────────────────────────────────

async function acquireToken() {
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope:         `${DATAVERSE_URL}/.default`,
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
  );
  if (!res.ok) throw new Error(`Token failed ${res.status}: ${await res.text()}`);
  const { access_token } = await res.json();
  console.log('✓ Token acquired');
  return access_token;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hdrs(token) {
  return {
    Authorization:  `Bearer ${token}`,
    'OData-MaxVersion': '4.0',
    'OData-Version':    '4.0',
    Accept:             'application/json',
    'Content-Type':     'application/json',
  };
}

async function apiPost(token, path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'POST', headers: hdrs(token), body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function apiGet(token, path) {
  const res = await fetch(`${API_BASE}/${path}`, { headers: hdrs(token) });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function publishEntity(token, entityName) {
  const xml = `<importexportxml><entities><entity>${entityName}</entity></entities></importexportxml>`;
  const res = await fetch(`${API_BASE}/PublishXml`, {
    method: 'POST', headers: hdrs(token),
    body: JSON.stringify({ ParameterXml: xml }),
  });
  if (!res.ok) throw new Error(`PublishXml ${entityName} → ${res.status}: ${await res.text()}`);
  console.log(`  ✓ Published ${entityName}`);
}

async function publishAll(token) {
  const res = await fetch(`${API_BASE}/PublishAllXml`, {
    method: 'POST', headers: hdrs(token), body: '{}',
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) throw new Error(`PublishAllXml → ${res.status}: ${await res.text()}`);
  console.log('  ✓ Published all');
}

async function entityExists(token, name) {
  try { await apiGet(token, `EntityDefinitions(LogicalName='${name}')?$select=LogicalName`); return true; }
  catch { return false; }
}

async function attrExists(token, entity, attr) {
  try { await apiGet(token, `EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${attr}')?$select=LogicalName`); return true; }
  catch { return false; }
}

function ok(msg)   { console.log(`  ✓ ${msg}`); }
function skip(msg) { console.log(`  ↷ ${msg}`); }

// ── Label helper ──────────────────────────────────────────────────────────────

function lbl(text) {
  return { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }] };
}

// ── Attribute builders ────────────────────────────────────────────────────────

function strAttr(schemaName, label, maxLength = 200, required = false) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    MaxLength: maxLength,
    RequiredLevel: { Value: required ? 'ApplicationRequired' : 'None' },
    DisplayName: lbl(label),
  };
}

function intAttr(schemaName, label, required = true, defaultValue = null, min = 1, max = 2147483647) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    RequiredLevel: { Value: required ? 'ApplicationRequired' : 'None' },
    MinValue: min, MaxValue: max, Format: 'None',
    DisplayName: lbl(label),
  };
}

function boolAttr(schemaName, label, defaultValue = false) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    RequiredLevel: { Value: 'None' }, DefaultValue: defaultValue,
    DisplayName: lbl(label),
    OptionSet: {
      TrueOption:  { Value: 1, Label: lbl('Yes') },
      FalseOption: { Value: 0, Label: lbl('No') },
    },
  };
}

function picklistAttr(schemaName, label, options) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    RequiredLevel: { Value: 'None' },
    DisplayName: lbl(label),
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
      IsGlobal: false, OptionSetType: 'Picklist',
      Options: options.map(({ value, label: l }) => ({ Value: value, Label: lbl(l) })),
    },
  };
}

function datetimeAttr(schemaName, label) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    RequiredLevel: { Value: 'ApplicationRequired' },
    Format: 'DateAndTime', DateTimeBehavior: { Value: 'UserLocal' },
    DisplayName: lbl(label),
  };
}

// ── Create attribute if missing ────────────────────────────────────────────────

async function addAttr(token, entity, attr) {
  const lname = attr.LogicalName;
  if (await attrExists(token, entity, lname)) { skip(`${entity}.${lname}`); return; }
  await apiPost(token, `EntityDefinitions(LogicalName='${entity}')/Attributes`, attr);
  ok(`${entity}.${lname}`);
}

// ── Create entity ─────────────────────────────────────────────────────────────

async function createEntity(token, logicalName, displayName, pluralName, description) {
  if (await entityExists(token, logicalName)) { skip(`Entity ${logicalName}`); return false; }
  const pkAttr = `${logicalName}name`;
  await apiPost(token, 'EntityDefinitions', {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: logicalName, LogicalName: logicalName,
    DisplayName: lbl(displayName),
    DisplayCollectionName: lbl(pluralName),
    Description: lbl(description),
    OwnershipType: 'UserOwned',
    HasActivities: false, HasNotes: false, IsActivity: false,
    PrimaryNameAttribute: pkAttr,
    Attributes: [{
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: pkAttr, LogicalName: pkAttr,
      IsPrimaryName: true, MaxLength: 200,
      RequiredLevel: { Value: 'ApplicationRequired' },
      DisplayName: lbl('Name'),
    }],
  });
  ok(`Created entity ${logicalName}`);
  return true;
}

// ── Create 1:N relationship (creates lookup on referencing entity) ──────────

async function addLookup(token, referencingEntity, referencedEntity, lookupSchemaName, label, cascadeDelete = true) {
  const lname = lookupSchemaName.toLowerCase();
  if (await attrExists(token, referencingEntity, lname)) { skip(`Lookup ${referencingEntity}.${lname}`); return; }

  // Build the relationship + lookup attribute in one call
  await apiPost(token, 'RelationshipDefinitions', {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: `${referencingEntity}_${lookupSchemaName}`,
    ReferencedEntity: referencedEntity,
    ReferencingEntity: referencingEntity,
    ReferencedAttribute: `${referencedEntity}id`,
    CascadeConfiguration: {
      Assign: 'NoCascade', Reparent: 'NoCascade',
      Share: 'NoCascade', Unshare: 'NoCascade', Merge: 'NoCascade',
      Delete: cascadeDelete ? 'Cascade' : 'RemoveLink',
    },
    AssociatedMenuConfiguration: {
      Behavior: 'UseCollectionName', Group: 'Details', Label: null, Order: null,
    },
    Lookup: {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      SchemaName: lookupSchemaName, LogicalName: lname,
      RequiredLevel: { Value: 'ApplicationRequired' },
      DisplayName: lbl(label),
    },
  });
  ok(`Lookup ${referencingEntity}.${lname} → ${referencedEntity}`);
}

// ── Alternate key ─────────────────────────────────────────────────────────────

async function addAlternateKey(token, entity, keySchemaName, attributes) {
  try {
    await apiPost(token, `EntityDefinitions(LogicalName='${entity}')/Keys`, {
      SchemaName: keySchemaName,
      DisplayName: lbl(keySchemaName),
      KeyAttributes: attributes,
    });
    ok(`Alternate key ${keySchemaName} on ${entity}`);
  } catch (err) {
    // 0x80060893 = key already exists — treat as success
    if (err.message.includes('0x80060893')) { skip(`Alternate key ${keySchemaName} already exists`); return; }
    throw err;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== DFE Addenda Schema Provisioning ===\n');
  const token = await acquireToken();

  // ─── 1. qdb_info_card_screen ──────────────────────────────────────────────
  console.log('\n[1/5] qdb_info_card_screen');
  const created1 = await createEntity(token,
    'qdb_info_card_screen', 'Info Card Screen', 'Info Card Screens',
    'Pre-form read-only informational screen');
  if (created1) { await publishEntity(token, 'qdb_info_card_screen'); }

  await addLookup(token, 'qdb_info_card_screen', 'qdb_form_definition', 'qdb_form_definition_id', 'Form Definition', true);
  await addAttr(token, 'qdb_info_card_screen', intAttr('qdb_display_order', 'Display Order'));
  await addAttr(token, 'qdb_info_card_screen', strAttr('qdb_icon_url',      'Icon URL', 1000));
  await addAttr(token, 'qdb_info_card_screen', strAttr('qdb_icon_alt_text', 'Icon Alt Text', 200));
  await addAttr(token, 'qdb_info_card_screen', strAttr('qdb_heading',       'Heading', 120, true));
  await addAttr(token, 'qdb_info_card_screen', strAttr('qdb_sub_heading',   'Sub Heading', 300));

  // ─── 2. qdb_info_card_section ─────────────────────────────────────────────
  console.log('\n[2/5] qdb_info_card_section');
  const created2 = await createEntity(token,
    'qdb_info_card_section', 'Info Card Section', 'Info Card Sections',
    'Content group within an Info Card Screen');
  if (created2) { await publishEntity(token, 'qdb_info_card_section'); }

  await addLookup(token, 'qdb_info_card_section', 'qdb_info_card_screen', 'qdb_info_card_screen_id', 'Info Card Screen', true);
  await addAttr(token, 'qdb_info_card_section', intAttr('qdb_display_order', 'Display Order'));
  await addAttr(token, 'qdb_info_card_section', strAttr('qdb_section_title', 'Section Title', 100));
  await addAttr(token, 'qdb_info_card_section', picklistAttr('qdb_section_type', 'Section Type', [
    { value: 100000000, label: 'Numbered Steps' },
    { value: 100000001, label: 'Icon List' },
    { value: 100000002, label: 'Download List' },
  ]));
  await addAttr(token, 'qdb_info_card_section', strAttr('qdb_note_text', 'Note Text', 500));

  // ─── 3. qdb_info_card_item ────────────────────────────────────────────────
  console.log('\n[3/5] qdb_info_card_item');
  const created3 = await createEntity(token,
    'qdb_info_card_item', 'Info Card Item', 'Info Card Items',
    'Single line item within an Info Card Section');
  if (created3) { await publishEntity(token, 'qdb_info_card_item'); }

  await addLookup(token, 'qdb_info_card_item', 'qdb_info_card_section', 'qdb_info_card_section_id', 'Info Card Section', true);
  await addAttr(token, 'qdb_info_card_item', intAttr('qdb_display_order',    'Display Order'));
  await addAttr(token, 'qdb_info_card_item', strAttr('qdb_item_title',       'Item Title', 120, true));
  await addAttr(token, 'qdb_info_card_item', strAttr('qdb_item_description', 'Item Description', 500));
  await addAttr(token, 'qdb_info_card_item', strAttr('qdb_icon_reference',   'Icon Reference', 200));
  await addAttr(token, 'qdb_info_card_item', strAttr('qdb_download_url',     'Download URL', 1000));

  // ─── 4. qdb_info_card_view_record ─────────────────────────────────────────
  console.log('\n[4/5] qdb_info_card_view_record');
  const created4 = await createEntity(token,
    'qdb_info_card_view_record', 'Info Card View Record', 'Info Card View Records',
    'Tracks first-view per user per form for audit');
  if (created4) { await publishEntity(token, 'qdb_info_card_view_record'); }

  await addLookup(token, 'qdb_info_card_view_record', 'qdb_form_definition', 'qdb_form_definition_id', 'Form Definition', false);
  await addAttr(token, 'qdb_info_card_view_record', strAttr('qdb_user_aad_object_id', 'User AAD Object ID', 100, true));
  await addAttr(token, 'qdb_info_card_view_record', datetimeAttr('qdb_viewed_on', 'Viewed On'));
  await addAlternateKey(token, 'qdb_info_card_view_record',
    'qdb_InfoCardViewRecord_UserForm',
    ['qdb_form_definition_id', 'qdb_user_aad_object_id']);

  // ─── 5. qdb_grid_column_config ────────────────────────────────────────────
  console.log('\n[5/5] qdb_grid_column_config');
  const created5 = await createEntity(token,
    'qdb_grid_column_config', 'Grid Column Config', 'Grid Column Configs',
    'Column definition for an Interactive Grid field');
  if (created5) { await publishEntity(token, 'qdb_grid_column_config'); }

  await addLookup(token, 'qdb_grid_column_config', 'qdb_form_field', 'qdb_form_field_id', 'Form Field', true);
  await addAttr(token, 'qdb_grid_column_config', intAttr('qdb_display_order',      'Display Order'));
  await addAttr(token, 'qdb_grid_column_config', strAttr('qdb_column_label',       'Column Label', 100, true));
  await addAttr(token, 'qdb_grid_column_config', strAttr('qdb_column_attribute',   'Column Attribute', 100, true));
  await addAttr(token, 'qdb_grid_column_config', strAttr('qdb_column_field_type',  'Column Field Type', 50));
  await addAttr(token, 'qdb_grid_column_config', boolAttr('qdb_is_editable', 'Is Editable', false));
  await addAttr(token, 'qdb_grid_column_config', boolAttr('qdb_is_visible',  'Is Visible', true));

  // ─── Extend qdb_form_definition ───────────────────────────────────────────
  console.log('\n[Ext] qdb_form_definition');
  await addAttr(token, 'qdb_form_definition', boolAttr('qdb_allow_infocard_skip',           'Allow Info Card Skip', false));
  await addAttr(token, 'qdb_form_definition', boolAttr('qdb_infocard_counts_in_progress',   'Info Card Counts In Progress', false));

  // ─── Extend qdb_form_field ────────────────────────────────────────────────
  console.log('\n[Ext] qdb_form_field');
  await addAttr(token, 'qdb_form_field', strAttr('qdb_true_label',  'True Label', 100));
  await addAttr(token, 'qdb_form_field', strAttr('qdb_false_label', 'False Label', 100));
  await addAttr(token, 'qdb_form_field', picklistAttr('qdb_boolean_render_style', 'Boolean Render Style', [
    { value: 100000000, label: 'Toggle' },
    { value: 100000001, label: 'Radio' },
  ]));
  await addAttr(token, 'qdb_form_field', picklistAttr('qdb_grid_mode', 'Grid Mode', [
    { value: 100000000, label: 'Selection' },
    { value: 100000001, label: 'Entry' },
  ]));
  await addAttr(token, 'qdb_form_field', strAttr('qdb_grid_target_entity',          'Grid Target Entity', 100));
  await addAttr(token, 'qdb_form_field', strAttr('qdb_grid_saved_view_id',          'Grid Saved View ID', 100));
  await addAttr(token, 'qdb_form_field', picklistAttr('qdb_grid_selection_mode', 'Grid Selection Mode', [
    { value: 100000000, label: 'Single' },
    { value: 100000001, label: 'Multi' },
  ]));
  await addAttr(token, 'qdb_form_field', strAttr('qdb_grid_relationship_attribute', 'Grid Relationship Attribute', 100));
  await addAttr(token, 'qdb_form_field', intAttr('qdb_grid_max_rows', 'Grid Max Rows', false, 200, 1, 500));

  // ─── qdb_form_submission_draft (core entity + addenda fields) ────────────
  console.log('\n[6] qdb_form_submission_draft');
  const createdDraft = await createEntity(token,
    'qdb_form_submission_draft', 'Form Submission Draft', 'Form Submission Drafts',
    'Stores in-progress form data for resume later');
  if (createdDraft) { await publishEntity(token, 'qdb_form_submission_draft'); }
  // Core Phase 4 fields
  await addAttr(token, 'qdb_form_submission_draft', strAttr('qdb_form_definition_id', 'Form Definition ID', 100, true));
  await addAttr(token, 'qdb_form_submission_draft', strAttr('qdb_form_code',          'Form Code', 100, true));
  await addAttr(token, 'qdb_form_submission_draft', strAttr('qdb_user_id',            'User ID', 100, true));
  await addAttr(token, 'qdb_form_submission_draft', strAttr('qdb_user_display_name',  'User Display Name', 200));
  await addAttr(token, 'qdb_form_submission_draft', strAttr('qdb_form_data_json',     'Form Data JSON', 4000));
  await addAttr(token, 'qdb_form_submission_draft', intAttr('qdb_current_tab_index',  'Current Tab Index', false, null, 0, 999));
  await addAttr(token, 'qdb_form_submission_draft', datetimeAttr('qdb_saved_at',      'Saved At'));
  await addAttr(token, 'qdb_form_submission_draft', datetimeAttr('qdb_expires_at',    'Expires At'));
  // Addenda fields
  await addAttr(token, 'qdb_form_submission_draft', strAttr('qdb_grid_schema_hash',   'Grid Schema Hash', 500));
  await addAttr(token, 'qdb_form_submission_draft', boolAttr('qdb_info_card_viewed',  'Info Card Viewed', false));

  // ─── Final publish ────────────────────────────────────────────────────────
  console.log('\n[Publish] Final publish...');
  await publishAll(token);

  console.log('\n=== Complete ✓ ===\n');
}

main().catch(err => {
  console.error('\n✗ Fatal:', err.message);
  process.exit(1);
});
