import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../../test/server';
import { movieSummaryFixture } from '../../test/fixtures';
import { DEFAULT_SORT, type BrowseFilters } from './filters';
import { flattenPages, useDiscoverMovies } from './useMovieList';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const baseFilters: BrowseFilters = {
  region: 'NL',
  providers: [],
  genres: [],
  sort: DEFAULT_SORT,
};

describe('useDiscoverMovies', () => {
  it('sends the mapped discover params for page 1', async () => {
    let seen: URLSearchParams | undefined;

    server.use(
      http.get('https://api.themoviedb.org/3/discover/movie', ({ request }) => {
        seen = new URL(request.url).searchParams;
        return HttpResponse.json({
          page: 1,
          results: [movieSummaryFixture()],
          total_pages: 1,
          total_results: 1,
        });
      }),
    );

    const { result } = renderHook(
      () => useDiscoverMovies({ ...baseFilters, providers: [8], rating: 7 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(seen?.get('watch_region')).toBe('NL');
    expect(seen?.get('with_watch_monetization_types')).toBe('flatrate');
    expect(seen?.get('with_watch_providers')).toBe('8');
    expect(seen?.get('vote_count.gte')).toBe('100');
    expect(seen?.get('page')).toBe('1');
  });

  it('appends the next page and flattens results in order', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/discover/movie', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'));
        return HttpResponse.json({
          page,
          results: [movieSummaryFixture({ id: page, title: `Movie ${page}` })],
          total_pages: 3,
          total_results: 3,
        });
      }),
    );

    const { result } = renderHook(() => useDiscoverMovies(baseFilters), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(flattenPages(result.current.data)).toHaveLength(2));
    expect(flattenPages(result.current.data).map((m) => m.title)).toEqual([
      'Movie 1',
      'Movie 2',
    ]);
  });

  it('reports no next page when TMDB exceeds the 500 page ceiling', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/discover/movie', () =>
        HttpResponse.json({
          page: 500,
          results: [movieSummaryFixture()],
          total_pages: 38020,
          total_results: 760400,
        }),
      ),
    );

    const { result } = renderHook(() => useDiscoverMovies(baseFilters), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });

  it('flattenPages returns an empty array when there is no data', () => {
    expect(flattenPages(undefined)).toEqual([]);
  });
});
