import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import { fetchDiscover, fetchSearch } from '../../api/movies';
import type { TmdbMovieSummary, TmdbPage } from '../../api/types';
import { toDiscoverParams, type BrowseFilters } from './filters';
import { getNextPageParam } from './pagination';

type MoviePage = TmdbPage<TmdbMovieSummary>;
type MovieListResult = UseInfiniteQueryResult<InfiniteData<MoviePage>, Error>;

const FIVE_MINUTES = 5 * 60 * 1000;

export function flattenPages(
  data: InfiniteData<MoviePage> | undefined,
): TmdbMovieSummary[] {
  return data?.pages.flatMap((page) => page.results) ?? [];
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
