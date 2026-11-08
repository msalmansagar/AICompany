// Xrm-backed replacement for src/services/gridDataService.ts. Queries a grid field's target
// entity directly via the CRM Web API instead of the portal's /grids backend endpoint.
import {
  buildFetchXmlFilterParts,
  buildODataFilter,
  buildViewFetchXml,
  collectLookupPathAttributes,
  type GridRecord,
  type GridRecordPage,
} from '@qdb/shared';
import { webApi, cleanGuid } from './xrmClient';
import { getLoadedForm } from './formApi';
import { fetchViewPage, resolveViewFetchXml } from './viewQuery';
import { resolveLookupNavigationProperty, resolveLookupTargetEntity } from './lookupBinding';

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

interface GridColumn {
  targetAttribute: string;
  columnFieldType: string;
  filterType?: 'text' | 'optionset' | 'lookup' | 'none';
  lookupTargetEntity?: string;
  lookupDisplayAttribute?: string;
}
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

/**
 * The related table for each lookup the template searches by display text
 * (`company/name like '%{x}%'`). A column already configured as a lookup filter carries
 * its target; anything else costs one cached metadata call.
 */
async function resolveLookupTargets(
  entity: string,
  grid: GridConfig,
): Promise<Record<string, string>> {
  const attributes = collectLookupPathAttributes(grid.dependsOnFilterTemplate ?? '');
  if (attributes.length === 0) return {};

  const columns = grid.columnConfigs ?? [];
  const targets: Record<string, string> = {};

  for (const attribute of attributes) {
    const column = columns.find((candidate) => candidate.targetAttribute === attribute);
    const target = column?.lookupTargetEntity
      ?? await resolveLookupTargetEntity(entity, attribute);
    if (target) targets[attribute] = target;
  }

  return targets;
}

// Compiles the maker's depends-on template against the current outside-field values.
// A malformed template must not take the grid down — it degrades to an unfiltered query,
// matching the portal path's policy.
async function buildDependsOnClause(
  entity: string,
  grid: GridConfig,
  request: GridPageRequest,
): Promise<string> {
  if (!grid.dependsOnFilterTemplate) return '';
  try {
    // OData reaches a related column through the navigation property, so a lookup path
    // needs one resolved per lookup before the (synchronous) emitter runs.
    const targets = await resolveLookupTargets(entity, grid);
    const navigationProperties: Record<string, string> = {};
    for (const [attribute, targetEntity] of Object.entries(targets)) {
      const navigationProperty = await resolveLookupNavigationProperty(entity, attribute, targetEntity);
      if (navigationProperty) navigationProperties[attribute] = navigationProperty;
    }

    return buildODataFilter(grid.dependsOnFilterTemplate, request.dependsOnValues ?? {}, navigationProperties);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[DFE-grid] depends-on template could not be parsed — skipped', error);
    return '';
  }
}

async function buildFilter(
  entity: string,
  grid: GridConfig,
  request: GridPageRequest,
): Promise<string[]> {
  const clauses: string[] = [];
  if (grid.filterExpression) clauses.push(grid.filterExpression);

  const dependsOnClause = await buildDependsOnClause(entity, grid, request);
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

  return clauses;
}

// OData has no join, so a lookup column filters through its navigation property; an option
// set compares its numeric value. Resolving the navigation property needs metadata, which
// is why this is async.
async function buildColumnFilterClausesOData(
  entity: string,
  columns: GridColumn[],
  columnFilters: Record<string, string> | undefined,
): Promise<string[]> {
  const clauses: string[] = [];

  for (const [attribute, value] of Object.entries(columnFilters ?? {})) {
    const trimmed = value?.trim();
    if (!trimmed) continue;

    const column = columns.find((candidate) => candidate.targetAttribute === attribute);
    const filterType = column?.filterType ?? 'text';

    if (filterType === 'optionset') {
      const optionValue = parseInt(trimmed, 10);
      if (!isNaN(optionValue)) clauses.push(`${attribute} eq ${optionValue}`);
      continue;
    }

    if (filterType === 'lookup') {
      if (!column?.lookupTargetEntity || !column.lookupDisplayAttribute) continue;
      const navigationProperty = await resolveLookupNavigationProperty(
        entity, attribute, column.lookupTargetEntity,
      );
      if (!navigationProperty) {
        // eslint-disable-next-line no-console
        console.warn(`[DFE-grid] no navigation property for lookup ${attribute} — filter skipped`);
        continue;
      }
      clauses.push(`contains(${navigationProperty}/${column.lookupDisplayAttribute},'${escapeOData(trimmed)}')`);
      continue;
    }

    clauses.push(`contains(${attribute},'${escapeOData(trimmed)}')`);
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

interface FetchXmlClauses {
  filterXml: string;
  linkEntityXml: string;
}

// Per-column filters follow the column's own filter type: free text is a like, an option
// set compares the numeric value, and a lookup joins to the related entity — a lookup
// attribute itself only compares by GUID, so filtering it by display text needs the join.
function buildColumnFilterClauses(
  columns: GridColumn[],
  columnFilters: Record<string, string> | undefined,
): FetchXmlClauses {
  const conditions: string[] = [];
  const linkEntities: string[] = [];

  for (const [attribute, value] of Object.entries(columnFilters ?? {})) {
    const trimmed = value?.trim();
    if (!trimmed) continue;

    const column = columns.find((candidate) => candidate.targetAttribute === attribute);
    const filterType = column?.filterType ?? 'text';

    if (filterType === 'optionset') {
      const optionValue = parseInt(trimmed, 10);
      if (!isNaN(optionValue)) {
        conditions.push(`<condition attribute="${attribute}" operator="eq" value="${optionValue}"/>`);
      }
      continue;
    }

    if (filterType === 'lookup') {
      if (!column?.lookupTargetEntity || !column.lookupDisplayAttribute) continue;
      const term = escapeXmlAttribute(`%${trimmed}%`);
      // Alias kept short — FetchXML rejects long aliases.
      const alias = `lnk_${attribute.replace(/\W/g, '_').slice(0, 15)}`;
      linkEntities.push(
        `<link-entity name="${column.lookupTargetEntity}" from="${column.lookupTargetEntity}id" ` +
        `to="${attribute}" alias="${alias}" link-type="inner">` +
        `<filter><condition attribute="${column.lookupDisplayAttribute}" operator="like" value="${term}"/></filter>` +
        `</link-entity>`,
      );
      continue;
    }

    conditions.push(`<condition attribute="${attribute}" operator="like" value="${escapeXmlAttribute(`%${trimmed}%`)}"/>`);
  }

  return { filterXml: conditions.join(''), linkEntityXml: linkEntities.join('') };
}

// The same conditions as buildFilter, in the FetchXML dialect the saved-view path needs.
async function buildFetchXmlConditions(
  entity: string,
  grid: GridConfig,
  request: GridPageRequest,
): Promise<FetchXmlClauses> {
  const parts: string[] = [];
  const templateJoins: string[] = [];

  const joinTargets: Record<string, { entityLogicalName: string }> = {};
  for (const [attribute, target] of Object.entries(await resolveLookupTargets(entity, grid))) {
    joinTargets[attribute] = { entityLogicalName: target };
  }

  for (const template of [grid.filterExpression, grid.dependsOnFilterTemplate]) {
    if (!template) continue;
    try {
      const compiled = buildFetchXmlFilterParts(template, request.dependsOnValues ?? {}, joinTargets);
      if (compiled.filterXml) parts.push(compiled.filterXml);
      if (compiled.linkEntityXml) templateJoins.push(compiled.linkEntityXml);
      if (compiled.unresolvedPaths.length > 0) {
        // eslint-disable-next-line no-console
        console.warn('[DFE-grid] lookup search dropped — target table unresolved', compiled.unresolvedPaths);
      }
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

  const columnClauses = buildColumnFilterClauses(columns, request.columnFilters);
  if (columnClauses.filterXml) parts.push(columnClauses.filterXml);

  return {
    filterXml: parts.length > 0 ? `<filter type="and">${parts.join('')}</filter>` : '',
    linkEntityXml: columnClauses.linkEntityXml + templateJoins.join(''),
  };
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

  const clauses = await buildFetchXmlConditions(entity, grid, request);
  const fetchXml = buildViewFetchXml({
    baseXml,
    page: request.page,
    pageSize: request.pageSize,
    columnAttributes: columns.map((column) => column.targetAttribute).filter(Boolean),
    filterXml: clauses.filterXml,
    linkEntityXml: clauses.linkEntityXml,
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
  const filters = [
    ...await buildFilter(entity, grid, request),
    ...await buildColumnFilterClausesOData(entity, columns, request.columnFilters),
  ];
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
