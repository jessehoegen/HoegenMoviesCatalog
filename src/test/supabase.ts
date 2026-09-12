import type { AppUser } from '../features/auth/useSession';
import type { MovieEntryRow } from '../features/lists/api';
import { testUser } from './auth';

/** Must match VITE_SUPABASE_URL in vite.config.ts's test block. */
export const SUPABASE_URL = 'https://test.supabase.co';

/** A PostgREST URL, e.g. restUrl('movie_entries'). MSW ignores the query string. */
export function restUrl(path: string): string {
  return `${SUPABASE_URL}/rest/v1/${path}`;
}

/** A Supabase Auth URL, e.g. authUrl('otp'). */
export function authUrl(path: string): string {
  return `${SUPABASE_URL}/auth/v1/${path}`;
}

function base64Url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The body Supabase Auth returns from POST /auth/v1/token, for MSW handlers. */
export function sessionResponse(user: AppUser = testUser) {
  const now = Math.floor(Date.now() / 1000);
  // Shaped like a real token, so anything that decodes it finds sensible
  // values. Nothing in the browser checks the signature.
  const accessToken = [
    base64Url({ alg: 'HS256', typ: 'JWT' }),
    base64Url({ sub: user.id, email: user.email, role: 'authenticated', exp: now + 3600 }),
    'test-signature',
  ].join('.');

  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: 'test-refresh-token',
    user: {
      id: user.id,
      email: user.email,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-09-12T00:00:00Z',
    },
  };
}

/** A movie_entries row as PostgREST returns it: Fight Club on testUser's wishlist. */
export function entryRow(overrides: Partial<MovieEntryRow> = {}): MovieEntryRow {
  return {
    user_id: testUser.id,
    movie_id: 550,
    is_favorite: false,
    status: 'wishlist',
    title: 'Fight Club',
    poster_path: '/poster.jpg',
    release_date: '1999-10-15',
    vote_average: 8.4,
    updated_at: '2026-09-12T10:00:00Z',
    ...overrides,
  };
}
