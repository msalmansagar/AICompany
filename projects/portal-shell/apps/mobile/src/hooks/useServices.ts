import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ApiRoutes } from '../constants/ApiRoutes';
import type { PortalService } from '@portal/types';

interface ServicesApiResponse {
  data: PortalService[];
}

interface ServiceDetailApiResponse {
  data: PortalService;
}

export const SERVICES_QUERY_KEYS = {
  list: ['services'] as const,
  detail: (code: string) => ['services', code] as const,
} as const;

export function useServices() {
  return useQuery<PortalService[]>({
    queryKey: SERVICES_QUERY_KEYS.list,
    queryFn: async (): Promise<PortalService[]> => {
      const response = await api.get<ServicesApiResponse>(ApiRoutes.services);
      return response.data;
    },
  });
}

export function useServiceDetail(code: string) {
  return useQuery<PortalService>({
    queryKey: SERVICES_QUERY_KEYS.detail(code),
    queryFn: async (): Promise<PortalService> => {
      const response = await api.get<ServiceDetailApiResponse>(ApiRoutes.serviceByCode(code));
      return response.data;
    },
    enabled: Boolean(code),
  });
}
