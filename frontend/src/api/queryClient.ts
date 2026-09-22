import { QueryClient } from '@tanstack/react-query';
import { isApiError } from './client';

/**
 * Server state lives in TanStack Query. Retries only make sense for transient
 * failures (network / 5xx) - retrying a 401, 403, 404 or validation error just delays the message.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}
