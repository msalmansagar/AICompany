/**
 * DFE-BARSRC-001 — Bar source field visibility on the Form Field form.
 *
 * The bar's bounds come from one of three places, and each needs different columns. Showing
 * all of them at once is what made the old configuration confusing, so the Bar Source choice
 * reveals only the columns that mode actually uses.
 *
 *   Form Field (default) → Bar Max Field Schema
 *   Static               → Bar Min Value, Bar Max Value
 *   Dynamic              → Bar Source Entity, Bar Min Field Schema Name, Bar Max Field Schema
 *
 * Bar Value Field Schema is deliberately always visible: it says where the AMOUNT lives and
 * applies in every mode (blank = this field's own value).
 *
 * Register on the qdb_form_field main form:
 *   OnLoad                        → Qdb.FormField.BarSource.onLoad
 *   OnChange of qdb_bar_source    → Qdb.FormField.BarSource.onBarSourceChange
 *   OnChange of qdb_number_display_style → Qdb.FormField.BarSource.onBarSourceChange
 * Pass the execution context as the first parameter for both.
 */
var Qdb = Qdb || {};
Qdb.FormField = Qdb.FormField || {};

Qdb.FormField.BarSource = (function () {
  "use strict";

  var BAR_SOURCE = { FORM_FIELD: 100000000, STATIC: 100000001, DYNAMIC: 100000002 };
  var DISPLAY_STYLE_BAR = 100000002;

  var SOURCE_FIELD = "qdb_bar_source";
  var DISPLAY_STYLE_FIELD = "qdb_number_display_style";

  var STATIC_FIELDS = ["qdb_bar_min_value", "qdb_bar_max_value"];
  var DYNAMIC_FIELDS = ["qdb_bar_source_entity", "qdb_bar_min_attribute"];
  var MAX_SCHEMA_FIELD = "qdb_bar_max_field_schema";
  var VALUE_SCHEMA_FIELD = "qdb_bar_value_field_schema";

  /** Fluent about missing controls: the same script loads on forms that omit some fields. */
  function setVisible(formContext, attributeName, isVisible) {
    var control = formContext.getControl(attributeName);
    if (control) {
      control.setVisible(isVisible);
    }
  }

  function setVisibleAll(formContext, attributeNames, isVisible) {
    attributeNames.forEach(function (name) {
      setVisible(formContext, name, isVisible);
    });
  }

  function readOptionValue(formContext, attributeName) {
    var attribute = formContext.getAttribute(attributeName);
    return attribute ? attribute.getValue() : null;
  }

  /**
   * Shows only the columns the selected source needs. Every bar column hides entirely when
   * the field is not displayed as a bar — they are meaningless for a plain number input.
   */
  function apply(formContext) {
    var isBar = readOptionValue(formContext, DISPLAY_STYLE_FIELD) === DISPLAY_STYLE_BAR;

    setVisible(formContext, SOURCE_FIELD, isBar);
    setVisible(formContext, VALUE_SCHEMA_FIELD, isBar);

    if (!isBar) {
      setVisibleAll(formContext, STATIC_FIELDS, false);
      setVisibleAll(formContext, DYNAMIC_FIELDS, false);
      setVisible(formContext, MAX_SCHEMA_FIELD, false);
      return;
    }

    // Unset counts as Form Field, matching how the runtime reads it.
    var source = readOptionValue(formContext, SOURCE_FIELD) || BAR_SOURCE.FORM_FIELD;

    setVisibleAll(formContext, STATIC_FIELDS, source === BAR_SOURCE.STATIC);
    setVisibleAll(formContext, DYNAMIC_FIELDS, source === BAR_SOURCE.DYNAMIC);
    // The maximum is a schema name in both Form Field and Dynamic mode — a form field in one,
    // an entity column in the other. Static carries its maximum as a literal instead.
    setVisible(formContext, MAX_SCHEMA_FIELD, source !== BAR_SOURCE.STATIC);
  }

  return {
    onLoad: function (executionContext) {
      apply(executionContext.getFormContext());
    },
    onBarSourceChange: function (executionContext) {
      apply(executionContext.getFormContext());
    },
    // Exposed for unit testing without a CRM form context.
    _apply: apply,
    _BAR_SOURCE: BAR_SOURCE,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Qdb.FormField.BarSource;
}
