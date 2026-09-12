import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { server } from '../../test/server';
import { movieSummaryFixture, regionsFixture } from '../../test/fixtures';
import { renderWithProviders } from '../../test/utils';
import { SearchPage } from './SearchPage';

function renderSearch(route: string) {
  server.use(
    http.get('/api/tmdb/watch/providers/regions', () =>
      HttpResponse.json({ results: regionsFixture }),
    ),
  );

  return renderWithProviders(
    <Routes>
      <Route path="/search" element={<SearchPage />} />
    </Routes>,
    { route },
  );
}

describe('SearchPage', () => {
  it('queries TMDB with the q param from the URL', async () => {
    let seenQuery: string | null = null;

    server.use(
      http.get('/api/tmdb/search/movie', ({ request }) => {
        seenQuery = new URL(request.url).searchParams.get('query');
        return HttpResponse.json({
          page: 1,
          results: [movieSummaryFixture()],
          total_pages: 1,
          total_results: 1,
        });
      }),
    );

    renderSearch('/search?q=fight+club&region=NL');

    expect(await screen.findByText('Fight Club')).toBeInTheDocument();
    expect(seenQuery).toBe('fight club');
  });

  it('links results to the detail route carrying the region', async () => {
    server.use(
      http.get('/api/tmdb/search/movie', () =>
        HttpResponse.json({
          page: 1,
          results: [movieSummaryFixture()],
          total_pages: 1,
          total_results: 1,
        }),
      ),
    );

    renderSearch('/search?q=fight+club&region=NL');

    expect(await screen.findByRole('link', { name: /fight club/i })).toHaveAttribute(
      'href',
      '/movie/550?region=NL',
    );
  });

  it('names the query in its empty state instead of talking about filters', async () => {
    server.use(
      http.get('/api/tmdb/search/movie', () =>
        HttpResponse.json({ page: 1, results: [], total_pages: 0, total_results: 0 }),
      ),
    );

    renderSearch('/search?q=zzzzq&region=NL');

    // Search has no year range and no providers, so the browse empty state's
    // advice is nonsense here.
    expect(await screen.findByText(/no movies match “zzzzq”/i)).toBeInTheDocument();
    expect(screen.queryByText(/no movies match these filters/i)).not.toBeInTheDocument();
  });

  it('prompts for a query when none is present', () => {
    renderSearch('/search?region=NL');

    expect(screen.getByText(/type a movie title/i)).toBeInTheDocument();
  });
});
