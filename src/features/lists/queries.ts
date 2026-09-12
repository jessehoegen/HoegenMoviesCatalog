import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useSession } from '../auth/useSession';
import {
  fetchAllEntries,
  fetchEntryFlags,
  saveEntry,
  type MovieEntryRow,
  type MovieSnapshot,
} from './api';
import type { EntryFlags } from './toggle';

// Every key starts with ['lists', userId]. That gives one prefix to clear on
// sign-out, and a different account can never be served another's cache.
export const listsKeys = {
  user: (userId: string) => ['lists', userId] as const,
  entry: (userId: string, movieId: number) =>
    ['lists', userId, 'entry', movieId] as const,
  all: (userId: string) => ['lists', userId, 'all'] as const,
};

/** The signed-in user's id, or '' when there is none (queries stay disabled). */
function useUserId(): string {
  const session = useSession();
  return session.status === 'signed-in' ? session.user.id : '';
}

export function useMovieEntry(movieId: number): UseQueryResult<EntryFlags | null> {
  const userId = useUserId();
  return useQuery({
    queryKey: listsKeys.entry(userId, movieId),
    queryFn: () => fetchEntryFlags(userId, movieId),
    enabled: userId !== '',
  });
}

export function useMyEntries(): UseQueryResult<MovieEntryRow[]> {
  const userId = useUserId();
  return useQuery({
    queryKey: listsKeys.all(userId),
    queryFn: () => fetchAllEntries(userId),
    enabled: userId !== '',
  });
}

export function useSaveEntry(
  movie: MovieSnapshot,
): UseMutationResult<EntryFlags | null, Error, EntryFlags | null> {
  const userId = useUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (flags: EntryFlags | null) => saveEntry(userId, movie, flags),
    onSuccess: (saved) => {
      // What the database confirmed becomes the button state at once...
      queryClient.setQueryData(listsKeys.entry(userId, movie.id), saved);
      // ...and the lists page refetches the next time it is shown.
      void queryClient.invalidateQueries({ queryKey: listsKeys.all(userId) });
    },
  });
}

/**
 * Forgets every cached list. Called on sign-out and account deletion, so the
 * next person on this computer sees nothing of the previous user's lists.
 */
export function clearListsCache(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: ['lists'] });
}
