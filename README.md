# Streaming Movie Catalog

Browse movies by what is currently streaming on subscription services in a given
region, using the [TMDB API](https://developer.themoviedb.org/docs/getting-started).

App to search movies catalog, favorite movies, wash list etc..

## Setup

```bash
npm install
cp .env.example .env
```

Add a TMDB API Read Access Token to `.env` as `TMDB_TOKEN`. Create one at
https://www.themoviedb.org/settings/api.

Accounts and lists need a Supabase project (see **Accounts and lists** below).
Add its URL and publishable key to `.env` as `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. Without them, browsing and search still work;
the sign-in page explains what is missing.

Run the app with the [Vercel CLI](https://vercel.com/docs/cli), which serves the
Vite front end and the TMDB proxy function together:

```bash
npx vercel login   # once
npx vercel link    # once — choose the existing Vercel project
npx vercel dev
```

> **`npm run dev` on its own will not load any movies.** It starts Vite without
> the proxy, so every request to `/api/tmdb/…` returns 404. Use `npx vercel dev`.

## Commands

| Command              | Purpose                                           |
| -------------------- | ------------------------------------------------- |
| `npx vercel dev`     | Start the app with the TMDB proxy (daily command) |
| `npm run dev`        | Start Vite only — TMDB requests will 404          |
| `npm run build`      | Type-check and build for production               |
| `npm test`           | Run the test suite once                           |
| `npm run test:watch` | Run tests in watch mode                           |

## How it works

All browse state lives in the URL query string, which makes filtered views
shareable and makes the back button work without extra code. TanStack Query
derives its cache keys from that state, so changing a filter automatically
resets pagination and refetches.

The browser never sees the TMDB token. It calls `/api/tmdb/…` on its own origin.
A Vercel Edge function (`api/tmdb.ts`, with its logic in `server/tmdbProxy.ts`)
checks that the request came from the app, checks that the path is one of the
six TMDB endpoints the app uses, and forwards it with the token. TMDB's response
comes back unchanged.

Tests use [MSW](https://mswjs.io/) to intercept requests at the network layer,
so the suite runs with no API token, no network access, and no rate limits.

## Accounts and lists

Signed-in users keep three lists: favorites, a wishlist, and watched. Sign-in
is an emailed magic link (Supabase Auth). The browser talks to Supabase
directly. Its publishable key is public by design; the protection is
row-level security in the database, which lets each user read and change only
their own rows. The schema, policies and grants are in
`supabase/migrations/`, and `supabase/tests/` checks them in PGlite, a real
Postgres that runs inside the test process.

One-time Supabase setup:

1. Create a project at https://supabase.com (the free plan is enough).
2. In the SQL editor, paste and run
   `supabase/migrations/20260912000000_accounts_and_lists.sql`.

   Supabase's Security Advisor will probably flag `delete_my_account` as a
   security-definer function that `authenticated` can call. That is
   intended: it only ever deletes the caller's own account (`auth.uid()`).
   Don't "fix" it.
3. In **Authentication → URL Configuration**, set the Site URL to the
   production address and add these Redirect URLs:
   - `https://hoegen-movies-catalog.vercel.app/**`
   - `http://localhost:3000/**`
   - `https://hoegen-movies-catalog-*-<team-slug>.vercel.app/**`, where the
     team slug is the last part of any preview URL in the Vercel dashboard.

   If a sign-in link lands on the home page instead of `/auth/callback`, the
   address it was sent from is missing from this list: Supabase falls back to
   the Site URL without saying so.

4. Copy the project URL and publishable key from **Project Settings → API
   Keys** into `.env` and into Vercel (see **Deployment**).
5. Don't skip this check: sign in with a test account and delete it for real
   from the Account page, then confirm it's gone from **Authentication →
   Users**. The PGlite tests can't prove that the real project's `postgres`
   owner is allowed to delete from `auth.users`. Only this check can.

**Until a custom email provider is set up, magic links only reach members of
the Supabase project's team, at most 2 per hour.** That is Supabase's built-in
email service. Opening sign-up to the public needs a domain verified with an
email provider such as Resend, entered in Supabase's SMTP settings. See
"Launch prerequisites" in the spec.

## Deployment

Pushing to `main` deploys to production on Vercel; other branches get preview
deployments. Set `TMDB_TOKEN`, `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` in the Vercel project's environment variables
for both Production and Preview, **without** a custom preview branch: a
variable tied to one branch is Preview-only, and Production silently gets
nothing. `.env` is gitignored and never committed.

## Known constraints

- The proxy's origin check stops other websites from using it, but a
  non-browser client can forge the headers it relies on. Someone determined can
  spend this deployment's TMDB quota on the six allowlisted read-only endpoints.
  There is no rate limiting yet.
- TMDB caps `/discover/movie` at page 500 regardless of the `total_pages` it
  reports, so the catalog is not exhaustively enumerable by paging. Filters are
  how you reach specific titles.
- Streaming availability is region-specific and covers subscription services
  only — rental and purchase availability is deliberately excluded.
- Supabase's free plan pauses a project after a week without enough database
  activity. Sign-in and lists then fail until it is resumed from the dashboard
  (data is kept); browsing and search are unaffected.
- A magic link only works in the browser that asked for it: that browser holds
  the secret the link is issued against (PKCE). Opening it elsewhere shows how
  to get a new one.
