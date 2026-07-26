// Xrm-backed replacement for src/services/gridDataService.ts. Queries a grid field's target
// entity directly via the CRM Web API instead of the portal's /grids backend endpoint.
import {
  buildFetchXmlFilter,
  buildODataFilter,
  buildViewFetchXml,
  type GridRecord,
  type GridRecordPage,
} from '@qdb/shared';
import { webApi, cleanGuid } from './xrmClient';
import { getLoadedForm } from './formApi';
import { fetchViewPage, resolveViewFetchXml } from './viewQuery';

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';

interface GridPageRequest {
  fieldId: string;
  page: number;
  pageSize: number;
  signal?: AbortSignal;
  dependsOnValues?: Record<string, string>;
  pagingCookie?: string;
  searchText?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  columnFilters?: Record<string, string>;
}

interface GridColumn { targetAttribute: string; columnFieldType: string; }
interface GridConfig {
  targetEntity: string;
  entityName?: string;
  savedViewId?: string;
  filterExpression?: string;
  dependsOnFilterTemplate?: string;
  columnConfigs: GridColumn[];
}

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

// A lookup is only addressable in its navigation form (_attr_value) in $select and
// $orderby — the bare attribute name is valid FetchXML but makes the Web API return 400.
function toQueryAttribute(attribute: string, columns: GridColumn[]): string {
  const column = columns.find((candidate) => candidate.targetAttribute === attribute);
  return column?.columnFieldType === 'lookup' ? `_${attribute}_value` : attribute;
}

// Compiles the maker's depends-on template against the current outside-field values.
// A malformed template must not take the grid down — it degrades to an unfiltered query,
// matching the portal path's policy.
function buildDependsOnClause(grid: GridConfig, request: GridPageRequest): string {
  if (!grid.dependsOnFilterTemplate) return '';
  try {
    return buildODataFilter(grid.dependsOnFilterTemplate, request.dependsOnValues ?? {});
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[DFE-grid] depends-on template could not be parsed — skipped', error);
    return '';
  }
}

function buildFilter(grid: GridConfig, request: GridPageRequest): string[] {
  const clauses: string[] = [];
  if (grid.filterExpression) clauses.push(grid.filterExpression);

  const dependsOnClause = buildDependsOnClause(grid, request);
  if (dependsOnClause) clauses.push(dependsOnClause);

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

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// The same conditions as buildFilter, in the FetchXML dialect the saved-view path needs.
function buildFetchXmlConditions(grid: GridConfig, request: GridPageRequest): string {
  const parts: string[] = [];

  for (const template of [grid.filterExpression, grid.dependsOnFilterTemplate]) {
    if (!template) continue;
    try {
      const compiled = buildFetchXmlFilter(template, request.dependsOnValues ?? {});
      if (compiled) parts.push(compiled);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[DFE-grid] filter template could not be parsed — skipped', error);
    }
  }

  const columns = grid.columnConfigs ?? [];
  if (request.searchText && request.searchText.trim() && columns.length > 0) {
    const term = escapeXmlAttribute(`%${request.searchText.trim()}%`);
    const textColumns = columns.filter((c) => !c.columnFieldType || c.columnFieldType === 'text');
    const searchable = (textColumns.length > 0 ? textColumns : columns)
      .map((c) => c.targetAttribute)
      .filter(Boolean);
    if (searchable.length > 0) {
      const conditions = searchable
        .map((attribute) => `<condition attribute="${attribute}" operator="like" value="${term}"/>`)
        .join('');
      parts.push(`<filter type="or">${conditions}</filter>`);
    }
  }

  for (const [attribute, value] of Object.entries(request.columnFilters ?? {})) {
    if (!value || !value.trim()) continue;
    const term = escapeXmlAttribute(`%${value.trim()}%`);
    parts.push(`<condition attribute="${attribute}" operator="like" value="${term}"/>`);
  }

  return parts.length > 0 ? `<filter type="and">${parts.join('')}</filter>` : '';
}

function mapRows(
  rows: Record<string, unknown>[],
  columns: GridColumn[],
  idAttribute: string,
): GridRecord[] {
  return rows.map((row) => {
    const values: Record<string, unknown> = {};
    for (const column of columns) {
      const attribute = column.targetAttribute;
      if (!attribute) continue;
      // A lookup attribute is returned by CRM under _<attr>_value (GUID) plus
      // _<attr>_value@FormattedValue (label), never under the bare <attr> key — so fall
      // back to those forms, otherwise a lookup column renders blank (mirrors the backend's
      // CrmGridDataService.buildRestrictedValues remap).
      const formatted = row[`${attribute}${FORMATTED}`] ?? row[`_${attribute}_value${FORMATTED}`];
      const rawValue = row[attribute] ?? row[`_${attribute}_value`];
      // The grid cell renders values[attribute] directly, so prefer the label; also expose it
      // under the FormattedValue key for the views that read it. The row's own id is preserved
      // separately as record.id for selection/submission.
      values[attribute] = formatted != null ? formatted : rawValue;
      if (formatted != null) values[`${attribute}${FORMATTED}`] = formatted;
    }
    return { id: cleanGuid(String(row[idAttribute] ?? '')), values };
  });
}

// Saved-view path: the view owns the columns, filter and sort; the grid pages on top of it
// with page-number paging, exactly as the portal does.
async function fetchPageFromView(
  grid: GridConfig,
  entity: string,
  request: GridPageRequest,
): Promise<GridRecordPage | null> {
  if (!grid.savedViewId) return null;

  const baseXml = await resolveViewFetchXml(grid.savedViewId);
  if (!baseXml) return null;

  const columns = grid.columnConfigs ?? [];
  const idAttribute = `${entity}id`;

  const fetchXml = buildViewFetchXml({
    baseXml,
    page: request.page,
    pageSize: request.pageSize,
    columnAttributes: columns.map((column) => column.targetAttribute).filter(Boolean),
    filterXml: buildFetchXmlConditions(grid, request),
    sortBy: request.sortBy,
    sortDirection: request.sortDirection,
  });

  const result = await fetchViewPage(entity, fetchXml, request.signal);
  const totalCount = result.totalCount;

  return {
    records: mapRows(result.rows, columns, idAttribute),
    page: request.page,
    pageSize: request.pageSize,
    hasNextPage: result.hasNextPage,
    isCapped: false,
    totalCount,
    totalPages: totalCount !== undefined ? Math.ceil(totalCount / request.pageSize) : undefined,
  };
}

export async function fetchGridPage(request: GridPageRequest): Promise<GridRecordPage> {
  const empty: GridRecordPage = { records: [], page: request.page, pageSize: request.pageSize, hasNextPage: false, isCapped: false };
  const grid = findGridConfig(request.fieldId);
  const entity = grid?.entityName ?? grid?.targetEntity;
  if (!grid || !entity) return empty;

  // A configured view wins; without one (or if it cannot be read) the grid queries the
  // entity directly, which is the only option for grids that never had a view.
  const viewPage = await fetchPageFromView(grid, entity, request);
  if (viewPage) return viewPage;

  const columns = grid.columnConfigs ?? [];
  const selectAttributes = Array.from(
    new Set(columns.map((c) => toQueryAttribute(c.targetAttribute, columns)).filter(Boolean)),
  );
  const idAttribute = `${entity}id`;

  let options = `?$select=${selectAttributes.join(',') || idAttribute}`;
  const filters = buildFilter(grid, request);
  if (filters.length > 0) options += `&$filter=${encodeURIComponent(filters.join(' and '))}`;
  if (request.sortBy) {
    options += `&$orderby=${toQueryAttribute(request.sortBy, columns)} ${request.sortDirection ?? 'asc'}`;
  }

  let result: { entities: Record<string, unknown>[]; nextLink?: string };
  try {
    result = await webApi().retrieveMultipleRecords(entity, options, request.pageSize);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[DFE-grid] query FAILED', entity, options, error);
    throw error;
  }

  return {
    records: mapRows(result.entities, columns, idAttribute),
    page: request.page,
    pageSize: request.pageSize,
    hasNextPage: Boolean(result.nextLink),
    isCapped: false,
    totalCount: result.entities.length,
  };
}
