/**
 * setup-formfield-form.mjs
 *
 * Does three things in sequence:
 *   1. Provisions qdb_document_type picklist on qdb_form_field
 *   2. Reorganises the qdb_form_field main form into typed sections
 *   3. Creates the JS web resource and registers it on the form
 *
 * Safe to re-run — attribute creation is guarded, form update is idempotent.
 * Run: node scripts/setup-formfield-form.mjs
 */

import { randomUUID } from 'crypto';

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;
const FORM_ID       = '585f5778-d19e-43dd-9d0d-e968cbafe6b4';
const ENTITY        = 'qdb_form_field';

// ── Auth ──────────────────────────────────────────────────────────────────────
const tok = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET, scope: `${DV}/.default`,
    }),
  },
).then(r => r.json()).then(j => { if (!j.access_token) throw new Error(j.error_description); return j.access_token; });

const H = {
  Authorization: `Bearer ${tok}`, 'OData-MaxVersion': '4.0',
  'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json',
};

const lbl = text => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }],
});

async function attrExists(schema) {
  const r = await fetch(
    `${BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${schema}')?$select=LogicalName`,
    { headers: H },
  );
  return r.ok;
}

async function addPicklist(schema, display, options) {
  if (await attrExists(schema)) { console.log(`  ↷ ${schema} (exists)`); return; }
  const r = await fetch(`${BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`, {
    method: 'POST', headers: H,
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
  if (!r.ok) { const t = await r.text(); throw new Error(`addPicklist ${schema}: ${t}`); }
  console.log(`  ✓ ${schema} (created)`);
}

async function publish() {
  const xml = `<importexportxml><entities><entity>${ENTITY}</entity></entities></importexportxml>`;
  const r = await fetch(`${BASE}/PublishXml`, { method: 'POST', headers: H, body: JSON.stringify({ ParameterXml: xml }) });
  if (!r.ok) { const t = await r.text(); throw new Error(`PublishXml: ${t}`); }
}

// ══════════════════════════════════════════════════════════════════════════════
// [1] Provision qdb_document_type
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[1] Provisioning qdb_document_type picklist…');
await addPicklist('qdb_document_type', 'Document Type', [
  [100000000, 'CV / Resume'],
  [100000001, 'National ID'],
  [100000002, 'Passport'],
  [100000003, 'Certificate'],
  [100000004, 'Contract'],
  [100000005, 'Payslip'],
  [100000006, 'Bank Statement'],
  [100000007, 'Photo'],
  [100000008, 'Other'],
]);
await publish();
console.log('  ✓ Published');

// ══════════════════════════════════════════════════════════════════════════════
// [2] Rebuild form XML with typed sections
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[2] Rebuilding form XML…');

// Control classids extracted from the existing form
const CLS = {
  string:   '{4273EDBD-AC1D-40D3-9FB2-095C621B552D}',
  memo:     '{E0DECE4B-6FC8-4A8F-A065-082708572369}',
  picklist: '{3EF39988-22BB-4F0B-BBBE-64B5A3748AEE}',
  bool:     '{67FAC785-CD58-4F9F-ABB3-4B7DDC6ED5ED}',
  int:      '{C6D124CA-7EDA-4A60-AEA9-7FB8D318B68F}',
  lookup:   '{270BD3DB-D9AF-4782-9025-509E298DEC0A}',
};

const uid = () => `{${randomUUID().toUpperCase()}}`;

// Builds a <row><cell>…</cell></row> block for one field
function cell(label, fieldName, classid) {
  return `<row><cell id="${uid()}" locklevel="0"><labels><label description="${label}" languagecode="1033" /></labels><control id="${fieldName}" classid="${classid}" datafieldname="${fieldName}" disabled="false" /></cell></row>`;
}

// Builds a named section with a visible header
function section(name, label, rows) {
  return `<section id="${uid()}" name="${name}" showlabel="true" showbar="false" locklevel="0" IsUserDefined="1"><labels><label description="${label}" languagecode="1033" /></labels><rows>${rows.join('')}</rows></section>`;
}

const TAB_ID = uid();

const allSections = [
  section('section_core', 'Core Configuration', [
    cell('Label',          'qdb_label',           CLS.string),
    cell('Schema Name',    'qdb_schema_name',      CLS.string),
    cell('Field Type',     'qdb_field_type',       CLS.picklist),
    cell('Form Section',   'qdb_form_section_id',  CLS.lookup),
    cell('Display Order',  'qdb_display_order',    CLS.int),
    cell('Column Span',    'qdb_column_span',      CLS.picklist),
    cell('Is Required',    'qdb_is_required',      CLS.bool),
    cell('Is Readonly',    'qdb_is_readonly',      CLS.bool),
    cell('Is Hidden',      'qdb_is_hidden',        CLS.bool),
    cell('Tooltip',        'qdb_tooltip',          CLS.string),
    cell('Component Key',  'qdb_component_key',    CLS.string),
    cell('Parent Field',   'qdb_parent_field_id',  CLS.lookup),
  ]),
  section('section_text_input', 'Text and Input Config', [
    cell('Placeholder',   'qdb_placeholder',    CLS.string),
    cell('Default Value', 'qdb_default_value',  CLS.string),
    cell('Max Rows',      'qdb_max_rows',        CLS.int),
  ]),
  section('section_number_currency', 'Number and Currency Config', [
    cell('Decimal Places', 'qdb_decimal_places',  CLS.int),
    cell('Currency Code',  'qdb_currency_code',   CLS.string),
  ]),
  section('section_options', 'Options Source', [
    cell('Option Source Entity',    'qdb_option_source_entity',    CLS.string),
    cell('Option Source Attribute', 'qdb_option_source_attribute', CLS.string),
  ]),
  section('section_radio_config', 'Radio Config', [
    cell('Radio Render Style', 'qdb_radio_render_style', CLS.picklist),
  ]),
  section('section_multiselect_config', 'Multiselect Config', [
    cell('Multiselect Render Style', 'qdb_multiselect_render_style', CLS.picklist),
  ]),
  section('section_boolean_config', 'Boolean and Checkbox Config', [
    cell('Boolean Render Style', 'qdb_boolean_render_style', CLS.picklist),
    cell('True Label',           'qdb_true_label',           CLS.string),
    cell('False Label',          'qdb_false_label',          CLS.string),
  ]),
  section('section_upload_config', 'Upload Config', [
    cell('Document Type',      'qdb_document_type',      CLS.picklist),
    cell('Allowed MIME Types', 'qdb_allowed_mime_types',  CLS.memo),
    cell('Max File Size (MB)', 'qdb_max_file_size_mb',    CLS.int),
    cell('Max Files',          'qdb_max_files',           CLS.int),
  ]),
  section('section_grid_config', 'Grid Config', [
    cell('Target Entity',           'qdb_grid_target_entity',              CLS.string),
    cell('Entity Display Name',     'qdb_grid_entity_name',                CLS.string),
    cell('Saved View ID',           'qdb_grid_saved_view_id',              CLS.string),
    cell('Selection Mode',          'qdb_grid_selection_mode',             CLS.picklist),
    cell('Selection Mode (Legacy)', 'qdb_selection_mode',                  CLS.picklist),
    cell('Grid Mode',               'qdb_grid_mode',                       CLS.picklist),
    cell('Filter Expression',       'qdb_grid_filter_expression',          CLS.memo),
    cell('Depends-On Field Schema', 'qdb_grid_depends_on_field_schema',    CLS.string),
    cell('Depends-On Filter Tmpl',  'qdb_grid_depends_on_filter_template', CLS.memo),
    cell('Max Rows',                'qdb_grid_max_rows',                   CLS.int),
    cell('Min Rows',                'qdb_grid_min_rows',                   CLS.int),
    cell('Relationship Attribute',  'qdb_grid_relationship_attribute',     CLS.string),
  ]),
  section('section_lookup_config', 'Lookup Config', [
    cell('Saved View ID', 'qdb_saved_view_id', CLS.string),
  ]),
  section('section_infocard_config', 'Info Card Config', [
    cell('Title', 'qdb_info_card_title', CLS.string),
    cell('Body',  'qdb_info_card_body',  CLS.string),
    cell('Icon',  'qdb_info_card_icon',  CLS.string),
    cell('Style', 'qdb_info_card_style', CLS.picklist),
  ]),
].join('');

const formXml =
  `<form headerdensity="HighWithControls">` +
  `<tabs><tab verticallayout="true" id="${TAB_ID}" name="tab_general" IsUserDefined="1" expanded="true" showlabel="true">` +
  `<labels><label description="General" languagecode="1033" /></labels>` +
  `<columns><column width="100%"><sections>${allSections}</sections></column></columns>` +
  `</tab></tabs>` +
  `<header id="${uid()}" celllabelposition="Top" columns="111" labelwidth="115" celllabelalignment="Left">` +
  `<rows><row><cell id="${uid()}" showlabel="false"><labels><label description="" languagecode="1033" /></labels></cell></row></rows>` +
  `</header>` +
  `<footer id="${uid()}" celllabelposition="Top" columns="111" labelwidth="115" celllabelalignment="Left">` +
  `<rows><row><cell id="${uid()}" showlabel="false"><labels><label description="" languagecode="1033" /></labels></cell></row></rows>` +
  `</footer>` +
  `<DisplayConditions Order="0" FallbackForm="true"><Everyone /></DisplayConditions>` +
  `</form>`;

// ══════════════════════════════════════════════════════════════════════════════
// [3] JS Web Resource — show/hide sections by field type
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[3] Building JS web resource…');

const jsContent = `// DFE — qdb_form_field form visibility controller
// Registered on: OnLoad + qdb_field_type OnChange
// Shows/hides typed sections based on the selected field type value.
"use strict";

var DFE = DFE || {};

DFE.FormField = (function () {

  // Picklist values for qdb_field_type
  var FT = {
    TEXT:            100000001,
    TEXTAREA:        100000002,
    NUMBER:          100000003,
    DATE:            100000004,
    DATETIME:        100000005,
    DROPDOWN:        100000006,
    MULTISELECT:     100000007,
    LOOKUP:          100000008,
    CHECKBOX:        100000009,
    RADIO:           100000010,
    CURRENCY:        100000011,
    DECIMAL:         100000012,
    EMAIL:           100000013,
    PHONE:           100000014,
    FILE:            100000015,
    REPEATING_GRID:  100000016,
    RICH_TEXT:       100000017,
    BOOLEAN:         100000019,
    INFO_CARD:       100000020,
    INTERACTIVE_GRID:100000021,
  };

  // Section name → which field types should show it.
  // section_core is always visible and not listed here.
  var SECTION_RULES = {
    section_text_input: [
      FT.TEXT, FT.TEXTAREA, FT.NUMBER, FT.DECIMAL, FT.CURRENCY,
      FT.EMAIL, FT.PHONE, FT.DATE, FT.DATETIME, FT.RICH_TEXT,
    ],
    section_number_currency: [FT.NUMBER, FT.DECIMAL, FT.CURRENCY],
    section_options: [FT.RADIO, FT.DROPDOWN, FT.MULTISELECT, FT.CHECKBOX],
    section_radio_config: [FT.RADIO],
    section_multiselect_config: [FT.MULTISELECT],
    section_boolean_config: [FT.BOOLEAN, FT.CHECKBOX],
    section_upload_config: [FT.FILE],
    section_grid_config: [FT.REPEATING_GRID, FT.INTERACTIVE_GRID],
    section_lookup_config: [FT.LOOKUP],
    section_infocard_config: [FT.INFO_CARD],
  };

  function applyVisibility(formContext) {
    var fieldTypeAttr = formContext.getAttribute("qdb_field_type");
    var fieldType = fieldTypeAttr ? fieldTypeAttr.getValue() : null;

    var tab = formContext.ui.tabs.get("tab_general");
    if (!tab) return;

    Object.keys(SECTION_RULES).forEach(function (sectionName) {
      var section = tab.sections.get(sectionName);
      if (!section) return;
      var applicableTypes = SECTION_RULES[sectionName];
      var shouldShow = fieldType !== null && applicableTypes.indexOf(fieldType) !== -1;
      section.setVisible(shouldShow);
    });
  }

  function onLoad(executionContext) {
    var formContext = executionContext.getFormContext();
    applyVisibility(formContext);

    // Register onChange so visibility updates when user changes field type
    var attr = formContext.getAttribute("qdb_field_type");
    if (attr) {
      attr.addOnChange(function (ctx) {
        applyVisibility(ctx.getFormContext());
      });
    }
  }

  return { onLoad: onLoad };

}());
`;

const jsBase64 = Buffer.from(jsContent, 'utf-8').toString('base64');
const WR_NAME  = 'qdb_/js/formfield_visibility.js';

// Check if web resource already exists
const wrSearch = await fetch(
  `${BASE}/webresourceset?$filter=name eq '${WR_NAME}'&$select=webresourceid`,
  { headers: H },
).then(r => r.json());

let wrId;
if (wrSearch.value.length > 0) {
  wrId = wrSearch.value[0].webresourceid;
  await fetch(`${BASE}/webresourceset(${wrId})`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify({ content: jsBase64, description: 'DFE form field visibility controller' }),
  });
  console.log(`  ↷ Web resource updated (${wrId})`);
} else {
  const wrRes = await fetch(`${BASE}/webresourceset`, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify({
      name: WR_NAME,
      displayname: 'DFE Form Field Visibility',
      description: 'DFE form field visibility controller — shows/hides typed sections',
      webresourcetype: 3, // JavaScript
      content: jsBase64,
    }),
  });
  const wrJson = await wrRes.json();
  if (!wrRes.ok) throw new Error(`Create web resource: ${JSON.stringify(wrJson.error)}`);
  wrId = wrJson.webresourceid;
  console.log(`  ✓ Web resource created (${wrId})`);
}

// Publish the web resource
await fetch(`${BASE}/PublishXml`, {
  method: 'POST', headers: H,
  body: JSON.stringify({
    ParameterXml: `<importexportxml><webresources><webresource>{${wrId}}</webresource></webresources></importexportxml>`,
  }),
});
console.log('  ✓ Web resource published');

// ══════════════════════════════════════════════════════════════════════════════
// [4] Update form: new XML + register OnLoad event
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[4] Updating form XML and registering event…');

const eventsXml = `<events><event name="onload" application="false" active="false"><Handlers><Handler functionName="DFE.FormField.onLoad" libraryName="${WR_NAME}" handlerUniqueId="${randomUUID()}" enabled="true" parameters="" passExecutionContext="true" /></Handlers></event></events>`;

// Inject events before closing </form>
const finalXml = formXml.replace('</form>', `${eventsXml}</form>`);

const updateRes = await fetch(`${BASE}/systemforms(${FORM_ID})`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({ formxml: finalXml }),
});
if (!updateRes.ok) {
  const t = await updateRes.text();
  throw new Error(`Update form: ${t}`);
}
console.log('  ✓ Form XML updated with sections');

// Publish the form
await fetch(`${BASE}/PublishXml`, {
  method: 'POST', headers: H,
  body: JSON.stringify({
    ParameterXml: `<importexportxml><entities><entity>${ENTITY}</entity></entities></importexportxml>`,
  }),
});
console.log('  ✓ Form published');

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  qdb_form_field form setup complete                              ║
╠══════════════════════════════════════════════════════════════════╣
║  [1] qdb_document_type picklist provisioned (9 options)          ║
║  [2] Form reorganised into 11 typed sections                     ║
║  [3] JS web resource: ${WR_NAME.padEnd(30)}║
║  [4] OnLoad event registered → DFE.FormField.onLoad              ║
╠══════════════════════════════════════════════════════════════════╣
║  Sections always visible:                                        ║
║    section_core                        (all field types)         ║
║  Sections shown only when relevant:                              ║
║    section_text_input                  (text/number/date/etc)    ║
║    section_number_currency             (number/decimal/currency) ║
║    section_options                     (radio/dropdown/multi)    ║
║    section_radio_config                (radio)                   ║
║    section_multiselect_config          (multiselect)             ║
║    section_boolean_config              (boolean/checkbox)        ║
║    section_upload_config               (file)                    ║
║    section_grid_config                 (grid types)              ║
║    section_lookup_config               (lookup)                  ║
║    section_infocard_config             (info-card)               ║
╚══════════════════════════════════════════════════════════════════╝
`);
