import { LRUCache } from 'lru-cache';
import type {
  DesignPayload,
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
import { CrmBaseService } from './CrmBaseService.js';
import { ValidationError } from '../utils/errors.js';
import { CssSanitiserService } from '../utils/cssSanitiser.js';
import { logger } from '../utils/logger.js';
import type { CrmAuthService } from './CrmAuthService.js';

// Used when no form-specific or global theme is found in Dataverse.
// Provides a safe, accessible baseline for all forms.
const DEFAULT_LIGHT_THEME: ThemeDefinition = {
  id: 'default-light',
  themeCode: 'light',
  themeName: 'Default Light',
  primaryColor: '#0078d4',
  backgroundColor: '#ffffff',
  surfaceColor: '#f5f5f5',
  textPrimaryColor: '#242424',
  textSecondaryColor: '#616161',
  borderColor: '#d1d1d1',
  errorColor: '#d13438',
  successColor: '#107c10',
  warningColor: '#ca5010',
  fontFamily: 'Segoe UI, system-ui, sans-serif',
  baseFontSize: '14px',
  borderRadius: '4px',
  shadowStyle: 'Subtle',
  spacingScale: 'Normal',
  isDarkMode: false,
  isActive: true,
};

const DEFAULT_FORM_DESIGN: Omit<FormDesign, 'id' | 'formDefinitionId'> = {
  layoutType: 'SingleColumn',
  labelPosition: 'Top',
  sectionStyle: 'Card',
  tabStyle: 'Tabs',
  buttonStyle: 'Primary',
  animationEnabled: true,
  alignment: 'Left',
  stickyActionBar: false,
  skeletonLoaderEnabled: true,
  isActive: true,
};

const SAFE_FORM_CODE_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;
const CACHE_KEY_ALL_THEMES = 'themes:all';

interface ODataCollection<T> {
  value: T[];
}

interface DesignFetchContext {
  formCode: string;
  formDefinitionId: string;
  correlationId: string;
}

// The design cache stores both DesignPayload (keyed by design:<formCode>)
// and ThemeDefinition[] (keyed by themes:all). The union type is intentional.
type DesignCacheValue = DesignPayload | ThemeDefinition[];

export class CrmDesignService extends CrmBaseService {
  constructor(
    authService: CrmAuthService,
    private readonly cache: LRUCache<string, DesignCacheValue>,
    private readonly cssSanitiser: CssSanitiserService,
  ) {
    super(authService);
  }

  async getDesignPayload(formCode: string, formDefinitionId: string): Promise<DesignPayload> {
    if (!SAFE_FORM_CODE_PATTERN.test(formCode)) {
      throw new ValidationError(`Invalid form code: '${formCode}'`);
    }

    const cacheKey = `design:${formCode}`;
    const cached = this.cache.get(cacheKey) as DesignPayload | undefined;
    if (cached) {
      logger.debug({ formCode, cacheHit: true }, 'Design cache hit');
      return cached;
    }

    logger.debug({ formCode, cacheHit: false }, 'Design cache miss â€” fetching from Dataverse');
    const payload = await this.fetchAndAssembleDesignPayload({ formCode, formDefinitionId, correlationId: formCode });
    this.cache.set(cacheKey, payload);
    return payload;
  }

  async getAllThemes(): Promise<ThemeDefinition[]> {
    const cached = this.cache.get(CACHE_KEY_ALL_THEMES) as ThemeDefinition[] | undefined;
    if (cached) {
      logger.debug({ cacheHit: true }, 'Themes cache hit');
      return cached;
    }

    const response = await this.crmFetch<ODataCollection<RawTheme>>(
      '/qdb_themes?$filter=statecode eq 0&$orderby=qdb_theme_name asc',
    );
    const themes = response.value.map((t) => this.mapTheme(t));
    this.cache.set(CACHE_KEY_ALL_THEMES, themes);
    return themes;
  }

  invalidateCache(formCode: string): void {
    this.cache.delete(`design:${formCode}`);
    logger.debug({ formCode }, 'Design cache invalidated for form');
  }

  invalidateAllCache(): void {
    this.cache.clear();
    logger.debug('All design cache entries cleared');
  }

  /** Returns the baseline design payload using the DEFAULT_LIGHT_THEME constant. */
  getDefaultPayload(): DesignPayload {
    return {
      theme: DEFAULT_LIGHT_THEME,
      formDesign: { id: 'default', ...DEFAULT_FORM_DESIGN },
      sectionDesigns: {},
      fieldDesigns: {},
      buttonDesigns: { Submit: undefined, SaveDraft: undefined, Cancel: undefined },
      layoutGrid: [],
    };
  }

  private async fetchAndAssembleDesignPayload(context: DesignFetchContext): Promise<DesignPayload> {
    // Round-trip 1: fetch form design with theme expanded in one call
    const formDesignResponse = await this.crmFetch<ODataCollection<RawFormDesign>>(
      `/qdb_form_designs?$filter=_qdb_form_definition_id_value eq '${context.formDefinitionId}' and qdb_is_active eq true` +
      `&$expand=qdb_theme_id($select=qdb_themeid,qdb_theme_code,qdb_theme_name,qdb_primary_color,qdb_secondary_color,qdb_background_color,qdb_surface_color,qdb_text_primary_color,qdb_text_secondary_color,qdb_border_color,qdb_error_color,qdb_success_color,qdb_warning_color,qdb_font_family,qdb_font_url,qdb_base_font_size,qdb_heading_font_size,qdb_label_font_size,qdb_input_font_size,qdb_border_radius,qdb_shadow_style,qdb_spacing_scale,qdb_is_dark_mode,qdb_is_active)&$top=1`,
    );

    const rawFormDesign = formDesignResponse.value[0];
    const { formDesign, theme } = await this.resolveFormDesignAndTheme(rawFormDesign, context);

    // Round-trips 2 and 3 run in parallel to minimise latency
    const [sectionResults, fieldResults, buttonResults, gridResults] = await Promise.allSettled([
      this.fetchSectionDesigns(context.formDefinitionId),
      this.fetchFieldDesigns(context.formDefinitionId),
      this.fetchButtonDesigns(context.formDefinitionId),
      this.fetchLayoutGrid(rawFormDesign?.qdb_form_designid),
    ]);

    const sectionDesigns = this.extractSettled(sectionResults, {}, 'sectionDesigns', context.formCode);
    const fieldDesigns = this.extractSettled(fieldResults, {}, 'fieldDesigns', context.formCode);
    const buttonDesigns = this.extractSettled(buttonResults, this.buildEmptyButtonDesigns(), 'buttonDesigns', context.formCode);
    const layoutGrid = this.extractSettled(gridResults, [], 'layoutGrid', context.formCode);

    const sanitisedFormDesign = this.sanitiseCustomCss(formDesign, context.formCode);
    return { theme, formDesign: sanitisedFormDesign, sectionDesigns, fieldDesigns, buttonDesigns, layoutGrid };
  }

  private async resolveFormDesignAndTheme(
    rawFormDesign: RawFormDesign | undefined,
    context: DesignFetchContext,
  ): Promise<{ formDesign: FormDesign; theme: ThemeDefinition }> {
    if (!rawFormDesign) {
      logger.debug({ formCode: context.formCode, themeResolution: 'default' }, 'No form design in Dataverse â€” using defaults');
      const theme = await this.resolveGlobalOrDefaultTheme(context);
      return { formDesign: this.buildDefaultFormDesign(context.formDefinitionId), theme };
    }

    const expandedTheme = rawFormDesign.qdb_theme_id;
    if (expandedTheme) {
      logger.debug({ formCode: context.formCode, themeResolution: 'form-specific' }, 'Theme resolved from form design record');
      return { formDesign: this.mapFormDesign(rawFormDesign), theme: this.mapTheme(expandedTheme) };
    }

    logger.debug({ formCode: context.formCode, themeResolution: 'global-or-default' }, 'No theme on form design â€” checking global');
    const theme = await this.resolveGlobalOrDefaultTheme(context);
    return { formDesign: this.mapFormDesign(rawFormDesign), theme };
  }

  private async resolveGlobalOrDefaultTheme(context: DesignFetchContext): Promise<ThemeDefinition> {
    const response = await this.crmFetch<ODataCollection<RawTheme>>(
      '/qdb_themes?$filter=qdb_is_active eq true and qdb_form_definitionid eq null&$top=1',
    ).catch((error: unknown) => {
      logger.warn({ formCode: context.formCode, error }, 'Failed to fetch global theme â€” falling back to default');
      return { value: [] as RawTheme[] };
    });

    const globalTheme = response.value[0];
    if (globalTheme) {
      logger.debug({ formCode: context.formCode, themeResolution: 'global' }, 'Global active theme resolved');
      return this.mapTheme(globalTheme);
    }

    logger.debug({ formCode: context.formCode, themeResolution: 'constant-default' }, 'Using DEFAULT_LIGHT_THEME constant');
    return DEFAULT_LIGHT_THEME;
  }

  private async fetchSectionDesigns(formDefinitionId: string): Promise<Record<string, SectionDesign>> {
    const response = await this.crmFetch<ODataCollection<RawSectionDesign>>(
      `/qdb_section_designs?$filter=_qdb_form_definition_id_value eq '${formDefinitionId}' and qdb_is_active eq true`,
    );
    return Object.fromEntries(
      response.value.map((s) => [s._qdb_form_section_id_value, this.mapSectionDesign(s)]),
    );
  }

  private async fetchFieldDesigns(formDefinitionId: string): Promise<Record<string, FieldDesign>> {
    const response = await this.crmFetch<ODataCollection<RawFieldDesign>>(
      `/qdb_field_designs?$filter=_qdb_form_definition_id_value eq '${formDefinitionId}' and qdb_is_active eq true`,
    );
    return Object.fromEntries(
      response.value.map((f) => [f._qdb_form_field_id_value, this.mapFieldDesign(f)]),
    );
  }

  private async fetchButtonDesigns(
    formDefinitionId: string,
  ): Promise<Record<ButtonType, ButtonDesign | undefined>> {
    const response = await this.crmFetch<ODataCollection<RawButtonDesign>>(
      `/qdb_button_designs?$filter=_qdb_form_definition_id_value eq '${formDefinitionId}' and qdb_is_active eq true`,
    );
    const result = this.buildEmptyButtonDesigns();
    for (const raw of response.value) {
      const buttonType = this.mapButtonType(raw.qdb_button_type);
      result[buttonType] = this.mapButtonDesign(raw);
    }
    return result;
  }

  private async fetchLayoutGrid(formDesignId: string | undefined): Promise<LayoutGrid[]> {
    if (!formDesignId) return [];
    const response = await this.crmFetch<ODataCollection<RawLayoutGrid>>(
      `/qdb_layout_grids?$filter=_qdb_form_design_id_value eq '${formDesignId}'`,
    );
    return response.value.map((g) => this.mapLayoutGrid(g));
  }

  private sanitiseCustomCss(formDesign: FormDesign, formCode: string): FormDesign {
    if (!formDesign.customCss) return formDesign;
    const sanitised = this.cssSanitiser.sanitise(formDesign.customCss, formCode);
    return { ...formDesign, customCss: sanitised };
  }

  private buildDefaultFormDesign(formDefinitionId: string): FormDesign {
    return { id: 'default', formDefinitionId, ...DEFAULT_FORM_DESIGN };
  }

  private buildEmptyButtonDesigns(): Record<ButtonType, ButtonDesign | undefined> {
    return { Submit: undefined, SaveDraft: undefined, Cancel: undefined };
  }

  private extractSettled<T>(
    result: PromiseSettledResult<T>,
    fallback: T,
    label: string,
    formCode: string,
  ): T {
    if (result.status === 'fulfilled') return result.value;
    logger.warn({ formCode, label, error: result.reason }, 'Design sub-query failed â€” using fallback');
    return fallback;
  }

  // â”€â”€ Domain mappers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private mapTheme(raw: RawTheme): ThemeDefinition {
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
      shadowStyle: raw.qdb_shadow_style !== undefined ? this.mapShadowStyle(raw.qdb_shadow_style) : undefined,
      spacingScale: raw.qdb_spacing_scale !== undefined ? this.mapSpacingScale(raw.qdb_spacing_scale) : undefined,
      isDarkMode: raw.qdb_is_dark_mode ?? false,
      isActive: raw.qdb_is_active ?? true,
    };
  }

  private mapFormDesign(raw: RawFormDesign): FormDesign {
    return {
      id: raw.qdb_form_designid,
      formDefinitionId: raw._qdb_form_definition_id_value,
      themeId: raw._qdb_theme_id_value,
      layoutType: this.mapLayoutType(raw.qdb_layout_type),
      labelPosition: this.mapLabelPosition(raw.qdb_label_position),
      sectionStyle: this.mapSectionStyle(raw.qdb_section_style),
      tabStyle: this.mapTabStyle(raw.qdb_tab_style),
      buttonStyle: this.mapButtonStyle(raw.qdb_button_style),
      animationEnabled: raw.qdb_animation_enabled ?? true,
      responsiveBehavior: raw.qdb_responsive_behavior
        ? (JSON.parse(raw.qdb_responsive_behavior) as Record<string, unknown>)
        : undefined,
      maxWidth: raw.qdb_max_width,
      alignment: this.mapAlignment(raw.qdb_alignment),
      customCss: raw.qdb_custom_css,
      stickyActionBar: raw.qdb_sticky_action_bar ?? false,
      skeletonLoaderEnabled: raw.qdb_skeleton_loader_enabled ?? true,
      isActive: raw.qdb_is_active ?? true,
    };
  }

  private mapSectionDesign(raw: RawSectionDesign): SectionDesign {
    return {
      id: raw.qdb_section_designid,
      sectionId: raw._qdb_form_section_id_value,
      backgroundColor: raw.qdb_background_color,
      borderStyle: raw.qdb_border_style,
      padding: raw.qdb_padding,
      margin: raw.qdb_margin,
      columnLayout: this.mapColumnLayout(raw.qdb_column_layout),
      cardStyle: this.mapCardStyle(raw.qdb_card_style),
      collapsibleStyle: this.mapCollapseStyle(raw.qdb_collapsible_style),
      headerStyle: raw.qdb_header_style
        ? (JSON.parse(raw.qdb_header_style) as Record<string, string>)
        : undefined,
      visibilityAnimation: this.mapAnimationStyle(raw.qdb_visibility_animation),
      isActive: raw.qdb_is_active ?? true,
    };
  }

  private mapFieldDesign(raw: RawFieldDesign): FieldDesign {
    return {
      id: raw.qdb_field_designid,
      fieldId: raw._qdb_form_field_id_value,
      labelStyle: raw.qdb_label_style
        ? (JSON.parse(raw.qdb_label_style) as Record<string, string>)
        : undefined,
      inputStyle: this.mapInputStyle(raw.qdb_input_style),
      width: this.mapFieldWidth(raw.qdb_width),
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

  private mapButtonDesign(raw: RawButtonDesign): ButtonDesign {
    return {
      id: raw.qdb_button_designid,
      formDefinitionId: raw._qdb_form_definition_id_value,
      buttonType: this.mapButtonType(raw.qdb_button_type),
      color: raw.qdb_color,
      size: this.mapButtonSize(raw.qdb_size),
      borderRadius: raw.qdb_border_radius,
      alignment: this.mapAlignment(raw.qdb_alignment),
      icon: raw.qdb_icon,
      hoverEffect: this.mapHoverEffect(raw.qdb_hover_effect),
      loadingStyle: this.mapLoadingStyle(raw.qdb_loading_style),
      isActive: raw.qdb_is_active ?? true,
    };
  }

  private mapLayoutGrid(raw: RawLayoutGrid): LayoutGrid {
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

  // â”€â”€ Picklist code mappers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private mapLayoutType(code: number): LayoutType {
    const map: Record<number, LayoutType> = {
      100000001: 'SingleColumn', 100000002: 'TwoColumn',  100000003: 'Grid',
      100000004: 'Stepper',     100000005: 'Wizard',      100000006: 'Accordion',
      100000007: 'TabBased',    100000008: 'InlineCompact',
    };
    return map[code] ?? 'SingleColumn';
  }

  private mapLabelPosition(code: number): LabelPosition {
    const map: Record<number, LabelPosition> = {
      100000001: 'Top', 100000002: 'Left', 100000003: 'Floating',
    };
    return map[code] ?? 'Top';
  }

  private mapSectionStyle(code: number): SectionStyleType {
    const map: Record<number, SectionStyleType> = {
      100000001: 'Card', 100000002: 'Flat', 100000003: 'Outlined',
    };
    return map[code] ?? 'Card';
  }

  private mapTabStyle(code: number): TabStyleType {
    const map: Record<number, TabStyleType> = {
      100000001: 'Tabs', 100000002: 'Stepper', 100000003: 'Accordion', 100000004: 'Sidebar',
    };
    return map[code] ?? 'Tabs';
  }

  private mapButtonStyle(code: number): ButtonStyleType {
    const map: Record<number, ButtonStyleType> = {
      100000001: 'Primary', 100000002: 'Outline', 100000003: 'Text',
    };
    return map[code] ?? 'Primary';
  }

  private mapInputStyle(code: number): InputStyleType {
    const map: Record<number, InputStyleType> = {
      100000001: 'Outlined', 100000002: 'Filled', 100000003: 'Standard',
    };
    return map[code] ?? 'Outlined';
  }

  private mapFieldWidth(code: number): FieldWidthType {
    const map: Record<number, FieldWidthType> = {
      100000001: 'Full', 100000002: 'Half', 100000003: 'Custom',
    };
    return map[code] ?? 'Full';
  }

  private mapButtonType(code: number): ButtonType {
    const map: Record<number, ButtonType> = {
      100000001: 'Submit', 100000002: 'SaveDraft', 100000003: 'Cancel',
    };
    return map[code] ?? 'Submit';
  }

  private mapButtonSize(code: number): ButtonSizeType {
    const map: Record<number, ButtonSizeType> = {
      100000001: 'Small', 100000002: 'Medium', 100000003: 'Large',
    };
    return map[code] ?? 'Medium';
  }

  private mapCollapseStyle(code: number): CollapseStyleType {
    const map: Record<number, CollapseStyleType> = {
      100000001: 'None', 100000002: 'Animated', 100000003: 'Instant',
    };
    return map[code] ?? 'None';
  }

  private mapAnimationStyle(code: number): AnimationStyleType {
    const map: Record<number, AnimationStyleType> = {
      100000001: 'None', 100000002: 'Fade', 100000003: 'Slide',
    };
    return map[code] ?? 'None';
  }

  private mapHoverEffect(code: number): HoverEffectType {
    const map: Record<number, HoverEffectType> = {
      100000001: 'None', 100000002: 'Elevate', 100000003: 'ColorShift',
    };
    return map[code] ?? 'None';
  }

  private mapLoadingStyle(code: number): LoadingStyleType {
    const map: Record<number, LoadingStyleType> = {
      100000001: 'Spinner', 100000002: 'Dots', 100000003: 'Pulse',
    };
    return map[code] ?? 'Spinner';
  }

  private mapShadowStyle(code: number): ShadowStyle {
    const map: Record<number, ShadowStyle> = {
      100000001: 'None', 100000002: 'Subtle', 100000003: 'Strong',
    };
    return map[code] ?? 'None';
  }

  private mapSpacingScale(code: number): SpacingScale {
    const map: Record<number, SpacingScale> = {
      100000001: 'Compact', 100000002: 'Normal', 100000003: 'Comfortable',
    };
    return map[code] ?? 'Normal';
  }

  private mapAlignment(code: number): AlignmentType {
    const map: Record<number, AlignmentType> = {
      100000001: 'Left', 100000002: 'Center', 100000003: 'Right',
    };
    return map[code] ?? 'Left';
  }

  private mapCardStyle(code: number): CardStyleType {
    const map: Record<number, CardStyleType> = {
      100000001: 'Flat', 100000002: 'Elevated', 100000003: 'Outlined',
    };
    return map[code] ?? 'Flat';
  }

  private mapColumnLayout(code: number): 1 | 2 | 3 | 4 {
    const map: Record<number, 1 | 2 | 3 | 4> = {
      100000001: 1, 100000002: 2, 100000003: 3, 100000004: 4,
    };
    return map[code] ?? 1;
  }
}

// â”€â”€ Raw Dataverse response types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PK names follow Dataverse convention: {entityLogicalName}id (no underscore before id)
// Lookup values follow OData convention: _{attributeName}_value

interface RawTheme {
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

interface RawFormDesign {
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

interface RawSectionDesign {
  qdb_section_designid: string;
  _qdb_form_section_id_value: string;
  _qdb_form_definition_id_value: string;
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

interface RawFieldDesign {
  qdb_field_designid: string;
  _qdb_form_field_id_value: string;
  _qdb_form_definition_id_value: string;
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

interface RawButtonDesign {
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

interface RawLayoutGrid {
  qdb_layout_gridid: string;
  _qdb_form_design_id_value: string;
  _qdb_form_field_id_value: string;
  qdb_columns_total: number;
  qdb_span_mobile: number;
  qdb_span_tablet: number;
  qdb_span_desktop: number;
}
