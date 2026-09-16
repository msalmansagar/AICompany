import type { ODataQueryOptions } from './types.js';

/**
 * Builds the OData API base path for a given Web API version.
 * e.g. apiVersion='9.2' → '/api/data/v9.2/'
 */
function apiPath(apiVersion: string): string {
  return `/api/data/v${apiVersion}/`;
}

/** Builds a URL for a Dataverse entity set list query. */
export function buildListUrl(
  baseUrl: string,
  apiVersion: string,
  entity: string,
  options: ODataQueryOptions = {},
): string {
  const base = `${baseUrl}${apiPath(apiVersion)}${entity}`;
  const params = buildQueryParams(options);
  return params ? `${base}?${params}` : base;
}

/** Builds a URL for a single-record GET by GUID. */
export function buildSingleUrl(
  baseUrl: string,
  apiVersion: string,
  entity: string,
  id: string,
  options: Pick<ODataQueryOptions, 'select' | 'expand'> = {},
): string {
  const base = `${baseUrl}${apiPath(apiVersion)}${entity}(${id})`;
  const params = buildQueryParams(options);
  return params ? `${base}?${params}` : base;
}

/**
 * Builds a URL for a single-record GET by OData alternate key.
 * Produces: entity(keyName='keyValue') per OData v4 §11.2.2.
 */
export function buildAlternateKeyUrl(
  baseUrl: string,
  apiVersion: string,
  entity: string,
  keyName: string,
  keyValue: string,
  options: Pick<ODataQueryOptions, 'select' | 'expand'> = {},
): string {
  const encodedValue = encodeURIComponent(keyValue);
  const base = `${baseUrl}${apiPath(apiVersion)}${entity}(${keyName}='${encodedValue}')`;
  const params = buildQueryParams(options);
  return params ? `${base}?${params}` : base;
}

/** Builds the URL for an unbound OData action. */
export function buildActionUrl(
  baseUrl: string,
  apiVersion: string,
  actionName: string,
): string {
  return `${baseUrl}${apiPath(apiVersion)}${actionName}`;
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
