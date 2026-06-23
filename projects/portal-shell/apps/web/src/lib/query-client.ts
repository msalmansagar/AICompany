import { QueryClient } from '@tanstack/react-query';

/**
 * Creates a new QueryClient configured for the portal shell.
 *
 * A new instance is created per-request on the server to avoid cross-request
 * data sharing. On the client, React's module caching ensures only one
 * instance is created.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * Returns a singleton QueryClient for browser environments.
 * Creates a new instance for each server render.
 */
export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    // Server: always create a new client
    return makeQueryClient();
  }
  // Browser: reuse the same client across renders
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
