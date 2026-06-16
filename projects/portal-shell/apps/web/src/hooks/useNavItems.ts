'use client';

import { useQuery } from '@tanstack/react-query';
import type { NavItem } from '@portal/types';

async function fetchNavItems(): Promise<NavItem[]> {
  const response = await fetch('/api/nav');
  if (!response.ok) throw new Error('Failed to fetch nav items');
  const data = (await response.json()) as { items: NavItem[] };
  return data.items;
}

/**
 * Returns the nav items for the current user, filtered by their role
 * on the server side. Cached for the session lifetime.
 */
export function useNavItems() {
  return useQuery({
    queryKey: ['nav-items'],
    queryFn: fetchNavItems,
    staleTime: Infinity,
  });
}
