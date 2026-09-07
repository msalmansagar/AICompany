// DFE — qdb_form_field form visibility controller
// Registered on: OnLoad + qdb_field_type OnChange
// Shows/hides typed sections AND type-specific fields (that live in the always-visible
// section_core) based on the selected field type value.
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

  // Section name → which field types should show it. section_core is always visible.
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
  };

  // Field (control) name → which field types should show it. These type-specific fields
  // sit inside the always-visible section_core, so they are toggled individually.
  var FIELD_RULES = {
    qdb_static_content:            [FT.LABEL],
    qdb_source_field_schema_name:  [FT.LABEL],
    qdb_component_key:             [FT.CUSTOM],
    // Parent field for dependent lookups / filtered options.
    qdb_parent_field_id:           [FT.LOOKUP, FT.MULTI_LOOKUP, FT.DROPDOWN, FT.MULTISELECT, FT.RADIO],
  };

  // DFE-BARSRC-001 — bar bounds source. Each mode needs different columns, so only the
  // relevant ones are shown; all of them hide when the field is not displayed as a bar.
  var BAR_SOURCE = { FORM_FIELD: 100000000, STATIC: 100000001, DYNAMIC: 100000002 };
  var DISPLAY_STYLE_BAR = 100000002;
  var BAR_STATIC_FIELDS = ['qdb_bar_min_value', 'qdb_bar_max_value'];
  var BAR_DYNAMIC_FIELDS = ['qdb_bar_source_entity', 'qdb_bar_min_attribute'];

  function setSectionVisible(tab, name, visible) {
    var section = tab.sections.get(name);
    if (section) section.setVisible(visible);
  }

  function setFieldVisible(formContext, name, visible) {
    var attr = formContext.getAttribute(name);
    if (attr) {
      attr.controls.forEach(function (c) { c.setVisible(visible); });
    }
  }

  function applies(rule, fieldType) {
    return fieldType !== null && rule.indexOf(fieldType) !== -1;
  }

  function applyBarVisibility(formContext) {
    var styleAttr = formContext.getAttribute('qdb_number_display_style');
    var isBar = styleAttr ? styleAttr.getValue() === DISPLAY_STYLE_BAR : false;

    setFieldVisible(formContext, 'qdb_bar_source', isBar);
    setFieldVisible(formContext, 'qdb_bar_value_field_schema', isBar);

    if (!isBar) {
      BAR_STATIC_FIELDS.concat(BAR_DYNAMIC_FIELDS).forEach(function (name) {
        setFieldVisible(formContext, name, false);
      });
      setFieldVisible(formContext, 'qdb_bar_max_field_schema', false);
      return;
    }

    // Unset counts as Form Field, matching how the runtime reads it.
    var sourceAttr = formContext.getAttribute('qdb_bar_source');
    var source = (sourceAttr && sourceAttr.getValue()) || BAR_SOURCE.FORM_FIELD;

    BAR_STATIC_FIELDS.forEach(function (name) {
      setFieldVisible(formContext, name, source === BAR_SOURCE.STATIC);
    });
    BAR_DYNAMIC_FIELDS.forEach(function (name) {
      setFieldVisible(formContext, name, source === BAR_SOURCE.DYNAMIC);
    });
    // The maximum is a schema name in Form Field and Dynamic mode alike; Static carries it
    // as a literal instead.
    setFieldVisible(formContext, 'qdb_bar_max_field_schema', source !== BAR_SOURCE.STATIC);
  }

  function applyVisibility(formContext) {
    var fieldTypeAttr = formContext.getAttribute("qdb_field_type");
    var fieldType = fieldTypeAttr ? fieldTypeAttr.getValue() : null;

    var tab = formContext.ui.tabs.get("tab_general");
    if (tab) {
      Object.keys(SECTION_RULES).forEach(function (name) {
        setSectionVisible(tab, name, applies(SECTION_RULES[name], fieldType));
      });
    }

    Object.keys(FIELD_RULES).forEach(function (name) {
      setFieldVisible(formContext, name, applies(FIELD_RULES[name], fieldType));
    });

    applyBarVisibility(formContext);
  }

  function onLoad(executionContext) {
    var formContext = executionContext.getFormContext();
    applyVisibility(formContext);

    // Register onChange so visibility updates when user changes field type
    ['qdb_field_type', 'qdb_number_display_style', 'qdb_bar_source'].forEach(function (name) {
      var attr = formContext.getAttribute(name);
      if (attr) {
        attr.addOnChange(function (ctx) {
          applyVisibility(ctx.getFormContext());
        });
      }
    });
  }

  return { onLoad: onLoad };

}());
