// Xrm-backed replacement for src/api/lookupApi.ts. Searches a target entity directly via
// the CRM Web API for lookup fields.
import type { LookupResult } from '@qdb/shared';
import { webApi, cleanGuid } from './xrmClient';

export interface LookupSearchParams {
  search?: string;
  displayAttribute: string;
  valueAttribute?: string;
  filter?: string;
  max?: number;
}

export const lookupApi = {
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
