import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { server } from '../../test/server';
import { providersFixture, regionsFixture } from '../../test/fixtures';
import { renderWithProviders } from '../../test/utils';
import type { TmdbMovieDetail } from '../../api/types';
import { MovieDetailPage } from './MovieDetailPage';

function detailFixture(overrides: Partial<TmdbMovieDetail> = {}): TmdbMovieDetail {
  return {
    id: 550,
    title: 'Fight Club',
    overview: 'A ticking-time-bomb insomniac.',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    release_date: '1999-10-15',
    vote_average: 8.4,
    vote_count: 27000,
    runtime: 139,
    genres: [{ id: 18, name: 'Drama' }],
    'watch/providers': {
      results: { NL: { link: 'https://example.test', flatrate: [providersFixture[0]] } },
    },
    ...overrides,
  };
}

function renderDetail(route: string) {
  server.use(
    http.get('https://api.themoviedb.org/3/watch/providers/regions', () =>
      HttpResponse.json({ results: regionsFixture }),
    ),
  );

  return renderWithProviders(
    <Routes>
      <Route path="/movie/:id" element={<MovieDetailPage />} />
    </Routes>,
    { route },
  );
}

describe('MovieDetailPage', () => {
  it('requests the movie with watch providers appended', async () => {
    let seenAppend: string | null = null;

    server.use(
      http.get('https://api.themoviedb.org/3/movie/550', ({ request }) => {
        seenAppend = new URL(request.url).searchParams.get('append_to_response');
        return HttpResponse.json(detailFixture());
      }),
    );

    renderDetail('/movie/550?region=NL');

    expect(
      await screen.findByRole('heading', { name: 'Fight Club' }),
    ).toBeInTheDocument();
    expect(seenAppend).toBe('watch/providers');
    expect(screen.getByText('139 min')).toBeInTheDocument();
    expect(screen.getByText('Drama')).toBeInTheDocument();
  });

  it('lists subscription providers for the selected region', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/movie/550', () =>
        HttpResponse.json(detailFixture()),
      ),
    );

    renderDetail('/movie/550?region=NL');

    expect(await screen.findByText('Netflix')).toBeInTheDocument();
  });

  it('says so plainly when nothing streams it in the region', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/movie/550', () =>
        HttpResponse.json(detailFixture({ 'watch/providers': { results: {} } })),
      ),
    );

    renderDetail('/movie/550?region=NL');

    expect(
      await screen.findByText(/not streaming on any subscription service/i),
    ).toBeInTheDocument();
  });

  it('offers a back link to browse rather than a history step', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/movie/550', () =>
        HttpResponse.json(detailFixture()),
      ),
    );

    // The page is designed to be shared: on a deep link there is no history
    // entry to step back to, and navigate(-1) would leave the app or do
    // nothing at all.
    renderDetail('/movie/550?region=NL');

    expect(await screen.findByRole('link', { name: /back to results/i })).toHaveAttribute(
      'href',
      '/browse?region=NL',
    );
  });

  it('names the region rather than showing its code', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/movie/550', () =>
        HttpResponse.json(detailFixture()),
      ),
    );

    renderDetail('/movie/550?region=NL');

    expect(
      await screen.findByRole('heading', { name: /streaming in netherlands/i }),
    ).toBeInTheDocument();
  });

  it('renders a not-found view for a 404 rather than an error view', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/movie/999999', () =>
        HttpResponse.json(
          {
            status_code: 34,
            status_message: 'The resource you requested could not be found.',
          },
          { status: 404 },
        ),
      ),
    );

    renderDetail('/movie/999999?region=NL');

    expect(await screen.findByText(/we could not find that movie/i)).toBeInTheDocument();
  });

  it('renders a not-found view for a non-numeric id rather than an endless skeleton', async () => {
    // No movie endpoint handler is registered: if the invalid-id guard ever
    // regresses and a request fires, onUnhandledRequest: 'error' fails this
    // test loudly instead of letting it hang or pass by accident.
    renderDetail('/movie/abc?region=NL');

    expect(await screen.findByText(/we could not find that movie/i)).toBeInTheDocument();
  });
});
