import apiClient from '../api/apiClient';
import type { GridRecordPage } from '@qdb/shared';

export interface GridPageRequest {
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

export async function fetchGridPage({
  fieldId,
  page,
  pageSize,
  signal,
  dependsOnValues,
  pagingCookie,
  searchText,
  sortBy,
  sortDirection,
  columnFilters,
}: GridPageRequest): Promise<GridRecordPage> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  if (dependsOnValues) {
    // Only send fields the user has actually filled in; the backend prunes the rest.
    const activeValues: Record<string, string> = {};
    for (const [schema, value] of Object.entries(dependsOnValues)) {
      if (value !== '') activeValues[schema] = value;
    }
    if (Object.keys(activeValues).length > 0) {
      params.set('dependsOnValues', JSON.stringify(activeValues));
    }
  }
  if (pagingCookie) {
    params.set('pagingCookie', pagingCookie);
  }
  if (searchText && searchText.trim()) {
    params.set('searchText', searchText.trim());
  }
  if (sortBy) {
    params.set('sortBy', sortBy);
    params.set('sortDirection', sortDirection ?? 'asc');
  }
  if (columnFilters) {
    const activeFilters: Record<string, string> = {};
    for (const [k, v] of Object.entries(columnFilters)) {
      if (v.trim()) activeFilters[k] = v;
    }
    if (Object.keys(activeFilters).length > 0) {
      params.set('columnFilters', JSON.stringify(activeFilters));
    }
  }

  const response = await apiClient.get<GridRecordPage>(
    `/grids/${fieldId}/records?${params.toString()}`,
    { signal },
  );

  return response.data;
}
