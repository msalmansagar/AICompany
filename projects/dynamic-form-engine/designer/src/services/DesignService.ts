import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import {
  THEME_ATTRS,
  FORM_DESIGN_ATTRS,
  SECTION_DESIGN_ATTRS,
  FIELD_DESIGN_ATTRS,
  BUTTON_DESIGN_ATTRS,
} from '@/constants/attributeNames';
import type { DesignerStyleModel } from '@/state/models/DesignerStyleModel';
import { DEFAULT_STYLE } from '@/state/models/DesignerStyleModel';
import { withRetry } from './crmRetry';

export interface ThemeSummary {
  id: string;
  name: string;
}

export interface UpsertThemeDto {
  name: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  fontFamily: string;
  fontSizeBase: number;
  borderRadius: number;
}

export interface UpsertFormDesignDto {
  formId: string;
  themeId: string | null;
  customCss: string;
  navStyle?: 'tabs' | 'stepper' | 'accordion' | 'sidebar';
}

export interface UpsertSectionDesignDto {
  sectionId: string;
  cssClass: string;
  customCss: string;
}

export interface UpsertFieldDesignDto {
  fieldId: string;
  labelStyle: string;
  inputStyle: string;
}

export interface UpsertButtonDesignDto {
  formId: string;
  buttonType: string;
  style: string;
  label: string;
}

export class DesignService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async upsertTheme(dto: UpsertThemeDto, existingThemeId?: string | null): Promise<string> {
    const payload: Record<string, unknown> = {
      [THEME_ATTRS.NAME]: dto.name,
      [THEME_ATTRS.PRIMARY_COLOR]: dto.primaryColor,
      [THEME_ATTRS.ACCENT_COLOR]: dto.accentColor,
      [THEME_ATTRS.BACKGROUND_COLOR]: dto.backgroundColor,
      [THEME_ATTRS.FONT_FAMILY]: dto.fontFamily,
      [THEME_ATTRS.FONT_SIZE_BASE]: dto.fontSizeBase,
      [THEME_ATTRS.BORDER_RADIUS]: dto.borderRadius,
    };

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

  async upsertFormDesign(dto: UpsertFormDesignDto): Promise<string> {
    const existingId = await this.findSingleByField(
      ENTITY_NAMES.FORM_DESIGN,
      FORM_DESIGN_ATTRS.FORM_ID,
      dto.formId,
      FORM_DESIGN_ATTRS.ID
    );

    const NAV_STYLE_PICKLIST: Record<string, number> = {
      tabs: 100000001,
      stepper: 100000002,
      accordion: 100000003,
      sidebar: 100000004,
    };

    const payload: Record<string, unknown> = {
      [FORM_DESIGN_ATTRS.CUSTOM_CSS]: dto.customCss,
      [`${FORM_DESIGN_ATTRS.THEME_ID}@odata.bind`]: dto.themeId
        ? `/qdb_themes(${dto.themeId})`
        : null,
      [FORM_DESIGN_ATTRS.TAB_STYLE]: NAV_STYLE_PICKLIST[dto.navStyle ?? 'tabs'] ?? 100000001,
    };

    if (existingId !== null) {
      await withRetry(
        () => this.webApi.updateRecord(ENTITY_NAMES.FORM_DESIGN, existingId, payload),
        'updateFormDesign'
      );
      return existingId;
    }

    payload[FORM_DESIGN_ATTRS.FORM_ID] = dto.formId;
    const result = await withRetry(
      () => this.webApi.createRecord(ENTITY_NAMES.FORM_DESIGN, payload),
      'createFormDesign'
    );
    return result.id;
  }

  async upsertSectionDesign(dto: UpsertSectionDesignDto): Promise<string> {
    const existingId = await this.findSingleByField(
      ENTITY_NAMES.SECTION_DESIGN,
      SECTION_DESIGN_ATTRS.SECTION_ID,
      dto.sectionId,
      SECTION_DESIGN_ATTRS.ID
    );

    const payload: Record<string, unknown> = {
      [SECTION_DESIGN_ATTRS.CSS_CLASS]: dto.cssClass,
      [SECTION_DESIGN_ATTRS.CUSTOM_CSS]: dto.customCss,
    };

    if (existingId !== null) {
      await withRetry(
        () => this.webApi.updateRecord(ENTITY_NAMES.SECTION_DESIGN, existingId, payload),
        'updateSectionDesign'
      );
      return existingId;
    }

    payload[SECTION_DESIGN_ATTRS.SECTION_ID] = dto.sectionId;
    const result = await withRetry(
      () => this.webApi.createRecord(ENTITY_NAMES.SECTION_DESIGN, payload),
      'createSectionDesign'
    );
    return result.id;
  }

  async upsertFieldDesign(dto: UpsertFieldDesignDto): Promise<string> {
    const existingId = await this.findSingleByField(
      ENTITY_NAMES.FIELD_DESIGN,
      FIELD_DESIGN_ATTRS.FIELD_ID,
      dto.fieldId,
      FIELD_DESIGN_ATTRS.ID
    );

    const payload: Record<string, unknown> = {
      [FIELD_DESIGN_ATTRS.LABEL_STYLE]: dto.labelStyle,
      [FIELD_DESIGN_ATTRS.INPUT_STYLE]: dto.inputStyle,
    };

    if (existingId !== null) {
      await withRetry(
        () => this.webApi.updateRecord(ENTITY_NAMES.FIELD_DESIGN, existingId, payload),
        'updateFieldDesign'
      );
      return existingId;
    }

    payload[FIELD_DESIGN_ATTRS.FIELD_ID] = dto.fieldId;
    const result = await withRetry(
      () => this.webApi.createRecord(ENTITY_NAMES.FIELD_DESIGN, payload),
      'createFieldDesign'
    );
    return result.id;
  }

  async upsertButtonDesign(dto: UpsertButtonDesignDto): Promise<string> {
    const existingId = await this.findSingleByField(
      ENTITY_NAMES.BUTTON_DESIGN,
      BUTTON_DESIGN_ATTRS.FORM_ID,
      dto.formId,
      BUTTON_DESIGN_ATTRS.ID
    );

    const payload: Record<string, unknown> = {
      [BUTTON_DESIGN_ATTRS.BUTTON_TYPE]: dto.buttonType,
      [BUTTON_DESIGN_ATTRS.STYLE]: dto.style,
      [BUTTON_DESIGN_ATTRS.LABEL]: dto.label,
    };

    if (existingId !== null) {
      await withRetry(
        () => this.webApi.updateRecord(ENTITY_NAMES.BUTTON_DESIGN, existingId, payload),
        'updateButtonDesign'
      );
      return existingId;
    }

    payload[BUTTON_DESIGN_ATTRS.FORM_ID] = dto.formId;
    const result = await withRetry(
      () => this.webApi.createRecord(ENTITY_NAMES.BUTTON_DESIGN, payload),
      'createButtonDesign'
    );
    return result.id;
  }

  async getTheme(id: string): Promise<DesignerStyleModel> {
    const select = [
      THEME_ATTRS.ID,
      THEME_ATTRS.NAME,
      THEME_ATTRS.PRIMARY_COLOR,
      THEME_ATTRS.ACCENT_COLOR,
      THEME_ATTRS.BACKGROUND_COLOR,
      THEME_ATTRS.FONT_FAMILY,
      THEME_ATTRS.FONT_SIZE_BASE,
      THEME_ATTRS.BORDER_RADIUS,
    ].join(',');

    const record = await withRetry(
      () => this.webApi.retrieveRecord(ENTITY_NAMES.THEME, id, `?$select=${select}`),
      'getTheme'
    );

    return this.mapRecordToStyleModel(record, id);
  }

  async listThemes(): Promise<ThemeSummary[]> {
    const select = [THEME_ATTRS.ID, THEME_ATTRS.NAME].join(',');
    const orderBy = `${THEME_ATTRS.NAME} asc`;

    const result = await withRetry(
      () =>
        this.webApi.retrieveMultipleRecords(
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

  private async findSingleByField(
    entityName: string,
    filterAttr: string,
    filterValue: string,
    idAttr: string
  ): Promise<string | null> {
    const result = await withRetry(
      () =>
        this.webApi.retrieveMultipleRecords(
          entityName,
          `?$select=${idAttr}&$filter=${filterAttr} eq ${filterValue}&$top=1`
        ),
      `findSingleByField.${entityName}`
    );

    if (result.entities.length === 0) return null;
    return String(result.entities[0][idAttr] ?? '');
  }

  private mapRecordToStyleModel(record: Record<string, unknown>, id: string): DesignerStyleModel {
    return {
      themeId: id,
      themeName: String(record[THEME_ATTRS.NAME] ?? DEFAULT_STYLE.themeName),
      primaryColor: String(record[THEME_ATTRS.PRIMARY_COLOR] ?? DEFAULT_STYLE.primaryColor),
      accentColor: String(record[THEME_ATTRS.ACCENT_COLOR] ?? DEFAULT_STYLE.accentColor),
      backgroundColor: String(record[THEME_ATTRS.BACKGROUND_COLOR] ?? DEFAULT_STYLE.backgroundColor),
      fontFamily: String(record[THEME_ATTRS.FONT_FAMILY] ?? DEFAULT_STYLE.fontFamily),
      fontSizeBase: Number(record[THEME_ATTRS.FONT_SIZE_BASE] ?? DEFAULT_STYLE.fontSizeBase),
      borderRadius: Number(record[THEME_ATTRS.BORDER_RADIUS] ?? DEFAULT_STYLE.borderRadius),
      // Fields removed from CRM entity — use defaults
      fieldSpacing: DEFAULT_STYLE.fieldSpacing,
      labelPosition: DEFAULT_STYLE.labelPosition,
      buttonStyle: DEFAULT_STYLE.buttonStyle,
      customCss: '',
    };
  }
}
