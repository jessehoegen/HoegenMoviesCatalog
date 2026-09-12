import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { server } from '../../test/server';
import { regionsFixture } from '../../test/fixtures';
import { signedIn, signedOut } from '../../test/auth';
import { entryRow, restUrl } from '../../test/supabase';
import { renderWithProviders } from '../../test/utils';
import type { AuthState } from '../auth/useSession';
import type { MovieEntryRow } from './api';
import { ListsPage } from './ListsPage';

const ROWS: MovieEntryRow[] = [
  entryRow({ movie_id: 550, title: 'Fight Club', status: 'wishlist' }),
  entryRow({ movie_id: 603, title: 'The Matrix', status: 'watched', is_favorite: true }),
  entryRow({ movie_id: 13, title: 'Forrest Gump', status: null, is_favorite: true }),
];

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function mockEntries(rows: MovieEntryRow[]) {
  server.use(http.get(restUrl('movie_entries'), () => HttpResponse.json(rows)));
}

function renderLists(route: string, auth: AuthState = signedIn) {
  server.use(
    http.get('/api/tmdb/watch/providers/regions', () =>
      HttpResponse.json({ results: regionsFixture }),
    ),
  );
  return renderWithProviders(
    <Routes>
      <Route path="/lists" element={<ListsPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { route, auth },
  );
}

describe('ListsPage', () => {
  it('opens on the wishlist, with a count on every tab', async () => {
    mockEntries(ROWS);
    renderLists('/lists?region=NL');

    expect(await screen.findByText('Fight Club')).toBeInTheDocument();
    expect(screen.queryByText('The Matrix')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Wishlist (1)' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Watched (1)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Favorites (2)' })).toBeInTheDocument();
    // A list is complete by nature; the browse grid's footer would read oddly.
    expect(screen.queryByText('End of results.')).not.toBeInTheDocument();
  });

  it('shows the tab named in the URL', async () => {
    mockEntries(ROWS);
    renderLists('/lists?tab=favorites&region=NL');

    expect(await screen.findByText('The Matrix')).toBeInTheDocument();
    expect(screen.getByText('Forrest Gump')).toBeInTheDocument();
    expect(screen.queryByText('Fight Club')).not.toBeInTheDocument();
  });

  it('falls back to the wishlist for an unknown tab', async () => {
    mockEntries(ROWS);
    renderLists('/lists?tab=nonsense&region=NL');

    expect(await screen.findByText('Fight Club')).toBeInTheDocument();
  });

  it('links each card to its movie, keeping the region', async () => {
    mockEntries(ROWS);
    renderLists('/lists?region=NL');

    const card = await screen.findByRole('link', { name: /fight club/i });

    expect(card.getAttribute('href')).toBe('/movie/550?region=NL');
  });

  it('says a tab is empty and points back to the catalog', async () => {
    mockEntries([]);
    renderLists('/lists?region=NL');

    expect(await screen.findByText('Nothing on your wishlist yet.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Browse the catalog' }).getAttribute('href'),
    ).toBe('/browse?region=NL');
  });

  it('offers a retry when the lists cannot be loaded', async () => {
    server.use(
      http.get(restUrl('movie_entries'), () =>
        HttpResponse.json({ message: 'Service Unavailable' }, { status: 503 }),
      ),
    );
    renderLists('/lists?region=NL');

    expect(await screen.findByText("Couldn't load your lists.")).toBeInTheDocument();

    mockEntries(ROWS);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Fight Club')).toBeInTheDocument();
  });

  it('sends a visitor to sign in, and back here afterwards', () => {
    renderLists('/lists?region=NL', signedOut);

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/sign-in?next=%2Flists%3Fregion%3DNL&region=NL',
    );
  });
});
