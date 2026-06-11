import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import {
  FORM_FIELD_ATTRS,
  FIELD_TYPE_TO_PICKLIST,
  PICKLIST_TO_FIELD_TYPE,
  COLUMN_SPAN_TO_PICKLIST,
  PICKLIST_TO_COLUMN_SPAN,
  BOOL_RENDER_STYLE_TO_PICKLIST,
  PICKLIST_TO_BOOL_RENDER_STYLE,
  INFO_CARD_STYLE_TO_PICKLIST,
  PICKLIST_TO_INFO_CARD_STYLE,
} from '@/constants/attributeNames';
import type { DesignerFieldModel } from '@/state/models/DesignerFormModel';
import { withRetry } from './crmRetry';

export interface CreateFieldDto {
  sectionId: string;
  label: string;
  code: string;
  fieldType: string;
  placeholder: string;
  helpText: string;
  isRequired: boolean;
  isReadOnly: boolean;
  isHidden?: boolean;
  defaultValue: string | null;
  sortOrder: number;
  columnSpan: 1 | 2 | 3;
  currencyCode?: string | null;
  decimalPlaces?: number | null;
  maxRows?: number | null;
  // Sprint 3
  componentKey?: string | null;
  // Sprint 4
  boolRenderStyle?: 'toggle' | 'radio' | null;
  trueLabel?: string | null;
  falseLabel?: string | null;
  infoCardStyle?: 'info' | 'warning' | 'success' | 'error' | null;
  infoCardTitle?: string | null;
  infoCardBody?: string | null;
  infoCardIcon?: string | null;
}

export interface UpdateFieldDto {
  label?: string;
  code?: string;
  placeholder?: string;
  helpText?: string;
  isRequired?: boolean;
  isReadOnly?: boolean;
  isHidden?: boolean;
  defaultValue?: string | null;
  sortOrder?: number;
  columnSpan?: 1 | 2 | 3;
  currencyCode?: string | null;
  decimalPlaces?: number | null;
  maxRows?: number | null;
  // Sprint 3
  componentKey?: string | null;
  // Sprint 4
  boolRenderStyle?: 'toggle' | 'radio' | null;
  trueLabel?: string | null;
  falseLabel?: string | null;
  infoCardStyle?: 'info' | 'warning' | 'success' | 'error' | null;
  infoCardTitle?: string | null;
  infoCardBody?: string | null;
  infoCardIcon?: string | null;
}

export class FieldService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async createField(dto: CreateFieldDto): Promise<string> {
    const fieldTypeCode = FIELD_TYPE_TO_PICKLIST[dto.fieldType] ?? FIELD_TYPE_TO_PICKLIST['text'];
    const columnSpanCode = COLUMN_SPAN_TO_PICKLIST[dto.columnSpan] ?? COLUMN_SPAN_TO_PICKLIST[1];

    const payload: Record<string, unknown> = {
      [`${FORM_FIELD_ATTRS.SECTION_ID}@odata.bind`]: `/qdb_form_sections(${dto.sectionId})`,
      [FORM_FIELD_ATTRS.LABEL]: dto.label,
      [FORM_FIELD_ATTRS.CODE]: dto.code,
      [FORM_FIELD_ATTRS.FIELD_TYPE]: fieldTypeCode,
      [FORM_FIELD_ATTRS.PLACEHOLDER]: dto.placeholder,
      [FORM_FIELD_ATTRS.HELP_TEXT]: dto.helpText,
      [FORM_FIELD_ATTRS.IS_REQUIRED]: dto.isRequired,
      [FORM_FIELD_ATTRS.IS_READ_ONLY]: dto.isReadOnly,
      [FORM_FIELD_ATTRS.IS_HIDDEN]: dto.isHidden ?? false,
      [FORM_FIELD_ATTRS.SORT_ORDER]: dto.sortOrder,
      [FORM_FIELD_ATTRS.COLUMN_SPAN]: columnSpanCode,
    };

    if (dto.defaultValue != null) payload[FORM_FIELD_ATTRS.DEFAULT_VALUE] = dto.defaultValue;
    if (dto.currencyCode != null) payload[FORM_FIELD_ATTRS.CURRENCY_CODE] = dto.currencyCode;
    if (dto.decimalPlaces != null) payload[FORM_FIELD_ATTRS.DECIMAL_PLACES] = dto.decimalPlaces;
    if (dto.maxRows != null) payload[FORM_FIELD_ATTRS.MAX_ROWS] = dto.maxRows;
    if (dto.componentKey != null) payload[FORM_FIELD_ATTRS.COMPONENT_KEY] = dto.componentKey;
    if (dto.boolRenderStyle != null) payload[FORM_FIELD_ATTRS.BOOL_RENDER_STYLE] = BOOL_RENDER_STYLE_TO_PICKLIST[dto.boolRenderStyle];
    if (dto.trueLabel != null) payload[FORM_FIELD_ATTRS.TRUE_LABEL] = dto.trueLabel;
    if (dto.falseLabel != null) payload[FORM_FIELD_ATTRS.FALSE_LABEL] = dto.falseLabel;
    if (dto.infoCardStyle != null) payload[FORM_FIELD_ATTRS.INFO_CARD_STYLE] = INFO_CARD_STYLE_TO_PICKLIST[dto.infoCardStyle];
    if (dto.infoCardTitle != null) payload[FORM_FIELD_ATTRS.INFO_CARD_TITLE] = dto.infoCardTitle;
    if (dto.infoCardBody != null) payload[FORM_FIELD_ATTRS.INFO_CARD_BODY] = dto.infoCardBody;
    if (dto.infoCardIcon != null) payload[FORM_FIELD_ATTRS.INFO_CARD_ICON] = dto.infoCardIcon;

    const result = await withRetry(
      () => this.webApi.createRecord(ENTITY_NAMES.FORM_FIELD, payload),
      'createField'
    );
    return result.id;
  }

  async updateField(id: string, dto: UpdateFieldDto): Promise<void> {
    const data: Record<string, unknown> = {};
    if (dto.label !== undefined) data[FORM_FIELD_ATTRS.LABEL] = dto.label;
    if (dto.code !== undefined) data[FORM_FIELD_ATTRS.CODE] = dto.code;
    if (dto.placeholder !== undefined) data[FORM_FIELD_ATTRS.PLACEHOLDER] = dto.placeholder;
    if (dto.helpText !== undefined) data[FORM_FIELD_ATTRS.HELP_TEXT] = dto.helpText;
    if (dto.isRequired !== undefined) data[FORM_FIELD_ATTRS.IS_REQUIRED] = dto.isRequired;
    if (dto.isReadOnly !== undefined) data[FORM_FIELD_ATTRS.IS_READ_ONLY] = dto.isReadOnly;
    if (dto.isHidden !== undefined) data[FORM_FIELD_ATTRS.IS_HIDDEN] = dto.isHidden;
    if (dto.defaultValue !== undefined) data[FORM_FIELD_ATTRS.DEFAULT_VALUE] = dto.defaultValue;
    if (dto.sortOrder !== undefined) data[FORM_FIELD_ATTRS.SORT_ORDER] = dto.sortOrder;
    if (dto.columnSpan !== undefined) {
      data[FORM_FIELD_ATTRS.COLUMN_SPAN] = COLUMN_SPAN_TO_PICKLIST[dto.columnSpan] ?? COLUMN_SPAN_TO_PICKLIST[1];
    }
    if (dto.currencyCode !== undefined) data[FORM_FIELD_ATTRS.CURRENCY_CODE] = dto.currencyCode;
    if (dto.decimalPlaces !== undefined) data[FORM_FIELD_ATTRS.DECIMAL_PLACES] = dto.decimalPlaces;
    if (dto.maxRows !== undefined) data[FORM_FIELD_ATTRS.MAX_ROWS] = dto.maxRows;
    if (dto.componentKey !== undefined) data[FORM_FIELD_ATTRS.COMPONENT_KEY] = dto.componentKey ?? null;
    if (dto.boolRenderStyle !== undefined) data[FORM_FIELD_ATTRS.BOOL_RENDER_STYLE] = dto.boolRenderStyle != null ? BOOL_RENDER_STYLE_TO_PICKLIST[dto.boolRenderStyle] : null;
    if (dto.trueLabel !== undefined) data[FORM_FIELD_ATTRS.TRUE_LABEL] = dto.trueLabel ?? null;
    if (dto.falseLabel !== undefined) data[FORM_FIELD_ATTRS.FALSE_LABEL] = dto.falseLabel ?? null;
    if (dto.infoCardStyle !== undefined) data[FORM_FIELD_ATTRS.INFO_CARD_STYLE] = dto.infoCardStyle != null ? INFO_CARD_STYLE_TO_PICKLIST[dto.infoCardStyle] : null;
    if (dto.infoCardTitle !== undefined) data[FORM_FIELD_ATTRS.INFO_CARD_TITLE] = dto.infoCardTitle ?? null;
    if (dto.infoCardBody !== undefined) data[FORM_FIELD_ATTRS.INFO_CARD_BODY] = dto.infoCardBody ?? null;
    if (dto.infoCardIcon !== undefined) data[FORM_FIELD_ATTRS.INFO_CARD_ICON] = dto.infoCardIcon ?? null;

    if (Object.keys(data).length === 0) return;

    await withRetry(
      () => this.webApi.updateRecord(ENTITY_NAMES.FORM_FIELD, id, data),
      'updateField'
    );
  }

  async deleteField(id: string): Promise<void> {
    await withRetry(
      () => this.webApi.deleteRecord(ENTITY_NAMES.FORM_FIELD, id),
      'deleteField'
    );
  }

  async listFieldsForSection(sectionId: string): Promise<DesignerFieldModel[]> {
    const select = [
      FORM_FIELD_ATTRS.ID,
      FORM_FIELD_ATTRS.SECTION_ID_VALUE,
      FORM_FIELD_ATTRS.LABEL,
      FORM_FIELD_ATTRS.CODE,
      FORM_FIELD_ATTRS.FIELD_TYPE,
      FORM_FIELD_ATTRS.PLACEHOLDER,
      FORM_FIELD_ATTRS.HELP_TEXT,
      FORM_FIELD_ATTRS.IS_REQUIRED,
      FORM_FIELD_ATTRS.IS_READ_ONLY,
      FORM_FIELD_ATTRS.IS_HIDDEN,
      FORM_FIELD_ATTRS.DEFAULT_VALUE,
      FORM_FIELD_ATTRS.SORT_ORDER,
      FORM_FIELD_ATTRS.COLUMN_SPAN,
      FORM_FIELD_ATTRS.CURRENCY_CODE,
      FORM_FIELD_ATTRS.DECIMAL_PLACES,
      FORM_FIELD_ATTRS.MAX_ROWS,
      FORM_FIELD_ATTRS.COMPONENT_KEY,
      FORM_FIELD_ATTRS.BOOL_RENDER_STYLE,
      FORM_FIELD_ATTRS.TRUE_LABEL,
      FORM_FIELD_ATTRS.FALSE_LABEL,
      FORM_FIELD_ATTRS.INFO_CARD_STYLE,
      FORM_FIELD_ATTRS.INFO_CARD_TITLE,
      FORM_FIELD_ATTRS.INFO_CARD_BODY,
      FORM_FIELD_ATTRS.INFO_CARD_ICON,
    ].join(',');

    const filter = `${FORM_FIELD_ATTRS.SECTION_ID_VALUE} eq ${sectionId}`;
    const orderBy = `${FORM_FIELD_ATTRS.SORT_ORDER} asc`;

    const result = await withRetry(
      () =>
        this.webApi.retrieveMultipleRecords(
          ENTITY_NAMES.FORM_FIELD,
          `?$select=${select}&$filter=${filter}&$orderby=${orderBy}`
        ),
      'listFieldsForSection'
    );

    return result.entities.map(record => this.mapRecordToModel(record));
  }

  private mapRecordToModel(record: Record<string, unknown>): DesignerFieldModel {
    const rawFieldType = Number(record[FORM_FIELD_ATTRS.FIELD_TYPE] ?? FIELD_TYPE_TO_PICKLIST['text']);
    const fieldType = PICKLIST_TO_FIELD_TYPE[rawFieldType] ?? 'text';

    const rawColumnSpan = Number(record[FORM_FIELD_ATTRS.COLUMN_SPAN] ?? COLUMN_SPAN_TO_PICKLIST[1]);
    const columnSpan = PICKLIST_TO_COLUMN_SPAN[rawColumnSpan] ?? 1;

    return {
      id: String(record[FORM_FIELD_ATTRS.ID] ?? ''),
      sectionId: String(record[FORM_FIELD_ATTRS.SECTION_ID_VALUE] ?? ''),
      label: String(record[FORM_FIELD_ATTRS.LABEL] ?? ''),
      code: String(record[FORM_FIELD_ATTRS.CODE] ?? ''),
      fieldType,
      placeholder: String(record[FORM_FIELD_ATTRS.PLACEHOLDER] ?? ''),
      helpText: String(record[FORM_FIELD_ATTRS.HELP_TEXT] ?? ''),
      isRequired: Boolean(record[FORM_FIELD_ATTRS.IS_REQUIRED]),
      isReadOnly: Boolean(record[FORM_FIELD_ATTRS.IS_READ_ONLY]),
      isHidden: Boolean(record[FORM_FIELD_ATTRS.IS_HIDDEN]),
      defaultValue: record[FORM_FIELD_ATTRS.DEFAULT_VALUE]
        ? String(record[FORM_FIELD_ATTRS.DEFAULT_VALUE])
        : null,
      currencyCode: record[FORM_FIELD_ATTRS.CURRENCY_CODE]
        ? String(record[FORM_FIELD_ATTRS.CURRENCY_CODE])
        : null,
      decimalPlaces: record[FORM_FIELD_ATTRS.DECIMAL_PLACES] != null
        ? Number(record[FORM_FIELD_ATTRS.DECIMAL_PLACES])
        : null,
      maxRows: record[FORM_FIELD_ATTRS.MAX_ROWS] != null
        ? Number(record[FORM_FIELD_ATTRS.MAX_ROWS])
        : null,
      sortOrder: Number(record[FORM_FIELD_ATTRS.SORT_ORDER] ?? 0),
      columnSpan,
      options: [],
      lookupConfig: null,
      componentKey: record[FORM_FIELD_ATTRS.COMPONENT_KEY] != null
        ? String(record[FORM_FIELD_ATTRS.COMPONENT_KEY])
        : null,
      boolRenderStyle: record[FORM_FIELD_ATTRS.BOOL_RENDER_STYLE] != null
        ? (PICKLIST_TO_BOOL_RENDER_STYLE[Number(record[FORM_FIELD_ATTRS.BOOL_RENDER_STYLE])] ?? null)
        : null,
      trueLabel: record[FORM_FIELD_ATTRS.TRUE_LABEL] != null ? String(record[FORM_FIELD_ATTRS.TRUE_LABEL]) : null,
      falseLabel: record[FORM_FIELD_ATTRS.FALSE_LABEL] != null ? String(record[FORM_FIELD_ATTRS.FALSE_LABEL]) : null,
      infoCardStyle: record[FORM_FIELD_ATTRS.INFO_CARD_STYLE] != null
        ? (PICKLIST_TO_INFO_CARD_STYLE[Number(record[FORM_FIELD_ATTRS.INFO_CARD_STYLE])] ?? null)
        : null,
      infoCardTitle: record[FORM_FIELD_ATTRS.INFO_CARD_TITLE] != null ? String(record[FORM_FIELD_ATTRS.INFO_CARD_TITLE]) : null,
      infoCardBody: record[FORM_FIELD_ATTRS.INFO_CARD_BODY] != null ? String(record[FORM_FIELD_ATTRS.INFO_CARD_BODY]) : null,
      infoCardIcon: record[FORM_FIELD_ATTRS.INFO_CARD_ICON] != null ? String(record[FORM_FIELD_ATTRS.INFO_CARD_ICON]) : null,
    };
  }
}
