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
    http.get('https://api.themoviedb.org/3/genre/movie/list', () =>
      HttpResponse.json({ genres: genresFixture }),
    ),
    http.get('https://api.themoviedb.org/3/watch/providers/regions', () =>
      HttpResponse.json({ results: regionsFixture }),
    ),
    http.get('https://api.themoviedb.org/3/watch/providers/movie', () =>
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
      http.get('https://api.themoviedb.org/3/discover/movie', ({ request }) => {
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
      http.get('https://api.themoviedb.org/3/discover/movie', ({ request }) => {
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

  it('shows active filters as chips and clears them', async () => {
    mockReferenceData();

    server.use(
      http.get('https://api.themoviedb.org/3/discover/movie', () =>
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
