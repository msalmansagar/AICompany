import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { FIELD_LABEL_ATTRS } from '@/constants/attributeNames';
import type { DesignerFieldLabelModel } from '@/state/models/DesignerFieldLabelModel';
import { withRetry } from './crmRetry';

export interface CreateFieldLabelDto {
  fieldId: string;
  locale: string;
  label?: string | null;
  placeholder?: string | null;
  tooltip?: string | null;
}

export interface UpdateFieldLabelDto {
  label?: string | null;
  placeholder?: string | null;
  tooltip?: string | null;
}

export class FieldLabelService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async listLabelsForField(fieldId: string): Promise<DesignerFieldLabelModel[]> {
    const select = [
      FIELD_LABEL_ATTRS.ID,
      FIELD_LABEL_ATTRS.FIELD_ID_VALUE,
      FIELD_LABEL_ATTRS.NAME,
      FIELD_LABEL_ATTRS.LOCALE,
      FIELD_LABEL_ATTRS.LABEL,
      FIELD_LABEL_ATTRS.PLACEHOLDER,
      FIELD_LABEL_ATTRS.TOOLTIP,
    ].join(',');

    const filter = `${FIELD_LABEL_ATTRS.FIELD_ID_VALUE} eq ${fieldId}`;

    const result = await withRetry(
      () => this.webApi.retrieveMultipleRecords(
        ENTITY_NAMES.FIELD_LABEL,
        `?$select=${select}&$filter=${filter}&$orderby=${FIELD_LABEL_ATTRS.LOCALE} asc`
      ),
      'listLabelsForField'
    );

    return result.entities.map(r => this.mapRecordToModel(r));
  }

  async createLabel(dto: CreateFieldLabelDto): Promise<string> {
    const autoName = `${dto.fieldId.slice(0, 8)} (${dto.locale})`;
    const payload: Record<string, unknown> = {
      [`${FIELD_LABEL_ATTRS.FIELD_ID}@odata.bind`]: `/qdb_form_fields(${dto.fieldId})`,
      [FIELD_LABEL_ATTRS.NAME]: autoName,
      [FIELD_LABEL_ATTRS.LOCALE]: dto.locale,
    };
    if (dto.label != null) payload[FIELD_LABEL_ATTRS.LABEL] = dto.label;
    if (dto.placeholder != null) payload[FIELD_LABEL_ATTRS.PLACEHOLDER] = dto.placeholder;
    if (dto.tooltip != null) payload[FIELD_LABEL_ATTRS.TOOLTIP] = dto.tooltip;

    const result = await withRetry(
      () => this.webApi.createRecord(ENTITY_NAMES.FIELD_LABEL, payload),
      'createFieldLabel'
    );
    return result.id;
  }

  async updateLabel(id: string, dto: UpdateFieldLabelDto): Promise<void> {
    const data: Record<string, unknown> = {};
    if (dto.label !== undefined) data[FIELD_LABEL_ATTRS.LABEL] = dto.label ?? null;
    if (dto.placeholder !== undefined) data[FIELD_LABEL_ATTRS.PLACEHOLDER] = dto.placeholder ?? null;
    if (dto.tooltip !== undefined) data[FIELD_LABEL_ATTRS.TOOLTIP] = dto.tooltip ?? null;

    if (Object.keys(data).length === 0) return;

    await withRetry(
      () => this.webApi.updateRecord(ENTITY_NAMES.FIELD_LABEL, id, data),
      'updateFieldLabel'
    );
  }

  async deleteLabel(id: string): Promise<void> {
    await withRetry(
      () => this.webApi.deleteRecord(ENTITY_NAMES.FIELD_LABEL, id),
      'deleteFieldLabel'
    );
  }

  private mapRecordToModel(record: Record<string, unknown>): DesignerFieldLabelModel {
    return {
      id: String(record[FIELD_LABEL_ATTRS.ID] ?? ''),
      fieldId: String(record[FIELD_LABEL_ATTRS.FIELD_ID_VALUE] ?? ''),
      name: String(record[FIELD_LABEL_ATTRS.NAME] ?? ''),
      locale: String(record[FIELD_LABEL_ATTRS.LOCALE] ?? ''),
      label: record[FIELD_LABEL_ATTRS.LABEL] != null ? String(record[FIELD_LABEL_ATTRS.LABEL]) : null,
      placeholder: record[FIELD_LABEL_ATTRS.PLACEHOLDER] != null ? String(record[FIELD_LABEL_ATTRS.PLACEHOLDER]) : null,
      tooltip: record[FIELD_LABEL_ATTRS.TOOLTIP] != null ? String(record[FIELD_LABEL_ATTRS.TOOLTIP]) : null,
    };
  }
}
