import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { FORM_TAB_ATTRS } from '@/constants/attributeNames';
import type { DesignerTabModel } from '@/state/models/DesignerFormModel';
import { withRetry } from './crmRetry';

export interface CreateTabDto {
  formId: string;
  label: string;
  sortOrder: number;
  iconName?: string | null;
  isVisible?: boolean;
  requiresPreviousTabComplete?: boolean;
}

export interface UpdateTabDto {
  label?: string;
  sortOrder?: number;
  iconName?: string | null;
  isVisible?: boolean;
  requiresPreviousTabComplete?: boolean;
}

export class TabService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async createTab(dto: CreateTabDto): Promise<string> {
    const result = await withRetry(
      () =>
        this.webApi.createRecord(ENTITY_NAMES.FORM_TAB, {
          [`${FORM_TAB_ATTRS.FORM_ID}@odata.bind`]: `/qdb_form_definitions(${dto.formId})`,
          [FORM_TAB_ATTRS.LABEL]: dto.label,
          [FORM_TAB_ATTRS.SORT_ORDER]: dto.sortOrder,
          [FORM_TAB_ATTRS.IS_VISIBLE]: dto.isVisible ?? true,
          [FORM_TAB_ATTRS.REQUIRES_PREVIOUS_TAB_COMPLETE]: dto.requiresPreviousTabComplete ?? false,
          ...(dto.iconName != null ? { [FORM_TAB_ATTRS.ICON_NAME]: dto.iconName } : {}),
        }),
      'createTab'
    );
    return result.id;
  }

  async updateTab(id: string, dto: UpdateTabDto): Promise<void> {
    const data: Record<string, unknown> = {};
    if (dto.label !== undefined) data[FORM_TAB_ATTRS.LABEL] = dto.label;
    if (dto.sortOrder !== undefined) data[FORM_TAB_ATTRS.SORT_ORDER] = dto.sortOrder;
    if (dto.isVisible !== undefined) data[FORM_TAB_ATTRS.IS_VISIBLE] = dto.isVisible;
    if (dto.requiresPreviousTabComplete !== undefined) {
      data[FORM_TAB_ATTRS.REQUIRES_PREVIOUS_TAB_COMPLETE] = dto.requiresPreviousTabComplete;
    }
    if (dto.iconName !== undefined) data[FORM_TAB_ATTRS.ICON_NAME] = dto.iconName;

    if (Object.keys(data).length === 0) return;

    await withRetry(
      () => this.webApi.updateRecord(ENTITY_NAMES.FORM_TAB, id, data),
      'updateTab'
    );
  }

  async deleteTab(id: string): Promise<void> {
    await withRetry(
      () => this.webApi.deleteRecord(ENTITY_NAMES.FORM_TAB, id),
      'deleteTab'
    );
  }

  async listTabsForForm(formId: string): Promise<DesignerTabModel[]> {
    const select = [
      FORM_TAB_ATTRS.ID,
      FORM_TAB_ATTRS.FORM_ID_VALUE,
      FORM_TAB_ATTRS.LABEL,
      FORM_TAB_ATTRS.ICON_NAME,
      FORM_TAB_ATTRS.SORT_ORDER,
      FORM_TAB_ATTRS.IS_VISIBLE,
      FORM_TAB_ATTRS.REQUIRES_PREVIOUS_TAB_COMPLETE,
    ].join(',');

    const filter = `${FORM_TAB_ATTRS.FORM_ID_VALUE} eq ${formId}`;
    const orderBy = `${FORM_TAB_ATTRS.SORT_ORDER} asc`;

    const result = await withRetry(
      () =>
        this.webApi.retrieveMultipleRecords(
          ENTITY_NAMES.FORM_TAB,
          `?$select=${select}&$filter=${filter}&$orderby=${orderBy}`
        ),
      'listTabsForForm'
    );

    return result.entities.map(record => this.mapRecordToModel(record));
  }

  private mapRecordToModel(record: Record<string, unknown>): DesignerTabModel {
    return {
      id: String(record[FORM_TAB_ATTRS.ID] ?? ''),
      formId: String(record[FORM_TAB_ATTRS.FORM_ID_VALUE] ?? ''),
      label: String(record[FORM_TAB_ATTRS.LABEL] ?? ''),
      iconName: record[FORM_TAB_ATTRS.ICON_NAME] ? String(record[FORM_TAB_ATTRS.ICON_NAME]) : null,
      sortOrder: Number(record[FORM_TAB_ATTRS.SORT_ORDER] ?? 0),
      isVisible: record[FORM_TAB_ATTRS.IS_VISIBLE] !== false,
      requiresPreviousTabComplete: Boolean(record[FORM_TAB_ATTRS.REQUIRES_PREVIOUS_TAB_COMPLETE]),
    };
  }
}
