import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
  string | undefined;

/**
 * False when either variable is missing. The sign-in page then shows a message
 * for the site owner. Browsing and search never touch Supabase, so they keep
 * working either way.
 */
export const isSupabaseConfigured = Boolean(url && publishableKey);

// Both values are public by design, unlike the TMDB token: the key only says
// which project a request is for. Row-level security in the database decides
// what each request may touch.
//
// createClient throws on an empty URL, which would blank the whole app at
// import time. The placeholder keeps the app running; the sign-in page checks
// isSupabaseConfigured before anything could send a request to it.
export const supabase = createClient(
  url || 'https://unconfigured.invalid',
  publishableKey || 'unconfigured',
  {
    auth: {
      // PKCE: the one-time code in a sign-in link only works together with a
      // secret this browser stored when it asked for the link.
      flowType: 'pkce',
      // /auth/callback exchanges the code itself, so it can show a failure.
      // Automatic detection would race it as the app starts.
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
    },
    // supabase-js retries failed reads on its own: up to 3 times, waiting up to
    // 7 seconds. TanStack Query owns retrying in this app (src/lib/queryClient.ts),
    // so the built-in retries are off.
    db: { retry: false },
  },
);
