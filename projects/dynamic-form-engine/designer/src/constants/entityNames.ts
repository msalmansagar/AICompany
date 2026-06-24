// Central registry of all CRM entity logical names used by the Form Designer.
// Never use inline strings for entity names — always reference from here.
// All entities are pre-provisioned in the target CRM environment.

export const ENTITY_NAMES = {
  FORM_DEFINITION: 'qdb_form_definition',
  FORM_TAB: 'qdb_form_tab',
  FORM_SECTION: 'qdb_form_section',
  FORM_FIELD: 'qdb_form_field',
  FORM_VALIDATION_RULE: 'qdb_form_validation_rule',
  FORM_BUSINESS_RULE: 'qdb_form_business_rule',
  FORM_OPTION_VALUE: 'qdb_form_option_value',
  FORM_LOOKUP_CONFIG: 'qdb_form_lookup_config',
  FORM_SUBMISSION_MAPPING: 'qdb_form_submission_mapping',
  FORM_VERSION: 'qdb_form_version',
  THEME: 'qdb_theme',
  FORM_DESIGN: 'qdb_form_design',
  SECTION_DESIGN: 'qdb_section_design',
  FIELD_DESIGN: 'qdb_field_design',
  BUTTON_DESIGN: 'qdb_button_design',
  FORM_AUDIT_LOG: 'qdb_form_audit_log',
  // Sprint 3+4
  RULE_TEMPLATE: 'qdb_rule_template',
  FIELD_LABEL: 'qdb_fieldlabel',
  FORM_ACCESS_POLICY: 'qdb_form_access_policy',
  // Sprint 5 — grid column config
  GRID_COLUMN_CONFIG: 'qdb_grid_column_configs',
  // i18n
  TRANSLATION: 'qdb_translation',
  LANGUAGE_CONFIG: 'qdb_language_config',
} as const;

export type EntityName = (typeof ENTITY_NAMES)[keyof typeof ENTITY_NAMES];
