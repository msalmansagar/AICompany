// Xrm-backed replacement for src/api/lookupApi.ts. Searches a target entity directly via
// the CRM Web API for lookup fields.
import type { LookupResult, RelatedRecordQuery } from '@qdb/shared';
import { isLogicalName } from '@qdb/shared';
import { webApi, cleanGuid } from './xrmClient';

export interface LookupSearchParams {
  search?: string;
  displayAttribute: string;
  valueAttribute?: string;
  filter?: string;
  max?: number;
  // Orders the results by the display attribute. Absent leaves the query unordered.
  sort?: 'asc' | 'desc';
}

export const lookupApi = {
  // Runs as the signed-in user, so CRM's own security decides what the rule may read.
  getRelatedRecord: async (
    _formCode: string,
    query: RelatedRecordQuery,
  ): Promise<{ data: Record<string, unknown> }> => {
    // Column names were already filtered by the shared allowlist; the entity is checked here
    // because it is spliced into the request path.
    if (!isLogicalName(query.entityLogicalName)) throw new Error('Lookup entity name is invalid');
    const record = await webApi().retrieveRecord(
      query.entityLogicalName,
      cleanGuid(query.recordId),
      `?$select=${query.attributes.join(',')}`,
    );
    const data = Object.fromEntries(query.attributes.map((attribute) => [attribute, record[attribute] ?? null]));
    return { data };
  },
  // The AbortSignal is accepted for API parity but Xrm.WebApi has no cancellation.
  search: async (
    entityName: string,
    params: LookupSearchParams,
    _signal?: AbortSignal,
  ): Promise<{ data: LookupResult[] }> => {
    const top = params.max ?? 20;
    const select = params.valueAttribute && params.valueAttribute !== params.displayAttribute
      ? `${params.displayAttribute},${params.valueAttribute}`
      : params.displayAttribute;

    const clauses: string[] = [];
    if (params.search) clauses.push(`contains(${params.displayAttribute},'${params.search.replace(/'/g, "''")}')`);
    if (params.filter) clauses.push(params.filter);

    let query = `?$select=${select}&$top=${top}`;
    if (clauses.length > 0) query += `&$filter=${encodeURIComponent(clauses.join(' and '))}`;
    if (params.sort) query += `&$orderby=${params.displayAttribute} ${params.sort}`;

    const result = await webApi().retrieveMultipleRecords(entityName, query);
    const idAttribute = `${entityName}id`;
    const data: LookupResult[] = result.entities.map((entity) => ({
      id: cleanGuid(String(entity[idAttribute] ?? '')),
      displayName: String(entity[params.displayAttribute] ?? ''),
      entityLogicalName: entityName,
    }));
    return { data };
  },
};
