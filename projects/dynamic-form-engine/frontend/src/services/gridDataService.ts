// Fetches Selection Grid records from the backend.
// Entity resolution is performed server-side — the frontend only sends the fieldId GUID.

import apiClient from '../api/apiClient';
import type { GridRecordPage } from '@qdb/shared';

export interface GridPageRequest {
  fieldId: string;
  page: number;
  pageSize: number;
  signal?: AbortSignal;
}

export async function fetchGridPage({
  fieldId,
  page,
  pageSize,
  signal,
}: GridPageRequest): Promise<GridRecordPage> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  const response = await apiClient.get<GridRecordPage>(
    `/grids/${fieldId}/records?${params.toString()}`,
    { signal },
  );

  // apiClient unwraps the ApiResponse envelope — response.data is already typed.
  return response.data;
}
