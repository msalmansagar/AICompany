'use client';

import React from 'react';
import { QueryClientProvider, HydrationBoundary } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { getQueryClient } from '../../lib/query-client';

interface QueryClientProviderWrapperProps {
  dehydratedState: unknown;
  children: React.ReactNode;
}

/**
 * Wraps children with TanStack QueryClientProvider and hydrates
 * server-prefetched query state from the root layout.
 *
 * Must be a Client Component — QueryClientProvider uses React context.
 */
export function QueryClientProviderWrapper({
  dehydratedState,
  children,
}: QueryClientProviderWrapperProps) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={dehydratedState}>
        {children}
      </HydrationBoundary>
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
