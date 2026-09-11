import { QueryClient } from '@tanstack/react-query';
import { TmdbError } from '../api/client';

const MAX_RETRIES = 2;

export function shouldRetry(failureCount: number, error: unknown): boolean {
  // 4xx means the request itself is wrong; repeating it is just slower failure.
  // 429 is the exception — it means "wrong for now".
  if (error instanceof TmdbError && error.status >= 400 && error.status < 500) {
    if (error.status !== 429) return false;
  }
  return failureCount < MAX_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        refetchOnWindowFocus: false,
      },
    },
  });
}
