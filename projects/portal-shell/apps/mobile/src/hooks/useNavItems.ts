import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ApiRoutes } from '../constants/ApiRoutes';
import type { NavItem } from '@portal/types';

interface NavApiResponse {
  data: NavItem[];
}

export const NAV_QUERY_KEY = ['nav'] as const;

export function useNavItems() {
  return useQuery<NavItem[]>({
    queryKey: NAV_QUERY_KEY,
    queryFn: async (): Promise<NavItem[]> => {
      const response = await api.get<NavApiResponse>(ApiRoutes.nav);
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // Nav items rarely change — cache for 5 minutes
  });
}
