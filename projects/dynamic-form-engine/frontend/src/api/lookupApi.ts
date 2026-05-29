import type { LookupResult } from '@dfe/shared';
import apiClient from './apiClient';

export interface LookupSearchParams {
  search?: string;
  displayAttribute: string;
  valueAttribute?: string;
  filter?: string;
  max?: number;
}

export const lookupApi = {
  search: (entityName: string, params: LookupSearchParams, signal?: AbortSignal) =>
    apiClient.get<LookupResult[]>(`/lookups/${entityName}`, { params, signal }),
};
