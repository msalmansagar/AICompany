// New style entity attributes for DFE-STYLE-001 (Advanced Visual Styling).
// These extend the existing design registries in designAttributeNames.ts.
// Do not inline these attribute names — always import from here.

/** Extended qdb_theme attributes — new fields added in DFE-STYLE-001 */
export const THEME_STYLE_ATTRS = {
  SECONDARY_COLOR: 'qdb_secondary_color',
  SURFACE_COLOR: 'qdb_surface_color',
  TEXT_PRIMARY_COLOR: 'qdb_text_primary_color',
  TEXT_SECONDARY_COLOR: 'qdb_text_secondary_color',
  BORDER_COLOR: 'qdb_border_color',
  ERROR_COLOR: 'qdb_error_color',
  SUCCESS_COLOR: 'qdb_success_color',
  WARNING_COLOR: 'qdb_warning_color',
  FONT_URL: 'qdb_font_url',
  HEADING_FONT_SIZE: 'qdb_heading_font_size',
  LABEL_FONT_SIZE: 'qdb_label_font_size',
  INPUT_FONT_SIZE: 'qdb_input_font_size',
  SHADOW_STYLE: 'qdb_shadow_style',
  SPACING_SCALE: 'qdb_spacing_scale',
  IS_DARK_MODE: 'qdb_is_dark_mode',
  THEME_CODE: 'qdb_theme_code',
} as const;

/** Extended qdb_form_design attributes — new fields added in DFE-STYLE-001 */
export const FORM_DESIGN_STYLE_ATTRS = {
  LAYOUT_TYPE: 'qdb_layout_type',
  LABEL_POSITION: 'qdb_label_position',
  FORM_BUTTON_STYLE: 'qdb_form_button_style',
  ALIGNMENT: 'qdb_alignment',
  MAX_WIDTH: 'qdb_max_width',
  SECTION_STYLE: 'qdb_section_style',
  ANIMATION_ENABLED: 'qdb_animation_enabled',
  STICKY_ACTION_BAR: 'qdb_sticky_action_bar',
  SKELETON_LOADER_ENABLED: 'qdb_skeleton_loader_enabled',
} as const;

/** Extended qdb_section_design attributes — new fields added in DFE-STYLE-001 */
export const SECTION_DESIGN_STYLE_ATTRS = {
  BACKGROUND_COLOR: 'qdb_background_color',
  BORDER_STYLE: 'qdb_border_style',
  PADDING: 'qdb_padding',
  MARGIN: 'qdb_margin',
  COLUMN_LAYOUT: 'qdb_column_layout',
  CARD_STYLE: 'qdb_card_style',
  COLLAPSIBLE_STYLE: 'qdb_collapsible_style',
  VISIBILITY_ANIMATION: 'qdb_visibility_animation',
  HEADER_STYLE_JSON: 'qdb_header_style_json',
  CSS_CLASS: 'qdb_css_class',
} as const;

/** Extended qdb_field_design attributes — new fields added in DFE-STYLE-001 */
export const FIELD_DESIGN_STYLE_ATTRS = {
  WIDTH: 'qdb_width',
  CUSTOM_WIDTH: 'qdb_custom_width',
  HEIGHT: 'qdb_height',
  ICON_PREFIX: 'qdb_icon_prefix',
  ICON_SUFFIX: 'qdb_icon_suffix',
  FOCUS_STYLE_JSON: 'qdb_focus_style_json',
  ERROR_STYLE_JSON: 'qdb_error_style_json',
  DISABLED_STYLE_JSON: 'qdb_disabled_style_json',
  PLACEHOLDER_STYLE_JSON: 'qdb_placeholder_style_json',
  TOOLTIP_STYLE_JSON: 'qdb_tooltip_style_json',
  CSS_CLASS: 'qdb_field_css_class',
} as const;

/** Extended qdb_button_design attributes — new fields added in DFE-STYLE-001 */
export const BUTTON_DESIGN_STYLE_ATTRS = {
  COLOR: 'qdb_color',
  BORDER_RADIUS: 'qdb_btn_border_radius',
  SIZE: 'qdb_size',
  ALIGNMENT: 'qdb_btn_alignment',
  ICON: 'qdb_icon',
  HOVER_EFFECT: 'qdb_hover_effect',
  LOADING_STYLE: 'qdb_loading_style',
} as const;

/** qdb_layout_grid entity attributes (new entity in DFE-STYLE-001) */
export const LAYOUT_GRID_ATTRS = {
  ID: 'qdb_layout_gridid',
  FORM_DESIGN_ID: 'qdb_form_design_id',
  FORM_DESIGN_ID_VALUE: '_qdb_form_design_id_value',
  FORM_FIELD_ID: 'qdb_form_field_id',
  FORM_FIELD_ID_VALUE: '_qdb_form_field_id_value',
  COLUMNS_TOTAL: 'qdb_columns_total',
  SPAN_MOBILE: 'qdb_span_mobile',
  SPAN_TABLET: 'qdb_span_tablet',
  SPAN_DESKTOP: 'qdb_span_desktop',
} as const;

/** qdb_css_allowlist_config entity attributes (new entity in DFE-STYLE-001) */
export const CSS_ALLOWLIST_CONFIG_ATTRS = {
  ID: 'qdb_css_allowlist_configid',
  CONFIG_KEY: 'qdb_config_key',
  ALLOWED_DOMAINS_JSON: 'qdb_allowed_domains_json',
  IS_ACTIVE: 'qdb_is_active',
} as const;
