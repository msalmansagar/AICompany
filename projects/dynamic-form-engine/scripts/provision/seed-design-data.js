'use strict';

const msal  = require('@azure/msal-node');
const fetch = require('node-fetch');

const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '51f81489-12ee-4a9e-aaae-a2591f45987d';
const DATAVERSE = 'https://org5869857f.crm4.dynamics.com';
const API       = `${DATAVERSE}/api/data/v9.2`;

// ─── Picklist codes (must match create-design-tables.js) ─────────────────────
const SHADOW      = { None: 100000001, Subtle: 100000002, Strong: 100000003 };
const SPACING     = { Compact: 100000001, Normal: 100000002, Comfortable: 100000003 };
const LAYOUT_TYPE = { SingleColumn: 100000001, TwoColumn: 100000002, Grid: 100000003,
                      Stepper: 100000004, Wizard: 100000005, Accordion: 100000006,
                      TabBased: 100000007, InlineCompact: 100000008 };
const LABEL_POS   = { Top: 100000001, Left: 100000002, Floating: 100000003 };
const SEC_STYLE   = { Card: 100000001, Flat: 100000002, Outlined: 100000003 };
const TAB_STYLE   = { Tabs: 100000001, Stepper: 100000002, Accordion: 100000003 };
const BTN_STYLE   = { Primary: 100000001, Outline: 100000002, Text: 100000003 };
const ALIGN       = { Left: 100000001, Center: 100000002, Right: 100000003 };
const COL_LAYOUT  = { One: 100000001, Two: 100000002, Three: 100000003, Four: 100000004 };
const CARD_STYLE  = { Flat: 100000001, Elevated: 100000002, Outlined: 100000003 };
const COLLAPSE    = { None: 100000001, Animated: 100000002, Instant: 100000003 };
const VIS_ANIM    = { None: 100000001, Fade: 100000002, Slide: 100000003 };
const INPUT_STYLE = { Outlined: 100000001, Filled: 100000002, Standard: 100000003 };
const FIELD_WIDTH = { Full: 100000001, Half: 100000002, Custom: 100000003 };
const BTN_TYPE    = { Submit: 100000001, SaveDraft: 100000002, Cancel: 100000003 };
const BTN_SIZE    = { Small: 100000001, Medium: 100000002, Large: 100000003 };
const HOVER_EFX   = { None: 100000001, Elevate: 100000002, ColorShift: 100000003 };
const LOADING     = { Spinner: 100000001, Dots: 100000002, Pulse: 100000003 };

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
async function post(token, entitySet, body) {
  const res = await fetch(`${API}/${entitySet}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`  POST ${entitySet} ${res.status}: ${text.slice(0, 400)}`);
    throw new Error(`POST ${entitySet} failed: ${res.status}`);
  }
  return JSON.parse(text);
}

async function get(token, path) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0'
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

function extractId(rec, entityLogicalName) {
  const pkKey = `${entityLogicalName}id`;
  if (rec[pkKey]) return rec[pkKey];
  for (const val of Object.values(rec)) {
    if (typeof val === 'string' && /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(val)) {
      return val;
    }
  }
  throw new Error(`Cannot extract ID from ${entityLogicalName} response`);
}

// ─── Theme definitions ────────────────────────────────────────────────────────

const THEMES = [
  {
    key: 'light',
    qdb_theme_name:          'Light',
    qdb_theme_code:          'light',
    qdb_primary_color:       '#0078d4',
    qdb_secondary_color:     '#106ebe',
    qdb_background_color:    '#ffffff',
    qdb_surface_color:       '#f5f5f5',
    qdb_text_primary_color:  '#242424',
    qdb_text_secondary_color:'#616161',
    qdb_border_color:        '#d1d1d1',
    qdb_error_color:         '#d13438',
    qdb_success_color:       '#107c10',
    qdb_warning_color:       '#797775',
    qdb_font_family:         'Segoe UI, system-ui, sans-serif',
    qdb_base_font_size:      '14px',
    qdb_heading_font_size:   '20px',
    qdb_label_font_size:     '12px',
    qdb_input_font_size:     '14px',
    qdb_border_radius:       '4px',
    qdb_shadow_style:        SHADOW.Subtle,
    qdb_spacing_scale:       SPACING.Normal,
    qdb_is_dark_mode:        false,
    qdb_is_active:           true
  },
  {
    key: 'dark',
    qdb_theme_name:          'Dark',
    qdb_theme_code:          'dark',
    qdb_primary_color:       '#479ef5',
    qdb_secondary_color:     '#2886de',
    qdb_background_color:    '#1f1f1f',
    qdb_surface_color:       '#2d2d2d',
    qdb_text_primary_color:  '#ffffff',
    qdb_text_secondary_color:'#ababab',
    qdb_border_color:        '#3d3d3d',
    qdb_error_color:         '#f1707b',
    qdb_success_color:       '#54b054',
    qdb_warning_color:       '#fcce6c',
    qdb_font_family:         'Segoe UI, system-ui, sans-serif',
    qdb_base_font_size:      '14px',
    qdb_heading_font_size:   '20px',
    qdb_label_font_size:     '12px',
    qdb_input_font_size:     '14px',
    qdb_border_radius:       '4px',
    qdb_shadow_style:        SHADOW.Subtle,
    qdb_spacing_scale:       SPACING.Normal,
    qdb_is_dark_mode:        true,
    qdb_is_active:           false
  },
  {
    key: 'corporate-qdb',
    qdb_theme_name:          'Corporate QDB',
    qdb_theme_code:          'corporate-qdb',
    qdb_primary_color:       '#003366',
    qdb_secondary_color:     '#c8a951',
    qdb_background_color:    '#f8f6f1',
    qdb_surface_color:       '#ffffff',
    qdb_text_primary_color:  '#1a1a2e',
    qdb_text_secondary_color:'#4a4a6a',
    qdb_border_color:        '#d4c5a0',
    qdb_error_color:         '#cc0000',
    qdb_success_color:       '#1a5c38',
    qdb_warning_color:       '#c8a951',
    qdb_font_family:         'Inter, system-ui, sans-serif',
    qdb_font_url:            'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    qdb_base_font_size:      '14px',
    qdb_heading_font_size:   '22px',
    qdb_label_font_size:     '12px',
    qdb_input_font_size:     '14px',
    qdb_border_radius:       '6px',
    qdb_shadow_style:        SHADOW.Strong,
    qdb_spacing_scale:       SPACING.Comfortable,
    qdb_is_dark_mode:        false,
    qdb_is_active:           false
  }
];

// ─── Button design definitions ─────────────────────────────────────────────────

function buildButtonDesigns(formDefinitionId) {
  return [
    {
      qdb_name:        'Loan Application — Submit',
      qdb_button_type: BTN_TYPE.Submit,
      qdb_size:        BTN_SIZE.Medium,
      qdb_alignment:   ALIGN.Left,
      qdb_hover_effect:HOVER_EFX.Elevate,
      qdb_loading_style:LOADING.Spinner,
      qdb_is_active:   true,
      qdb_color:       '#003366',
      qdb_border_radius:'6px',
      'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formDefinitionId})`
    },
    {
      qdb_name:        'Loan Application — Save Draft',
      qdb_button_type: BTN_TYPE.SaveDraft,
      qdb_size:        BTN_SIZE.Medium,
      qdb_alignment:   ALIGN.Left,
      qdb_hover_effect:HOVER_EFX.None,
      qdb_loading_style:LOADING.Spinner,
      qdb_is_active:   true,
      'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formDefinitionId})`
    },
    {
      qdb_name:        'Loan Application — Cancel',
      qdb_button_type: BTN_TYPE.Cancel,
      qdb_size:        BTN_SIZE.Medium,
      qdb_alignment:   ALIGN.Right,
      qdb_hover_effect:HOVER_EFX.None,
      qdb_loading_style:LOADING.Spinner,
      qdb_is_active:   true,
      'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formDefinitionId})`
    }
  ];
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  QDB Dynamic Form Engine — Design Data Seeder');
  console.log('  Seeds: 3 Themes · 1 Form Design · 3 Button Designs · 1 Layout Grid');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const token = await getToken();
  console.log('✓ Authenticated\n');

  // ── Guard: check if already seeded ─────────────────────────────────────────
  const existingThemes = await get(token, `/qdb_themes?$filter=qdb_theme_code eq 'light'&$select=qdb_themeid`);
  if (existingThemes.value.length > 0) {
    console.log("Theme 'light' already exists — seed has already been run.");
    console.log('To re-seed: delete theme records in Dataverse first. Exiting.\n');
    return;
  }

  // ── Step 1: Themes ──────────────────────────────────────────────────────────
  console.log('─── Step 1: Themes ───────────────────────────────────────────');
  const themeIds = {};

  for (const theme of THEMES) {
    const { key, ...body } = theme;
    const rec = await post(token, 'qdb_themes', body);
    themeIds[key] = extractId(rec, 'qdb_theme');
    const activeLabel = body.qdb_is_active ? ' [active]' : '';
    console.log(`✓ ${body.qdb_theme_name}${activeLabel}: ${themeIds[key]}`);
  }

  // ── Step 2: Resolve form definition ID ─────────────────────────────────────
  console.log('\n─── Step 2: Resolving Form Definition ────────────────────────');
  const formResult = await get(token, `/qdb_form_definitions?$filter=qdb_form_code eq 'loan-application'&$select=qdb_form_definitionid`);
  if (formResult.value.length === 0) {
    throw new Error("Form 'loan-application' not found — run seed-data.js first.");
  }
  const formDefinitionId = formResult.value[0].qdb_form_definitionid;
  console.log(`✓ loan-application form definition: ${formDefinitionId}`);

  // ── Step 3: Form Design ────────────────────────────────────────────────────
  console.log('\n─── Step 3: Form Design ──────────────────────────────────────');
  const formDesignRec = await post(token, 'qdb_form_designs', {
    qdb_name:                    'Loan Application — Default Design',
    qdb_layout_type:             LAYOUT_TYPE.TabBased,
    qdb_label_position:          LABEL_POS.Top,
    qdb_section_style:           SEC_STYLE.Card,
    qdb_tab_style:               TAB_STYLE.Stepper,
    qdb_button_style:            BTN_STYLE.Primary,
    qdb_alignment:               ALIGN.Left,
    qdb_animation_enabled:       true,
    qdb_sticky_action_bar:       true,
    qdb_skeleton_loader_enabled: true,
    qdb_is_active:               true,
    qdb_max_width:               '1200px',
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formDefinitionId})`,
    'qdb_theme_id@odata.bind':           `/qdb_themes(${themeIds['corporate-qdb']})`
  });
  const formDesignId = extractId(formDesignRec, 'qdb_form_design');
  console.log(`✓ Form Design: ${formDesignId}`);

  // ── Step 4: Button Designs ─────────────────────────────────────────────────
  console.log('\n─── Step 4: Button Designs ───────────────────────────────────');
  for (const btn of buildButtonDesigns(formDefinitionId)) {
    const rec = await post(token, 'qdb_button_designs', btn);
    console.log(`✓ ${btn.qdb_name}: ${extractId(rec, 'qdb_button_design')}`);
  }

  // ── Step 5: Layout Grid (form-level 12-col responsive grid) ───────────────
  console.log('\n─── Step 5: Layout Grid ──────────────────────────────────────');
  const gridRec = await post(token, 'qdb_layout_grids', {
    qdb_name:           'Loan Application — Responsive Grid',
    qdb_columns_total:  12,
    qdb_span_mobile:    12,
    qdb_span_tablet:    6,
    qdb_span_desktop:   4,
    qdb_is_active:      true,
    'qdb_form_design_id@odata.bind': `/qdb_form_designs(${formDesignId})`
  });
  console.log(`✓ Layout Grid: ${extractId(gridRec, 'qdb_layout_grid')}`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log(`  Themes        : ${THEMES.length} created`);
  console.log('  Form Design   : 1 created (loan-application + corporate-qdb theme)');
  console.log('  Button Designs: 3 created (Submit / Save Draft / Cancel)');
  console.log('  Layout Grids  : 1 created (12-col responsive)');
  console.log('\n  ✅ Design data seeded successfully.');
  console.log('\n  Active theme  : Light (switch to Corporate QDB in Dataverse to go live)');
  console.log('  Next steps:');
  console.log('    1. Settings → Customizations → Publish All Customizations');
  console.log('    2. Set qdb_is_active = true on "Corporate QDB" theme for branding');
  console.log('    3. Start backend + frontend — design payload loads automatically');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(e => { console.error('\nFatal:', e.message); process.exit(1); });
