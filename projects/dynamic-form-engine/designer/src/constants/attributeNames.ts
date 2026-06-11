// Central registry of CRM attribute logical names for all qdb_* entities.
// Never use inline attribute name strings — always reference from here.

export const FORM_DEFINITION_ATTRS = {
  ID: 'qdb_form_definitionid',
  NAME: 'qdb_title',
  CODE: 'qdb_form_code',
  DESCRIPTION: 'qdb_description',
  ENTITY_LOGICAL_NAME: 'qdb_entity_logical_name',
  STATUS: 'qdb_status',
  CURRENT_VERSION: 'qdb_version',
  ALLOW_SAVE_DRAFT: 'qdb_allow_save_draft',
  DRAFT_EXPIRY_DAYS: 'qdb_draft_expiry_days',
  POWER_AUTOMATE_FLOW_ID: 'qdb_power_automate_flow_id',
  CONFIRMATION_MESSAGE: 'qdb_confirmation_message',
  CONFIRMATION_RECORD_REF_ATTRIBUTE: 'qdb_confirmation_record_ref_attribute',
  ACCESS_GROUP_ID: 'qdb_access_group_id',
  CREATED_BY: 'createdby',
  CREATED_ON: 'createdon',
  MODIFIED_BY: 'modifiedby',
  MODIFIED_ON: 'modifiedon',
} as const;

// Picklist option values for qdb_status
export const FORM_STATUS_VALUE = {
  DRAFT: 100000000,
  ACTIVE: 100000001,
  INACTIVE: 100000002,
  ARCHIVED: 100000003,
} as const;

// Map CRM integer → app FormStatus string
export const PICKLIST_TO_STATUS: Record<number, string> = {
  100000000: 'draft',
  100000001: 'published',
  100000002: 'published',
  100000003: 'archived',
};

// Map app FormStatus string → CRM integer
export const STATUS_TO_PICKLIST: Record<string, number> = {
  draft:     100000000,
  published: 100000001,
  archived:  100000003,
};

export const FORM_TAB_ATTRS = {
  ID: 'qdb_form_tabid',
  FORM_ID: 'qdb_form_definition_id',              // use for create/update (lookup write)
  FORM_ID_VALUE: '_qdb_form_definition_id_value', // use for $select and read
  LABEL: 'qdb_label',
  ICON_NAME: 'qdb_icon_name',
  SORT_ORDER: 'qdb_display_order',
  IS_VISIBLE: 'qdb_is_visible',
  REQUIRES_PREVIOUS_TAB_COMPLETE: 'qdb_requires_previous_tab_complete',
} as const;

export const FORM_SECTION_ATTRS = {
  ID: 'qdb_form_sectionid',
  TAB_ID: 'qdb_form_tab_id',               // use for create/update
  TAB_ID_VALUE: '_qdb_form_tab_id_value',   // use for $select and read
  LABEL: 'qdb_label',
  DESCRIPTION: 'qdb_description',
  COLUMN_COUNT: 'qdb_columns',
  IS_COLLAPSIBLE: 'qdb_is_collapsible',
  IS_COLLAPSED_BY_DEFAULT: 'qdb_is_collapsed_by_default',
  IS_VISIBLE: 'qdb_is_visible',
  SORT_ORDER: 'qdb_display_order',
} as const;

// Picklist codes for qdb_columns (1–4 column layouts)
// phase-4-crm.md: 1 Column = 100000001, 2 Columns = 100000002, 3 Columns = 100000003, 4 Columns = 100000004
export const COLUMN_COUNT_TO_PICKLIST: Record<number, number> = {
  1: 100000001, 2: 100000002, 3: 100000003, 4: 100000004,
};
export const PICKLIST_TO_COLUMN_COUNT: Record<number, 1 | 2 | 3> = {
  100000001: 1, 100000002: 2, 100000003: 3, 100000004: 3,
  1: 1, 2: 2, 3: 3,
};

export const FORM_FIELD_ATTRS = {
  ID: 'qdb_form_fieldid',
  SECTION_ID: 'qdb_form_section_id',               // use for create/update
  SECTION_ID_VALUE: '_qdb_form_section_id_value',  // use for $select and read
  LABEL: 'qdb_label',
  CODE: 'qdb_schema_name',
  FIELD_TYPE: 'qdb_field_type',                    // Picklist — see FIELD_TYPE_TO_PICKLIST
  PLACEHOLDER: 'qdb_placeholder',
  HELP_TEXT: 'qdb_tooltip',
  IS_REQUIRED: 'qdb_is_required',
  IS_READ_ONLY: 'qdb_is_readonly',
  IS_HIDDEN: 'qdb_is_hidden',
  DEFAULT_VALUE: 'qdb_default_value',
  CURRENCY_CODE: 'qdb_currency_code',
  DECIMAL_PLACES: 'qdb_decimal_places',
  MAX_ROWS: 'qdb_max_rows',
  SORT_ORDER: 'qdb_display_order',
  COLUMN_SPAN: 'qdb_column_span',                  // Picklist — see COLUMN_SPAN_TO_PICKLIST
  PARENT_FIELD_ID: 'qdb_parent_field_id',
  PARENT_FIELD_ID_VALUE: '_qdb_parent_field_id_value',
  // Sprint 3 — custom field type
  COMPONENT_KEY: 'qdb_component_key',
  // Sprint 4 — boolean field type
  BOOL_RENDER_STYLE: 'qdb_bool_render_style',
  TRUE_LABEL: 'qdb_true_label',
  FALSE_LABEL: 'qdb_false_label',
  // Sprint 4 — info-card inline field
  INFO_CARD_STYLE: 'qdb_info_card_style',
  INFO_CARD_TITLE: 'qdb_info_card_title',
  INFO_CARD_BODY: 'qdb_info_card_body',
  INFO_CARD_ICON: 'qdb_info_card_icon',
} as const;

// Picklist codes for qdb_field_type
// phase-4-crm.md: text=100000001, textarea=100000002, ...
export const FIELD_TYPE_TO_PICKLIST: Record<string, number> = {
  text:          100000001,
  textarea:      100000002,
  number:        100000003,
  date:          100000004,
  datetime:      100000005,
  dropdown:      100000006,
  multi_select:  100000007,
  lookup:        100000008,
  checkbox:      100000009,
  radio:         100000010,
  currency:      100000011,
  decimal:       100000012,
  email:         100000013,
  phone:         100000014,
  file_upload:   100000015,
  repeating_grid:100000016,
  rich_text:     100000017,
  // Sprint 3
  custom:          100000018,
  // Sprint 4
  boolean:         100000019,
  'info-card':     100000020,
  'interactive-grid': 100000021,
};
export const PICKLIST_TO_FIELD_TYPE: Record<number, string> = Object.fromEntries(
  Object.entries(FIELD_TYPE_TO_PICKLIST).map(([k, v]) => [v, k])
);

// Picklist codes for qdb_column_span
// phase-4-crm.md: 1=100000001, 2=100000002, 3=100000003, 4=100000004
export const COLUMN_SPAN_TO_PICKLIST: Record<number, number> = {
  1: 100000001, 2: 100000002, 3: 100000003,
};
export const PICKLIST_TO_COLUMN_SPAN: Record<number, 1 | 2 | 3> = {
  100000001: 1, 100000002: 2, 100000003: 3, 100000004: 3,
  1: 1, 2: 2, 3: 3,
};

// Boolean render style — qdb_bool_render_style picklist
export const BOOL_RENDER_STYLE_TO_PICKLIST: Record<string, number> = {
  toggle: 100000000,
  radio:  100000001,
};
export const PICKLIST_TO_BOOL_RENDER_STYLE: Record<number, 'toggle' | 'radio'> = {
  100000000: 'toggle',
  100000001: 'radio',
};

// Info-card style — qdb_info_card_style picklist
export const INFO_CARD_STYLE_TO_PICKLIST: Record<string, number> = {
  info:    100000000,
  warning: 100000001,
  success: 100000002,
  error:   100000003,
};
export const PICKLIST_TO_INFO_CARD_STYLE: Record<number, 'info' | 'warning' | 'success' | 'error'> = {
  100000000: 'info',
  100000001: 'warning',
  100000002: 'success',
  100000003: 'error',
};

export const FORM_VALIDATION_RULE_ATTRS = {
  ID: 'qdb_form_validation_ruleid',
  FIELD_ID: 'qdb_form_field_id',
  FIELD_ID_VALUE: '_qdb_form_field_id_value',
  RULE_TYPE: 'qdb_rule_type',
  ERROR_MESSAGE: 'qdb_error_message',
  MIN_LENGTH: 'qdb_min_length',
  MAX_LENGTH: 'qdb_max_length',
  MIN_VALUE: 'qdb_min_value',
  MAX_VALUE: 'qdb_max_value',
  REGEX_PATTERN: 'qdb_regex_pattern',
  COMPARE_TO_FIELD_ID: 'qdb_compare_to_field_id',
  COMPARE_TO_VALUE: 'qdb_compare_to_value',
  SORT_ORDER: 'qdb_priority',
  IS_ACTIVE: 'qdb_is_active',
  // Sprint 3
  CUSTOM_EXPRESSION: 'qdb_custom_expression',
  RULE_TEMPLATE_ID: 'qdb_rule_template_id',
  RULE_TEMPLATE_ID_VALUE: '_qdb_rule_template_id_value',
} as const;

export const FORM_BUSINESS_RULE_ATTRS = {
  ID: 'qdb_form_business_ruleid',
  FORM_ID: 'qdb_form_definition_id',
  FORM_ID_VALUE: '_qdb_form_definition_id_value',
  NAME: 'qdb_name',
  RULE_DEFINITION: 'qdb_conditions_json',
  IS_ACTIVE: 'qdb_is_active',
  SORT_ORDER: 'qdb_priority',
} as const;

export const FORM_OPTION_VALUE_ATTRS = {
  ID: 'qdb_form_option_valueid',
  FIELD_ID: 'qdb_form_field_id',
  FIELD_ID_VALUE: '_qdb_form_field_id_value',
  LABEL: 'qdb_label',
  VALUE: 'qdb_value',
  SORT_ORDER: 'qdb_display_order',
  IS_DEFAULT: 'qdb_is_default',
  PARENT_OPTION_VALUE: 'qdb_parent_option_value',
  IS_ACTIVE: 'qdb_is_active',
} as const;

export const FORM_LOOKUP_CONFIG_ATTRS = {
  ID: 'qdb_form_lookup_configid',
  FIELD_ID: 'qdb_form_field_id',
  FIELD_ID_VALUE: '_qdb_form_field_id_value',
  TARGET_ENTITY: 'qdb_entity_logical_name',  // correct attr — not qdb_target_entity
  DISPLAY_FIELD: 'qdb_display_attribute',
  VALUE_FIELD: 'qdb_value_attribute',
  FILTER_QUERY: 'qdb_filter_expression',
  SEARCH_MIN_CHARS: 'qdb_search_min_chars',
  MAX_RESULTS: 'qdb_max_results',
} as const;

export const FORM_SUBMISSION_MAPPING_ATTRS = {
  ID: 'qdb_form_submission_mappingid',
  FORM_ID: 'qdb_form_definition_id',
  FORM_ID_VALUE: '_qdb_form_definition_id_value',
  FIELD_ID: 'qdb_form_field_id',
  FIELD_ID_VALUE: '_qdb_form_field_id_value',
  TARGET_ENTITY: 'qdb_target_entity_logical_name',
  TARGET_ATTRIBUTE: 'qdb_target_attribute_logical_name',
  IS_CHILD_ENTITY: 'qdb_is_child_entity',
  CHILD_ENTITY_RELATIONSHIP_NAME: 'qdb_child_entity_relationship_name',
  TRANSFORM_EXPRESSION: 'qdb_transform_expression',
  IS_ACTIVE: 'qdb_is_active',
} as const;

export const FORM_VERSION_ATTRS = {
  ID: 'qdb_form_versionid',
  FORM_ID: 'qdb_form_definition_id',
  FORM_ID_VALUE: '_qdb_form_definition_id_value',
  VERSION_NUMBER: 'qdb_version_number',
  VERSION_LABEL: 'qdb_change_notes',
  SNAPSHOT_JSON: 'qdb_metadata_snapshot_json',
  PUBLISHED_ON: 'qdb_published_at',
  PUBLISHED_BY: 'qdb_published_by',
} as const;

export const THEME_ATTRS = {
  ID: 'qdb_themeid',
  NAME: 'qdb_theme_name',
  PRIMARY_COLOR: 'qdb_primary_color',
  ACCENT_COLOR: 'qdb_secondary_color',
  BACKGROUND_COLOR: 'qdb_background_color',
  FONT_FAMILY: 'qdb_font_family',
  FONT_SIZE_BASE: 'qdb_base_font_size',
  BORDER_RADIUS: 'qdb_border_radius',
} as const;

export const FORM_DESIGN_ATTRS = {
  ID: 'qdb_form_designid',
  FORM_ID: 'qdb_form_definition_id',
  THEME_ID: 'qdb_theme_id',
  CUSTOM_CSS: 'qdb_custom_css',
} as const;

export const FORM_AUDIT_LOG_ATTRS = {
  ID: 'qdb_form_audit_logid',
  FORM_ID: 'qdb_form_definition_id',
  ACTION: 'qdb_event_type',
  ACTOR_ID: 'qdb_user_id',
  ACTOR_NAME: 'qdb_user_display_name',
  TIMESTAMP: 'qdb_timestamp_utc',
  PAYLOAD_JSON: 'qdb_changed_data_json',
} as const;

export const SECTION_DESIGN_ATTRS = {
  ID: 'qdb_section_designid',
  SECTION_ID: 'qdb_form_section_id',
  CSS_CLASS: 'qdb_css_class',
  CUSTOM_CSS: 'qdb_custom_css',
} as const;

export const FIELD_DESIGN_ATTRS = {
  ID: 'qdb_field_designid',
  FIELD_ID: 'qdb_form_field_id',
  LABEL_STYLE: 'qdb_label_style',
  INPUT_STYLE: 'qdb_input_style',
} as const;

export const BUTTON_DESIGN_ATTRS = {
  ID: 'qdb_button_designid',
  FORM_ID: 'qdb_form_definition_id',
  BUTTON_TYPE: 'qdb_button_type',
  STYLE: 'qdb_style',
  LABEL: 'qdb_label',
} as const;

// ─── Sprint 3 — qdb_rule_template ────────────────────────────────────────────

export const RULE_TEMPLATE_ATTRS = {
  ID: 'qdb_rule_templateid',
  NAME: 'qdb_name',
  RULE_TYPE: 'qdb_rule_type',
  ERROR_MESSAGE: 'qdb_error_message',
  MIN_LENGTH: 'qdb_min_length',
  MAX_LENGTH: 'qdb_max_length',
  MIN_VALUE: 'qdb_min_value',
  MAX_VALUE: 'qdb_max_value',
  REGEX_PATTERN: 'qdb_regex_pattern',
  CUSTOM_EXPRESSION: 'qdb_custom_expression',
} as const;

// Picklist codes for qdb_rule_template.qdb_rule_type (same set as qdb_form_validation_rule)
export const RULE_TYPE_TO_PICKLIST: Record<string, number> = {
  required:           100000001,
  min_length:         100000002,
  max_length:         100000003,
  min_value:          100000004,
  max_value:          100000005,
  regex:              100000006,
  email:              100000007,
  phone:              100000008,
  date_before:        100000009,
  date_after:         100000010,
  cross_field:        100000011,
  custom_expression:  100000012,
};
export const PICKLIST_TO_RULE_TYPE: Record<number, string> = Object.fromEntries(
  Object.entries(RULE_TYPE_TO_PICKLIST).map(([k, v]) => [v, k])
);

// ─── Sprint 4 — qdb_fieldlabel ───────────────────────────────────────────────

export const FIELD_LABEL_ATTRS = {
  ID: 'qdb_fieldlabelid',
  FIELD_ID: 'qdb_form_field_id',
  FIELD_ID_VALUE: '_qdb_form_field_id_value',
  NAME: 'qdb_name',
  LOCALE: 'qdb_locale',
  LABEL: 'qdb_label',
  PLACEHOLDER: 'qdb_placeholder',
  TOOLTIP: 'qdb_tooltip',
} as const;

// ─── Sprint 4 — qdb_form_access_policy ───────────────────────────────────────

export const FORM_ACCESS_POLICY_ATTRS = {
  ID: 'qdb_form_access_policyid',
  FORM_ID: 'qdb_form_definition_id',
  FORM_ID_VALUE: '_qdb_form_definition_id_value',
  NAME: 'qdb_name',
  ROLE_ID: 'qdb_role_id',
  ACCESS_TYPE: 'qdb_access_type',
} as const;

export const ACCESS_TYPE_TO_PICKLIST: Record<string, number> = {
  view:   100000001,
  submit: 100000002,
  draft:  100000003,
};
export const PICKLIST_TO_ACCESS_TYPE: Record<number, string> = Object.fromEntries(
  Object.entries(ACCESS_TYPE_TO_PICKLIST).map(([k, v]) => [v, k])
);
