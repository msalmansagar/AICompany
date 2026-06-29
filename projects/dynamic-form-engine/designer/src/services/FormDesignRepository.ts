import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { FORM_DESIGN_ATTRS } from '@/constants/designAttributeNames';
import { FORM_DESIGN_STYLE_ATTRS } from '@/constants/styleAttributeNames';
import type { FormDesign } from '@qdb/shared';
import { withRetry } from './crmRetry';

export interface UpsertFormDesignDto {
  formId: string;
  themeId: string | null;
  customCss: string;
  layoutType?: string;
  labelPosition?: string;
  buttonStyle?: string;
  alignment?: string;
  maxWidth?: string;
  sectionStyle?: string;
  animationEnabled?: boolean;
  stickyActionBar?: boolean;
  skeletonLoaderEnabled?: boolean;
  tabStyle?: string;
}

// All Option Set attributes are stored as picklist integers in Dataverse. Each map
// has a forward (string -> int) for writes and a reverse (int -> string) for reads,
// so styling round-trips instead of resetting to a default (M-001).
const NAV_STYLE_TO_PICKLIST: Record<string, number> = {
  Tabs: 100000001, Stepper: 100000002, Accordion: 100000003, Sidebar: 100000004,
  tabs: 100000001, stepper: 100000002, accordion: 100000003, sidebar: 100000004,
};
const LAYOUT_TYPE_TO_PICKLIST: Record<string, number> = {
  SingleColumn: 100000001, TwoColumn: 100000002, Grid: 100000003,
  Stepper: 100000004, Wizard: 100000005, Accordion: 100000006,
  TabBased: 100000007, InlineCompact: 100000008,
};
const LABEL_POSITION_TO_PICKLIST: Record<string, number> = { Top: 100000001, Left: 100000002, Floating: 100000003 };
const BUTTON_STYLE_TO_PICKLIST: Record<string, number> = { Primary: 100000001, Outline: 100000002, Text: 100000003 };
const ALIGNMENT_TO_PICKLIST: Record<string, number> = { Left: 100000001, Center: 100000002, Right: 100000003 };
const SECTION_STYLE_TO_PICKLIST: Record<string, number> = { Card: 100000001, Flat: 100000002, Outlined: 100000003 };

const PICKLIST_TO_NAV_STYLE: Record<number, FormDesign['tabStyle']> = { 100000001: 'Tabs', 100000002: 'Stepper', 100000003: 'Accordion', 100000004: 'Sidebar' };
const PICKLIST_TO_LAYOUT: Record<number, FormDesign['layoutType']> = { 100000001: 'SingleColumn', 100000002: 'TwoColumn', 100000003: 'Grid', 100000004: 'Stepper', 100000005: 'Wizard', 100000006: 'Accordion', 100000007: 'TabBased', 100000008: 'InlineCompact' };
const PICKLIST_TO_LABEL_POSITION: Record<number, FormDesign['labelPosition']> = { 100000001: 'Top', 100000002: 'Left', 100000003: 'Floating' };
const PICKLIST_TO_BUTTON_STYLE: Record<number, FormDesign['buttonStyle']> = { 100000001: 'Primary', 100000002: 'Outline', 100000003: 'Text' };
const PICKLIST_TO_ALIGNMENT: Record<number, FormDesign['alignment']> = { 100000001: 'Left', 100000002: 'Center', 100000003: 'Right' };
const PICKLIST_TO_SECTION_STYLE: Record<number, FormDesign['sectionStyle']> = { 100000001: 'Card', 100000002: 'Flat', 100000003: 'Outlined' };

/** Maps a stored picklist integer back to its typed string value, or the fallback. */
function fromPicklist<T>(raw: unknown, map: Record<number, T>, fallback: T): T {
  const code = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(code) && map[code] !== undefined ? map[code] : fallback;
}

export class FormDesignRepository {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async upsertFormDesign(dto: UpsertFormDesignDto): Promise<string> {
    const existingId = await this.findExistingFormDesignId(dto.formId);
    const payload = this.buildFormDesignPayload(dto);

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

  async getFormDesign(formId: string): Promise<FormDesign | null> {
    const select = [
      FORM_DESIGN_ATTRS.ID, FORM_DESIGN_ATTRS.FORM_ID, FORM_DESIGN_ATTRS.THEME_ID,
      FORM_DESIGN_ATTRS.CUSTOM_CSS, FORM_DESIGN_ATTRS.TAB_STYLE,
      FORM_DESIGN_STYLE_ATTRS.LAYOUT_TYPE, FORM_DESIGN_STYLE_ATTRS.LABEL_POSITION,
      FORM_DESIGN_STYLE_ATTRS.FORM_BUTTON_STYLE, FORM_DESIGN_STYLE_ATTRS.ALIGNMENT,
      FORM_DESIGN_STYLE_ATTRS.MAX_WIDTH, FORM_DESIGN_STYLE_ATTRS.SECTION_STYLE,
      FORM_DESIGN_STYLE_ATTRS.ANIMATION_ENABLED, FORM_DESIGN_STYLE_ATTRS.STICKY_ACTION_BAR,
      FORM_DESIGN_STYLE_ATTRS.SKELETON_LOADER_ENABLED,
    ].join(',');

    const result = await withRetry(
      () => this.webApi.retrieveMultipleRecords(
        ENTITY_NAMES.FORM_DESIGN,
        `?$select=${select}&$filter=${FORM_DESIGN_ATTRS.FORM_ID} eq ${formId}&$top=1`
      ),
      'getFormDesign'
    );

    if (result.entities.length === 0) return null;
    return this.mapRecordToFormDesign(result.entities[0]);
  }

  private buildFormDesignPayload(dto: UpsertFormDesignDto): Record<string, unknown> {
    return {
      [FORM_DESIGN_ATTRS.CUSTOM_CSS]: dto.customCss,
      [`${FORM_DESIGN_ATTRS.THEME_ID}@odata.bind`]: dto.themeId
        ? `/qdb_themes(${dto.themeId})` : null,
      [FORM_DESIGN_ATTRS.TAB_STYLE]: NAV_STYLE_TO_PICKLIST[dto.tabStyle ?? 'Tabs'] ?? 100000001,
      [FORM_DESIGN_STYLE_ATTRS.LAYOUT_TYPE]: LAYOUT_TYPE_TO_PICKLIST[dto.layoutType ?? 'SingleColumn'] ?? 100000001,
      [FORM_DESIGN_STYLE_ATTRS.LABEL_POSITION]: LABEL_POSITION_TO_PICKLIST[dto.labelPosition ?? 'Top'] ?? 100000001,
      [FORM_DESIGN_STYLE_ATTRS.FORM_BUTTON_STYLE]: BUTTON_STYLE_TO_PICKLIST[dto.buttonStyle ?? 'Primary'] ?? 100000001,
      [FORM_DESIGN_STYLE_ATTRS.ALIGNMENT]: ALIGNMENT_TO_PICKLIST[dto.alignment ?? 'Left'] ?? 100000001,
      [FORM_DESIGN_STYLE_ATTRS.MAX_WIDTH]: dto.maxWidth ?? null,
      [FORM_DESIGN_STYLE_ATTRS.SECTION_STYLE]: SECTION_STYLE_TO_PICKLIST[dto.sectionStyle ?? 'Card'] ?? 100000001,
      [FORM_DESIGN_STYLE_ATTRS.ANIMATION_ENABLED]: dto.animationEnabled ?? false,
      [FORM_DESIGN_STYLE_ATTRS.STICKY_ACTION_BAR]: dto.stickyActionBar ?? false,
      [FORM_DESIGN_STYLE_ATTRS.SKELETON_LOADER_ENABLED]: dto.skeletonLoaderEnabled ?? false,
    };
  }

  private async findExistingFormDesignId(formId: string): Promise<string | null> {
    const result = await withRetry(
      () => this.webApi.retrieveMultipleRecords(
        ENTITY_NAMES.FORM_DESIGN,
        `?$select=${FORM_DESIGN_ATTRS.ID}&$filter=${FORM_DESIGN_ATTRS.FORM_ID} eq ${formId}&$top=1`
      ),
      'findFormDesign'
    );
    if (result.entities.length === 0) return null;
    return String(result.entities[0][FORM_DESIGN_ATTRS.ID] ?? '');
  }

  private mapRecordToFormDesign(record: Record<string, unknown>): FormDesign {
    return {
      id: String(record[FORM_DESIGN_ATTRS.ID] ?? ''),
      formDefinitionId: record[FORM_DESIGN_ATTRS.FORM_ID] != null
        ? String(record[FORM_DESIGN_ATTRS.FORM_ID]) : undefined,
      layoutType: fromPicklist(record[FORM_DESIGN_STYLE_ATTRS.LAYOUT_TYPE], PICKLIST_TO_LAYOUT, 'SingleColumn'),
      labelPosition: fromPicklist(record[FORM_DESIGN_STYLE_ATTRS.LABEL_POSITION], PICKLIST_TO_LABEL_POSITION, 'Top'),
      sectionStyle: fromPicklist(record[FORM_DESIGN_STYLE_ATTRS.SECTION_STYLE], PICKLIST_TO_SECTION_STYLE, 'Card'),
      tabStyle: fromPicklist(record[FORM_DESIGN_ATTRS.TAB_STYLE], PICKLIST_TO_NAV_STYLE, 'Tabs'),
      buttonStyle: fromPicklist(record[FORM_DESIGN_STYLE_ATTRS.FORM_BUTTON_STYLE], PICKLIST_TO_BUTTON_STYLE, 'Primary'),
      animationEnabled: Boolean(record[FORM_DESIGN_STYLE_ATTRS.ANIMATION_ENABLED] ?? false),
      alignment: fromPicklist(record[FORM_DESIGN_STYLE_ATTRS.ALIGNMENT], PICKLIST_TO_ALIGNMENT, 'Left'),
      maxWidth: record[FORM_DESIGN_STYLE_ATTRS.MAX_WIDTH] != null
        ? String(record[FORM_DESIGN_STYLE_ATTRS.MAX_WIDTH]) : undefined,
      customCss: record[FORM_DESIGN_ATTRS.CUSTOM_CSS] != null
        ? String(record[FORM_DESIGN_ATTRS.CUSTOM_CSS]) : undefined,
      stickyActionBar: Boolean(record[FORM_DESIGN_STYLE_ATTRS.STICKY_ACTION_BAR] ?? false),
      skeletonLoaderEnabled: Boolean(record[FORM_DESIGN_STYLE_ATTRS.SKELETON_LOADER_ENABLED] ?? false),
      isActive: true,
    };
  }
}
