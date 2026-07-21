import type { LookupResult } from '@qdb/shared';
import apiClient from './apiClient';

export interface LookupSearchParams {
  search?: string;
  displayAttribute: string;
  valueAttribute?: string;
  filter?: string;
  max?: number;
}

// DFE-APILOOKUP-001 — query for the external-API proxy route. The endpointKey resolves
// server-side; the mapping paths are non-sensitive (already in the form JSON).
export interface ApiLookupSearchParams {
  endpointKey: string;
  search?: string;
  valuePath: string;
  labelPath: string;
  searchParam?: string;
  searchMode?: 'typeahead' | 'fetchAll';
  formCode?: string;
  max?: number;
}

export const lookupApi = {
  search: (entityName: string, params: LookupSearchParams, signal?: AbortSignal) =>
    apiClient.get<LookupResult[]>(`/lookups/${entityName}`, { params, signal }),
  searchApi: (params: ApiLookupSearchParams, signal?: AbortSignal) =>
    apiClient.get<LookupResult[]>('/lookups/api-lookup', { params, signal }),
};
