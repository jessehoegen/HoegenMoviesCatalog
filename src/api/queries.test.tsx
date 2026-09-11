import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../test/server';
import { genresFixture, providersFixture, regionsFixture } from '../test/fixtures';
import { useGenres, useProviders, useRegions } from './queries';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('reference data queries', () => {
  it('unwraps the genres list from its envelope', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/genre/movie/list', () =>
        HttpResponse.json({ genres: genresFixture }),
      ),
    );

    const { result } = renderHook(() => useGenres(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(genresFixture);
  });

  it('unwraps the regions list and sorts it by English name', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/watch/providers/regions', () =>
        HttpResponse.json({ results: regionsFixture }),
      ),
    );

    const { result } = renderHook(() => useRegions(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((r) => r.iso_3166_1)).toEqual(['NL', 'US']);
  });

  it('requests providers for the given region and sorts by display priority', async () => {
    let seenRegion: string | null = null;

    server.use(
      http.get('https://api.themoviedb.org/3/watch/providers/movie', ({ request }) => {
        seenRegion = new URL(request.url).searchParams.get('watch_region');
        return HttpResponse.json({
          results: [providersFixture[1], providersFixture[0]],
        });
      }),
    );

    const { result } = renderHook(() => useProviders('NL'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(seenRegion).toBe('NL');
    expect(result.current.data?.map((p) => p.provider_id)).toEqual([8, 337]);
  });
});
