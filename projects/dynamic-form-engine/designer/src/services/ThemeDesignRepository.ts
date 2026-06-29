import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { THEME_ATTRS } from '@/constants/designAttributeNames';
import { THEME_STYLE_ATTRS } from '@/constants/styleAttributeNames';
import type { ThemeDefinition } from '@qdb/shared';
import { withRetry } from './crmRetry';

// Org-verified Option Set codes (qdb_shadow_style, qdb_spacing_scale).
const SHADOW_TO_PICKLIST: Record<string, number> = { None: 100000001, Subtle: 100000002, Strong: 100000003 };
const SPACING_TO_PICKLIST: Record<string, number> = { Compact: 100000001, Normal: 100000002, Comfortable: 100000003 };
const PICKLIST_TO_SHADOW: Record<number, ThemeDefinition['shadowStyle']> = { 100000001: 'None', 100000002: 'Subtle', 100000003: 'Strong' };
const PICKLIST_TO_SPACING: Record<number, ThemeDefinition['spacingScale']> = { 100000001: 'Compact', 100000002: 'Normal', 100000003: 'Comfortable' };

/** Returns String(value) when present, else undefined — collapses the repeated null-guard pattern. */
function toOptionalString(value: unknown): string | undefined {
  return value != null ? String(value) : undefined;
}

export interface UpsertThemeDto {
  name: string;
  themeCode: string;
  primaryColor: string;
  secondaryColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  textPrimaryColor?: string;
  textSecondaryColor?: string;
  borderColor?: string;
  errorColor?: string;
  successColor?: string;
  warningColor?: string;
  fontFamily?: string;
  fontUrl?: string;
  baseFontSize?: string;
  headingFontSize?: string;
  labelFontSize?: string;
  inputFontSize?: string;
  borderRadius?: string;
  shadowStyle?: string;
  spacingScale?: string;
  isDarkMode?: boolean;
}

export interface ThemeSummary {
  id: string;
  name: string;
}

export class ThemeDesignRepository {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async upsertTheme(dto: UpsertThemeDto, existingThemeId?: string | null): Promise<string> {
    const payload = this.buildThemePayload(dto);

    if (existingThemeId) {
      await withRetry(
        () => this.webApi.updateRecord(ENTITY_NAMES.THEME, existingThemeId, payload),
        'updateTheme'
      );
      return existingThemeId;
    }

    const result = await withRetry(
      () => this.webApi.createRecord(ENTITY_NAMES.THEME, payload),
      'createTheme'
    );
    return result.id;
  }

  async getTheme(id: string): Promise<ThemeDefinition> {
    const select = this.buildThemeSelectClause();
    const record = await withRetry(
      () => this.webApi.retrieveRecord(ENTITY_NAMES.THEME, id, `?$select=${select}`),
      'getTheme'
    );
    return this.mapRecordToThemeDefinition(record, id);
  }

  async listThemes(): Promise<ThemeSummary[]> {
    const select = [THEME_ATTRS.ID, THEME_ATTRS.NAME].join(',');
    const orderBy = `${THEME_ATTRS.NAME} asc`;

    const result = await withRetry(
      () => this.webApi.retrieveMultipleRecords(
        ENTITY_NAMES.THEME,
        `?$select=${select}&$orderby=${orderBy}`
      ),
      'listThemes'
    );

    return result.entities.map(record => ({
      id: String(record[THEME_ATTRS.ID] ?? ''),
      name: String(record[THEME_ATTRS.NAME] ?? ''),
    }));
  }

  private buildThemeSelectClause(): string {
    return [
      THEME_ATTRS.ID, THEME_ATTRS.NAME, THEME_ATTRS.PRIMARY_COLOR,
      THEME_ATTRS.BACKGROUND_COLOR,
      THEME_ATTRS.FONT_FAMILY, THEME_ATTRS.FONT_SIZE_BASE, THEME_ATTRS.BORDER_RADIUS,
      THEME_STYLE_ATTRS.THEME_CODE, THEME_STYLE_ATTRS.SECONDARY_COLOR,
      THEME_STYLE_ATTRS.SURFACE_COLOR, THEME_STYLE_ATTRS.TEXT_PRIMARY_COLOR,
      THEME_STYLE_ATTRS.TEXT_SECONDARY_COLOR, THEME_STYLE_ATTRS.BORDER_COLOR,
      THEME_STYLE_ATTRS.ERROR_COLOR, THEME_STYLE_ATTRS.SUCCESS_COLOR,
      THEME_STYLE_ATTRS.WARNING_COLOR, THEME_STYLE_ATTRS.FONT_URL,
      THEME_STYLE_ATTRS.HEADING_FONT_SIZE, THEME_STYLE_ATTRS.LABEL_FONT_SIZE,
      THEME_STYLE_ATTRS.INPUT_FONT_SIZE, THEME_STYLE_ATTRS.SHADOW_STYLE,
      THEME_STYLE_ATTRS.SPACING_SCALE, THEME_STYLE_ATTRS.IS_DARK_MODE,
    ].join(',');
  }

  private buildThemePayload(dto: UpsertThemeDto): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      [THEME_ATTRS.NAME]: dto.name,
      [THEME_ATTRS.PRIMARY_COLOR]: dto.primaryColor,
      [THEME_ATTRS.FONT_FAMILY]: dto.fontFamily,
      [THEME_ATTRS.BORDER_RADIUS]: dto.borderRadius,
      [THEME_STYLE_ATTRS.THEME_CODE]: dto.themeCode,
      [THEME_STYLE_ATTRS.SECONDARY_COLOR]: dto.secondaryColor ?? null,
      [THEME_STYLE_ATTRS.SURFACE_COLOR]: dto.surfaceColor ?? null,
      [THEME_STYLE_ATTRS.TEXT_PRIMARY_COLOR]: dto.textPrimaryColor ?? null,
      [THEME_STYLE_ATTRS.TEXT_SECONDARY_COLOR]: dto.textSecondaryColor ?? null,
      [THEME_STYLE_ATTRS.BORDER_COLOR]: dto.borderColor ?? null,
      [THEME_STYLE_ATTRS.ERROR_COLOR]: dto.errorColor ?? null,
      [THEME_STYLE_ATTRS.SUCCESS_COLOR]: dto.successColor ?? null,
      [THEME_STYLE_ATTRS.WARNING_COLOR]: dto.warningColor ?? null,
      [THEME_STYLE_ATTRS.FONT_URL]: dto.fontUrl ?? null,
      [THEME_STYLE_ATTRS.HEADING_FONT_SIZE]: dto.headingFontSize ?? null,
      [THEME_STYLE_ATTRS.LABEL_FONT_SIZE]: dto.labelFontSize ?? null,
      [THEME_STYLE_ATTRS.INPUT_FONT_SIZE]: dto.inputFontSize ?? null,
      [THEME_STYLE_ATTRS.SHADOW_STYLE]: dto.shadowStyle ? (SHADOW_TO_PICKLIST[dto.shadowStyle] ?? null) : null,
      [THEME_STYLE_ATTRS.SPACING_SCALE]: dto.spacingScale ? (SPACING_TO_PICKLIST[dto.spacingScale] ?? null) : null,
      [THEME_STYLE_ATTRS.IS_DARK_MODE]: dto.isDarkMode ?? false,
    };
    if (dto.backgroundColor !== undefined) {
      payload[THEME_ATTRS.BACKGROUND_COLOR] = dto.backgroundColor;
    }
    return payload;
  }

  private mapRecordToThemeDefinition(record: Record<string, unknown>, id: string): ThemeDefinition {
    return {
      id,
      themeCode: String(record[THEME_STYLE_ATTRS.THEME_CODE] ?? ''),
      themeName: String(record[THEME_ATTRS.NAME] ?? 'Default'),
      primaryColor: String(record[THEME_ATTRS.PRIMARY_COLOR] ?? '#0078d4'),
      secondaryColor: toOptionalString(record[THEME_STYLE_ATTRS.SECONDARY_COLOR]),
      backgroundColor: toOptionalString(record[THEME_ATTRS.BACKGROUND_COLOR]),
      surfaceColor: toOptionalString(record[THEME_STYLE_ATTRS.SURFACE_COLOR]),
      textPrimaryColor: toOptionalString(record[THEME_STYLE_ATTRS.TEXT_PRIMARY_COLOR]),
      textSecondaryColor: toOptionalString(record[THEME_STYLE_ATTRS.TEXT_SECONDARY_COLOR]),
      borderColor: toOptionalString(record[THEME_STYLE_ATTRS.BORDER_COLOR]),
      errorColor: toOptionalString(record[THEME_STYLE_ATTRS.ERROR_COLOR]),
      successColor: toOptionalString(record[THEME_STYLE_ATTRS.SUCCESS_COLOR]),
      warningColor: toOptionalString(record[THEME_STYLE_ATTRS.WARNING_COLOR]),
      fontFamily: toOptionalString(record[THEME_ATTRS.FONT_FAMILY]),
      fontUrl: toOptionalString(record[THEME_STYLE_ATTRS.FONT_URL]),
      baseFontSize: toOptionalString(record[THEME_ATTRS.FONT_SIZE_BASE]),
      headingFontSize: toOptionalString(record[THEME_STYLE_ATTRS.HEADING_FONT_SIZE]),
      labelFontSize: toOptionalString(record[THEME_STYLE_ATTRS.LABEL_FONT_SIZE]),
      inputFontSize: toOptionalString(record[THEME_STYLE_ATTRS.INPUT_FONT_SIZE]),
      borderRadius: toOptionalString(record[THEME_ATTRS.BORDER_RADIUS]),
      shadowStyle: PICKLIST_TO_SHADOW[Number(record[THEME_STYLE_ATTRS.SHADOW_STYLE])],
      spacingScale: PICKLIST_TO_SPACING[Number(record[THEME_STYLE_ATTRS.SPACING_SCALE])],
      isDarkMode: Boolean(record[THEME_STYLE_ATTRS.IS_DARK_MODE] ?? false),
      isActive: true,
      _brand: 'ThemeDefinition',
    };
  }
}
