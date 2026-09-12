import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { testUser } from '../../test/auth';
import { entryRow, restUrl } from '../../test/supabase';
import {
  ListsError,
  entryToMovieSummary,
  fetchAllEntries,
  fetchEntryFlags,
  saveEntry,
  type MovieSnapshot,
} from './api';

const fightClub: MovieSnapshot = {
  id: 550,
  title: 'Fight Club',
  poster_path: '/poster.jpg',
  release_date: '1999-10-15',
  vote_average: 8.4,
};

/** Runs `run`, expecting it to throw a ListsError, and returns that error. */
async function listsErrorFrom(run: () => Promise<unknown>): Promise<ListsError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ListsError) return error;
    throw error;
  }
  throw new Error('expected a ListsError, but nothing was thrown');
}

describe('fetchEntryFlags', () => {
  it("asks for this user's entry for this movie, and returns its flags", async () => {
    let url: URL | undefined;
    server.use(
      http.get(restUrl('movie_entries'), ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json([{ is_favorite: true, status: 'wishlist' }]);
      }),
    );

    const flags = await fetchEntryFlags(testUser.id, 550);

    expect(flags).toEqual({ isFavorite: true, status: 'wishlist' });
    expect(url?.searchParams.get('user_id')).toBe(`eq.${testUser.id}`);
    expect(url?.searchParams.get('movie_id')).toBe('eq.550');
  });

  it('returns null when the movie is on none of the lists', async () => {
    server.use(http.get(restUrl('movie_entries'), () => HttpResponse.json([])));

    expect(await fetchEntryFlags(testUser.id, 550)).toBeNull();
  });

  it('throws a ListsError with the status, after a single request', async () => {
    let requests = 0;
    server.use(
      http.get(restUrl('movie_entries'), () => {
        requests += 1;
        return HttpResponse.json({ message: 'Service Unavailable' }, { status: 503 });
      }),
    );

    const error = await listsErrorFrom(() => fetchEntryFlags(testUser.id, 550));

    expect(error.status).toBe(503);
    // One request, not four: supabase-js's own retries are off (db.retry).
    expect(requests).toBe(1);
  });

  it('reports status 0 when no response arrives', async () => {
    server.use(http.get(restUrl('movie_entries'), () => HttpResponse.error()));

    const error = await listsErrorFrom(() => fetchEntryFlags(testUser.id, 550));

    expect(error.status).toBe(0);
  });
});

describe('fetchAllEntries', () => {
  it("returns this user's entries, newest first", async () => {
    let url: URL | undefined;
    server.use(
      http.get(restUrl('movie_entries'), ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json([entryRow()]);
      }),
    );

    expect(await fetchAllEntries(testUser.id)).toEqual([entryRow()]);
    expect(url?.searchParams.get('user_id')).toBe(`eq.${testUser.id}`);
    expect(url?.searchParams.get('order')).toBe('updated_at.desc');
  });
});

describe('saveEntry', () => {
  it('upserts the flags together with a fresh copy of the movie details', async () => {
    let body: unknown;
    let url: URL | undefined;
    let prefer: string | null = null;
    server.use(
      http.post(restUrl('movie_entries'), async ({ request }) => {
        url = new URL(request.url);
        prefer = request.headers.get('prefer');
        body = await request.json();
        return HttpResponse.json([{ is_favorite: false, status: 'watched' }], {
          status: 201,
        });
      }),
    );

    const saved = await saveEntry(
      testUser.id,
      { ...fightClub, release_date: '' },
      { isFavorite: false, status: 'watched' },
    );

    expect(saved).toEqual({ isFavorite: false, status: 'watched' });
    expect(url?.searchParams.get('on_conflict')).toBe('user_id,movie_id');
    expect(prefer).toContain('resolution=merge-duplicates');
    expect(body).toEqual({
      user_id: testUser.id,
      movie_id: 550,
      is_favorite: false,
      status: 'watched',
      title: 'Fight Club',
      poster_path: '/poster.jpg',
      // TMDB's "" for an unknown date is stored as null.
      release_date: null,
      vote_average: 8.4,
    });
  });

  it('deletes the entry when nothing is left set', async () => {
    let url: URL | undefined;
    server.use(
      http.delete(restUrl('movie_entries'), ({ request }) => {
        url = new URL(request.url);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    expect(await saveEntry(testUser.id, fightClub, null)).toBeNull();
    expect(url?.searchParams.get('user_id')).toBe(`eq.${testUser.id}`);
    expect(url?.searchParams.get('movie_id')).toBe('eq.550');
  });

  it('throws a ListsError when the database refuses the write', async () => {
    server.use(
      http.post(restUrl('movie_entries'), () =>
        HttpResponse.json(
          { code: '42501', message: 'new row violates row-level security policy' },
          { status: 403 },
        ),
      ),
    );

    const error = await listsErrorFrom(() =>
      saveEntry(testUser.id, fightClub, { isFavorite: true, status: null }),
    );

    expect(error.status).toBe(403);
    expect(error.message).toBe('new row violates row-level security policy');
  });
});

describe('entryToMovieSummary', () => {
  it('shapes a row like the TMDB summaries that MovieCard displays', () => {
    expect(
      entryToMovieSummary(entryRow({ release_date: null, vote_average: null })),
    ).toEqual({
      id: 550,
      title: 'Fight Club',
      overview: '',
      poster_path: '/poster.jpg',
      release_date: '',
      vote_average: 0,
      vote_count: 0,
    });
  });
});
