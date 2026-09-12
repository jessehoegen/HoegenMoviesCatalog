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

## Deployment

Pushing to `main` deploys to production on Vercel; other branches get preview
deployments. `TMDB_TOKEN` must be set in the Vercel project's environment
variables for both Production and Preview. `.env` is gitignored and never
committed.

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
