# Streaming Movie Catalog

Browse movies by what is currently streaming on subscription services in a given
region, using the [TMDB API](https://developer.themoviedb.org/docs/getting-started).

## Setup

```bash
npm install
cp .env.example .env
```

Add a TMDB API Read Access Token to `.env`. Create one at
https://www.themoviedb.org/settings/api.

```bash
npm run dev
```

## Commands

| Command              | Purpose                 |
| -------------------- | ----------------------- |
| `npm run dev`        | Start the dev server    |
| `npm run build`      | Production build        |
| `npm test`           | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |

## How it works

All browse state lives in the URL query string, which makes filtered views
shareable and makes the back button work without extra code. TanStack Query
derives its cache keys from that state, so changing a filter automatically
resets pagination and refetches.

Tests use [MSW](https://mswjs.io/) to intercept TMDB at the network layer, so the
suite runs with no API token, no network access, and no rate limits.

## Known constraints

- The TMDB token is compiled into the client bundle and is publicly visible. Use
  a read-only token you are willing to rotate. `src/api/client.ts` is the only
  module that knows about TMDB, so moving to a server-side proxy is a contained
  change.
- TMDB caps `/discover/movie` at page 500 regardless of the `total_pages` it
  reports, so the catalog is not exhaustively enumerable by paging. Filters are
  how you reach specific titles.
- Streaming availability is region-specific and covers subscription services
  only — rental and purchase availability is deliberately excluded.
