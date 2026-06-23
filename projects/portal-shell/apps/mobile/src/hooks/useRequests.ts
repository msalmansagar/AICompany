import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ApiRoutes } from '../constants/ApiRoutes';
import type { RequestDetail, RequestStatus, UserRequest } from '@portal/types';

interface RequestsApiResponse {
  data: UserRequest[];
}

interface RequestDetailApiResponse {
  data: RequestDetail;
}

export const REQUESTS_QUERY_KEYS = {
  list: ['requests'] as const,
  detail: (id: string) => ['requests', id] as const,
} as const;

export function useRequests() {
  return useQuery<UserRequest[]>({
    queryKey: REQUESTS_QUERY_KEYS.list,
    queryFn: async (): Promise<UserRequest[]> => {
      const response = await api.get<RequestsApiResponse>(ApiRoutes.requests);
      return response.data;
    },
  });
}

export function useRequestDetail(id: string) {
  return useQuery<RequestDetail>({
    queryKey: REQUESTS_QUERY_KEYS.detail(id),
    queryFn: async (): Promise<RequestDetail> => {
      const response = await api.get<RequestDetailApiResponse>(ApiRoutes.requestById(id));
      return response.data;
    },
    enabled: Boolean(id),
  });
}

// ---------------------------------------------------------------------------
// Derived stat counts for the dashboard
// ---------------------------------------------------------------------------

export interface RequestStats {
  submitted: number;
  underReview: number;
  approved: number;
}

function countByStatus(requests: UserRequest[], status: RequestStatus): number {
  return requests.filter((r) => r.status === status).length;
}

export function useRequestStats(): { stats: RequestStats | null; isLoading: boolean } {
  const { data: requests, isLoading } = useRequests();

  if (!requests) return { stats: null, isLoading };

  const stats: RequestStats = {
    submitted: countByStatus(requests, 'submitted'),
    underReview: countByStatus(requests, 'under-review'),
    approved: countByStatus(requests, 'approved'),
  };

  return { stats, isLoading };
}
