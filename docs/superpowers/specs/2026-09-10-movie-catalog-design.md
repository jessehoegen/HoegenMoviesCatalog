# Streaming Movie Catalog — Design

**Date:** 2026-09-10
**Status:** Approved design, ready for implementation planning

## Purpose

A web app for browsing movies by what is currently streaming on subscription
services in a given region, backed by the TMDB API. The project is a learning
exercise: favor explicit, understandable code over clever shortcuts.

There are no user accounts and nothing is persisted. The app is a read-only
catalog browser.

## Scope

In scope:

- Browse movies filtered by region, streaming provider, genre, release year
  range, and minimum rating, with configurable sort order.
- Search movies by title.
- View a movie's details, including which subscription services carry it in the
  selected region.

Out of scope:

- Accounts, authentication, watchlists, favorites, ratings, or any persisted
  user data.
- TV shows. Movies only.
- Server-side rendering, a backend, or a database.

## Constraints from the TMDB API

These shape the design and are not negotiable:

- **Base URL** is `https://api.themoviedb.org/3`.
- **Authentication** is an `Authorization: Bearer <read access token>` header.
  An `api_key` query parameter is also supported with identical access; we use
  the bearer token.
- **Rate limit** is approximately 40 requests per second. Normal use will not
  approach this, but `429` responses must be handled.
- **Streaming availability is region-specific.** There is no global "all
  streaming movies" list. Availability comes from JustWatch data exposed
  per-region.
- **`watch_region` is mandatory** whenever `with_watch_providers` is used.
  Region can therefore never be empty.
- **`/discover/movie` caps at page 500**, regardless of the `total_pages` value
  in the response, which can read in the tens of thousands. This is not stated
  in TMDB's documentation but is enforced. Requesting page 501 returns an error.
- **`/search/movie` does not accept provider filters.** Search is global;
  streaming availability is only resolvable on the detail page.
- **Image URLs** follow `https://image.tmdb.org/t/p/{size}/{path}`. TMDB
  documents fetching `/configuration` to discover this, but the value is stable
  and we hardcode it.

## Technology decisions

| Decision | Choice | Reason |
|---|---|---|
| Platform | React web app (Vite) | Runs everywhere, no native tooling |
| Language | TypeScript, `strict` | TMDB payloads are large and nested; types replace guessing |
| Data layer | TanStack Query | Caching, dedupe, pagination, and request states without hand-rolled `useEffect` |
| Styling | Tailwind CSS | Fast iteration, no naming decisions |
| Routing | React Router | Needed for URL-as-state |
| Browse state | URL query string | Single source of truth; see below |
| Pagination | Infinite scroll (`useInfiniteQuery`) | Filters are shareable, scroll depth is not |
| Testing | Vitest + React Testing Library + MSW | Tests run with no token, no network, no rate limits |
| API token | Client-side `VITE_` env var | Accepted exposure for a read-only key on a learning project |

## Architecture

### State model

The URL query string is the single source of truth for browse state. React
Router reads it; the TanStack Query key is derived directly from it. No filter
state is duplicated in React state or context.

Consequences, all of them desirable:

- Back, forward, refresh, and link-sharing work without dedicated code.
- Changing a filter changes the query key, which resets the infinite query to
  page 1 and refetches automatically. "Reset pagination when filters change"
  logic does not need to exist.

Scroll depth is deliberately *not* in the URL. Filters are restorable; how many
pages were loaded is not.

### Routes

| Route | Purpose |
|---|---|
| `/browse?region=…&providers=…&genres=…&from=…&to=…&rating=…&sort=…` | Main catalog. Also the home page. |
| `/search?region=…&q=…` | Title search results. |
| `/movie/:id?region=…` | Detail page. |

**`region` appears on every route.** Streaming availability is meaningless
without it, and the detail page needs it to resolve providers. Keeping it in the
URL rather than in a context provider preserves the single-source-of-truth rule
and makes a shared detail link resolve to the same availability for the
recipient. Navigation between routes must carry the current `region` forward; a
small `useRegion()` hook reads it and a link helper appends it, so no component
constructs these URLs by hand.

### File layout

Organized by feature, not by file type.

```
src/
  api/
    client.ts          fetch wrapper: base URL, auth header, error mapping
    movies.ts          one function per endpoint
    types.ts           TMDB response shapes
  features/
    browse/
      BrowsePage.tsx
      FilterBar.tsx
      useBrowseFilters.ts   parse, validate, and update URL params
      useMovieList.ts       useInfiniteQuery wrapper
    search/
      SearchPage.tsx
    movie/
      MovieDetailPage.tsx
      ProviderList.tsx
  components/          MovieCard, MovieGrid, Poster, Spinner, ErrorState, EmptyState
  lib/
    images.ts          builds image URLs at a given size
  App.tsx
  main.tsx
```

**Import rule:** `features/` may import from `components/`, `api/`, and `lib/`,
but never from another feature. Anything two features need moves down into
`components/`.

**API isolation:** every TMDB call goes through `api/client.ts`. No other module
knows the base URL, the auth header, or that TMDB is the provider. Swapping to a
server-side proxy later is a change confined to this file.

## API surface

| Purpose | Endpoint | Cache policy |
|---|---|---|
| Regions | `/watch/providers/regions` | `staleTime: Infinity` |
| Providers in region | `/watch/providers/movie?watch_region={region}` | `staleTime: Infinity` |
| Genres | `/genre/movie/list` | `staleTime: Infinity` |
| Catalog | `/discover/movie` | 5 minutes |
| Search | `/search/movie?query=…` | 5 minutes |
| Detail | `/movie/{id}?append_to_response=watch/providers` | 1 hour |

Reference data (regions, providers, genres) changes a few times a year and is
fetched once per session. The detail endpoint uses `append_to_response` to fetch
the movie and its streaming providers in a single request.

### `client.ts` requirements

- Reads `import.meta.env.VITE_TMDB_TOKEN`, sends
  `Authorization: Bearer <token>`.
- Prefixes all paths with `https://api.themoviedb.org/3`.
- **Checks `response.ok` explicitly.** `fetch` does not reject on 401 or 404; a
  wrapper that omits this check turns failed requests into successful ones
  carrying malformed data.
- On a non-2xx response, reads TMDB's `{ status_code, status_message }` body and
  throws a typed `TmdbError` carrying the HTTP status.
- Retry policy: `429` and `5xx` retry twice with exponential backoff; `4xx` never
  retries.

## Filter contract

`useBrowseFilters.ts` owns URL parsing, validation, and updates. It returns a
typed filter object and an `updateFilters()` that merges changes back into the
query string.

| URL param | Example | TMDB parameter |
|---|---|---|
| `region` | `NL` | `watch_region` |
| `providers` | `8\|337` | `with_watch_providers` (pipe = OR) |
| `genres` | `28\|35` | `with_genres` (pipe = OR) |
| `from` | `2010` | `primary_release_date.gte=2010-01-01` |
| `to` | `2019` | `primary_release_date.lte=2019-12-31` |
| `rating` | `7` | `vote_average.gte` |
| `sort` | `vote_average.desc` | `sort_by` |

### Validation

URL values are untrusted input. Every value is validated and invalid values are
silently replaced with defaults rather than surfaced as errors:

- `sort` against a TypeScript literal union of TMDB's accepted values.
- `genres` against the IDs returned by `/genre/movie/list`.
- `providers` against the IDs returned by the providers endpoint for the current
  region.
- `region` against `/watch/providers/regions`.
- `from`, `to`, and `rating` against numeric ranges; `from` must not exceed `to`.

### Always-applied parameters

These are sent to `/discover/movie` regardless of UI state:

- **`with_watch_monetization_types=flatrate`.** Subscription streaming only.
  Without it, provider filters also match rental and purchase availability. This
  is fixed and has no UI control.
- **`vote_count.gte=100`, whenever a `rating` filter is active.** Filtering on
  `vote_average` alone returns obscure titles with a single high vote, which
  makes the rating filter appear broken. Invisible to the user.

### Defaults

- **Region:** derived from `navigator.language` (for example `nl-NL` yields
  `NL`), falling back to `US` when the derived code is not in TMDB's supported
  region list. Not persisted between visits.
- **Sort:** `popularity.desc`.
- All other filters default to unset.

### Pagination

`useInfiniteQuery` derives the next page from the response's `page` and
`total_pages`. `getNextPageParam` returns `undefined` at
`min(total_pages, 500)`. Without the 500 cap, scrolling to the bottom of a broad
result set produces an API error instead of a clean end-of-results.

## Screens

### Layout shell

A persistent header holds the search input and the region picker.

The region picker applies app-wide rather than being a browse-page filter, but
it is still stored in the URL on every route as described under Routes, not in a
context provider.

The header's search input is a navigation control, not a stateful one:
submitting it navigates to `/search?q=…&region=…`. The search page reads `q`
from the URL, which keeps search results shareable and consistent with every
other piece of state in the app.

### Browse page

`FilterBar` plus `MovieGrid`.

`FilterBar` contains: provider multi-select rendered as logos, genre
multi-select, year range, minimum rating, and sort order. Below the `md`
breakpoint it collapses into a "Filters" button opening a sheet. Active filters
render as removable chips so a user arriving via a heavily-filtered link can see
why results are sparse.

### Movie grid

`MovieGrid` is shared between browse and search, differing only in which query
hook feeds it. It renders `MovieCard` (poster, title, release year, rating
badge) in a responsive grid from roughly 2 columns at mobile widths to 6 at wide
widths.

Four states, each explicitly handled:

- **Loading:** skeleton cards in the grid's shape, so layout does not shift when
  results arrive.
- **Empty:** "No movies match these filters" with a clear-filters action. This is
  reachable through ordinary use and is not an error.
- **Error:** message with a retry action.
- **End of results:** an explicit end marker, including when the page-500 ceiling
  is reached.

### Infinite scroll

An `IntersectionObserver` watches a sentinel below the grid and triggers
`fetchNextPage()`.

The sentinel is a real "Load more" `<button>` that the observer activates
programmatically. Scroll-only loading is unreachable by keyboard and hostile to
screen readers; the button costs nothing and provides a manual fallback when the
observer misbehaves.

### Detail page

Backdrop hero with the poster overlapping it, then title, year, runtime, genres,
rating, and synopsis. `ProviderList` shows subscription services carrying the
movie in the selected region. When no service carries it there, the page says so
plainly — a common and legitimate answer, not a failure state.

A back-to-results link preserves the browse URL so filters survive the round
trip.

### Search page

Reuses `MovieGrid`. Reads `q` from the URL and renders its own empty state.

The header input debounces (~300ms) before pushing a new `q` into the URL, so
typing produces one request rather than one per keystroke. Provider filters do
not apply to search; streaming availability appears only on detail pages.

## Error handling

Errors are handled by kind, not uniformly:

| Condition | Behavior |
|---|---|
| `401` | Setup error. Message: check `VITE_TMDB_TOKEN` in `.env`. |
| `404` on detail | Not-found view, not an error view. |
| `429`, `5xx` | Retry twice with backoff, then show a retry action. |
| Other `4xx` | Fail immediately, no retry. |
| Network failure | Distinguished from API errors; different user action. |

A route-level error boundary catches render-time crashes so a single malformed
record cannot white-screen the app. Query errors are handled in-component where
they can be retried in place.

## Testing

Vitest, React Testing Library, and MSW intercepting TMDB at the network layer.
MSW lets tests run with no API token, no network access, and no rate limits,
against controlled fixtures including error and empty responses.

Tests are written before the implementation they cover.

Priority order:

1. **`useBrowseFilters` parsing and validation** — pure logic; malformed params,
   missing params, out-of-range numbers, unknown genre and provider IDs.
2. **`client.ts` error mapping** — a 401 produces a `TmdbError` rather than a
   resolved promise.
3. **`getNextPageParam`** — stops at 500 even when `total_pages` is far larger.
4. **Grid states** — loading, empty, error, and end-of-results each render
   correctly.
5. **One integration test** — changing a filter updates the URL and issues a new
   query.

Explicitly not tested: TMDB's own behavior, Tailwind class names, blanket
snapshots.

## Tooling

- Vite, TypeScript `strict`, ESLint, Prettier.
- `.env` is gitignored. A committed `.env.example` documents `VITE_TMDB_TOKEN`.

## Accepted risks

- **The API token is public.** `VITE_`-prefixed variables are compiled into the
  bundle by design and are readable in devtools. This is acceptable for a
  read-only, rotatable key on a learning project. The `api/client.ts` boundary
  exists so that moving to a server-side proxy is a contained change.
- **The catalog is not exhaustively enumerable.** The page-500 cap means deep
  paging cannot reach every result. Filters, not paging, are how users reach
  specific titles.
