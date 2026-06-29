// Design entity attribute registries (theme, form design, section design, field design, button design).
// These registries contain the EXISTING Dataverse attributes only.
// New style attributes added for DFE-STYLE-001 are in styleAttributeNames.ts.
// Split from attributeNames.ts (SC-09).

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
  TAB_STYLE: 'qdb_tab_style',
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
