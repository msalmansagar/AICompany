// Raw Dataverse response shapes and domain-mapper functions for DesignAssembler.
// Kept in a separate module so DesignAssembler.ts stays within the 400-line NFR-014 cap.
import type {
  ThemeDefinition,
  FormDesign,
  SectionDesign,
  FieldDesign,
  ButtonDesign,
  LayoutGrid,
  LayoutType,
  LabelPosition,
  SectionStyleType,
  TabStyleType,
  ButtonStyleType,
  InputStyleType,
  FieldWidthType,
  ButtonType,
  ButtonSizeType,
  CollapseStyleType,
  AnimationStyleType,
  HoverEffectType,
  LoadingStyleType,
  ShadowStyle,
  SpacingScale,
  AlignmentType,
  CardStyleType,
} from '@qdb/shared';

// ── Raw Dataverse entity shapes ───────────────────────────────────────────────
// PK naming: {entityLogicalName}id (no underscore). Lookup values: _{attr}_value.

export interface RawTheme {
  qdb_themeid: string;
  qdb_theme_code: string;
  qdb_theme_name: string;
  qdb_primary_color: string;
  qdb_secondary_color?: string;
  qdb_background_color?: string;
  qdb_surface_color?: string;
  qdb_text_primary_color?: string;
  qdb_text_secondary_color?: string;
  qdb_border_color?: string;
  qdb_error_color?: string;
  qdb_success_color?: string;
  qdb_warning_color?: string;
  qdb_font_family?: string;
  qdb_font_url?: string;
  qdb_base_font_size?: string;
  qdb_heading_font_size?: string;
  qdb_label_font_size?: string;
  qdb_input_font_size?: string;
  qdb_border_radius?: string;
  qdb_shadow_style?: number;
  qdb_spacing_scale?: number;
  qdb_is_dark_mode?: boolean;
  qdb_is_active?: boolean;
}

export interface RawFormDesign {
  qdb_form_designid: string;
  _qdb_form_definition_id_value: string;
  _qdb_theme_id_value?: string;
  qdb_theme_id?: RawTheme;
  qdb_layout_type: number;
  qdb_label_position: number;
  qdb_section_style: number;
  qdb_tab_style: number;
  qdb_button_style: number;
  qdb_animation_enabled?: boolean;
  qdb_responsive_behavior?: string;
  qdb_max_width?: string;
  qdb_alignment: number;
  qdb_custom_css?: string;
  qdb_sticky_action_bar?: boolean;
  qdb_skeleton_loader_enabled?: boolean;
  qdb_is_active?: boolean;
}

export interface RawSectionDesign {
  qdb_section_designid: string;
  _qdb_form_section_id_value: string;
  qdb_background_color?: string;
  qdb_border_style?: string;
  qdb_padding?: string;
  qdb_margin?: string;
  qdb_column_layout: number;
  qdb_card_style: number;
  qdb_collapsible_style: number;
  qdb_header_style?: string;
  qdb_visibility_animation: number;
  qdb_is_active?: boolean;
}

export interface RawFieldDesign {
  qdb_field_designid: string;
  _qdb_form_field_id_value: string;
  qdb_label_style?: string;
  qdb_input_style: number;
  qdb_width: number;
  qdb_custom_width?: string;
  qdb_height?: string;
  qdb_placeholder_style?: string;
  qdb_icon_prefix?: string;
  qdb_icon_suffix?: string;
  qdb_tooltip_style?: string;
  qdb_error_style?: string;
  qdb_focus_style?: string;
  qdb_disabled_style?: string;
  qdb_is_active?: boolean;
}

export interface RawButtonDesign {
  qdb_button_designid: string;
  _qdb_form_definition_id_value: string;
  qdb_button_type: number;
  qdb_color?: string;
  qdb_size: number;
  qdb_border_radius?: string;
  qdb_alignment: number;
  qdb_icon?: string;
  qdb_hover_effect: number;
  qdb_loading_style: number;
  qdb_is_active?: boolean;
}

export interface RawLayoutGrid {
  qdb_layout_gridid: string;
  _qdb_form_design_id_value: string;
  _qdb_form_field_id_value: string;
  qdb_columns_total: number;
  qdb_span_mobile: number;
  qdb_span_tablet: number;
  qdb_span_desktop: number;
}

// ── Domain mappers ────────────────────────────────────────────────────────────

export function mapTheme(raw: RawTheme): ThemeDefinition {
  return {
    id: raw.qdb_themeid,
    themeCode: raw.qdb_theme_code,
    themeName: raw.qdb_theme_name,
    primaryColor: raw.qdb_primary_color,
    secondaryColor: raw.qdb_secondary_color,
    backgroundColor: raw.qdb_background_color,
    surfaceColor: raw.qdb_surface_color,
    textPrimaryColor: raw.qdb_text_primary_color,
    textSecondaryColor: raw.qdb_text_secondary_color,
    borderColor: raw.qdb_border_color,
    errorColor: raw.qdb_error_color,
    successColor: raw.qdb_success_color,
    warningColor: raw.qdb_warning_color,
    fontFamily: raw.qdb_font_family,
    fontUrl: raw.qdb_font_url,
    baseFontSize: raw.qdb_base_font_size,
    headingFontSize: raw.qdb_heading_font_size,
    labelFontSize: raw.qdb_label_font_size,
    inputFontSize: raw.qdb_input_font_size,
    borderRadius: raw.qdb_border_radius,
    shadowStyle: raw.qdb_shadow_style !== undefined ? mapShadowStyle(raw.qdb_shadow_style) : undefined,
    spacingScale: raw.qdb_spacing_scale !== undefined ? mapSpacingScale(raw.qdb_spacing_scale) : undefined,
    isDarkMode: raw.qdb_is_dark_mode ?? false,
    isActive: raw.qdb_is_active ?? true,
  };
}

export function mapFormDesign(raw: RawFormDesign): FormDesign {
  return {
    id: raw.qdb_form_designid,
    formDefinitionId: raw._qdb_form_definition_id_value,
    themeId: raw._qdb_theme_id_value,
    layoutType: mapLayoutType(raw.qdb_layout_type),
    labelPosition: mapLabelPosition(raw.qdb_label_position),
    sectionStyle: mapSectionStyle(raw.qdb_section_style),
    tabStyle: mapTabStyle(raw.qdb_tab_style),
    buttonStyle: mapButtonStyle(raw.qdb_button_style),
    animationEnabled: raw.qdb_animation_enabled ?? true,
    responsiveBehavior: raw.qdb_responsive_behavior
      ? (JSON.parse(raw.qdb_responsive_behavior) as Record<string, unknown>)
      : undefined,
    maxWidth: raw.qdb_max_width,
    alignment: mapAlignment(raw.qdb_alignment),
    customCss: raw.qdb_custom_css,
    stickyActionBar: raw.qdb_sticky_action_bar ?? false,
    skeletonLoaderEnabled: raw.qdb_skeleton_loader_enabled ?? true,
    isActive: raw.qdb_is_active ?? true,
  };
}

export function mapSectionDesign(raw: RawSectionDesign): SectionDesign {
  return {
    id: raw.qdb_section_designid,
    sectionId: raw._qdb_form_section_id_value,
    backgroundColor: raw.qdb_background_color,
    borderStyle: raw.qdb_border_style,
    padding: raw.qdb_padding,
    margin: raw.qdb_margin,
    columnLayout: mapColumnLayout(raw.qdb_column_layout),
    cardStyle: mapCardStyle(raw.qdb_card_style),
    collapsibleStyle: mapCollapseStyle(raw.qdb_collapsible_style),
    headerStyle: raw.qdb_header_style
      ? (JSON.parse(raw.qdb_header_style) as Record<string, string>)
      : undefined,
    visibilityAnimation: mapAnimationStyle(raw.qdb_visibility_animation),
    isActive: raw.qdb_is_active ?? true,
  };
}

export function mapFieldDesign(raw: RawFieldDesign): FieldDesign {
  return {
    id: raw.qdb_field_designid,
    fieldId: raw._qdb_form_field_id_value,
    labelStyle: raw.qdb_label_style
      ? (JSON.parse(raw.qdb_label_style) as Record<string, string>)
      : undefined,
    inputStyle: mapInputStyle(raw.qdb_input_style),
    width: mapFieldWidth(raw.qdb_width),
    customWidth: raw.qdb_custom_width,
    height: raw.qdb_height,
    placeholderStyle: raw.qdb_placeholder_style
      ? (JSON.parse(raw.qdb_placeholder_style) as Record<string, string>)
      : undefined,
    iconPrefix: raw.qdb_icon_prefix,
    iconSuffix: raw.qdb_icon_suffix,
    tooltipStyle: raw.qdb_tooltip_style
      ? (JSON.parse(raw.qdb_tooltip_style) as Record<string, string>)
      : undefined,
    errorStyle: raw.qdb_error_style
      ? (JSON.parse(raw.qdb_error_style) as Record<string, string>)
      : undefined,
    focusStyle: raw.qdb_focus_style
      ? (JSON.parse(raw.qdb_focus_style) as Record<string, string>)
      : undefined,
    disabledStyle: raw.qdb_disabled_style
      ? (JSON.parse(raw.qdb_disabled_style) as Record<string, string>)
      : undefined,
    isActive: raw.qdb_is_active ?? true,
  };
}

export function mapButtonDesign(raw: RawButtonDesign): ButtonDesign {
  return {
    id: raw.qdb_button_designid,
    formDefinitionId: raw._qdb_form_definition_id_value,
    buttonType: mapButtonType(raw.qdb_button_type),
    color: raw.qdb_color,
    size: mapButtonSize(raw.qdb_size),
    borderRadius: raw.qdb_border_radius,
    alignment: mapAlignment(raw.qdb_alignment),
    icon: raw.qdb_icon,
    hoverEffect: mapHoverEffect(raw.qdb_hover_effect),
    loadingStyle: mapLoadingStyle(raw.qdb_loading_style),
    isActive: raw.qdb_is_active ?? true,
  };
}

export function mapLayoutGrid(raw: RawLayoutGrid): LayoutGrid {
  return {
    id: raw.qdb_layout_gridid,
    formDesignId: raw._qdb_form_design_id_value,
    fieldId: raw._qdb_form_field_id_value,
    columnsTotal: raw.qdb_columns_total,
    spanMobile: raw.qdb_span_mobile,
    spanTablet: raw.qdb_span_tablet,
    spanDesktop: raw.qdb_span_desktop,
  };
}

export function mapButtonType(code: number): ButtonType {
  const map: Record<number, ButtonType> = {
    100000001: 'Submit', 100000002: 'SaveDraft', 100000003: 'Cancel',
  };
  return map[code] ?? 'Submit';
}

// ── Picklist code mappers ─────────────────────────────────────────────────────

function mapLayoutType(code: number): LayoutType {
  const map: Record<number, LayoutType> = {
    100000001: 'SingleColumn', 100000002: 'TwoColumn',   100000003: 'Grid',
    100000004: 'Stepper',      100000005: 'Wizard',       100000006: 'Accordion',
    100000007: 'TabBased',     100000008: 'InlineCompact',
  };
  return map[code] ?? 'SingleColumn';
}

function mapLabelPosition(code: number): LabelPosition {
  const map: Record<number, LabelPosition> = { 100000001: 'Top', 100000002: 'Left', 100000003: 'Floating' };
  return map[code] ?? 'Top';
}

function mapSectionStyle(code: number): SectionStyleType {
  const map: Record<number, SectionStyleType> = { 100000001: 'Card', 100000002: 'Flat', 100000003: 'Outlined' };
  return map[code] ?? 'Card';
}

function mapTabStyle(code: number): TabStyleType {
  const map: Record<number, TabStyleType> = {
    100000001: 'Tabs', 100000002: 'Stepper', 100000003: 'Accordion', 100000004: 'Sidebar',
  };
  return map[code] ?? 'Tabs';
}

function mapButtonStyle(code: number): ButtonStyleType {
  const map: Record<number, ButtonStyleType> = { 100000001: 'Primary', 100000002: 'Outline', 100000003: 'Text' };
  return map[code] ?? 'Primary';
}

function mapInputStyle(code: number): InputStyleType {
  const map: Record<number, InputStyleType> = { 100000001: 'Outlined', 100000002: 'Filled', 100000003: 'Standard' };
  return map[code] ?? 'Outlined';
}

function mapFieldWidth(code: number): FieldWidthType {
  const map: Record<number, FieldWidthType> = { 100000001: 'Full', 100000002: 'Half', 100000003: 'Custom' };
  return map[code] ?? 'Full';
}

function mapButtonSize(code: number): ButtonSizeType {
  const map: Record<number, ButtonSizeType> = { 100000001: 'Small', 100000002: 'Medium', 100000003: 'Large' };
  return map[code] ?? 'Medium';
}

function mapCollapseStyle(code: number): CollapseStyleType {
  const map: Record<number, CollapseStyleType> = {
    100000001: 'None', 100000002: 'Animated', 100000003: 'Instant',
  };
  return map[code] ?? 'None';
}

function mapAnimationStyle(code: number): AnimationStyleType {
  const map: Record<number, AnimationStyleType> = {
    100000001: 'None', 100000002: 'Fade', 100000003: 'Slide',
  };
  return map[code] ?? 'None';
}

function mapHoverEffect(code: number): HoverEffectType {
  const map: Record<number, HoverEffectType> = {
    100000001: 'None', 100000002: 'Elevate', 100000003: 'ColorShift',
  };
  return map[code] ?? 'None';
}

function mapLoadingStyle(code: number): LoadingStyleType {
  const map: Record<number, LoadingStyleType> = { 100000001: 'Spinner', 100000002: 'Dots', 100000003: 'Pulse' };
  return map[code] ?? 'Spinner';
}

function mapShadowStyle(code: number): ShadowStyle {
  const map: Record<number, ShadowStyle> = {
    100000001: 'None', 100000002: 'Subtle', 100000003: 'Strong',
  };
  return map[code] ?? 'None';
}

function mapSpacingScale(code: number): SpacingScale {
  const map: Record<number, SpacingScale> = {
    100000001: 'Compact', 100000002: 'Normal', 100000003: 'Comfortable',
  };
  return map[code] ?? 'Normal';
}

function mapAlignment(code: number): AlignmentType {
  const map: Record<number, AlignmentType> = { 100000001: 'Left', 100000002: 'Center', 100000003: 'Right' };
  return map[code] ?? 'Left';
}

function mapCardStyle(code: number): CardStyleType {
  const map: Record<number, CardStyleType> = { 100000001: 'Flat', 100000002: 'Elevated', 100000003: 'Outlined' };
  return map[code] ?? 'Flat';
}

function mapColumnLayout(code: number): 1 | 2 | 3 | 4 {
  const map: Record<number, 1 | 2 | 3 | 4> = { 100000001: 1, 100000002: 2, 100000003: 3, 100000004: 4 };
  return map[code] ?? 1;
}
