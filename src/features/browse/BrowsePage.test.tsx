import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { server } from '../../test/server';
import {
  genresFixture,
  movieSummaryFixture,
  providersFixture,
  regionsFixture,
} from '../../test/fixtures';
import { renderWithProviders } from '../../test/utils';
import { BrowsePage } from './BrowsePage';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

function mockReferenceData() {
  server.use(
    http.get('/api/tmdb/genre/movie/list', () =>
      HttpResponse.json({ genres: genresFixture }),
    ),
    http.get('/api/tmdb/watch/providers/regions', () =>
      HttpResponse.json({ results: regionsFixture }),
    ),
    http.get('/api/tmdb/watch/providers/movie', () =>
      HttpResponse.json({ results: providersFixture }),
    ),
  );
}

function renderBrowse(route: string) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/browse"
        element={
          <>
            <LocationProbe />
            <BrowsePage />
          </>
        }
      />
    </Routes>,
    { route },
  );
}

describe('BrowsePage', () => {
  it('renders results for the region in the URL', async () => {
    mockReferenceData();
    let seenRegion: string | null = null;

    server.use(
      http.get('/api/tmdb/discover/movie', ({ request }) => {
        seenRegion = new URL(request.url).searchParams.get('watch_region');
        return HttpResponse.json({
          page: 1,
          results: [movieSummaryFixture()],
          total_pages: 1,
          total_results: 1,
        });
      }),
    );

    renderBrowse('/browse?region=NL');

    expect(await screen.findByText('Fight Club')).toBeInTheDocument();
    expect(seenRegion).toBe('NL');
  });

  it('pushes a genre selection into the URL and refetches', async () => {
    mockReferenceData();
    const requestedGenres: (string | null)[] = [];

    server.use(
      http.get('/api/tmdb/discover/movie', ({ request }) => {
        requestedGenres.push(new URL(request.url).searchParams.get('with_genres'));
        return HttpResponse.json({
          page: 1,
          results: [movieSummaryFixture()],
          total_pages: 1,
          total_results: 1,
        });
      }),
    );

    renderBrowse('/browse?region=NL');

    await screen.findByText('Fight Club');
    await userEvent.click(await screen.findByRole('button', { name: 'Action' }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('genres=28'),
    );
    await waitFor(() => expect(requestedGenres).toContain('28'));
  });

  it('writes the resolved region into a URL that arrived without one', async () => {
    mockReferenceData();
    let seenRegion: string | null = null;

    server.use(
      http.get('/api/tmdb/discover/movie', ({ request }) => {
        seenRegion = new URL(request.url).searchParams.get('watch_region');
        return HttpResponse.json({
          page: 1,
          results: [movieSummaryFixture()],
          total_pages: 1,
          total_results: 1,
        });
      }),
    );

    // The landing redirect sends the user to /browse with no query string at
    // all. Left alone, the address bar describes a different catalog from the
    // one on screen, and sharing that link hands the recipient another one.
    renderBrowse('/browse');

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('region=US'),
    );
    expect(seenRegion).toBe('US');
  });

  it('replaces an unsupported region in the URL with the one actually used', async () => {
    mockReferenceData();

    server.use(
      http.get('/api/tmdb/discover/movie', () =>
        HttpResponse.json({
          page: 1,
          results: [movieSummaryFixture()],
          total_pages: 1,
          total_results: 1,
        }),
      ),
    );

    renderBrowse('/browse?region=ZZ');

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('region=US'),
    );
  });

  it('keeps a year typed one character at a time and puts it in the URL', async () => {
    mockReferenceData();

    server.use(
      http.get('/api/tmdb/discover/movie', () =>
        HttpResponse.json({
          page: 1,
          results: [movieSummaryFixture()],
          total_pages: 1,
          total_results: 1,
        }),
      ),
    );

    renderBrowse('/browse?region=NL');
    await screen.findByText('Fight Club');

    const field = screen.getByLabelText(/from year/i);
    // 2, 20 and 201 are all below the minimum year: a field that wrote every
    // keystroke to the URL read each of them back as undefined and erased
    // itself, so the year filter could not be typed at all.
    await userEvent.type(field, '2010');

    expect(field).toHaveValue(2010);
    await waitFor(
      () => expect(screen.getByTestId('location')).toHaveTextContent('from=2010'),
      { timeout: 3000 },
    );
  });

  it('empties the year field when all filters are cleared', async () => {
    mockReferenceData();

    server.use(
      http.get('/api/tmdb/discover/movie', () =>
        HttpResponse.json({
          page: 1,
          results: [movieSummaryFixture()],
          total_pages: 1,
          total_results: 1,
        }),
      ),
    );

    renderBrowse('/browse?region=NL&rating=7');
    await screen.findByText('Fight Club');

    await userEvent.type(screen.getByLabelText(/from year/i), '2010');
    await waitFor(
      () => expect(screen.getByTestId('location')).toHaveTextContent('from=2010'),
      { timeout: 3000 },
    );

    await userEvent.click(screen.getByRole('button', { name: /clear all filters/i }));

    await waitFor(() => expect(screen.getByLabelText(/from year/i)).toHaveValue(null));
    expect(screen.getByLabelText(/min rating/i)).toHaveValue(null);
    expect(screen.getByTestId('location')).not.toHaveTextContent('from=');
  });

  it('shows active filters as chips and clears them', async () => {
    mockReferenceData();

    server.use(
      http.get('/api/tmdb/discover/movie', () =>
        HttpResponse.json({ page: 1, results: [], total_pages: 0, total_results: 0 }),
      ),
    );

    renderBrowse('/browse?region=NL&genres=28&rating=7');

    expect(
      await screen.findByRole('button', { name: /remove action/i }),
    ).toBeInTheDocument();

    await userEvent.click(
      await screen.findByRole('button', { name: /clear all filters/i }),
    );

    await waitFor(() => {
      const search = screen.getByTestId('location').textContent ?? '';
      expect(search).not.toContain('genres=');
      expect(search).not.toContain('rating=');
      expect(search).toContain('region=NL');
    });
  });
});
