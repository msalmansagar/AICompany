import type { IWebApiAdapter } from './IWebApiAdapter';
import { assertGuid } from './assertGuid';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { GRID_COLUMN_CONFIG_ATTRS } from '@/constants/attributeNames';
import type { DesignerGridColumnConfig } from '@/state/models/DesignerFormModel';
import { withRetry } from './crmRetry';

export class GridColumnConfigService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async createColumn(fieldId: string, col: DesignerGridColumnConfig): Promise<string> {
    const result = await withRetry(
      () =>
        this.webApi.createRecord(ENTITY_NAMES.GRID_COLUMN_CONFIG, {
          [`${GRID_COLUMN_CONFIG_ATTRS.FIELD_ID}@odata.bind`]: `/qdb_form_fields(${fieldId})`,
          [GRID_COLUMN_CONFIG_ATTRS.COLUMN_LABEL]: col.columnLabel,
          [GRID_COLUMN_CONFIG_ATTRS.TARGET_ATTR]: col.targetAttribute,
          [GRID_COLUMN_CONFIG_ATTRS.COLUMN_TYPE]: col.columnFieldType,
          [GRID_COLUMN_CONFIG_ATTRS.DISPLAY_ORDER]: col.displayOrder,
          [GRID_COLUMN_CONFIG_ATTRS.IS_VISIBLE]: true,
          [GRID_COLUMN_CONFIG_ATTRS.IS_EDITABLE]: col.isEditable,
          ...(col.optionsJson != null ? { [GRID_COLUMN_CONFIG_ATTRS.OPTIONS_JSON]: col.optionsJson } : {}),
        }),
      'createGridColumn',
    );
    return result.id;
  }

  async updateColumn(id: string, col: Partial<DesignerGridColumnConfig>): Promise<void> {
    const data: Record<string, unknown> = {};
    if (col.columnLabel !== undefined) data[GRID_COLUMN_CONFIG_ATTRS.COLUMN_LABEL] = col.columnLabel;
    if (col.targetAttribute !== undefined) data[GRID_COLUMN_CONFIG_ATTRS.TARGET_ATTR] = col.targetAttribute;
    if (col.columnFieldType !== undefined) data[GRID_COLUMN_CONFIG_ATTRS.COLUMN_TYPE] = col.columnFieldType;
    if (col.displayOrder !== undefined) data[GRID_COLUMN_CONFIG_ATTRS.DISPLAY_ORDER] = col.displayOrder;
    if (col.isEditable !== undefined) data[GRID_COLUMN_CONFIG_ATTRS.IS_EDITABLE] = col.isEditable;
    if (col.optionsJson !== undefined) data[GRID_COLUMN_CONFIG_ATTRS.OPTIONS_JSON] = col.optionsJson ?? null;

    if (Object.keys(data).length === 0) return;

    await withRetry(
      () => this.webApi.updateRecord(ENTITY_NAMES.GRID_COLUMN_CONFIG, id, data),
      'updateGridColumn',
    );
  }

  async deleteColumn(id: string): Promise<void> {
    await withRetry(
      () => this.webApi.deleteRecord(ENTITY_NAMES.GRID_COLUMN_CONFIG, id),
      'deleteGridColumn',
    );
  }

  async listColumnsForField(fieldId: string): Promise<DesignerGridColumnConfig[]> {
    assertGuid(fieldId, 'fieldId');
    const select = [
      GRID_COLUMN_CONFIG_ATTRS.ID,
      GRID_COLUMN_CONFIG_ATTRS.COLUMN_LABEL,
      GRID_COLUMN_CONFIG_ATTRS.TARGET_ATTR,
      GRID_COLUMN_CONFIG_ATTRS.COLUMN_TYPE,
      GRID_COLUMN_CONFIG_ATTRS.DISPLAY_ORDER,
      GRID_COLUMN_CONFIG_ATTRS.IS_EDITABLE,
      GRID_COLUMN_CONFIG_ATTRS.OPTIONS_JSON,
    ].join(',');

    const filter = `${GRID_COLUMN_CONFIG_ATTRS.FIELD_ID_VALUE} eq ${fieldId} and ${GRID_COLUMN_CONFIG_ATTRS.IS_VISIBLE} eq true`;
    const orderBy = `${GRID_COLUMN_CONFIG_ATTRS.DISPLAY_ORDER} asc`;

    const result = await withRetry(
      () =>
        this.webApi.retrieveMultipleRecords(
          ENTITY_NAMES.GRID_COLUMN_CONFIG,
          `?$select=${select}&$filter=${filter}&$orderby=${orderBy}`,
        ),
      'listGridColumnsForField',
    );

    return result.entities.map(r => this.mapRecord(r));
  }

  // Full-replace sync: delete removed, create new, update existing (same pattern as OptionValueService).
  async syncColumns(fieldId: string, columns: DesignerGridColumnConfig[]): Promise<void> {
    const existing = await this.listColumnsForField(fieldId);
    const currentIds = new Set(
      columns.filter(c => !c.id.startsWith('tmp_')).map(c => c.id),
    );

    await Promise.all(
      existing
        .filter(c => !currentIds.has(c.id))
        .map(c => this.deleteColumn(c.id)),
    );

    for (const col of columns) {
      if (col.id.startsWith('tmp_')) {
        await this.createColumn(fieldId, col);
      } else {
        await this.updateColumn(col.id, col);
      }
    }
  }

  private mapRecord(record: Record<string, unknown>): DesignerGridColumnConfig {
    return {
      id: String(record[GRID_COLUMN_CONFIG_ATTRS.ID] ?? ''),
      columnLabel: String(record[GRID_COLUMN_CONFIG_ATTRS.COLUMN_LABEL] ?? ''),
      targetAttribute: String(record[GRID_COLUMN_CONFIG_ATTRS.TARGET_ATTR] ?? ''),
      columnFieldType: String(record[GRID_COLUMN_CONFIG_ATTRS.COLUMN_TYPE] ?? 'text'),
      displayOrder: Number(record[GRID_COLUMN_CONFIG_ATTRS.DISPLAY_ORDER] ?? 0),
      isEditable: Boolean(record[GRID_COLUMN_CONFIG_ATTRS.IS_EDITABLE]),
      optionsJson: record[GRID_COLUMN_CONFIG_ATTRS.OPTIONS_JSON] != null
        ? String(record[GRID_COLUMN_CONFIG_ATTRS.OPTIONS_JSON])
        : null,
    };
  }
}
