import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import {
  FORM_SECTION_ATTRS,
  COLUMN_COUNT_TO_PICKLIST,
  PICKLIST_TO_COLUMN_COUNT,
} from '@/constants/attributeNames';
import type { DesignerSectionModel } from '@/state/models/DesignerFormModel';
import { withRetry } from './crmRetry';

export interface CreateSectionDto {
  tabId: string;
  label: string;
  description?: string | null;
  iconName?: string | null;
  columnCount: 1 | 2 | 3;
  isCollapsible: boolean;
  isExpandedByDefault: boolean;
  isVisible?: boolean;
  sortOrder: number;
}

export interface UpdateSectionDto {
  label?: string;
  description?: string | null;
  iconName?: string | null;
  columnCount?: 1 | 2 | 3;
  isCollapsible?: boolean;
  isExpandedByDefault?: boolean;
  isVisible?: boolean;
  sortOrder?: number;
}

export class SectionService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async createSection(dto: CreateSectionDto): Promise<string> {
    const result = await withRetry(
      () =>
        this.webApi.createRecord(ENTITY_NAMES.FORM_SECTION, {
          [`${FORM_SECTION_ATTRS.TAB_ID}@odata.bind`]: `/qdb_form_tabs(${dto.tabId})`,
          [FORM_SECTION_ATTRS.LABEL]: dto.label,
          ...(dto.description != null ? { [FORM_SECTION_ATTRS.DESCRIPTION]: dto.description } : {}),
          ...(dto.iconName != null ? { [FORM_SECTION_ATTRS.ICON_NAME]: dto.iconName } : {}),
          [FORM_SECTION_ATTRS.COLUMN_COUNT]: COLUMN_COUNT_TO_PICKLIST[dto.columnCount] ?? COLUMN_COUNT_TO_PICKLIST[1],
          [FORM_SECTION_ATTRS.IS_COLLAPSIBLE]: dto.isCollapsible,
          [FORM_SECTION_ATTRS.IS_COLLAPSED_BY_DEFAULT]: !dto.isExpandedByDefault,
          [FORM_SECTION_ATTRS.IS_VISIBLE]: dto.isVisible ?? true,
          [FORM_SECTION_ATTRS.SORT_ORDER]: dto.sortOrder,
        }),
      'createSection'
    );
    return result.id;
  }

  async updateSection(id: string, dto: UpdateSectionDto): Promise<void> {
    const data: Record<string, unknown> = {};
    if (dto.label !== undefined) data[FORM_SECTION_ATTRS.LABEL] = dto.label;
    if (dto.description !== undefined) data[FORM_SECTION_ATTRS.DESCRIPTION] = dto.description;
    if (dto.iconName !== undefined) data[FORM_SECTION_ATTRS.ICON_NAME] = dto.iconName;
    if (dto.columnCount !== undefined) {
      data[FORM_SECTION_ATTRS.COLUMN_COUNT] = COLUMN_COUNT_TO_PICKLIST[dto.columnCount] ?? COLUMN_COUNT_TO_PICKLIST[1];
    }
    if (dto.isCollapsible !== undefined) data[FORM_SECTION_ATTRS.IS_COLLAPSIBLE] = dto.isCollapsible;
    if (dto.isExpandedByDefault !== undefined) {
      data[FORM_SECTION_ATTRS.IS_COLLAPSED_BY_DEFAULT] = !dto.isExpandedByDefault;
    }
    if (dto.isVisible !== undefined) data[FORM_SECTION_ATTRS.IS_VISIBLE] = dto.isVisible;
    if (dto.sortOrder !== undefined) data[FORM_SECTION_ATTRS.SORT_ORDER] = dto.sortOrder;

    if (Object.keys(data).length === 0) return;

    await withRetry(
      () => this.webApi.updateRecord(ENTITY_NAMES.FORM_SECTION, id, data),
      'updateSection'
    );
  }

  async deleteSection(id: string): Promise<void> {
    await withRetry(
      () => this.webApi.deleteRecord(ENTITY_NAMES.FORM_SECTION, id),
      'deleteSection'
    );
  }

  async listSectionsForTab(tabId: string): Promise<DesignerSectionModel[]> {
    const select = [
      FORM_SECTION_ATTRS.ID,
      FORM_SECTION_ATTRS.TAB_ID_VALUE,
      FORM_SECTION_ATTRS.LABEL,
      FORM_SECTION_ATTRS.DESCRIPTION,
      FORM_SECTION_ATTRS.ICON_NAME,
      FORM_SECTION_ATTRS.COLUMN_COUNT,
      FORM_SECTION_ATTRS.IS_COLLAPSIBLE,
      FORM_SECTION_ATTRS.IS_COLLAPSED_BY_DEFAULT,
      FORM_SECTION_ATTRS.IS_VISIBLE,
      FORM_SECTION_ATTRS.SORT_ORDER,
    ].join(',');

    const filter = `${FORM_SECTION_ATTRS.TAB_ID_VALUE} eq ${tabId}`;
    const orderBy = `${FORM_SECTION_ATTRS.SORT_ORDER} asc`;

    const result = await withRetry(
      () =>
        this.webApi.retrieveMultipleRecords(
          ENTITY_NAMES.FORM_SECTION,
          `?$select=${select}&$filter=${filter}&$orderby=${orderBy}`
        ),
      'listSectionsForTab'
    );

    return result.entities.map(record => this.mapRecordToModel(record));
  }

  private mapRecordToModel(record: Record<string, unknown>): DesignerSectionModel {
    const rawColumnCount = Number(record[FORM_SECTION_ATTRS.COLUMN_COUNT] ?? COLUMN_COUNT_TO_PICKLIST[1]);
    const columnCount = PICKLIST_TO_COLUMN_COUNT[rawColumnCount] ?? 1;
    const isCollapsedByDefault = Boolean(record[FORM_SECTION_ATTRS.IS_COLLAPSED_BY_DEFAULT]);

    return {
      id: String(record[FORM_SECTION_ATTRS.ID] ?? ''),
      tabId: String(record[FORM_SECTION_ATTRS.TAB_ID_VALUE] ?? ''),
      label: String(record[FORM_SECTION_ATTRS.LABEL] ?? ''),
      description: record[FORM_SECTION_ATTRS.DESCRIPTION]
        ? String(record[FORM_SECTION_ATTRS.DESCRIPTION])
        : null,
      iconName: record[FORM_SECTION_ATTRS.ICON_NAME] ? String(record[FORM_SECTION_ATTRS.ICON_NAME]) : null,
      columnCount,
      isCollapsible: Boolean(record[FORM_SECTION_ATTRS.IS_COLLAPSIBLE]),
      isExpandedByDefault: !isCollapsedByDefault,
      isVisible: record[FORM_SECTION_ATTRS.IS_VISIBLE] !== false,
      sortOrder: Number(record[FORM_SECTION_ATTRS.SORT_ORDER] ?? 0),
    };
  }
}
