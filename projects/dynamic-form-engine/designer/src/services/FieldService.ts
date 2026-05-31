import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import {
  FORM_FIELD_ATTRS,
  FIELD_TYPE_TO_PICKLIST,
  PICKLIST_TO_FIELD_TYPE,
  COLUMN_SPAN_TO_PICKLIST,
  PICKLIST_TO_COLUMN_SPAN,
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
    };
  }
}
