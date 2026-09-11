import type { TmdbPage } from '../../api/types';

/**
 * TMDB enforces this ceiling on /discover/movie and /search/movie even though
 * total_pages in the response can be far larger. This is not documented.
 */
export const MAX_TMDB_PAGE = 500;

export function getNextPageParam(lastPage: TmdbPage<unknown>): number | undefined {
  const lastReachable = Math.min(lastPage.total_pages, MAX_TMDB_PAGE);
  return lastPage.page < lastReachable ? lastPage.page + 1 : undefined;
}
