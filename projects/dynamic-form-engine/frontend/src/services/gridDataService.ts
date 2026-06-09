// Fetches Selection Grid records from the backend using FetchXML cursor paging.
// Entity resolution and filter injection are performed server-side.
// The frontend sends fieldId + optional pagingCookie (cursor); the backend
// returns hasNextPage + nextPageCookie for efficient keyset navigation.

import apiClient from '../api/apiClient';
import type { GridRecordPage } from '@qdb/shared';

export interface GridPageRequest {
  fieldId: string;
  page: number;
  pageSize: number;
  signal?: AbortSignal;
  dependsOnValue?: string;
  pagingCookie?: string;   // opaque cursor from the previous page response
}

export async function fetchGridPage({
  fieldId,
  page,
  pageSize,
  signal,
  dependsOnValue,
  pagingCookie,
}: GridPageRequest): Promise<GridRecordPage> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  if (dependsOnValue !== undefined && dependsOnValue !== '') {
    params.set('dependsOnValue', dependsOnValue);
  }

  if (pagingCookie) {
    params.set('pagingCookie', pagingCookie);
  }

  const response = await apiClient.get<GridRecordPage>(
    `/grids/${fieldId}/records?${params.toString()}`,
    { signal },
  );

  return response.data;
}
