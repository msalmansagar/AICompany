// Validation rule template attribute registries.
// Split from attributeNames.ts (SC-09).

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
