import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { FIELD_DESIGN_ATTRS } from '@/constants/designAttributeNames';
import { FIELD_DESIGN_STYLE_ATTRS } from '@/constants/styleAttributeNames';
import type { FieldDesign } from '@qdb/shared';
import { withRetry } from './crmRetry';
import { fromPicklist, toPicklist } from './picklistCodec';

// Org-verified Option Set codes (qdb_width, qdb_input_style).
const WIDTH_TO_PICKLIST: Record<string, number> = { Full: 100000001, Half: 100000002, Custom: 100000003 };
const INPUT_STYLE_TO_PICKLIST: Record<string, number> = { Outlined: 100000001, Filled: 100000002, Standard: 100000003 };
const PICKLIST_TO_WIDTH: Record<number, FieldDesign['width']> = { 100000001: 'Full', 100000002: 'Half', 100000003: 'Custom' };
const PICKLIST_TO_INPUT_STYLE: Record<number, FieldDesign['inputStyle']> = { 100000001: 'Outlined', 100000002: 'Filled', 100000003: 'Standard' };

export interface UpsertFieldDesignDto {
  fieldId: string;
  labelStyle?: string;
  inputStyle?: string;
  width?: string;
  customWidth?: string;
  height?: string;
  iconPrefix?: string;
  iconSuffix?: string;
  focusStyleJson?: string;
  errorStyleJson?: string;
  disabledStyleJson?: string;
  placeholderStyleJson?: string;
  tooltipStyleJson?: string;
  cssClass?: string;
}

export class FieldDesignRepository {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async upsertFieldDesign(dto: UpsertFieldDesignDto): Promise<string> {
    const existingId = await this.findExistingFieldDesignId(dto.fieldId);
    const payload = this.buildPayload(dto);

    if (existingId !== null) {
      await withRetry(
        () => this.webApi.updateRecord(ENTITY_NAMES.FIELD_DESIGN, existingId, payload),
        'updateFieldDesign'
      );
      return existingId;
    }

    payload[`${FIELD_DESIGN_ATTRS.FIELD_ID}@odata.bind`] = `/qdb_form_fields(${dto.fieldId})`;
    const result = await withRetry(
      () => this.webApi.createRecord(ENTITY_NAMES.FIELD_DESIGN, payload),
      'createFieldDesign'
    );
    return result.id;
  }

  /**
   * Field designs for a single form, scoped to that form's field IDs.
   * field_design has no form_design FK, so scoping is by the form's field lookups —
   * this keeps one form's styling from bleeding into another (H-1 contamination).
   */
  async getFieldDesigns(fieldIds: string[]): Promise<FieldDesign[]> {
    if (fieldIds.length === 0) return [];

    const select = [
      FIELD_DESIGN_ATTRS.ID, FIELD_DESIGN_ATTRS.FIELD_ID_VALUE,
      FIELD_DESIGN_ATTRS.LABEL_STYLE, FIELD_DESIGN_ATTRS.INPUT_STYLE,
      FIELD_DESIGN_STYLE_ATTRS.WIDTH, FIELD_DESIGN_STYLE_ATTRS.CUSTOM_WIDTH,
      FIELD_DESIGN_STYLE_ATTRS.HEIGHT, FIELD_DESIGN_STYLE_ATTRS.ICON_PREFIX,
      FIELD_DESIGN_STYLE_ATTRS.ICON_SUFFIX, FIELD_DESIGN_STYLE_ATTRS.FOCUS_STYLE_JSON,
      FIELD_DESIGN_STYLE_ATTRS.ERROR_STYLE_JSON, FIELD_DESIGN_STYLE_ATTRS.DISABLED_STYLE_JSON,
      FIELD_DESIGN_STYLE_ATTRS.PLACEHOLDER_STYLE_JSON, FIELD_DESIGN_STYLE_ATTRS.TOOLTIP_STYLE_JSON,
      FIELD_DESIGN_STYLE_ATTRS.CSS_CLASS,
    ].join(',');

    const filter = fieldIds
      .map(id => `${FIELD_DESIGN_ATTRS.FIELD_ID_VALUE} eq ${id}`)
      .join(' or ');

    const result = await withRetry(
      () => this.webApi.retrieveMultipleRecords(
        ENTITY_NAMES.FIELD_DESIGN,
        `?$select=${select}&$filter=${filter}`
      ),
      'getFieldDesigns'
    );

    return result.entities.map(r => this.mapRecordToFieldDesign(r));
  }

  private buildPayload(dto: UpsertFieldDesignDto): Record<string, unknown> {
    return {
      [FIELD_DESIGN_ATTRS.LABEL_STYLE]: dto.labelStyle ?? null,
      [FIELD_DESIGN_ATTRS.INPUT_STYLE]: toPicklist(dto.inputStyle ?? 'Outlined', INPUT_STYLE_TO_PICKLIST, 100000001),
      [FIELD_DESIGN_STYLE_ATTRS.WIDTH]: toPicklist(dto.width ?? 'Full', WIDTH_TO_PICKLIST, 100000001),
      [FIELD_DESIGN_STYLE_ATTRS.CUSTOM_WIDTH]: dto.customWidth ?? null,
      [FIELD_DESIGN_STYLE_ATTRS.HEIGHT]: dto.height ?? null,
      [FIELD_DESIGN_STYLE_ATTRS.ICON_PREFIX]: dto.iconPrefix ?? null,
      [FIELD_DESIGN_STYLE_ATTRS.ICON_SUFFIX]: dto.iconSuffix ?? null,
      [FIELD_DESIGN_STYLE_ATTRS.FOCUS_STYLE_JSON]: dto.focusStyleJson ?? null,
      [FIELD_DESIGN_STYLE_ATTRS.ERROR_STYLE_JSON]: dto.errorStyleJson ?? null,
      [FIELD_DESIGN_STYLE_ATTRS.DISABLED_STYLE_JSON]: dto.disabledStyleJson ?? null,
      [FIELD_DESIGN_STYLE_ATTRS.PLACEHOLDER_STYLE_JSON]: dto.placeholderStyleJson ?? null,
      [FIELD_DESIGN_STYLE_ATTRS.TOOLTIP_STYLE_JSON]: dto.tooltipStyleJson ?? null,
      [FIELD_DESIGN_STYLE_ATTRS.CSS_CLASS]: dto.cssClass ?? null,
    };
  }

  private async findExistingFieldDesignId(fieldId: string): Promise<string | null> {
    const result = await withRetry(
      () => this.webApi.retrieveMultipleRecords(
        ENTITY_NAMES.FIELD_DESIGN,
        `?$select=${FIELD_DESIGN_ATTRS.ID}&$filter=${FIELD_DESIGN_ATTRS.FIELD_ID_VALUE} eq ${fieldId}&$top=1`
      ),
      'findFieldDesign'
    );
    if (result.entities.length === 0) return null;
    return String(result.entities[0][FIELD_DESIGN_ATTRS.ID] ?? '');
  }

  private mapRecordToFieldDesign(record: Record<string, unknown>): FieldDesign {
    const parseJsonStyle = (raw: unknown): Record<string, string> | undefined => {
      if (raw == null) return undefined;
      try { return JSON.parse(String(raw)) as Record<string, string>; }
      catch { return undefined; }
    };

    return {
      id: String(record[FIELD_DESIGN_ATTRS.ID] ?? ''),
      fieldId: String(record[FIELD_DESIGN_ATTRS.FIELD_ID_VALUE] ?? ''),
      inputStyle: fromPicklist(record[FIELD_DESIGN_ATTRS.INPUT_STYLE], PICKLIST_TO_INPUT_STYLE, 'Outlined'),
      width: fromPicklist(record[FIELD_DESIGN_STYLE_ATTRS.WIDTH], PICKLIST_TO_WIDTH, 'Full'),
      customWidth: record[FIELD_DESIGN_STYLE_ATTRS.CUSTOM_WIDTH] != null
        ? String(record[FIELD_DESIGN_STYLE_ATTRS.CUSTOM_WIDTH]) : undefined,
      height: record[FIELD_DESIGN_STYLE_ATTRS.HEIGHT] != null
        ? String(record[FIELD_DESIGN_STYLE_ATTRS.HEIGHT]) : undefined,
      iconPrefix: record[FIELD_DESIGN_STYLE_ATTRS.ICON_PREFIX] != null
        ? String(record[FIELD_DESIGN_STYLE_ATTRS.ICON_PREFIX]) : undefined,
      iconSuffix: record[FIELD_DESIGN_STYLE_ATTRS.ICON_SUFFIX] != null
        ? String(record[FIELD_DESIGN_STYLE_ATTRS.ICON_SUFFIX]) : undefined,
      focusStyle: parseJsonStyle(record[FIELD_DESIGN_STYLE_ATTRS.FOCUS_STYLE_JSON]),
      errorStyle: parseJsonStyle(record[FIELD_DESIGN_STYLE_ATTRS.ERROR_STYLE_JSON]),
      disabledStyle: parseJsonStyle(record[FIELD_DESIGN_STYLE_ATTRS.DISABLED_STYLE_JSON]),
      placeholderStyle: parseJsonStyle(record[FIELD_DESIGN_STYLE_ATTRS.PLACEHOLDER_STYLE_JSON]),
      tooltipStyle: parseJsonStyle(record[FIELD_DESIGN_STYLE_ATTRS.TOOLTIP_STYLE_JSON]),
      cssClassName: record[FIELD_DESIGN_STYLE_ATTRS.CSS_CLASS] != null
        ? String(record[FIELD_DESIGN_STYLE_ATTRS.CSS_CLASS]) : undefined,
      isActive: true,
    };
  }
}
