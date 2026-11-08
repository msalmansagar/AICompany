// DFE-BTN-001 — attribute logical names + lookup navigation properties for the
// qdb_form_scoped_button entity. Never inline these strings elsewhere.

export const SCOPED_BUTTON_ATTRS = {
  ID: 'qdb_form_scoped_buttonid',
  LABEL: 'qdb_label',
  PLACEMENT_SCOPE: 'qdb_placement_scope',
  DISPLAY_ORDER: 'qdb_display_order',
  IS_PRIMARY: 'qdb_is_primary',
  IS_VISIBLE: 'qdb_is_visible',
  CONFIRM_REQUIRED: 'qdb_confirm_required',
  CONFIRM_MESSAGE: 'qdb_confirm_message',
  ACTION_TYPE: 'qdb_action_type',
  ACTION_CONFIG_JSON: 'qdb_action_config_json',
  IS_ACTIVE: 'qdb_is_active',
  // DFE-CBTN-001: condition sets stored as JSON memo columns.
  VISIBLE_CONDITIONS_JSON: 'qdb_visible_conditions_json',
  ENABLED_CONDITIONS_JSON: 'qdb_enabled_conditions_json',
  // OData lookup value fields (read side).
  TAB_VALUE: '_qdb_tab_id_value',
  SECTION_VALUE: '_qdb_section_id_value',
  FORM_VALUE: '_qdb_form_definition_id_value',
} as const;

/** Single-valued navigation property names (schema-cased) for @odata.bind on create. */
export const SCOPED_BUTTON_NAV = {
  FORM_DEFINITION: 'qdb_Form_Definition_Id',
  TAB: 'qdb_Tab_Id',
  SECTION: 'qdb_Section_Id',
} as const;

/** Entity-set names used in @odata.bind targets. */
export const SCOPED_BUTTON_BIND_SETS = {
  FORM_DEFINITION: 'qdb_form_definitions',
  TAB: 'qdb_form_tabs',
  SECTION: 'qdb_form_sections',
} as const;
