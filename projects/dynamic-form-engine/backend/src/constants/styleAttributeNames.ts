// Dataverse attribute name registry for design-related entities.
// DesignAssembler builds all OData $select strings from these constants.
// Never inline attribute name strings outside this file.

/** qdb_form_tabs / qdb_form_sections / qdb_form_fields — hierarchy walk */
export const FORM_HIERARCHY_ATTRS = {
  TAB_ID: 'qdb_form_tabid',
  TAB_FORM_DEFINITION_ID_VALUE: '_qdb_form_definition_id_value',
  SECTION_ID: 'qdb_form_sectionid',
  SECTION_TAB_ID_VALUE: '_qdb_form_tab_id_value',
  FIELD_ID: 'qdb_form_fieldid',
  FIELD_SECTION_ID_VALUE: '_qdb_form_section_id_value',
} as const;

/** qdb_theme entity attributes */
export const THEME_ATTRS = {
  ID: 'qdb_themeid',
  THEME_CODE: 'qdb_theme_code',
  THEME_NAME: 'qdb_theme_name',
  PRIMARY_COLOR: 'qdb_primary_color',
  SECONDARY_COLOR: 'qdb_secondary_color',
  BACKGROUND_COLOR: 'qdb_background_color',
  SURFACE_COLOR: 'qdb_surface_color',
  TEXT_PRIMARY_COLOR: 'qdb_text_primary_color',
  TEXT_SECONDARY_COLOR: 'qdb_text_secondary_color',
  BORDER_COLOR: 'qdb_border_color',
  ERROR_COLOR: 'qdb_error_color',
  SUCCESS_COLOR: 'qdb_success_color',
  WARNING_COLOR: 'qdb_warning_color',
  FONT_FAMILY: 'qdb_font_family',
  FONT_URL: 'qdb_font_url',
  BASE_FONT_SIZE: 'qdb_base_font_size',
  HEADING_FONT_SIZE: 'qdb_heading_font_size',
  LABEL_FONT_SIZE: 'qdb_label_font_size',
  INPUT_FONT_SIZE: 'qdb_input_font_size',
  BORDER_RADIUS: 'qdb_border_radius',
  SHADOW_STYLE: 'qdb_shadow_style',
  SPACING_SCALE: 'qdb_spacing_scale',
  IS_DARK_MODE: 'qdb_is_dark_mode',
  IS_ACTIVE: 'qdb_is_active',
} as const;

/** qdb_form_design entity attributes */
export const FORM_DESIGN_ATTRS = {
  ID: 'qdb_form_designid',
  FORM_DEFINITION_ID_VALUE: '_qdb_form_definition_id_value',
  THEME_ID_VALUE: '_qdb_theme_id_value',
  LAYOUT_TYPE: 'qdb_layout_type',
  LABEL_POSITION: 'qdb_label_position',
  SECTION_STYLE: 'qdb_section_style',
  TAB_STYLE: 'qdb_tab_style',
  BUTTON_STYLE: 'qdb_button_style',
  ANIMATION_ENABLED: 'qdb_animation_enabled',
  RESPONSIVE_BEHAVIOR: 'qdb_responsive_behavior',
  MAX_WIDTH: 'qdb_max_width',
  ALIGNMENT: 'qdb_alignment',
  CUSTOM_CSS: 'qdb_custom_css',
  STICKY_ACTION_BAR: 'qdb_sticky_action_bar',
  SKELETON_LOADER_ENABLED: 'qdb_skeleton_loader_enabled',
  IS_ACTIVE: 'qdb_is_active',
} as const;

/** qdb_section_design entity attributes */
export const SECTION_DESIGN_ATTRS = {
  ID: 'qdb_section_designid',
  FORM_SECTION_ID_VALUE: '_qdb_form_section_id_value',
  BACKGROUND_COLOR: 'qdb_background_color',
  BORDER_STYLE: 'qdb_border_style',
  PADDING: 'qdb_padding',
  MARGIN: 'qdb_margin',
  COLUMN_LAYOUT: 'qdb_column_layout',
  CARD_STYLE: 'qdb_card_style',
  COLLAPSIBLE_STYLE: 'qdb_collapsible_style',
  HEADER_STYLE: 'qdb_header_style',
  VISIBILITY_ANIMATION: 'qdb_visibility_animation',
  IS_ACTIVE: 'qdb_is_active',
} as const;

/** qdb_field_design entity attributes */
export const FIELD_DESIGN_ATTRS = {
  ID: 'qdb_field_designid',
  FORM_FIELD_ID_VALUE: '_qdb_form_field_id_value',
  LABEL_STYLE: 'qdb_label_style',
  INPUT_STYLE: 'qdb_input_style',
  WIDTH: 'qdb_width',
  CUSTOM_WIDTH: 'qdb_custom_width',
  HEIGHT: 'qdb_height',
  PLACEHOLDER_STYLE: 'qdb_placeholder_style',
  ICON_PREFIX: 'qdb_icon_prefix',
  ICON_SUFFIX: 'qdb_icon_suffix',
  TOOLTIP_STYLE: 'qdb_tooltip_style',
  ERROR_STYLE: 'qdb_error_style',
  FOCUS_STYLE: 'qdb_focus_style',
  DISABLED_STYLE: 'qdb_disabled_style',
  IS_ACTIVE: 'qdb_is_active',
} as const;

/** qdb_button_design entity attributes */
export const BUTTON_DESIGN_ATTRS = {
  ID: 'qdb_button_designid',
  FORM_DEFINITION_ID_VALUE: '_qdb_form_definition_id_value',
  BUTTON_TYPE: 'qdb_button_type',
  COLOR: 'qdb_color',
  SIZE: 'qdb_size',
  BORDER_RADIUS: 'qdb_border_radius',
  ALIGNMENT: 'qdb_alignment',
  ICON: 'qdb_icon',
  HOVER_EFFECT: 'qdb_hover_effect',
  LOADING_STYLE: 'qdb_loading_style',
  IS_ACTIVE: 'qdb_is_active',
} as const;

/** qdb_layout_grid entity attributes */
export const LAYOUT_GRID_ATTRS = {
  ID: 'qdb_layout_gridid',
  FORM_DESIGN_ID_VALUE: '_qdb_form_design_id_value',
  FORM_FIELD_ID_VALUE: '_qdb_form_field_id_value',
  COLUMNS_TOTAL: 'qdb_columns_total',
  SPAN_MOBILE: 'qdb_span_mobile',
  SPAN_TABLET: 'qdb_span_tablet',
  SPAN_DESKTOP: 'qdb_span_desktop',
} as const;
