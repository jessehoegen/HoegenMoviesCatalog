import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { server } from '../../test/server';
import { regionsFixture } from '../../test/fixtures';
import { signedIn, signedOut } from '../../test/auth';
import { restUrl } from '../../test/supabase';
import { renderWithProviders } from '../../test/utils';
import type { AuthState } from '../auth/useSession';
import type { MovieSnapshot } from './api';
import { ListButtons } from './ListButtons';
import type { EntryFlags } from './toggle';

const fightClub: MovieSnapshot = {
  id: 550,
  title: 'Fight Club',
  poster_path: '/poster.jpg',
  release_date: '1999-10-15',
  vote_average: 8.4,
};

function renderButtons(auth: AuthState) {
  server.use(
    http.get('/api/tmdb/watch/providers/regions', () =>
      HttpResponse.json({ results: regionsFixture }),
    ),
  );
  return renderWithProviders(
    <Routes>
      <Route path="/movie/:id" element={<ListButtons movie={fightClub} />} />
    </Routes>,
    { route: '/movie/550?region=NL', auth },
  );
}

/** The movie's current entry, as GET /rest/v1/movie_entries returns it. */
function mockEntry(flags: EntryFlags | null) {
  server.use(
    http.get(restUrl('movie_entries'), () =>
      HttpResponse.json(flags ? [{ is_favorite: flags.isFavorite, status: flags.status }] : []),
    ),
  );
}

function button(name: 'Favorite' | 'Wishlist' | 'Watched') {
  return screen.getByRole('button', { name });
}

describe('ListButtons', () => {
  it('offers the three lists to visitors as links to sign in and come back', () => {
    renderButtons(signedOut);

    for (const name of ['Favorite', 'Wishlist', 'Watched']) {
      expect(screen.getByRole('link', { name }).getAttribute('href')).toContain(
        '/sign-in?next=%2Fmovie%2F550%3Fregion%3DNL',
      );
    }
  });

  it("shows which lists the movie is on", async () => {
    mockEntry({ isFavorite: false, status: 'wishlist' });
    renderButtons(signedIn);

    await waitFor(() => expect(button('Wishlist')).toHaveAttribute('aria-pressed', 'true'));
    expect(button('Watched')).toHaveAttribute('aria-pressed', 'false');
    expect(button('Favorite')).toHaveAttribute('aria-pressed', 'false');
  });

  it('moves a wishlisted movie to watched in one save', async () => {
    mockEntry({ isFavorite: false, status: 'wishlist' });
    let body: { status?: string } | undefined;
    server.use(
      http.post(restUrl('movie_entries'), async ({ request }) => {
        body = (await request.json()) as { status?: string };
        return HttpResponse.json([{ is_favorite: false, status: 'watched' }], { status: 201 });
      }),
    );
    renderButtons(signedIn);
    await waitFor(() => expect(button('Wishlist')).toBeEnabled());

    await userEvent.click(button('Watched'));

    await waitFor(() => expect(button('Watched')).toHaveAttribute('aria-pressed', 'true'));
    expect(button('Wishlist')).toHaveAttribute('aria-pressed', 'false');
    expect(body?.status).toBe('watched');
  });

  it('deletes the entry when the last list is cleared', async () => {
    mockEntry({ isFavorite: false, status: 'wishlist' });
    let deleted = false;
    server.use(
      http.delete(restUrl('movie_entries'), () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderButtons(signedIn);
    await waitFor(() => expect(button('Wishlist')).toHaveAttribute('aria-pressed', 'true'));

    await userEvent.click(button('Wishlist'));

    await waitFor(() => expect(button('Wishlist')).toHaveAttribute('aria-pressed', 'false'));
    expect(deleted).toBe(true);
  });

  it('disables the buttons until the database confirms the save', async () => {
    mockEntry(null);
    let release: () => void = () => {};
    const confirmed = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post(restUrl('movie_entries'), async () => {
        await confirmed;
        return HttpResponse.json([{ is_favorite: true, status: null }], { status: 201 });
      }),
    );
    renderButtons(signedIn);
    await waitFor(() => expect(button('Favorite')).toBeEnabled());

    await userEvent.click(button('Favorite'));

    // Not yet confirmed: nothing pressed, nothing clickable.
    await waitFor(() => expect(button('Favorite')).toBeDisabled());
    expect(button('Favorite')).toHaveAttribute('aria-pressed', 'false');
    release();
    await waitFor(() => expect(button('Favorite')).toHaveAttribute('aria-pressed', 'true'));
    expect(button('Favorite')).toBeEnabled();
  });

  it('says so when a save fails, and keeps showing the saved state', async () => {
    mockEntry(null);
    server.use(
      http.post(restUrl('movie_entries'), () =>
        HttpResponse.json({ message: 'Service Unavailable' }, { status: 503 }),
      ),
    );
    renderButtons(signedIn);
    await waitFor(() => expect(button('Favorite')).toBeEnabled());

    await userEvent.click(button('Favorite'));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save. Try again.");
    expect(button('Favorite')).toHaveAttribute('aria-pressed', 'false');
  });

  it('offers a retry when the lists cannot be loaded', async () => {
    server.use(
      http.get(restUrl('movie_entries'), () =>
        HttpResponse.json({ message: 'Service Unavailable' }, { status: 503 }),
      ),
    );
    renderButtons(signedIn);

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your lists.");

    mockEntry({ isFavorite: true, status: null });
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(button('Favorite')).toHaveAttribute('aria-pressed', 'true'));
  });
});
