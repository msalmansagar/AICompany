'use strict';

const msal  = require('@azure/msal-node');
const fetch = require('node-fetch');

const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '51f81489-12ee-4a9e-aaae-a2591f45987d'; // public CRM client (device code)
const DATAVERSE = 'https://org5869857f.crm4.dynamics.com';
const API       = `${DATAVERSE}/api/data/v9.2`;
const LANG      = 1033;

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function getToken() {
  const pca = new msal.PublicClientApplication({
    auth: { clientId: CLIENT_ID, authority: `https://login.microsoftonline.com/${TENANT_ID}` }
  });
  const result = await pca.acquireTokenByDeviceCode({
    scopes: [`${DATAVERSE}/.default`],
    deviceCodeCallback: (r) => console.log('\n' + r.message + '\n')
  });
  return result.accessToken;
}

// ─── HTTP ──────────────────────────────────────────────────────────────────────

async function api(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Metadata helpers ──────────────────────────────────────────────────────────

const lbl = (text) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: LANG }]
});

const req = (level) => ({ Value: level, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' });

function str(schemaName, display, maxLen, required, isPrimary = false) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    DisplayName: lbl(display), RequiredLevel: req(required ? 'ApplicationRequired' : 'None'),
    MaxLength: maxLen, Format: 'Text', IsPrimaryName: isPrimary
  };
}

function memo(schemaName, display, maxLen) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    DisplayName: lbl(display), RequiredLevel: req('None'),
    Format: 'TextArea', MaxLength: maxLen || 1048576
  };
}

function int(schemaName, display, required, min, max) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    DisplayName: lbl(display), RequiredLevel: req(required ? 'ApplicationRequired' : 'None'),
    Format: 'None', MinValue: min ?? 0, MaxValue: max ?? 9999
  };
}

function bool(schemaName, display, defaultVal) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    DisplayName: lbl(display), RequiredLevel: req('ApplicationRequired'),
    DefaultValue: defaultVal,
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
      TrueOption:  { Value: 1, Label: lbl('Yes') },
      FalseOption: { Value: 0, Label: lbl('No')  }
    }
  };
}

function picklist(schemaName, display, options, defaultValue, required = true) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    DisplayName: lbl(display), RequiredLevel: req(required ? 'ApplicationRequired' : 'None'),
    DefaultFormValue: defaultValue,
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
      IsGlobal: false, OptionSetType: 'Picklist',
      Options: options.map(([v, l]) => ({ Value: v, Label: lbl(l) }))
    }
  };
}

function entity(schemaName, displayName, pluralName, primaryAttr, attributes) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: schemaName,
    DisplayName: lbl(displayName),
    DisplayCollectionName: lbl(pluralName),
    OwnershipType: 'OrganizationOwned',
    IsActivity: false, HasNotes: false, HasActivities: false,
    PrimaryNameAttribute: primaryAttr.toLowerCase(),
    Attributes: attributes
  };
}

// ─── Design entity definitions ────────────────────────────────────────────────

// Choice option shorthand
const SHADOW      = [[100000001,'None'],[100000002,'Subtle'],[100000003,'Strong']];
const SPACING     = [[100000001,'Compact'],[100000002,'Normal'],[100000003,'Comfortable']];
const LAYOUT_TYPE = [[100000001,'SingleColumn'],[100000002,'TwoColumn'],[100000003,'Grid'],
                     [100000004,'Stepper'],[100000005,'Wizard'],[100000006,'Accordion'],
                     [100000007,'TabBased'],[100000008,'InlineCompact']];
const LABEL_POS   = [[100000001,'Top'],[100000002,'Left'],[100000003,'Floating']];
const SEC_STYLE   = [[100000001,'Card'],[100000002,'Flat'],[100000003,'Outlined']];
const TAB_STYLE   = [[100000001,'Tabs'],[100000002,'Stepper'],[100000003,'Accordion']];
const BTN_STYLE   = [[100000001,'Primary'],[100000002,'Outline'],[100000003,'Text']];
const ALIGN       = [[100000001,'Left'],[100000002,'Center'],[100000003,'Right']];
const COL_LAYOUT  = [[100000001,'One'],[100000002,'Two'],[100000003,'Three'],[100000004,'Four']];
const CARD_STYLE  = [[100000001,'Flat'],[100000002,'Elevated'],[100000003,'Outlined']];
const COLLAPSE    = [[100000001,'None'],[100000002,'Animated'],[100000003,'Instant']];
const VIS_ANIM    = [[100000001,'None'],[100000002,'Fade'],[100000003,'Slide']];
const INPUT_STYLE = [[100000001,'Outlined'],[100000002,'Filled'],[100000003,'Standard']];
const FIELD_WIDTH = [[100000001,'Full'],[100000002,'Half'],[100000003,'Custom']];
const BTN_TYPE    = [[100000001,'Submit'],[100000002,'SaveDraft'],[100000003,'Cancel']];
const BTN_SIZE    = [[100000001,'Small'],[100000002,'Medium'],[100000003,'Large']];
const HOVER_EFX   = [[100000001,'None'],[100000002,'Elevate'],[100000003,'ColorShift']];
const LOADING     = [[100000001,'Spinner'],[100000002,'Dots'],[100000003,'Pulse']];

const DESIGN_ENTITIES = [

  // ── qdb_theme ─────────────────────────────────────────────────────────────
  entity('qdb_theme', 'Form Theme', 'Form Themes', 'qdb_theme_name', [
    str('qdb_theme_name',         'Theme Name',           100,  true,  true),
    str('qdb_theme_code',         'Theme Code',           100,  true),
    str('qdb_primary_color',      'Primary Color',        20,   true),
    str('qdb_secondary_color',    'Secondary Color',      20,   false),
    str('qdb_background_color',   'Background Color',     20,   false),
    str('qdb_surface_color',      'Surface Color',        20,   false),
    str('qdb_text_primary_color', 'Text Primary Color',   20,   false),
    str('qdb_text_secondary_color','Text Secondary Color',20,   false),
    str('qdb_border_color',       'Border Color',         20,   false),
    str('qdb_error_color',        'Error Color',          20,   false),
    str('qdb_success_color',      'Success Color',        20,   false),
    str('qdb_warning_color',      'Warning Color',        20,   false),
    str('qdb_font_family',        'Font Family',          200,  false),
    str('qdb_font_url',           'Font URL',             500,  false),
    str('qdb_base_font_size',     'Base Font Size',       10,   false),
    str('qdb_heading_font_size',  'Heading Font Size',    10,   false),
    str('qdb_label_font_size',    'Label Font Size',      10,   false),
    str('qdb_input_font_size',    'Input Font Size',      10,   false),
    str('qdb_border_radius',      'Border Radius',        10,   false),
    picklist('qdb_shadow_style',  'Shadow Style',  SHADOW,  100000002, false),
    picklist('qdb_spacing_scale', 'Spacing Scale', SPACING, 100000002, false),
    bool('qdb_is_dark_mode', 'Is Dark Mode', false),
    bool('qdb_is_active',    'Is Active',    true)
  ]),

  // ── qdb_form_design ───────────────────────────────────────────────────────
  entity('qdb_form_design', 'Form Design', 'Form Designs', 'qdb_name', [
    str('qdb_name',           'Name',          200, true, true),
    picklist('qdb_layout_type',    'Layout Type',    LAYOUT_TYPE, 100000001),
    picklist('qdb_label_position', 'Label Position', LABEL_POS,   100000001),
    picklist('qdb_section_style',  'Section Style',  SEC_STYLE,   100000002),
    picklist('qdb_tab_style',      'Tab Style',      TAB_STYLE,   100000001),
    picklist('qdb_button_style',   'Button Style',   BTN_STYLE,   100000001),
    picklist('qdb_alignment',      'Alignment',      ALIGN,       100000001),
    bool('qdb_animation_enabled',      'Animation Enabled',      false),
    bool('qdb_sticky_action_bar',      'Sticky Action Bar',      false),
    bool('qdb_skeleton_loader_enabled','Skeleton Loader Enabled', true),
    bool('qdb_is_active',              'Is Active',               true),
    str('qdb_max_width', 'Max Width', 20, false),
    memo('qdb_responsive_behavior', 'Responsive Behavior', 2000),
    memo('qdb_custom_css',          'Custom CSS',          65536)
  ]),

  // ── qdb_section_design ────────────────────────────────────────────────────
  entity('qdb_section_design', 'Section Design', 'Section Designs', 'qdb_name', [
    str('qdb_name',           'Name',             200, true,  true),
    str('qdb_background_color','Background Color', 20,  false),
    str('qdb_border_style',   'Border Style',      100, false),
    str('qdb_padding',        'Padding',           50,  false),
    str('qdb_margin',         'Margin',            50,  false),
    picklist('qdb_column_layout',       'Column Layout',      COL_LAYOUT, 100000002),
    picklist('qdb_card_style',          'Card Style',         CARD_STYLE, 100000001),
    picklist('qdb_collapsible_style',   'Collapsible Style',  COLLAPSE,   100000001),
    picklist('qdb_visibility_animation','Visibility Animation',VIS_ANIM,  100000001),
    bool('qdb_is_active', 'Is Active', true),
    memo('qdb_header_style', 'Header Style', 2000)
  ]),

  // ── qdb_field_design ──────────────────────────────────────────────────────
  entity('qdb_field_design', 'Field Design', 'Field Designs', 'qdb_name', [
    str('qdb_name',         'Name',         200, true, true),
    picklist('qdb_input_style','Input Style', INPUT_STYLE, 100000001),
    picklist('qdb_width',      'Width',       FIELD_WIDTH, 100000001),
    bool('qdb_is_active', 'Is Active', true),
    str('qdb_custom_width',  'Custom Width',  20,  false),
    str('qdb_height',        'Height',        20,  false),
    str('qdb_icon_prefix',   'Icon Prefix',   100, false),
    str('qdb_icon_suffix',   'Icon Suffix',   100, false),
    memo('qdb_label_style',       'Label Style',       2000),
    memo('qdb_placeholder_style', 'Placeholder Style', 2000),
    memo('qdb_tooltip_style',     'Tooltip Style',     2000),
    memo('qdb_error_style',       'Error Style',       2000),
    memo('qdb_focus_style',       'Focus Style',       2000),
    memo('qdb_disabled_style',    'Disabled Style',    2000)
  ]),

  // ── qdb_button_design ─────────────────────────────────────────────────────
  entity('qdb_button_design', 'Button Design', 'Button Designs', 'qdb_name', [
    str('qdb_name', 'Name', 200, true, true),
    picklist('qdb_button_type',  'Button Type',   BTN_TYPE, 100000001),
    picklist('qdb_size',         'Size',          BTN_SIZE, 100000002),
    picklist('qdb_alignment',    'Alignment',     ALIGN,    100000001),
    picklist('qdb_hover_effect', 'Hover Effect',  HOVER_EFX,100000001),
    picklist('qdb_loading_style','Loading Style', LOADING,  100000001),
    bool('qdb_is_active', 'Is Active', true),
    str('qdb_color',        'Color',        20,  false),
    str('qdb_border_radius','Border Radius',10,  false),
    str('qdb_icon',         'Icon',         100, false)
  ]),

  // ── qdb_layout_grid ───────────────────────────────────────────────────────
  entity('qdb_layout_grid', 'Layout Grid', 'Layout Grids', 'qdb_name', [
    str('qdb_name', 'Name', 200, true, true),
    int('qdb_columns_total', 'Columns Total', true,  1, 12),
    int('qdb_span_mobile',   'Span Mobile',   true,  1, 12),
    int('qdb_span_tablet',   'Span Tablet',   true,  1, 12),
    int('qdb_span_desktop',  'Span Desktop',  true,  1, 12),
    bool('qdb_is_active', 'Is Active', true)
  ])
];

// ─── Relationship builders ────────────────────────────────────────────────────

function cascade(deleteType = 'Cascade') {
  const del = deleteType === 'NoCascade' ? 'RemoveLink' : deleteType;
  return { Assign: 'NoCascade', Delete: del, Merge: 'NoCascade', Reparent: 'NoCascade', Share: 'NoCascade', Unshare: 'NoCascade' };
}

function rel(schemaName, parent, child, lookupSchema, lookupDisplay, deleteType = 'Cascade', required = true) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: schemaName,
    ReferencedEntity: parent,
    ReferencingEntity: child,
    CascadeConfiguration: cascade(deleteType),
    Lookup: {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      SchemaName: lookupSchema,
      DisplayName: lbl(lookupDisplay),
      RequiredLevel: req(required ? 'ApplicationRequired' : 'None')
    }
  };
}

const DESIGN_RELATIONSHIPS = [
  // qdb_theme is referenced by qdb_form_design (optional — null = use global active theme)
  rel('qdb_theme_formdesign',       'qdb_theme',            'qdb_form_design',    'qdb_theme_id',          'Theme',           'NoCascade', false),

  // qdb_form_definition links to qdb_form_design (optional — null = global default design)
  rel('qdb_formdef_formdesign',     'qdb_form_definition',  'qdb_form_design',    'qdb_form_definition_id','Form Definition', 'NoCascade', false),

  // qdb_form_section links to qdb_section_design (one section, one design record)
  rel('qdb_formsection_sectiondesign','qdb_form_section',   'qdb_section_design', 'qdb_form_section_id',   'Form Section',    'NoCascade', false),

  // qdb_form_field links to qdb_field_design (one field, one design record)
  rel('qdb_formfield_fielddesign',  'qdb_form_field',       'qdb_field_design',   'qdb_form_field_id',     'Form Field',      'NoCascade', false),

  // qdb_form_definition links to qdb_button_design (one form def, 3 button designs: Submit/SaveDraft/Cancel)
  rel('qdb_formdef_buttondesign',   'qdb_form_definition',  'qdb_button_design',  'qdb_form_definition_id','Form Definition', 'Cascade',   true),

  // qdb_form_design links to qdb_layout_grid (one form design, many grid configs)
  rel('qdb_formdesign_layoutgrid',  'qdb_form_design',      'qdb_layout_grid',    'qdb_form_design_id',    'Form Design',     'Cascade',   true),

  // qdb_form_field links to qdb_layout_grid (which field this grid row controls)
  rel('qdb_formfield_layoutgrid',   'qdb_form_field',       'qdb_layout_grid',    'qdb_form_field_id',     'Form Field',      'NoCascade', true)
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function entityExists(token, schemaName) {
  try {
    const r = await api(token, 'GET', `/EntityDefinitions?$filter=SchemaName eq '${schemaName}'&$select=SchemaName`);
    return r.value && r.value.length > 0;
  } catch { return false; }
}

async function relationshipExists(token, schemaName) {
  try {
    const r = await api(token, 'GET', `/RelationshipDefinitions?$filter=SchemaName eq '${schemaName}'&$select=SchemaName`);
    return r.value && r.value.length > 0;
  } catch { return false; }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  QDB Dynamic Form Engine — UI Design Engine Table Provisioner');
  console.log('  Creates 6 new design tables + 7 relationships');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const token = await getToken();
  console.log('✓ Authenticated\n');

  // ── Step 1: Create entities ──────────────────────────────────────────────
  console.log('─── Step 1: Creating Tables ─────────────────────────────────');
  let entityPass = 0, entityFail = 0;

  for (const def of DESIGN_ENTITIES) {
    const name = def.SchemaName;
    process.stdout.write(`  ${name}... `);
    try {
      if (await entityExists(token, name)) {
        console.log('already exists — skipped');
      } else {
        await api(token, 'POST', '/EntityDefinitions', def);
        console.log('✓ created');
        entityPass++;
        await sleep(500);
      }
    } catch (e) {
      console.log(`✗ FAILED\n    ${e.message.slice(0, 300)}`);
      entityFail++;
    }
  }

  if (entityFail > 0) {
    console.log(`\n✗ ${entityFail} table(s) failed — fix errors before proceeding.\n`);
    process.exit(1);
  }

  // ── Step 2: Wait for Dataverse to publish ────────────────────────────────
  process.stdout.write('\nWaiting 60 s for Dataverse to finish publishing tables...');
  await sleep(60000);
  console.log(' done\n');

  // ── Step 3: Create relationships (with retry) ────────────────────────────
  console.log('─── Step 2: Creating Relationships ──────────────────────────');
  let relPass = 0, relFail = 0;

  for (const r of DESIGN_RELATIONSHIPS) {
    process.stdout.write(`  ${r.SchemaName}... `);

    if (await relationshipExists(token, r.SchemaName)) {
      console.log('already exists — skipped');
      continue;
    }

    let succeeded = false;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        await api(token, 'POST', '/RelationshipDefinitions', r);
        console.log('✓');
        relPass++;
        succeeded = true;
        await sleep(2000);
        break;
      } catch (e) {
        const msg = e.message;
        const isDuplicate = msg.includes('already exists') || msg.includes('0x80048404') ||
                            msg.includes('duplicate') || msg.includes('0x80072551') ||
                            msg.includes('not unique');
        if (isDuplicate) {
          console.log('already exists — skipped');
          succeeded = true;
          break;
        }
        const isTransient = msg.includes('ENOTFOUND') || msg.includes('ECONNRESET') ||
                            msg.includes('0x80044151') || msg.includes('0x80071151') ||
                            msg.includes('timeout') || msg.includes('429');
        if (isTransient && attempt < 4) {
          const delay = attempt * 15000;
          process.stdout.write(`retrying in ${delay / 1000}s... `);
          await sleep(delay);
        } else {
          console.log(`✗ FAILED (attempt ${attempt})\n    ${msg.slice(0, 300)}`);
          if (!succeeded) relFail++;
        }
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log(`  Tables        : ${entityPass} created, ${entityFail} failed`);
  console.log(`  Relationships : ${relPass} created, ${relFail} failed`);
  if (entityFail === 0 && relFail === 0) {
    console.log('\n  ✅ All done.');
    console.log('  Next step: run seed-design-data.js to seed Light / Dark / Corporate themes.');
    console.log('  Then publish customizations:');
    console.log('  Settings → Customizations → Publish All Customizations');
  } else {
    console.log('\n  ⚠  Some steps failed. Review errors above and re-run — script is idempotent.');
  }
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(e => { console.error('\nFatal:', e.message); process.exit(1); });
