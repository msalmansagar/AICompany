// Grid column config attribute registries.
// Split from attributeNames.ts (SC-09).

// Grid mode picklist — qdb_grid_mode
export const GRID_MODE_TO_PICKLIST: Record<string, number> = {
  selection: 100000000,
  entry:     100000001,
};
export const PICKLIST_TO_GRID_MODE: Record<number, 'selection' | 'entry'> = {
  100000000: 'selection',
  100000001: 'entry',
};

// Grid selection mode — qdb_selection_mode
export const GRID_SELECTION_MODE_TO_PICKLIST: Record<string, number> = {
  single: 100000000,
  multi:  100000001,
};
export const PICKLIST_TO_GRID_SELECTION_MODE: Record<number, 'single' | 'multi'> = {
  100000000: 'single',
  100000001: 'multi',
};

// Grid column config attributes — qdb_grid_column_configs entity
export const GRID_COLUMN_CONFIG_ATTRS = {
  ID:             'qdb_grid_column_configid',
  FIELD_ID:       'qdb_form_field_id',
  FIELD_ID_VALUE: '_qdb_form_field_id_value',
  COLUMN_LABEL:   'qdb_column_label',
  TARGET_ATTR:    'qdb_column_attribute',
  COLUMN_TYPE:    'qdb_column_field_type',
  DISPLAY_ORDER:  'qdb_display_order',
  IS_VISIBLE:     'qdb_is_visible',
  IS_EDITABLE:    'qdb_is_editable',
  OPTIONS_JSON:   'qdb_column_options_json',
  // Per-column validation.
  IS_REQUIRED:        'qdb_is_required',
  MAX_LENGTH:         'qdb_max_length',
  VALIDATION_FORMAT:  'qdb_validation_format',
  VALIDATION_PATTERN: 'qdb_validation_pattern',
  VALIDATION_MESSAGE: 'qdb_validation_message',
} as const;
