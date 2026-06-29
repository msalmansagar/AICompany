import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { THEME_ATTRS } from '@/constants/designAttributeNames';
import { THEME_STYLE_ATTRS } from '@/constants/styleAttributeNames';
import type { ThemeDefinition } from '@qdb/shared';
import { withRetry } from './crmRetry';

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
      THEME_ATTRS.ACCENT_COLOR, THEME_ATTRS.BACKGROUND_COLOR,
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
      [THEME_STYLE_ATTRS.SHADOW_STYLE]: dto.shadowStyle ?? null,
      [THEME_STYLE_ATTRS.SPACING_SCALE]: dto.spacingScale ?? null,
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
      secondaryColor: record[THEME_STYLE_ATTRS.SECONDARY_COLOR] != null
        ? String(record[THEME_STYLE_ATTRS.SECONDARY_COLOR]) : undefined,
      backgroundColor: record[THEME_ATTRS.BACKGROUND_COLOR] != null
        ? String(record[THEME_ATTRS.BACKGROUND_COLOR]) : undefined,
      surfaceColor: record[THEME_STYLE_ATTRS.SURFACE_COLOR] != null
        ? String(record[THEME_STYLE_ATTRS.SURFACE_COLOR]) : undefined,
      textPrimaryColor: record[THEME_STYLE_ATTRS.TEXT_PRIMARY_COLOR] != null
        ? String(record[THEME_STYLE_ATTRS.TEXT_PRIMARY_COLOR]) : undefined,
      textSecondaryColor: record[THEME_STYLE_ATTRS.TEXT_SECONDARY_COLOR] != null
        ? String(record[THEME_STYLE_ATTRS.TEXT_SECONDARY_COLOR]) : undefined,
      borderColor: record[THEME_STYLE_ATTRS.BORDER_COLOR] != null
        ? String(record[THEME_STYLE_ATTRS.BORDER_COLOR]) : undefined,
      errorColor: record[THEME_STYLE_ATTRS.ERROR_COLOR] != null
        ? String(record[THEME_STYLE_ATTRS.ERROR_COLOR]) : undefined,
      successColor: record[THEME_STYLE_ATTRS.SUCCESS_COLOR] != null
        ? String(record[THEME_STYLE_ATTRS.SUCCESS_COLOR]) : undefined,
      warningColor: record[THEME_STYLE_ATTRS.WARNING_COLOR] != null
        ? String(record[THEME_STYLE_ATTRS.WARNING_COLOR]) : undefined,
      fontFamily: record[THEME_ATTRS.FONT_FAMILY] != null
        ? String(record[THEME_ATTRS.FONT_FAMILY]) : undefined,
      fontUrl: record[THEME_STYLE_ATTRS.FONT_URL] != null
        ? String(record[THEME_STYLE_ATTRS.FONT_URL]) : undefined,
      baseFontSize: record[THEME_ATTRS.FONT_SIZE_BASE] != null
        ? String(record[THEME_ATTRS.FONT_SIZE_BASE]) : undefined,
      headingFontSize: record[THEME_STYLE_ATTRS.HEADING_FONT_SIZE] != null
        ? String(record[THEME_STYLE_ATTRS.HEADING_FONT_SIZE]) : undefined,
      labelFontSize: record[THEME_STYLE_ATTRS.LABEL_FONT_SIZE] != null
        ? String(record[THEME_STYLE_ATTRS.LABEL_FONT_SIZE]) : undefined,
      inputFontSize: record[THEME_STYLE_ATTRS.INPUT_FONT_SIZE] != null
        ? String(record[THEME_STYLE_ATTRS.INPUT_FONT_SIZE]) : undefined,
      borderRadius: record[THEME_ATTRS.BORDER_RADIUS] != null
        ? String(record[THEME_ATTRS.BORDER_RADIUS]) : undefined,
      shadowStyle: record[THEME_STYLE_ATTRS.SHADOW_STYLE] != null
        ? String(record[THEME_STYLE_ATTRS.SHADOW_STYLE]) as ThemeDefinition['shadowStyle'] : undefined,
      spacingScale: record[THEME_STYLE_ATTRS.SPACING_SCALE] != null
        ? String(record[THEME_STYLE_ATTRS.SPACING_SCALE]) as ThemeDefinition['spacingScale'] : undefined,
      isDarkMode: Boolean(record[THEME_STYLE_ATTRS.IS_DARK_MODE] ?? false),
      isActive: true,
      _brand: 'ThemeDefinition',
    };
  }
}
