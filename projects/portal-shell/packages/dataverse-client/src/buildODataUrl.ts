import type { ODataQueryOptions } from './types.js';

const ODATA_API_PATH = '/api/data/v9.2/';

/**
 * Builds a fully qualified OData v4 URL for a Dataverse list query.
 *
 * @param orgUrl - Base org URL without trailing slash
 * @param entity - Dataverse entity set name (plural), e.g. "qdb_portal_configs"
 * @param options - OData query options ($select, $filter, etc.)
 */
export function buildListUrl(
  orgUrl: string,
  entity: string,
  options: ODataQueryOptions = {},
): string {
  const base = `${orgUrl}${ODATA_API_PATH}${entity}`;
  const params = buildQueryParams(options);
  return params ? `${base}?${params}` : base;
}

/**
 * Builds a fully qualified OData v4 URL for a single-record GET.
 *
 * @param orgUrl - Base org URL without trailing slash
 * @param entity - Dataverse entity set name (plural)
 * @param id - GUID of the record
 * @param options - Only $select and $expand are meaningful for single-record GETs
 */
export function buildSingleUrl(
  orgUrl: string,
  entity: string,
  id: string,
  options: Pick<ODataQueryOptions, 'select' | 'expand'> = {},
): string {
  const base = `${orgUrl}${ODATA_API_PATH}${entity}(${id})`;
  const params = buildQueryParams(options);
  return params ? `${base}?${params}` : base;
}

/**
 * Builds the OData action URL.
 */
export function buildActionUrl(orgUrl: string, actionName: string): string {
  return `${orgUrl}${ODATA_API_PATH}${actionName}`;
}

function buildQueryParams(options: ODataQueryOptions): string {
  const parts: string[] = [];

  if (options.select && options.select.length > 0) {
    parts.push(`$select=${options.select.join(',')}`);
  }
  if (options.filter) {
    parts.push(`$filter=${encodeURIComponent(options.filter)}`);
  }
  if (options.top !== undefined) {
    parts.push(`$top=${options.top}`);
  }
  if (options.skip !== undefined) {
    parts.push(`$skip=${options.skip}`);
  }
  if (options.orderBy) {
    parts.push(`$orderby=${encodeURIComponent(options.orderBy)}`);
  }
  if (options.expand && options.expand.length > 0) {
    parts.push(`$expand=${options.expand.join(',')}`);
  }
  if (options.count === true) {
    parts.push('$count=true');
  }

  return parts.join('&');
}
