// Xrm-backed replacement for src/services/gridDataService.ts. Queries a grid field's target
// entity directly via the CRM Web API instead of the portal's /grids backend endpoint.
import type { GridRecord, GridRecordPage } from '@qdb/shared';
import { webApi, cleanGuid } from './xrmClient';
import { getLoadedForm } from './formApi';

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';

interface GridPageRequest {
  fieldId: string;
  page: number;
  pageSize: number;
  signal?: AbortSignal;
  dependsOnValue?: string;
  pagingCookie?: string;
  searchText?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  columnFilters?: Record<string, string>;
}

interface GridColumn { targetAttribute: string; columnFieldType: string; }
interface GridConfig { targetEntity: string; entityName?: string; filterExpression?: string; columnConfigs: GridColumn[]; }

function findGridConfig(fieldId: string): GridConfig | null {
  const form = getLoadedForm();
  if (!form) return null;
  for (const tab of form.tabs) {
    for (const section of tab.sections) {
      for (const field of section.fields) {
        if (field.id === fieldId && field.gridConfig) return field.gridConfig as unknown as GridConfig;
      }
    }
  }
  return null;
}

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

function buildFilter(grid: GridConfig, request: GridPageRequest): string[] {
  const clauses: string[] = [];
  if (grid.filterExpression) clauses.push(grid.filterExpression);

  const columns = grid.columnConfigs ?? [];
  if (request.searchText && request.searchText.trim() && columns.length > 0) {
    const term = escapeOData(request.searchText.trim());
    const textColumns = columns.filter((c) => !c.columnFieldType || c.columnFieldType === 'text');
    const searchable = (textColumns.length > 0 ? textColumns : columns).map((c) => c.targetAttribute).filter(Boolean);
    if (searchable.length > 0) {
      clauses.push('(' + searchable.map((a) => `contains(${a},'${term}')`).join(' or ') + ')');
    }
  }

  for (const [attribute, value] of Object.entries(request.columnFilters ?? {})) {
    if (value && value.trim()) clauses.push(`contains(${attribute},'${escapeOData(value.trim())}')`);
  }
  return clauses;
}

export async function fetchGridPage(request: GridPageRequest): Promise<GridRecordPage> {
  const empty: GridRecordPage = { records: [], page: request.page, pageSize: request.pageSize, hasNextPage: false, isCapped: false };
  const grid = findGridConfig(request.fieldId);
  const entity = grid?.entityName ?? grid?.targetEntity;
  // TEMP diagnostics for in-CRM grid debugging — remove once confirmed working.
  // eslint-disable-next-line no-console
  console.warn('[DFE-grid] field', request.fieldId, '| gridFound', !!grid, '| entity', entity);
  if (!grid || !entity) return empty;

  const columns = grid.columnConfigs ?? [];
  const selectAttributes = Array.from(new Set(columns.map((c) => c.targetAttribute).filter(Boolean)));
  const idAttribute = `${entity}id`;

  let options = `?$select=${selectAttributes.join(',') || idAttribute}`;
  const filters = buildFilter(grid, request);
  if (filters.length > 0) options += `&$filter=${encodeURIComponent(filters.join(' and '))}`;
  if (request.sortBy) options += `&$orderby=${request.sortBy} ${request.sortDirection ?? 'asc'}`;

  let result: { entities: Record<string, unknown>[]; nextLink?: string };
  try {
    result = await webApi().retrieveMultipleRecords(entity, options, request.pageSize);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[DFE-grid] query FAILED', entity, options, error);
    throw error;
  }
  // eslint-disable-next-line no-console
  console.warn('[DFE-grid] query', entity, options, '->', result.entities.length, 'records');

  const records: GridRecord[] = result.entities.map((row) => {
    const values: Record<string, unknown> = {};
    for (const column of columns) {
      const attribute = column.targetAttribute;
      if (!attribute) continue;
      const formatted = row[`${attribute}${FORMATTED}`];
      values[attribute] = formatted != null ? formatted : row[attribute];
    }
    return { id: cleanGuid(String(row[idAttribute] ?? '')), values };
  });

  return {
    records,
    page: request.page,
    pageSize: request.pageSize,
    hasNextPage: Boolean(result.nextLink),
    isCapped: false,
    totalCount: records.length,
  };
}
