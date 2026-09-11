import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import { fetchDiscover, fetchSearch } from './movies';
import type { TmdbMovieSummary, TmdbPage } from './types';
import { toDiscoverParams, type BrowseFilters } from '../lib/filters';
import { getNextPageParam } from './pagination';

type MoviePage = TmdbPage<TmdbMovieSummary>;
type MovieListResult = UseInfiniteQueryResult<InfiniteData<MoviePage>, Error>;

const FIVE_MINUTES = 5 * 60 * 1000;

// TMDB's real discover/search endpoints re-rank between requests (popularity
// shifts in near-real-time), so the same movie can legitimately appear on two
// consecutive pages during a single scroll session — MSW fixtures never do
// this, since each mocked page is static. Dedupe by id, keeping the first
// occurrence: a movie that drifted to a later page should stay wherever the
// user already saw it, not jump position mid-scroll.
export function flattenPages(
  data: InfiniteData<MoviePage> | undefined,
): TmdbMovieSummary[] {
  const seen = new Set<number>();
  const deduped: TmdbMovieSummary[] = [];
  for (const page of data?.pages ?? []) {
    for (const movie of page.results) {
      if (seen.has(movie.id)) continue;
      seen.add(movie.id);
      deduped.push(movie);
    }
  }
  return deduped;
}

export function useDiscoverMovies(filters: BrowseFilters): MovieListResult {
  return useInfiniteQuery({
    // The filter object IS the cache key. Changing any filter changes the key,
    // which resets pagination and refetches — no manual reset logic needed.
    queryKey: ['discover', filters],
    queryFn: ({ pageParam }) => fetchDiscover(toDiscoverParams(filters, pageParam)),
    initialPageParam: 1,
    getNextPageParam,
    staleTime: FIVE_MINUTES,
  });
}

export function useSearchMovies(query: string): MovieListResult {
  return useInfiniteQuery({
    queryKey: ['search', query],
    queryFn: ({ pageParam }) => fetchSearch(query, pageParam),
    initialPageParam: 1,
    getNextPageParam,
    staleTime: FIVE_MINUTES,
    enabled: query.trim() !== '',
  });
}
