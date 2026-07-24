import type { IWebApiAdapter } from './IWebApiAdapter';
import { assertGuid } from './assertGuid';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { GRID_COLUMN_CONFIG_ATTRS } from '@/constants/attributeNames';
import type { DesignerGridColumnConfig, GridColumnFilterType } from '@/state/models/DesignerFormModel';
import { withRetry } from './crmRetry';

// Encodes filter metadata into the v2 extended options JSON format.
// Falls back to a plain array if no filter metadata is set and options exist.
function encodeOptionsJson(col: DesignerGridColumnConfig): string | null {
  const hasOptions = col.optionsJson != null && col.optionsJson.trim().startsWith('[');
  const hasFilterMeta = col.filterType !== 'none' || col.lookupTargetEntity || col.lookupDisplayAttribute || col.lookupValueAttribute;

  if (!hasOptions && !hasFilterMeta) return null;

  let parsedOptions: unknown[] = [];
  if (hasOptions) {
    try { parsedOptions = JSON.parse(col.optionsJson!) as unknown[]; } catch { /* keep empty */ }
  }

  if (!hasFilterMeta && parsedOptions.length > 0) {
    return JSON.stringify(parsedOptions);
  }

  const v2: Record<string, unknown> = { v: 2 };
  if (parsedOptions.length > 0) v2['options'] = parsedOptions;
  if (col.filterType && col.filterType !== 'none') v2['filterType'] = col.filterType;
  if (col.lookupTargetEntity) v2['lookupTargetEntity'] = col.lookupTargetEntity;
  if (col.lookupDisplayAttribute) v2['lookupDisplayAttribute'] = col.lookupDisplayAttribute;
  if (col.lookupValueAttribute) v2['lookupValueAttribute'] = col.lookupValueAttribute;

  return JSON.stringify(v2);
}

// Decodes the options JSON field into filter metadata + raw options string.
function decodeOptionsJson(raw: string | null | undefined): {
  optionsJson: string | null;
  filterType: GridColumnFilterType;
  lookupTargetEntity: string | null;
  lookupDisplayAttribute: string | null;
  lookupValueAttribute: string | null;
} {
  const defaults = { optionsJson: null, filterType: 'none' as GridColumnFilterType, lookupTargetEntity: null, lookupDisplayAttribute: null, lookupValueAttribute: null };
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return { ...defaults, optionsJson: raw };
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      const options = Array.isArray(obj['options']) ? JSON.stringify(obj['options']) : null;
      const ft = (['text', 'optionset', 'lookup', 'none'] as GridColumnFilterType[]).includes(obj['filterType'] as GridColumnFilterType)
        ? (obj['filterType'] as GridColumnFilterType)
        : 'none';
      return {
        optionsJson: options,
        filterType: ft,
        lookupTargetEntity: typeof obj['lookupTargetEntity'] === 'string' ? obj['lookupTargetEntity'] : null,
        lookupDisplayAttribute: typeof obj['lookupDisplayAttribute'] === 'string' ? obj['lookupDisplayAttribute'] : null,
        lookupValueAttribute: typeof obj['lookupValueAttribute'] === 'string' ? obj['lookupValueAttribute'] : null,
      };
    }
  } catch { /* fall through */ }
  return defaults;
}

export class GridColumnConfigService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async createColumn(fieldId: string, col: DesignerGridColumnConfig): Promise<string> {
    const encodedOptionsJson = encodeOptionsJson(col);
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
          ...(encodedOptionsJson != null ? { [GRID_COLUMN_CONFIG_ATTRS.OPTIONS_JSON]: encodedOptionsJson } : {}),
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
    // Re-encode options JSON whenever any filter-related field changes.
    const filterFieldChanged = col.optionsJson !== undefined
      || col.filterType !== undefined
      || col.lookupTargetEntity !== undefined
      || col.lookupDisplayAttribute !== undefined
      || col.lookupValueAttribute !== undefined;
    if (filterFieldChanged) {
      data[GRID_COLUMN_CONFIG_ATTRS.OPTIONS_JSON] = encodeOptionsJson(col as DesignerGridColumnConfig) ?? null;
    }

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
    const rawOptionsJson = record[GRID_COLUMN_CONFIG_ATTRS.OPTIONS_JSON] != null
      ? String(record[GRID_COLUMN_CONFIG_ATTRS.OPTIONS_JSON])
      : null;
    const { optionsJson, filterType, lookupTargetEntity, lookupDisplayAttribute, lookupValueAttribute } = decodeOptionsJson(rawOptionsJson);
    return {
      id: String(record[GRID_COLUMN_CONFIG_ATTRS.ID] ?? ''),
      columnLabel: String(record[GRID_COLUMN_CONFIG_ATTRS.COLUMN_LABEL] ?? ''),
      targetAttribute: String(record[GRID_COLUMN_CONFIG_ATTRS.TARGET_ATTR] ?? ''),
      columnFieldType: String(record[GRID_COLUMN_CONFIG_ATTRS.COLUMN_TYPE] ?? 'text'),
      displayOrder: Number(record[GRID_COLUMN_CONFIG_ATTRS.DISPLAY_ORDER] ?? 0),
      isEditable: Boolean(record[GRID_COLUMN_CONFIG_ATTRS.IS_EDITABLE]),
      optionsJson,
      filterType,
      lookupTargetEntity,
      lookupDisplayAttribute,
      lookupValueAttribute,
    };
  }
}
