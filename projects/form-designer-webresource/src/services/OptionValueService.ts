import { ENTITY_NAMES } from '@/constants/entityNames';
import { FORM_OPTION_VALUE_ATTRS } from '@/constants/attributeNames';
import type { DesignerOptionValue } from '@/state/models/DesignerFormModel';
import { withRetry } from './crmRetry';

export interface CreateOptionDto {
  fieldId: string;
  label: string;
  value: string;
  sortOrder: number;
  isDefault: boolean;
}

export interface UpdateOptionDto {
  label?: string;
  value?: string;
  sortOrder?: number;
  isDefault?: boolean;
}

export class OptionValueService {
  constructor(private readonly webApi: typeof Xrm.WebApi) {}

  async createOption(dto: CreateOptionDto): Promise<string> {
    const result = await withRetry(
      () =>
        this.webApi.createRecord(ENTITY_NAMES.FORM_OPTION_VALUE, {
          [`${FORM_OPTION_VALUE_ATTRS.FIELD_ID}@odata.bind`]: `/qdb_form_fields(${dto.fieldId})`,
          [FORM_OPTION_VALUE_ATTRS.LABEL]: dto.label,
          [FORM_OPTION_VALUE_ATTRS.VALUE]: dto.value,
          [FORM_OPTION_VALUE_ATTRS.SORT_ORDER]: dto.sortOrder,
          [FORM_OPTION_VALUE_ATTRS.IS_DEFAULT]: dto.isDefault,
        }),
      'createOption'
    );
    return result.id;
  }

  async updateOption(id: string, dto: UpdateOptionDto): Promise<void> {
    const data: Record<string, unknown> = {};
    if (dto.label !== undefined) data[FORM_OPTION_VALUE_ATTRS.LABEL] = dto.label;
    if (dto.value !== undefined) data[FORM_OPTION_VALUE_ATTRS.VALUE] = dto.value;
    if (dto.sortOrder !== undefined) data[FORM_OPTION_VALUE_ATTRS.SORT_ORDER] = dto.sortOrder;
    if (dto.isDefault !== undefined) data[FORM_OPTION_VALUE_ATTRS.IS_DEFAULT] = dto.isDefault;

    if (Object.keys(data).length === 0) return;

    await withRetry(
      () => this.webApi.updateRecord(ENTITY_NAMES.FORM_OPTION_VALUE, id, data),
      'updateOption'
    );
  }

  async deleteOption(id: string): Promise<void> {
    await withRetry(
      () => this.webApi.deleteRecord(ENTITY_NAMES.FORM_OPTION_VALUE, id),
      'deleteOption'
    );
  }

  async listOptionsForField(fieldId: string): Promise<DesignerOptionValue[]> {
    const select = [
      FORM_OPTION_VALUE_ATTRS.ID,
      FORM_OPTION_VALUE_ATTRS.FIELD_ID_VALUE,
      FORM_OPTION_VALUE_ATTRS.LABEL,
      FORM_OPTION_VALUE_ATTRS.VALUE,
      FORM_OPTION_VALUE_ATTRS.SORT_ORDER,
      FORM_OPTION_VALUE_ATTRS.IS_DEFAULT,
    ].join(',');

    const filter = `${FORM_OPTION_VALUE_ATTRS.FIELD_ID_VALUE} eq ${fieldId}`;
    const orderBy = `${FORM_OPTION_VALUE_ATTRS.SORT_ORDER} asc`;

    const result = await withRetry(
      () =>
        this.webApi.retrieveMultipleRecords(
          ENTITY_NAMES.FORM_OPTION_VALUE,
          `?$select=${select}&$filter=${filter}&$orderby=${orderBy}`
        ),
      'listOptionsForField'
    );

    return result.entities.map(record => this.mapRecordToModel(record));
  }

  // Full-replace sync: delete options removed by the user, create new, update existing.
  async syncOptions(fieldId: string, currentOptions: DesignerOptionValue[]): Promise<void> {
    const existing = await this.listOptionsForField(fieldId);
    const currentIds = new Set(currentOptions.filter(o => !o.id.startsWith('tmp_')).map(o => o.id));

    await Promise.all(
      existing
        .filter(o => !currentIds.has(o.id))
        .map(o => this.deleteOption(o.id))
    );

    for (const option of currentOptions) {
      if (option.id.startsWith('tmp_')) {
        await this.createOption({ fieldId, label: option.label, value: option.value, sortOrder: option.sortOrder, isDefault: option.isDefault });
      } else {
        await this.updateOption(option.id, { label: option.label, value: option.value, sortOrder: option.sortOrder, isDefault: option.isDefault });
      }
    }
  }

  private mapRecordToModel(record: Record<string, unknown>): DesignerOptionValue {
    return {
      id: String(record[FORM_OPTION_VALUE_ATTRS.ID] ?? ''),
      label: String(record[FORM_OPTION_VALUE_ATTRS.LABEL] ?? ''),
      value: String(record[FORM_OPTION_VALUE_ATTRS.VALUE] ?? ''),
      sortOrder: Number(record[FORM_OPTION_VALUE_ATTRS.SORT_ORDER] ?? 0),
      isDefault: Boolean(record[FORM_OPTION_VALUE_ATTRS.IS_DEFAULT]),
    };
  }
}
