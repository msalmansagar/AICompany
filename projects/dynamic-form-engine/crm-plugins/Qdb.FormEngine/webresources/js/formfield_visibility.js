// DFE — qdb_form_field form visibility controller
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
    CUSTOM:          100000018,
    BOOLEAN:         100000019,
    INFO_CARD:       100000020,
    INTERACTIVE_GRID:100000021,
    LABEL:           100000022,
    MULTI_LOOKUP:    100000023,
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
    // Lookup + multi-select lookup share the same lookup configuration.
    section_lookup_config: [FT.LOOKUP, FT.MULTI_LOOKUP],
    section_infocard_config: [FT.INFO_CARD],
    // Label: static content (qdb_static_content) and/or a bound source field
    // (qdb_source_field_schema_name).
    section_label_config: [FT.LABEL],
    // Custom: developer-registered component (qdb_component_key).
    section_custom_config: [FT.CUSTOM],
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
