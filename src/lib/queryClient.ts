import { QueryClient } from '@tanstack/react-query';
import { TmdbError } from '../api/client';
import { ListsError } from '../features/lists/api';

const MAX_RETRIES = 2;

export function shouldRetry(failureCount: number, error: unknown): boolean {
  // 4xx means the request itself is wrong (for lists: an RLS refusal or a
  // failed check), so repeating it is just slower failure. 429 is the
  // exception: it means "wrong for now".
  const status =
    error instanceof TmdbError || error instanceof ListsError ? error.status : undefined;

  if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
    return false;
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
