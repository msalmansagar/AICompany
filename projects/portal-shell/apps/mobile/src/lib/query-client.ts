import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

// Each call creates a new QueryClient so tests don't share state.
// The root layout calls this once at module level to produce a singleton.
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data is considered fresh for 30 seconds before a background refetch
        staleTime: 30_000,
        // Retry failed requests up to 2 times, but not on 401/403/404
        retry: (failureCount, error) => {
          if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
            return false;
          }
          return failureCount < 2;
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30_000),
      },
      mutations: {
        // Mutations do not retry by default
        retry: false,
      },
    },
  });
}
