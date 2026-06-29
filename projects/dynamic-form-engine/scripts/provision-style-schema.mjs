// provision-style-schema.mjs — DFE-STYLE-001 Dataverse schema provisioning.
//
// Creates the 56 new attributes across 5 existing design entities, the 2 new
// entities (qdb_layout_grid, qdb_css_allowlist_config), the two lookup
// relationships on qdb_layout_grid, and seeds the default CSS allowlist record.
// Idempotent: existing attributes/entities/records are detected and skipped.
//
// Deployment order (see DEPLOYMENT-RUNBOOK-style.md / arch C-004):
//   This script is Step 1+2 of the runbook (schema + seed). Run it BEFORE
//   deploying the code that reads the new attributes. All new attributes are
//   optional/nullable, so this is a zero-downtime additive change.
//
// Run:
//   node --env-file=scripts/.env scripts/provision-style-schema.mjs
//   node --env-file=scripts/.env scripts/provision-style-schema.mjs --dry-run
//
// Required .env entry: DV_CLIENT_SECRET=<service-principal-secret>

const DV_CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
if (!DV_CLIENT_SECRET) {
  throw new Error('DV_CLIENT_SECRET not set. Run with: node --env-file=scripts/.env scripts/provision-style-schema.mjs');
}

const DRY_RUN = process.argv.includes('--dry-run');

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION_NAME = 'QdbDynamicFormEngine';   // solution the existing design entities live in
const PUBLISHER_PREFIX = 'qdb';
const LANG = 1033;

// ── Auth ────────────────────────────────────────────────────────────────────
async function acquireToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: CLIENT_ID,
    client_secret: DV_CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
  });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) throw new Error(`Token request failed ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

function headers(token, metadata = false) {
  const h = {
    Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
    Accept: 'application/json', 'Content-Type': 'application/json',
  };
  if (metadata) { h['MSCRM.SolutionUniqueName'] = SOLUTION_NAME; h['Consistency'] = 'Strong'; }
  return h;
}

async function apiGet(token, path) {
  const res = await fetch(`${API_BASE}/${path}`, { headers: headers(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost(token, path, payload, metadata = true) {
  if (DRY_RUN) { console.log(`  [dry-run] POST ${path}`); return {}; }
  const res = await fetch(`${API_BASE}/${path}`, { method: 'POST', headers: headers(token, metadata), body: JSON.stringify(payload) });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

// ── Metadata builders ─────────────────────────────────────────────────────────
const label = (text) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: LANG }] });
const schemaName = (logical) => logical.split('_').map((p, i) => i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)).join('_');

function strAttr(logical, display, maxLength) {
  return { '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', SchemaName: schemaName(logical), MaxLength: maxLength,
    FormatName: { Value: 'Text' }, RequiredLevel: { Value: 'None' }, DisplayName: label(display) };
}
function memoAttr(logical, display, maxLength) {
  return { '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', SchemaName: schemaName(logical), MaxLength: maxLength,
    RequiredLevel: { Value: 'None' }, DisplayName: label(display) };
}
function boolAttr(logical, display, defaultValue) {
  return { '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata', SchemaName: schemaName(logical), DefaultValue: defaultValue,
    RequiredLevel: { Value: 'None' }, DisplayName: label(display),
    OptionSet: { '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
      TrueOption: { Value: 1, Label: label('Yes') }, FalseOption: { Value: 0, Label: label('No') } } };
}
function intAttr(logical, display, min, max) {
  return { '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata', SchemaName: schemaName(logical), MinValue: min, MaxValue: max,
    Format: 'None', RequiredLevel: { Value: 'None' }, DisplayName: label(display) };
}
function pickAttr(logical, display, options) {
  return { '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata', SchemaName: schemaName(logical),
    RequiredLevel: { Value: 'None' }, DisplayName: label(display),
    OptionSet: { '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata', IsGlobal: false, OptionSetType: 'Picklist',
      Options: options.map(([text, value]) => ({ Value: value, Label: label(text) })) } };
}

// ── Schema definition: 56 new attributes across 5 existing entities ────────────
const EXTENDED = {
  qdb_theme: [
    strAttr('qdb_theme_code', 'Theme Code', 100),
    strAttr('qdb_surface_color', 'Surface Color', 7),
    strAttr('qdb_text_primary_color', 'Text Primary Color', 7),
    strAttr('qdb_text_secondary_color', 'Text Secondary Color', 7),
    strAttr('qdb_border_color', 'Border Color', 7),
    strAttr('qdb_error_color', 'Error Color', 7),
    strAttr('qdb_success_color', 'Success Color', 7),
    strAttr('qdb_warning_color', 'Warning Color', 7),
    strAttr('qdb_font_url', 'Font URL', 2048),
    strAttr('qdb_heading_font_size', 'Heading Font Size', 10),
    strAttr('qdb_label_font_size', 'Label Font Size', 10),
    strAttr('qdb_input_font_size', 'Input Font Size', 10),
    pickAttr('qdb_shadow_style', 'Shadow Style', [['None', 100000000], ['Subtle', 100000001], ['Strong', 100000002]]),
    pickAttr('qdb_spacing_scale', 'Spacing Scale', [['Compact', 100000000], ['Normal', 100000001], ['Comfortable', 100000002]]),
    boolAttr('qdb_is_dark_mode', 'Is Dark Mode', false),
    boolAttr('qdb_is_active', 'Is Active', true),
  ],
  qdb_form_design: [
    pickAttr('qdb_layout_type', 'Layout Type', [['SingleColumn', 100000001], ['TwoColumn', 100000002], ['Grid', 100000003], ['Stepper', 100000004], ['Wizard', 100000005], ['Accordion', 100000006], ['TabBased', 100000007], ['InlineCompact', 100000008]]),
    pickAttr('qdb_label_position', 'Label Position', [['Top', 100000001], ['Left', 100000002], ['Floating', 100000003]]),
    pickAttr('qdb_section_style', 'Section Style', [['Card', 100000001], ['Flat', 100000002], ['Outlined', 100000003]]),
    pickAttr('qdb_form_button_style', 'Button Style', [['Primary', 100000001], ['Outline', 100000002], ['Text', 100000003]]),
    boolAttr('qdb_animation_enabled', 'Animation Enabled', true),
    memoAttr('qdb_responsive_behavior_json', 'Responsive Behavior JSON', 4000),
    strAttr('qdb_max_width', 'Max Width', 20),
    pickAttr('qdb_alignment', 'Alignment', [['Left', 100000001], ['Center', 100000002], ['Right', 100000003]]),
    boolAttr('qdb_sticky_action_bar', 'Sticky Action Bar', false),
    boolAttr('qdb_skeleton_loader_enabled', 'Skeleton Loader Enabled', false),
    boolAttr('qdb_form_design_is_active', 'Is Active', true),
  ],
  qdb_section_design: [
    strAttr('qdb_background_color', 'Background Color', 7),
    strAttr('qdb_border_style', 'Border Style', 100),
    strAttr('qdb_padding', 'Padding', 20),
    strAttr('qdb_margin', 'Margin', 20),
    pickAttr('qdb_section_column_layout', 'Column Layout', [['1', 100000001], ['2', 100000002], ['3', 100000003], ['4', 100000004]]),
    pickAttr('qdb_card_style', 'Card Style', [['Flat', 100000001], ['Elevated', 100000002], ['Outlined', 100000003]]),
    pickAttr('qdb_collapsible_style', 'Collapsible Style', [['None', 100000000], ['Animated', 100000001], ['Instant', 100000002]]),
    memoAttr('qdb_header_style_json', 'Header Style JSON', 2000),
    pickAttr('qdb_visibility_animation', 'Visibility Animation', [['None', 100000000], ['Fade', 100000001], ['Slide', 100000002]]),
    boolAttr('qdb_section_is_active', 'Is Active', true),
  ],
  // qdb_label_style / qdb_input_style already exist (content-format change only) — not created here.
  qdb_field_design: [
    pickAttr('qdb_field_width', 'Field Width', [['Full', 100000001], ['Half', 100000002], ['Custom', 100000003]]),
    strAttr('qdb_custom_width', 'Custom Width', 20),
    strAttr('qdb_field_height', 'Field Height', 20),
    memoAttr('qdb_placeholder_style_json', 'Placeholder Style JSON', 1000),
    strAttr('qdb_icon_prefix', 'Icon Prefix', 100),
    strAttr('qdb_icon_suffix', 'Icon Suffix', 100),
    memoAttr('qdb_tooltip_style_json', 'Tooltip Style JSON', 1000),
    memoAttr('qdb_error_style_json', 'Error Style JSON', 1000),
    memoAttr('qdb_focus_style_json', 'Focus Style JSON', 1000),
    memoAttr('qdb_disabled_style_json', 'Disabled Style JSON', 1000),
    boolAttr('qdb_field_is_active', 'Is Active', true),
  ],
  qdb_button_design: [
    strAttr('qdb_button_color', 'Button Color', 7),
    pickAttr('qdb_button_size', 'Button Size', [['Small', 100000001], ['Medium', 100000002], ['Large', 100000003]]),
    strAttr('qdb_button_border_radius', 'Button Border Radius', 20),
    pickAttr('qdb_button_alignment', 'Button Alignment', [['Left', 100000001], ['Center', 100000002], ['Right', 100000003]]),
    strAttr('qdb_button_icon', 'Button Icon', 100),
    pickAttr('qdb_hover_effect', 'Hover Effect', [['None', 100000000], ['Elevate', 100000001], ['ColorShift', 100000002]]),
    pickAttr('qdb_loading_style', 'Loading Style', [['Spinner', 100000001], ['Dots', 100000002], ['Pulse', 100000003]]),
    boolAttr('qdb_button_is_active', 'Is Active', true),
  ],
};

async function attributeExists(token, entity, logical) {
  const r = await apiGet(token, `EntityDefinitions(LogicalName='${entity}')/Attributes?$select=LogicalName&$filter=LogicalName eq '${logical}'`);
  return !!(r && r.value && r.value.length);
}
async function entityExists(token, logical) {
  const r = await apiGet(token, `EntityDefinitions(LogicalName='${logical}')?$select=LogicalName`);
  return !!r;
}
// Granularly idempotent: create the attribute only when it is genuinely absent.
async function ensureAttribute(token, entity, meta) {
  const logical = meta.SchemaName.toLowerCase();
  if (await attributeExists(token, entity, logical)) { console.log(`  skip  ${entity}.${logical} (exists)`); return false; }
  await apiPost(token, `EntityDefinitions(LogicalName='${entity}')/Attributes`, meta);
  console.log(`  +     ${entity}.${logical}`); return true;
}

async function createExtendedAttributes(token) {
  let created = 0, skipped = 0;
  for (const [entity, attrs] of Object.entries(EXTENDED)) {
    console.log(`\n-- ${entity} (${attrs.length} attrs) --`);
    for (const meta of attrs) {
      const logical = meta.SchemaName.toLowerCase();
      if (await attributeExists(token, entity, logical)) { console.log(`  skip  ${logical} (exists)`); skipped++; continue; }
      await apiPost(token, `EntityDefinitions(LogicalName='${entity}')/Attributes`, meta);
      console.log(`  +     ${logical}`); created++;
    }
  }
  return { created, skipped };
}

// ── New entity: qdb_layout_grid ────────────────────────────────────────────────
// NOTE: this entity already exists in org5869857f (provisioned by DFE-ADD) with
// columns_total, span_mobile/tablet/desktop, both lookups, and an active flag
// named qdb_is_active. This function is written idempotently: it creates the
// entity only if absent, then ensures each attribute/lookup individually, so it
// is a no-op against the current org and correct against a fresh environment.
async function createLayoutGridEntity(token) {
  if (!(await entityExists(token, 'qdb_layout_grid'))) {
    console.log('\n-- creating qdb_layout_grid --');
    await apiPost(token, 'EntityDefinitions', {
      '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
      SchemaName: 'qdb_LayoutGrid', DisplayName: label('Layout Grid'), DisplayCollectionName: label('Layout Grids'),
      OwnershipType: 'OrganizationOwned', HasActivities: false, HasNotes: false, IsActivity: false,
      Attributes: [{ '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', SchemaName: 'qdb_Name',
        MaxLength: 200, FormatName: { Value: 'Text' }, RequiredLevel: { Value: 'ApplicationRequired' },
        IsPrimaryName: true, DisplayName: label('Name') }],
    });
  } else { console.log('\n-- qdb_layout_grid exists; ensuring attributes/lookups --'); }

  for (const meta of [
    intAttr('qdb_columns_total', 'Columns Total', 1, 12),
    intAttr('qdb_span_mobile', 'Span Mobile', 1, 12),
    intAttr('qdb_span_tablet', 'Span Tablet', 1, 12),
    intAttr('qdb_span_desktop', 'Span Desktop', 1, 12),
    boolAttr('qdb_is_active', 'Is Active', true),  // matches the existing DFE-ADD attribute name
  ]) await ensureAttribute(token, 'qdb_layout_grid', meta);

  // N:1 lookups → qdb_form_design and qdb_form_field. Skip if the lookup attribute already exists.
  for (const target of ['qdb_form_design', 'qdb_form_field']) {
    const lookupLogical = `${target}_id`;
    if (await attributeExists(token, 'qdb_layout_grid', lookupLogical)) { console.log(`  skip  lookup ${lookupLogical} (exists)`); continue; }
    const rel = `qdb_${target.replace('qdb_', '')}_layoutgrid`;
    await apiPost(token, 'RelationshipDefinitions', {
      '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
      SchemaName: rel, ReferencedEntity: target, ReferencingEntity: 'qdb_layout_grid',
      CascadeConfiguration: { Assign: 'NoCascade', Delete: 'RemoveLink', Merge: 'NoCascade', Reparent: 'NoCascade', Share: 'NoCascade', Unshare: 'NoCascade' },
      Lookup: { '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
        SchemaName: lookupLogical, RequiredLevel: { Value: 'ApplicationRequired' }, DisplayName: label(target === 'qdb_form_design' ? 'Form Design' : 'Form Field') },
    });
    console.log(`  +     relationship ${rel} (lookup ${lookupLogical})`);
  }
}

// ── New entity: qdb_css_allowlist_config ───────────────────────────────────────
async function createAllowlistEntity(token) {
  if (!(await entityExists(token, 'qdb_css_allowlist_config'))) {
    console.log('\n-- creating qdb_css_allowlist_config --');
    await apiPost(token, 'EntityDefinitions', {
      '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
      SchemaName: 'qdb_CssAllowlistConfig', DisplayName: label('CSS Allowlist Config'), DisplayCollectionName: label('CSS Allowlist Configs'),
      OwnershipType: 'OrganizationOwned', HasActivities: false, HasNotes: false, IsActivity: false,
      Attributes: [{ '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', SchemaName: 'qdb_ConfigKey',
        MaxLength: 100, FormatName: { Value: 'Text' }, RequiredLevel: { Value: 'ApplicationRequired' },
        IsPrimaryName: true, DisplayName: label('Config Key') }],
    });
  } else { console.log('\n-- qdb_css_allowlist_config exists; ensuring attributes --'); }

  for (const meta of [
    memoAttr('qdb_allowed_domains_json', 'Allowed Domains JSON', 8000),
    boolAttr('qdb_is_active', 'Is Active', true),
    memoAttr('qdb_notes', 'Notes', 2000),
  ]) await ensureAttribute(token, 'qdb_css_allowlist_config', meta);
}

// ── Seed the default allowlist record (SC-01 / runbook step 2) ──────────────────
async function seedAllowlist(token) {
  const existing = await apiGet(token, `qdb_css_allowlist_configs?$filter=qdb_configkey eq 'default'&$select=qdb_css_allowlist_configid`);
  if (existing && existing.value && existing.value.length) { console.log('\n-- allowlist seed: default record exists, skipping --'); return; }
  console.log('\n-- seeding qdb_css_allowlist_config default record --');
  // Conservative starter set; QDB IT/Brand expand per OQ-007.
  const domains = ['fonts.googleapis.com', 'fonts.gstatic.com'];
  await apiPost(token, 'qdb_css_allowlist_configs', {
    qdb_configkey: 'default', qdb_is_active: true,
    qdb_allowed_domains_json: JSON.stringify(domains),
    qdb_notes: 'Initial approved CDN domains for customCss url() and ThemeDefinition.fontUrl. Expand per OQ-007 (QDB Brand confirmation).',
  }, false);
  console.log(`  + default record (domains: ${domains.join(', ')})`);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`DFE-STYLE-001 schema provisioning${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`Org: ${DATAVERSE_URL}  Solution: ${SOLUTION_NAME}\n${'─'.repeat(56)}`);
  const token = await acquireToken();

  const ext = await createExtendedAttributes(token);
  await createLayoutGridEntity(token);
  await createAllowlistEntity(token);
  await seedAllowlist(token);

  console.log(`\n${'─'.repeat(56)}`);
  console.log(`Extended attributes: ${ext.created} created, ${ext.skipped} skipped (already present).`);
  console.log('Entities: qdb_layout_grid ensured (pre-exists in org5869857f from DFE-ADD);');
  console.log('          qdb_css_allowlist_config created (net-new) + its attributes.');
  console.log('Allowlist default record seeded.');
  console.log('\nNEXT (runbook): add the security role, then publish all customizations,');
  console.log('then deploy the application code and the qdb_form_runtime.html web resource.');
}

run().catch((e) => { console.error('\nPROVISIONING FAILED:', e.message); process.exit(1); });
