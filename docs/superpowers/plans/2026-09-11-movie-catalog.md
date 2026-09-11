# Streaming Movie Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React web app that browses movies by what is currently streaming on subscription services in a given region, backed by the TMDB API.

**Architecture:** A client-only single-page app with no backend. All browse state (region, providers, genres, year range, rating, sort) lives in the URL query string and is the single source of truth; TanStack Query derives its cache keys directly from that state, so changing a filter automatically resets and refetches pagination. Every TMDB call funnels through one `api/client.ts` module so the API boundary stays in a single file.

**Tech Stack:** Vite, React 19, TypeScript (strict), TanStack Query v5, React Router v7, Tailwind CSS v4, Vitest, React Testing Library, MSW v2.

**Spec:** `docs/superpowers/specs/2026-09-10-movie-catalog-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **TMDB base URL** is exactly `https://api.themoviedb.org/3`. It appears in `src/api/client.ts` and nowhere else.
- **Authentication** is the header `Authorization: Bearer <token>`, where the token is read from `import.meta.env.VITE_TMDB_TOKEN`.
- **`with_watch_monetization_types=flatrate` is sent on every `/discover/movie` request**, unconditionally. There is no UI control for it. Without it, provider filters also match rental and purchase availability.
- **`vote_count.gte=100` is sent whenever, and only when, a `rating` filter is active.** It is invisible in the UI.
- **`/discover/movie` caps at page 500** regardless of the `total_pages` value in the response. Pagination must stop at `min(total_pages, 500)`.
- **`watch_region` is mandatory** on every discover request; region is never empty.
- **`region` appears in the URL on every route**, including `/movie/:id`. No context provider, no global store holds it.
- **Import rule:** `src/features/` may import from `src/components/`, `src/api/`, and `src/lib/`, but never from another feature. Anything two features need moves down into `src/components/`.
- **Nothing is persisted.** No `localStorage`, no `sessionStorage`, no accounts, no watchlist.
- **TypeScript runs in `strict` mode.** No `any` in committed code.
- **Images** come from `https://image.tmdb.org/t/p/{size}{path}`, hardcoded. Do not fetch `/configuration`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/api/types.ts` | TypeScript shapes for every TMDB response we consume |
| `src/api/client.ts` | Base URL, auth header, query-string building, `TmdbError` mapping |
| `src/api/movies.ts` | One function per TMDB endpoint used |
| `src/api/queries.ts` | TanStack Query hooks and cache policy per endpoint |
| `src/lib/images.ts` | Builds image URLs at a given size |
| `src/lib/queryClient.ts` | `QueryClient` construction and retry policy |
| `src/features/browse/filters.ts` | Pure parse/validate/serialize logic for the URL filter contract |
| `src/features/browse/useBrowseFilters.ts` | React hook binding `filters.ts` to `useSearchParams` |
| `src/features/browse/BrowsePage.tsx` | Composes `FilterBar` + `MovieGrid` |
| `src/features/browse/FilterBar.tsx` | Provider, genre, year, rating, sort controls |
| `src/features/browse/useMovieList.ts` | `useInfiniteQuery` wrapper over discover |
| `src/features/search/SearchPage.tsx` | Search results, reusing `MovieGrid` |
| `src/features/movie/MovieDetailPage.tsx` | Detail view |
| `src/features/movie/ProviderList.tsx` | Streaming services for a movie in a region |
| `src/components/MovieGrid.tsx` | Responsive grid with loading/empty/error/end states |
| `src/components/MovieCard.tsx` | Poster, title, year, rating badge |
| `src/components/Poster.tsx` | Image with fallback for missing artwork |
| `src/components/LoadMoreButton.tsx` | Real button that an `IntersectionObserver` auto-activates |
| `src/components/ErrorState.tsx` | Error message with retry, 401 special-cased |
| `src/components/EmptyState.tsx` | No-results message with a clear-filters action |
| `src/components/ErrorBoundary.tsx` | Route-level render-crash boundary |
| `src/components/RegionLink.tsx` | `Link` wrapper that carries `region` forward |
| `src/app/Layout.tsx` | Header shell: search input + region picker |
| `src/app/RegionPicker.tsx` | Region select |
| `src/app/HeaderSearch.tsx` | Debounced input that navigates to `/search` |
| `src/app/useRegion.ts` | Reads validated `region` from the URL |
| `src/App.tsx` | Route table |
| `src/main.tsx` | Providers and mount |
| `src/test/setup.ts` | Vitest setup: jest-dom, MSW lifecycle, `IntersectionObserver` stub |
| `src/test/server.ts` | MSW server and default handlers |
| `src/test/fixtures.ts` | Shared TMDB response fixtures |
| `src/test/utils.tsx` | `renderWithProviders` helper |

---

## Task 1: Project scaffold and test infrastructure

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `.gitignore`, `.env.example`, `src/main.tsx`, `src/App.tsx`, `src/index.css`
- Create: `src/test/setup.ts`, `src/test/server.ts`, `src/test/utils.tsx`
- Test: `src/test/smoke.test.tsx`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `server` (MSW `SetupServerApi`) from `src/test/server.ts`; `renderWithProviders(ui: ReactElement, options?: { route?: string }): RenderResult` from `src/test/utils.tsx`

- [ ] **Step 1: Scaffold the Vite project**

Run in the project root (the directory already contains `docs/`, so scaffold in place):

```bash
npm create vite@latest . -- --template react-ts
```

If prompted about a non-empty directory, choose to continue without clearing existing files.

- [ ] **Step 2: Install runtime and dev dependencies**

```bash
npm install @tanstack/react-query react-router-dom
npm install -D tailwindcss @tailwindcss/vite \
  vitest jsdom @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom \
  msw
```

- [ ] **Step 3: Configure Vite for Tailwind and Vitest**

Replace `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    env: {
      VITE_TMDB_TOKEN: 'test-token',
    },
  },
});
```

The `env` block matters: `import.meta.env.VITE_TMDB_TOKEN` is `undefined` in tests otherwise, and one test in Task 2 asserts the exact `Authorization` header.

- [ ] **Step 4: Enable Tailwind and strict TypeScript**

Replace `src/index.css` entirely:

```css
@import "tailwindcss";
```

In `tsconfig.json`, confirm `compilerOptions` contains these (add any that are missing):

```json
{
  "strict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "types": ["vitest/globals"]
}
```

- [ ] **Step 5: Add environment and git files**

Create `.env.example`:

```
# TMDB API Read Access Token — https://www.themoviedb.org/settings/api
# This value is compiled into the client bundle and is publicly visible.
# Use a read-only token you are willing to rotate.
VITE_TMDB_TOKEN=
```

Append to `.gitignore` (the Vite template already ignores `node_modules` and `dist`):

```
.env
.env.local
```

- [ ] **Step 6: Write the MSW server**

Create `src/test/server.ts`:

```ts
import { setupServer } from 'msw/node';

export const server = setupServer();
```

Handlers are registered per-test with `server.use(...)`. There are no defaults, so any unmocked request fails loudly — which is what we want.

- [ ] **Step 7: Write the Vitest setup file**

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { server } from './server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// jsdom does not implement IntersectionObserver, which LoadMoreButton uses.
class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
```

- [ ] **Step 8: Write the render helper**

Create `src/test/utils.tsx`:

```tsx
import type { ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

export function renderWithProviders(
  ui: ReactElement,
  { route = '/' }: { route?: string } = {},
): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
```

Retries are disabled in tests so a deliberate error fixture fails in milliseconds instead of backing off.

- [ ] **Step 9: Write the smoke test**

Create `src/test/smoke.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './utils';

describe('test infrastructure', () => {
  it('renders a component through the provider stack', () => {
    renderWithProviders(<h1>Movie Catalog</h1>);
    expect(screen.getByRole('heading', { name: 'Movie Catalog' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Add test scripts**

In `package.json`, add to `"scripts"`:

```json
{
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 11: Run the test suite**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 12: Verify the dev server boots**

Run: `npm run dev`
Expected: Vite prints a local URL and the page loads without console errors. Stop the server afterward.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite React TS app with Tailwind and test infrastructure"
```

---

## Task 2: TMDB types and API client

**Files:**
- Create: `src/api/types.ts`, `src/api/client.ts`
- Test: `src/api/client.test.ts`

**Interfaces:**
- Consumes: `server` from `src/test/server.ts`
- Produces:
  - `TmdbError` class with `status: number`, `statusCode: number | undefined`, `message: string`
  - `tmdbFetch<T>(path: string, params?: TmdbParams): Promise<T>` where `type TmdbParams = Record<string, string | number | undefined>`
  - Types: `TmdbPage<T>`, `TmdbMovieSummary`, `TmdbMovieDetail`, `TmdbGenre`, `TmdbRegion`, `TmdbProvider`, `TmdbWatchProviders`

- [ ] **Step 1: Write the TMDB response types**

Create `src/api/types.ts`:

```ts
export interface TmdbPage<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TmdbMovieSummary {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  /** ISO date, e.g. "2019-05-24". Can be an empty string for unreleased titles. */
  release_date: string;
  vote_average: number;
  vote_count: number;
}

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority: number;
}

export interface TmdbRegion {
  iso_3166_1: string;
  english_name: string;
  native_name: string;
}

/** One region's entry in a /movie/{id}/watch/providers response. */
export interface TmdbRegionProviders {
  link: string;
  flatrate?: TmdbProvider[];
  rent?: TmdbProvider[];
  buy?: TmdbProvider[];
}

export interface TmdbWatchProviders {
  /** Keyed by ISO 3166-1 region code, e.g. "NL". */
  results: Record<string, TmdbRegionProviders | undefined>;
}

export interface TmdbMovieDetail extends TmdbMovieSummary {
  backdrop_path: string | null;
  runtime: number | null;
  genres: TmdbGenre[];
  'watch/providers'?: TmdbWatchProviders;
}

export interface TmdbErrorBody {
  status_code?: number;
  status_message?: string;
}
```

- [ ] **Step 2: Write the failing client tests**

Create `src/api/client.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { TmdbError, tmdbFetch } from './client';

describe('tmdbFetch', () => {
  it('requests the TMDB base URL with a bearer token', async () => {
    let seenUrl = '';
    let seenAuth: string | null = null;

    server.use(
      http.get('https://api.themoviedb.org/3/movie/550', ({ request }) => {
        seenUrl = request.url;
        seenAuth = request.headers.get('Authorization');
        return HttpResponse.json({ id: 550 });
      }),
    );

    const data = await tmdbFetch<{ id: number }>('/movie/550');

    expect(data).toEqual({ id: 550 });
    expect(seenUrl).toBe('https://api.themoviedb.org/3/movie/550');
    expect(seenAuth).toBe('Bearer test-token');
  });

  it('serialises params and omits undefined and empty values', async () => {
    let seenParams: URLSearchParams | undefined;

    server.use(
      http.get('https://api.themoviedb.org/3/discover/movie', ({ request }) => {
        seenParams = new URL(request.url).searchParams;
        return HttpResponse.json({ page: 1, results: [], total_pages: 0, total_results: 0 });
      }),
    );

    await tmdbFetch('/discover/movie', {
      page: 2,
      watch_region: 'NL',
      with_genres: undefined,
      sort_by: '',
    });

    expect(seenParams?.get('page')).toBe('2');
    expect(seenParams?.get('watch_region')).toBe('NL');
    expect(seenParams?.has('with_genres')).toBe(false);
    expect(seenParams?.has('sort_by')).toBe(false);
  });

  it('throws TmdbError with TMDB status_message on 401', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/movie/550', () =>
        HttpResponse.json(
          { status_code: 7, status_message: 'Invalid API key.' },
          { status: 401 },
        ),
      ),
    );

    await expect(tmdbFetch('/movie/550')).rejects.toMatchObject({
      name: 'TmdbError',
      status: 401,
      statusCode: 7,
      message: 'Invalid API key.',
    });
  });

  it('throws TmdbError on 404 rather than resolving', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/movie/999999999', () =>
        HttpResponse.json(
          { status_code: 34, status_message: 'The resource you requested could not be found.' },
          { status: 404 },
        ),
      ),
    );

    await expect(tmdbFetch('/movie/999999999')).rejects.toBeInstanceOf(TmdbError);
  });

  it('falls back to the status text when the error body is not JSON', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/movie/550', () =>
        new HttpResponse('upstream exploded', { status: 500 }),
      ),
    );

    await expect(tmdbFetch('/movie/550')).rejects.toMatchObject({
      status: 500,
      statusCode: undefined,
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/api/client.test.ts`
Expected: FAIL — cannot resolve `./client`.

- [ ] **Step 4: Implement the client**

Create `src/api/client.ts`:

```ts
import type { TmdbErrorBody } from './types';

const BASE_URL = 'https://api.themoviedb.org/3';

export type TmdbParams = Record<string, string | number | undefined>;

export class TmdbError extends Error {
  readonly status: number;
  readonly statusCode: number | undefined;

  constructor(status: number, message: string, statusCode?: number) {
    super(message);
    this.name = 'TmdbError';
    this.status = status;
    this.statusCode = statusCode;
  }
}

export async function tmdbFetch<T>(path: string, params: TmdbParams = {}): Promise<T> {
  const url = new URL(BASE_URL + path);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_TMDB_TOKEN}`,
      accept: 'application/json',
    },
  });

  // fetch does not reject on 4xx/5xx. Without this check a failed request
  // resolves as a successful one carrying malformed data.
  if (!response.ok) {
    let message = response.statusText;
    let statusCode: number | undefined;

    try {
      const body = (await response.json()) as TmdbErrorBody;
      message = body.status_message ?? message;
      statusCode = body.status_code;
    } catch {
      // Error body was not JSON; keep the status text.
    }

    throw new TmdbError(response.status, message, statusCode);
  }

  return (await response.json()) as T;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/api/client.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/api/types.ts src/api/client.ts src/api/client.test.ts
git commit -m "feat: add TMDB API client with typed error mapping"
```

---

## Task 3: Image URL builder

**Files:**
- Create: `src/lib/images.ts`
- Test: `src/lib/images.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `posterUrl(path: string | null, size?: PosterSize): string | null`
  - `backdropUrl(path: string | null, size?: BackdropSize): string | null`
  - `logoUrl(path: string | null, size?: LogoSize): string | null`
  - `type PosterSize = 'w185' | 'w342' | 'w500'`
  - `type BackdropSize = 'w780' | 'w1280'`
  - `type LogoSize = 'w45' | 'w92'`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/images.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { backdropUrl, logoUrl, posterUrl } from './images';

describe('image URL builders', () => {
  it('builds a poster URL at the default size', () => {
    expect(posterUrl('/abc123.jpg')).toBe('https://image.tmdb.org/t/p/w342/abc123.jpg');
  });

  it('builds a poster URL at an explicit size', () => {
    expect(posterUrl('/abc123.jpg', 'w500')).toBe('https://image.tmdb.org/t/p/w500/abc123.jpg');
  });

  it('builds backdrop and logo URLs', () => {
    expect(backdropUrl('/back.jpg')).toBe('https://image.tmdb.org/t/p/w1280/back.jpg');
    expect(logoUrl('/logo.jpg')).toBe('https://image.tmdb.org/t/p/w92/logo.jpg');
  });

  it('returns null when TMDB has no artwork', () => {
    expect(posterUrl(null)).toBeNull();
    expect(backdropUrl(null)).toBeNull();
    expect(logoUrl(null)).toBeNull();
  });
});
```

Note that TMDB paths already begin with `/`, so the builder must not insert another one.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/images.test.ts`
Expected: FAIL — cannot resolve `./images`.

- [ ] **Step 3: Implement the builders**

Create `src/lib/images.ts`:

```ts
// TMDB documents fetching /configuration to discover this base URL and the
// valid size strings. The values are stable and hardcoded here deliberately,
// to avoid spending a request and a loading state on them.
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

export type PosterSize = 'w185' | 'w342' | 'w500';
export type BackdropSize = 'w780' | 'w1280';
export type LogoSize = 'w45' | 'w92';

function buildUrl(path: string | null, size: string): string | null {
  // TMDB paths already start with a slash.
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

export function posterUrl(path: string | null, size: PosterSize = 'w342'): string | null {
  return buildUrl(path, size);
}

export function backdropUrl(path: string | null, size: BackdropSize = 'w1280'): string | null {
  return buildUrl(path, size);
}

export function logoUrl(path: string | null, size: LogoSize = 'w92'): string | null {
  return buildUrl(path, size);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/images.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/images.ts src/lib/images.test.ts
git commit -m "feat: add TMDB image URL builders"
```

---

## Task 4: Reference data endpoints and query hooks

**Files:**
- Create: `src/api/movies.ts`, `src/api/queries.ts`, `src/lib/queryClient.ts`
- Create: `src/test/fixtures.ts`
- Test: `src/api/queries.test.tsx`, `src/lib/queryClient.test.ts`

**Interfaces:**
- Consumes: `tmdbFetch`, `TmdbError` from `src/api/client.ts`; TMDB types from `src/api/types.ts`
- Produces:
  - From `src/api/movies.ts`: `fetchRegions(): Promise<TmdbRegion[]>`, `fetchProviders(region: string): Promise<TmdbProvider[]>`, `fetchGenres(): Promise<TmdbGenre[]>`
  - From `src/api/queries.ts`: `useRegions()`, `useProviders(region: string)`, `useGenres()` — all TanStack `UseQueryResult`
  - From `src/lib/queryClient.ts`: `createQueryClient(): QueryClient`, `shouldRetry(failureCount: number, error: unknown): boolean`
  - From `src/test/fixtures.ts`: `genresFixture`, `regionsFixture`, `providersFixture`, `movieSummaryFixture(overrides?)`, `moviePageFixture(overrides?)`

- [ ] **Step 1: Write the shared fixtures**

Create `src/test/fixtures.ts`:

```ts
import type {
  TmdbGenre,
  TmdbMovieSummary,
  TmdbPage,
  TmdbProvider,
  TmdbRegion,
} from '../api/types';

export const genresFixture: TmdbGenre[] = [
  { id: 28, name: 'Action' },
  { id: 35, name: 'Comedy' },
  { id: 99, name: 'Documentary' },
];

export const regionsFixture: TmdbRegion[] = [
  { iso_3166_1: 'NL', english_name: 'Netherlands', native_name: 'Netherlands' },
  { iso_3166_1: 'US', english_name: 'United States of America', native_name: 'United States' },
];

export const providersFixture: TmdbProvider[] = [
  { provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.jpg', display_priority: 0 },
  { provider_id: 337, provider_name: 'Disney Plus', logo_path: '/disney.jpg', display_priority: 1 },
];

export function movieSummaryFixture(
  overrides: Partial<TmdbMovieSummary> = {},
): TmdbMovieSummary {
  return {
    id: 550,
    title: 'Fight Club',
    overview: 'A ticking-time-bomb insomniac.',
    poster_path: '/poster.jpg',
    release_date: '1999-10-15',
    vote_average: 8.4,
    vote_count: 27000,
    ...overrides,
  };
}

export function moviePageFixture(
  overrides: Partial<TmdbPage<TmdbMovieSummary>> = {},
): TmdbPage<TmdbMovieSummary> {
  return {
    page: 1,
    results: [movieSummaryFixture()],
    total_pages: 1,
    total_results: 1,
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing retry-policy test**

Create `src/lib/queryClient.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { TmdbError } from '../api/client';
import { shouldRetry } from './queryClient';

describe('shouldRetry', () => {
  it('does not retry 4xx client errors', () => {
    expect(shouldRetry(0, new TmdbError(401, 'Invalid API key.'))).toBe(false);
    expect(shouldRetry(0, new TmdbError(404, 'Not found.'))).toBe(false);
  });

  it('retries 429 rate limiting', () => {
    expect(shouldRetry(0, new TmdbError(429, 'Too many requests.'))).toBe(true);
  });

  it('retries 5xx server errors up to twice', () => {
    const error = new TmdbError(503, 'Service unavailable.');
    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(1, error)).toBe(true);
    expect(shouldRetry(2, error)).toBe(false);
  });

  it('retries non-TMDB errors such as network failures', () => {
    expect(shouldRetry(0, new TypeError('Failed to fetch'))).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/queryClient.test.ts`
Expected: FAIL — cannot resolve `./queryClient`.

- [ ] **Step 4: Implement the query client**

Create `src/lib/queryClient.ts`:

```ts
import { QueryClient } from '@tanstack/react-query';
import { TmdbError } from '../api/client';

const MAX_RETRIES = 2;

export function shouldRetry(failureCount: number, error: unknown): boolean {
  // 4xx means the request itself is wrong; repeating it is just slower failure.
  // 429 is the exception — it means "wrong for now".
  if (error instanceof TmdbError && error.status >= 400 && error.status < 500) {
    if (error.status !== 429) return false;
  }
  return failureCount < MAX_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        refetchOnWindowFocus: false,
      },
    },
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/queryClient.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the failing reference-query tests**

Create `src/api/queries.test.tsx`:

```tsx
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../test/server';
import { genresFixture, providersFixture, regionsFixture } from '../test/fixtures';
import { useGenres, useProviders, useRegions } from './queries';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('reference data queries', () => {
  it('unwraps the genres list from its envelope', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/genre/movie/list', () =>
        HttpResponse.json({ genres: genresFixture }),
      ),
    );

    const { result } = renderHook(() => useGenres(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(genresFixture);
  });

  it('unwraps the regions list and sorts it by English name', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/watch/providers/regions', () =>
        HttpResponse.json({ results: regionsFixture }),
      ),
    );

    const { result } = renderHook(() => useRegions(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((r) => r.iso_3166_1)).toEqual(['NL', 'US']);
  });

  it('requests providers for the given region and sorts by display priority', async () => {
    let seenRegion: string | null = null;

    server.use(
      http.get('https://api.themoviedb.org/3/watch/providers/movie', ({ request }) => {
        seenRegion = new URL(request.url).searchParams.get('watch_region');
        return HttpResponse.json({
          results: [providersFixture[1], providersFixture[0]],
        });
      }),
    );

    const { result } = renderHook(() => useProviders('NL'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(seenRegion).toBe('NL');
    expect(result.current.data?.map((p) => p.provider_id)).toEqual([8, 337]);
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `npx vitest run src/api/queries.test.tsx`
Expected: FAIL — cannot resolve `./queries`.

- [ ] **Step 8: Implement the endpoint functions**

Create `src/api/movies.ts`:

```ts
import { tmdbFetch } from './client';
import type { TmdbGenre, TmdbProvider, TmdbRegion } from './types';

export async function fetchGenres(): Promise<TmdbGenre[]> {
  const data = await tmdbFetch<{ genres: TmdbGenre[] }>('/genre/movie/list');
  return data.genres;
}

export async function fetchRegions(): Promise<TmdbRegion[]> {
  const data = await tmdbFetch<{ results: TmdbRegion[] }>('/watch/providers/regions');
  return [...data.results].sort((a, b) => a.english_name.localeCompare(b.english_name));
}

export async function fetchProviders(region: string): Promise<TmdbProvider[]> {
  const data = await tmdbFetch<{ results: TmdbProvider[] }>('/watch/providers/movie', {
    watch_region: region,
  });
  return [...data.results].sort((a, b) => a.display_priority - b.display_priority);
}
```

- [ ] **Step 9: Implement the query hooks**

Create `src/api/queries.ts`:

```ts
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchGenres, fetchProviders, fetchRegions } from './movies';
import type { TmdbGenre, TmdbProvider, TmdbRegion } from './types';

// Regions, providers, and genres change a few times a year. Fetch once per
// session and never revalidate.
const REFERENCE_DATA = { staleTime: Infinity, gcTime: Infinity } as const;

export function useGenres(): UseQueryResult<TmdbGenre[]> {
  return useQuery({
    queryKey: ['genres'],
    queryFn: fetchGenres,
    ...REFERENCE_DATA,
  });
}

export function useRegions(): UseQueryResult<TmdbRegion[]> {
  return useQuery({
    queryKey: ['regions'],
    queryFn: fetchRegions,
    ...REFERENCE_DATA,
  });
}

export function useProviders(region: string): UseQueryResult<TmdbProvider[]> {
  return useQuery({
    queryKey: ['providers', region],
    queryFn: () => fetchProviders(region),
    enabled: region !== '',
    ...REFERENCE_DATA,
  });
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run src/api/queries.test.tsx src/lib/queryClient.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 11: Commit**

```bash
git add src/api/movies.ts src/api/queries.ts src/api/queries.test.tsx \
  src/lib/queryClient.ts src/lib/queryClient.test.ts src/test/fixtures.ts
git commit -m "feat: add reference data endpoints and retry policy"
```

---

## Task 5: URL filter contract

This is the highest-value test surface in the project. All logic here is pure and testable without rendering.

**Files:**
- Create: `src/features/browse/filters.ts`
- Test: `src/features/browse/filters.test.ts`

**Interfaces:**
- Consumes: nothing (pure module)
- Produces:
  - `SORT_OPTIONS: readonly SortOption[]`, `type SortOption`, `DEFAULT_SORT: SortOption`
  - `interface BrowseFilters { region: string; providers: number[]; genres: number[]; from?: number; to?: number; rating?: number; sort: SortOption }`
  - `interface FilterVocabulary { supportedRegions?: string[]; validGenreIds?: number[]; validProviderIds?: number[] }`
  - `defaultRegion(language: string | undefined, supported?: string[]): string`
  - `parseFilters(params: URLSearchParams, vocabulary?: FilterVocabulary, language?: string): BrowseFilters`
  - `serialiseFilters(filters: BrowseFilters): URLSearchParams`
  - `toDiscoverParams(filters: BrowseFilters, page: number): TmdbParams`
  - `MIN_YEAR: 1874`, `VOTE_COUNT_FLOOR: 100`

- [ ] **Step 1: Write the failing tests**

Create `src/features/browse/filters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SORT,
  defaultRegion,
  parseFilters,
  serialiseFilters,
  toDiscoverParams,
} from './filters';

const vocabulary = {
  supportedRegions: ['NL', 'US', 'GB'],
  validGenreIds: [28, 35, 99],
  validProviderIds: [8, 337],
};

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

describe('defaultRegion', () => {
  it('extracts the region from a full locale', () => {
    expect(defaultRegion('nl-NL', ['NL', 'US'])).toBe('NL');
  });

  it('falls back to US when the locale has no region part', () => {
    expect(defaultRegion('en', ['NL', 'US'])).toBe('US');
  });

  it('falls back to US when the region is unsupported', () => {
    expect(defaultRegion('en-ZZ', ['NL', 'US'])).toBe('US');
  });

  it('falls back to US when the language is undefined', () => {
    expect(defaultRegion(undefined, ['NL', 'US'])).toBe('US');
  });

  it('trusts the locale when the supported list is not yet loaded', () => {
    expect(defaultRegion('nl-NL', undefined)).toBe('NL');
  });
});

describe('parseFilters', () => {
  it('applies defaults for an empty query string', () => {
    const filters = parseFilters(params(''), vocabulary, 'nl-NL');

    expect(filters).toEqual({
      region: 'NL',
      providers: [],
      genres: [],
      from: undefined,
      to: undefined,
      rating: undefined,
      sort: DEFAULT_SORT,
    });
  });

  it('parses a fully populated query string', () => {
    const filters = parseFilters(
      params('region=US&providers=8|337&genres=28|35&from=2010&to=2019&rating=7&sort=vote_average.desc'),
      vocabulary,
      'nl-NL',
    );

    expect(filters).toEqual({
      region: 'US',
      providers: [8, 337],
      genres: [28, 35],
      from: 2010,
      to: 2019,
      rating: 7,
      sort: 'vote_average.desc',
    });
  });

  it('drops unknown genre and provider ids', () => {
    const filters = parseFilters(params('genres=28|9999&providers=8|4242'), vocabulary, 'nl-NL');

    expect(filters.genres).toEqual([28]);
    expect(filters.providers).toEqual([8]);
  });

  it('keeps ids unvalidated while the vocabulary is still loading', () => {
    const filters = parseFilters(params('genres=28|9999'), {}, 'nl-NL');

    expect(filters.genres).toEqual([28, 9999]);
  });

  it('discards non-numeric and duplicate ids', () => {
    const filters = parseFilters(params('genres=28|abc|28|'), vocabulary, 'nl-NL');

    expect(filters.genres).toEqual([28]);
  });

  it('replaces an unknown sort value with the default', () => {
    const filters = parseFilters(params('sort=drop_tables'), vocabulary, 'nl-NL');

    expect(filters.sort).toBe(DEFAULT_SORT);
  });

  it('replaces an unsupported region with the locale default', () => {
    const filters = parseFilters(params('region=ZZ'), vocabulary, 'nl-NL');

    expect(filters.region).toBe('NL');
  });

  it('discards out-of-range years and ratings', () => {
    const filters = parseFilters(params('from=1500&to=abc&rating=99'), vocabulary, 'nl-NL');

    expect(filters.from).toBeUndefined();
    expect(filters.to).toBeUndefined();
    expect(filters.rating).toBeUndefined();
  });

  it('ignores "to" when it precedes "from"', () => {
    const filters = parseFilters(params('from=2019&to=2010'), vocabulary, 'nl-NL');

    expect(filters.from).toBe(2019);
    expect(filters.to).toBeUndefined();
  });
});

describe('serialiseFilters', () => {
  it('omits defaults and empty values', () => {
    const query = serialiseFilters({
      region: 'NL',
      providers: [],
      genres: [],
      sort: DEFAULT_SORT,
    });

    expect(query.toString()).toBe('region=NL');
  });

  it('round-trips a populated filter set', () => {
    const original = {
      region: 'US',
      providers: [8, 337],
      genres: [28],
      from: 2010,
      to: 2019,
      rating: 7,
      sort: 'vote_average.desc' as const,
    };

    expect(parseFilters(serialiseFilters(original), vocabulary, 'nl-NL')).toEqual(original);
  });
});

describe('toDiscoverParams', () => {
  it('always sends region, flatrate monetization, sort, and page', () => {
    const result = toDiscoverParams(
      { region: 'NL', providers: [], genres: [], sort: DEFAULT_SORT },
      3,
    );

    expect(result).toMatchObject({
      page: 3,
      watch_region: 'NL',
      with_watch_monetization_types: 'flatrate',
      sort_by: DEFAULT_SORT,
    });
    expect(result.with_watch_providers).toBeUndefined();
    expect(result['vote_count.gte']).toBeUndefined();
  });

  it('joins providers and genres with pipes for OR semantics', () => {
    const result = toDiscoverParams(
      { region: 'NL', providers: [8, 337], genres: [28, 35], sort: DEFAULT_SORT },
      1,
    );

    expect(result.with_watch_providers).toBe('8|337');
    expect(result.with_genres).toBe('28|35');
  });

  it('expands years into full ISO dates', () => {
    const result = toDiscoverParams(
      { region: 'NL', providers: [], genres: [], from: 2010, to: 2019, sort: DEFAULT_SORT },
      1,
    );

    expect(result['primary_release_date.gte']).toBe('2010-01-01');
    expect(result['primary_release_date.lte']).toBe('2019-12-31');
  });

  it('adds the vote count floor whenever a rating filter is active', () => {
    const result = toDiscoverParams(
      { region: 'NL', providers: [], genres: [], rating: 8, sort: DEFAULT_SORT },
      1,
    );

    expect(result['vote_average.gte']).toBe(8);
    expect(result['vote_count.gte']).toBe(100);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/browse/filters.test.ts`
Expected: FAIL — cannot resolve `./filters`.

- [ ] **Step 3: Implement the filter module**

Create `src/features/browse/filters.ts`:

```ts
import type { TmdbParams } from '../../api/client';

export const SORT_OPTIONS = [
  'popularity.desc',
  'popularity.asc',
  'vote_average.desc',
  'vote_average.asc',
  'primary_release_date.desc',
  'primary_release_date.asc',
  'title.asc',
  'title.desc',
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number];

export const DEFAULT_SORT: SortOption = 'popularity.desc';
export const FALLBACK_REGION = 'US';
export const MIN_YEAR = 1874;
export const VOTE_COUNT_FLOOR = 100;

export interface BrowseFilters {
  region: string;
  providers: number[];
  genres: number[];
  from?: number;
  to?: number;
  rating?: number;
  sort: SortOption;
}

/**
 * Reference lists used to validate ids. Each field is optional because the
 * lists arrive asynchronously — while a list is undefined, ids of that kind
 * pass through unvalidated rather than being stripped, so a shared link is not
 * silently emptied during the first render.
 */
export interface FilterVocabulary {
  supportedRegions?: string[];
  validGenreIds?: number[];
  validProviderIds?: number[];
}

function maxYear(): number {
  return new Date().getFullYear() + 5;
}

export function defaultRegion(language: string | undefined, supported?: string[]): string {
  const region = language?.split('-')[1]?.toUpperCase();
  if (!region) return FALLBACK_REGION;
  if (supported && !supported.includes(region)) return FALLBACK_REGION;
  return region;
}

function parseIdList(raw: string | null, validIds?: number[]): number[] {
  if (!raw) return [];

  const ids = raw
    .split('|')
    .map((part) => Number(part))
    .filter((id) => Number.isInteger(id) && id > 0);

  const unique = [...new Set(ids)];
  return validIds ? unique.filter((id) => validIds.includes(id)) : unique;
}

function parseNumberInRange(raw: string | null, min: number, max: number): number | undefined {
  if (raw === null || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) return undefined;
  return value;
}

function parseSort(raw: string | null): SortOption {
  return SORT_OPTIONS.includes(raw as SortOption) ? (raw as SortOption) : DEFAULT_SORT;
}

export function parseFilters(
  params: URLSearchParams,
  vocabulary: FilterVocabulary = {},
  language: string | undefined = navigator.language,
): BrowseFilters {
  const requestedRegion = params.get('region')?.toUpperCase();
  const regionIsValid =
    requestedRegion !== undefined &&
    (!vocabulary.supportedRegions || vocabulary.supportedRegions.includes(requestedRegion));

  const from = parseNumberInRange(params.get('from'), MIN_YEAR, maxYear());
  const to = parseNumberInRange(params.get('to'), MIN_YEAR, maxYear());

  return {
    region: regionIsValid
      ? requestedRegion
      : defaultRegion(language, vocabulary.supportedRegions),
    providers: parseIdList(params.get('providers'), vocabulary.validProviderIds),
    genres: parseIdList(params.get('genres'), vocabulary.validGenreIds),
    from,
    // A range running backwards is meaningless; keep the start, drop the end.
    to: from !== undefined && to !== undefined && to < from ? undefined : to,
    rating: parseNumberInRange(params.get('rating'), 0, 10),
    sort: parseSort(params.get('sort')),
  };
}

export function serialiseFilters(filters: BrowseFilters): URLSearchParams {
  const params = new URLSearchParams();

  params.set('region', filters.region);
  if (filters.providers.length > 0) params.set('providers', filters.providers.join('|'));
  if (filters.genres.length > 0) params.set('genres', filters.genres.join('|'));
  if (filters.from !== undefined) params.set('from', String(filters.from));
  if (filters.to !== undefined) params.set('to', String(filters.to));
  if (filters.rating !== undefined) params.set('rating', String(filters.rating));
  if (filters.sort !== DEFAULT_SORT) params.set('sort', filters.sort);

  return params;
}

export function toDiscoverParams(filters: BrowseFilters, page: number): TmdbParams {
  const params: TmdbParams = {
    page,
    sort_by: filters.sort,
    watch_region: filters.region,
    // Subscription streaming only. Without this, provider filters also match
    // rental and purchase availability.
    with_watch_monetization_types: 'flatrate',
  };

  if (filters.providers.length > 0) {
    params.with_watch_providers = filters.providers.join('|');
  }
  if (filters.genres.length > 0) {
    params.with_genres = filters.genres.join('|');
  }
  if (filters.from !== undefined) {
    params['primary_release_date.gte'] = `${filters.from}-01-01`;
  }
  if (filters.to !== undefined) {
    params['primary_release_date.lte'] = `${filters.to}-12-31`;
  }
  if (filters.rating !== undefined) {
    params['vote_average.gte'] = filters.rating;
    // Without a vote floor, a high rating threshold returns obscure titles
    // carrying a single 10/10 vote and the filter looks broken.
    params['vote_count.gte'] = VOTE_COUNT_FLOOR;
  }

  return params;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/browse/filters.test.ts`
Expected: PASS, 21 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/browse/filters.ts src/features/browse/filters.test.ts
git commit -m "feat: add URL filter contract with validation and discover mapping"
```

---

## Task 6: Discover, search, and the infinite query

**Files:**
- Modify: `src/api/movies.ts` (append discover and search functions)
- Create: `src/features/browse/pagination.ts`, `src/features/browse/useMovieList.ts`
- Test: `src/features/browse/pagination.test.ts`, `src/features/browse/useMovieList.test.tsx`

**Interfaces:**
- Consumes: `tmdbFetch`, `TmdbParams` from `src/api/client.ts`; `BrowseFilters`, `toDiscoverParams` from `src/features/browse/filters.ts`
- Produces:
  - From `src/api/movies.ts`: `fetchDiscover(params: TmdbParams): Promise<TmdbPage<TmdbMovieSummary>>`, `fetchSearch(query: string, page: number): Promise<TmdbPage<TmdbMovieSummary>>`
  - From `src/features/browse/pagination.ts`: `MAX_TMDB_PAGE: 500`, `getNextPageParam(lastPage: TmdbPage<unknown>): number | undefined`
  - From `src/features/browse/useMovieList.ts`: `useDiscoverMovies(filters: BrowseFilters)`, `useSearchMovies(query: string)` — both return `UseInfiniteQueryResult`; `flattenPages(data)` helper returning `TmdbMovieSummary[]`

- [ ] **Step 1: Write the failing pagination tests**

Create `src/features/browse/pagination.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getNextPageParam, MAX_TMDB_PAGE } from './pagination';

function page(current: number, total: number) {
  return { page: current, total_pages: total, total_results: total * 20, results: [] };
}

describe('getNextPageParam', () => {
  it('advances to the next page mid-list', () => {
    expect(getNextPageParam(page(1, 10))).toBe(2);
  });

  it('stops at the final page', () => {
    expect(getNextPageParam(page(10, 10))).toBeUndefined();
  });

  it('stops at page 500 even when TMDB reports far more pages', () => {
    // TMDB rejects page 501 despite advertising total_pages in the tens of
    // thousands. Without this cap the grid errors at the bottom of a broad
    // result set instead of ending cleanly.
    expect(getNextPageParam(page(499, 38020))).toBe(500);
    expect(getNextPageParam(page(MAX_TMDB_PAGE, 38020))).toBeUndefined();
  });

  it('returns undefined for an empty result set', () => {
    expect(getNextPageParam(page(1, 0))).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/browse/pagination.test.ts`
Expected: FAIL — cannot resolve `./pagination`.

- [ ] **Step 3: Implement pagination**

Create `src/features/browse/pagination.ts`:

```ts
import type { TmdbPage } from '../../api/types';

/**
 * TMDB enforces this ceiling on /discover/movie and /search/movie even though
 * total_pages in the response can be far larger. This is not documented.
 */
export const MAX_TMDB_PAGE = 500;

export function getNextPageParam(lastPage: TmdbPage<unknown>): number | undefined {
  const lastReachable = Math.min(lastPage.total_pages, MAX_TMDB_PAGE);
  return lastPage.page < lastReachable ? lastPage.page + 1 : undefined;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/browse/pagination.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing infinite-query tests**

Create `src/features/browse/useMovieList.test.tsx`:

```tsx
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../../test/server';
import { movieSummaryFixture } from '../../test/fixtures';
import { DEFAULT_SORT, type BrowseFilters } from './filters';
import { flattenPages, useDiscoverMovies } from './useMovieList';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const baseFilters: BrowseFilters = {
  region: 'NL',
  providers: [],
  genres: [],
  sort: DEFAULT_SORT,
};

describe('useDiscoverMovies', () => {
  it('sends the mapped discover params for page 1', async () => {
    let seen: URLSearchParams | undefined;

    server.use(
      http.get('https://api.themoviedb.org/3/discover/movie', ({ request }) => {
        seen = new URL(request.url).searchParams;
        return HttpResponse.json({
          page: 1,
          results: [movieSummaryFixture()],
          total_pages: 1,
          total_results: 1,
        });
      }),
    );

    const { result } = renderHook(
      () => useDiscoverMovies({ ...baseFilters, providers: [8], rating: 7 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(seen?.get('watch_region')).toBe('NL');
    expect(seen?.get('with_watch_monetization_types')).toBe('flatrate');
    expect(seen?.get('with_watch_providers')).toBe('8');
    expect(seen?.get('vote_count.gte')).toBe('100');
    expect(seen?.get('page')).toBe('1');
  });

  it('appends the next page and flattens results in order', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/discover/movie', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'));
        return HttpResponse.json({
          page,
          results: [movieSummaryFixture({ id: page, title: `Movie ${page}` })],
          total_pages: 3,
          total_results: 3,
        });
      }),
    );

    const { result } = renderHook(() => useDiscoverMovies(baseFilters), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(flattenPages(result.current.data)).toHaveLength(2));
    expect(flattenPages(result.current.data).map((m) => m.title)).toEqual([
      'Movie 1',
      'Movie 2',
    ]);
  });

  it('reports no next page when TMDB exceeds the 500 page ceiling', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/discover/movie', () =>
        HttpResponse.json({
          page: 500,
          results: [movieSummaryFixture()],
          total_pages: 38020,
          total_results: 760400,
        }),
      ),
    );

    const { result } = renderHook(() => useDiscoverMovies(baseFilters), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });

  it('flattenPages returns an empty array when there is no data', () => {
    expect(flattenPages(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run src/features/browse/useMovieList.test.tsx`
Expected: FAIL — cannot resolve `./useMovieList`.

- [ ] **Step 7: Add the discover and search endpoint functions**

Append to `src/api/movies.ts`:

```ts
import type { TmdbMovieSummary, TmdbPage } from './types';
import type { TmdbParams } from './client';

export function fetchDiscover(params: TmdbParams): Promise<TmdbPage<TmdbMovieSummary>> {
  return tmdbFetch<TmdbPage<TmdbMovieSummary>>('/discover/movie', params);
}

export function fetchSearch(
  query: string,
  page: number,
): Promise<TmdbPage<TmdbMovieSummary>> {
  return tmdbFetch<TmdbPage<TmdbMovieSummary>>('/search/movie', { query, page });
}
```

Merge the new `import type` lines into the existing import statements at the top of the file rather than duplicating them.

- [ ] **Step 8: Implement the infinite query hooks**

Create `src/features/browse/useMovieList.ts`:

```ts
import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import { fetchDiscover, fetchSearch } from '../../api/movies';
import type { TmdbMovieSummary, TmdbPage } from '../../api/types';
import { toDiscoverParams, type BrowseFilters } from './filters';
import { getNextPageParam } from './pagination';

type MoviePage = TmdbPage<TmdbMovieSummary>;
type MovieListResult = UseInfiniteQueryResult<InfiniteData<MoviePage>, Error>;

const FIVE_MINUTES = 5 * 60 * 1000;

export function flattenPages(
  data: InfiniteData<MoviePage> | undefined,
): TmdbMovieSummary[] {
  return data?.pages.flatMap((page) => page.results) ?? [];
}

export function useDiscoverMovies(filters: BrowseFilters): MovieListResult {
  return useInfiniteQuery({
    // The filter object IS the cache key. Changing any filter changes the key,
    // which resets pagination and refetches — no manual reset logic needed.
    queryKey: ['discover', filters],
    queryFn: ({ pageParam }) => fetchDiscover(toDiscoverParams(filters, pageParam)),
    initialPageParam: 1,
    getNextPageParam,
    staleTime: FIVE_MINUTES,
  });
}

export function useSearchMovies(query: string): MovieListResult {
  return useInfiniteQuery({
    queryKey: ['search', query],
    queryFn: ({ pageParam }) => fetchSearch(query, pageParam),
    initialPageParam: 1,
    getNextPageParam,
    staleTime: FIVE_MINUTES,
    enabled: query.trim() !== '',
  });
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run src/features/browse/useMovieList.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 10: Commit**

```bash
git add src/api/movies.ts src/features/browse/pagination.ts \
  src/features/browse/pagination.test.ts src/features/browse/useMovieList.ts \
  src/features/browse/useMovieList.test.tsx
git commit -m "feat: add discover and search infinite queries with page 500 cap"
```

---

## Task 7: Presentational components and grid states

**Files:**
- Create: `src/components/Poster.tsx`, `src/components/MovieCard.tsx`, `src/components/EmptyState.tsx`, `src/components/ErrorState.tsx`, `src/components/LoadMoreButton.tsx`, `src/components/MovieGrid.tsx`
- Test: `src/components/MovieGrid.test.tsx`, `src/components/ErrorState.test.tsx`

**Interfaces:**
- Consumes: `posterUrl` from `src/lib/images.ts`; `TmdbMovieSummary` from `src/api/types.ts`; `TmdbError` from `src/api/client.ts`
- Produces:
  - `Poster({ path, alt, size }: { path: string | null; alt: string; size?: PosterSize })`
  - `MovieCard({ movie, to }: { movie: TmdbMovieSummary; to: string })`
  - `EmptyState({ onClearFilters }: { onClearFilters?: () => void })`
  - `ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void })`
  - `LoadMoreButton({ onLoadMore, isFetching }: { onLoadMore: () => void; isFetching: boolean })`
  - `MovieGrid(props: MovieGridProps)` where `MovieGridProps = { movies: TmdbMovieSummary[]; status: 'pending' | 'error' | 'success'; error: unknown; hasNextPage: boolean; isFetchingNextPage: boolean; onLoadMore: () => void; onRetry: () => void; onClearFilters?: () => void; linkFor: (movie: TmdbMovieSummary) => string }`

- [ ] **Step 1: Write the failing grid and error tests**

Create `src/components/MovieGrid.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import { movieSummaryFixture } from '../test/fixtures';
import { MovieGrid } from './MovieGrid';

const baseProps = {
  movies: [],
  status: 'success' as const,
  error: null,
  hasNextPage: false,
  isFetchingNextPage: false,
  onLoadMore: vi.fn(),
  onRetry: vi.fn(),
  linkFor: (movie: { id: number }) => `/movie/${movie.id}?region=NL`,
};

describe('MovieGrid', () => {
  it('renders skeleton placeholders while pending', () => {
    renderWithProviders(<MovieGrid {...baseProps} status="pending" />);

    expect(screen.getByTestId('grid-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders an empty state with a clear-filters action', async () => {
    const onClearFilters = vi.fn();
    renderWithProviders(
      <MovieGrid {...baseProps} movies={[]} onClearFilters={onClearFilters} />,
    );

    expect(screen.getByText(/no movies match these filters/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(onClearFilters).toHaveBeenCalledOnce();
  });

  it('renders an error state with a retry action', async () => {
    const onRetry = vi.fn();
    renderWithProviders(
      <MovieGrid
        {...baseProps}
        status="error"
        error={new Error('network down')}
        onRetry={onRetry}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders movie cards linking to the detail route', () => {
    renderWithProviders(
      <MovieGrid {...baseProps} movies={[movieSummaryFixture()]} />,
    );

    const link = screen.getByRole('link', { name: /fight club/i });
    expect(link).toHaveAttribute('href', '/movie/550?region=NL');
    expect(screen.getByText('1999')).toBeInTheDocument();
    expect(screen.getByText('8.4')).toBeInTheDocument();
  });

  it('shows a load-more button when another page exists', () => {
    renderWithProviders(
      <MovieGrid {...baseProps} movies={[movieSummaryFixture()]} hasNextPage />,
    );

    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
    expect(screen.queryByText(/end of results/i)).not.toBeInTheDocument();
  });

  it('shows an end marker when no further pages exist', () => {
    renderWithProviders(
      <MovieGrid {...baseProps} movies={[movieSummaryFixture()]} hasNextPage={false} />,
    );

    expect(screen.getByText(/end of results/i)).toBeInTheDocument();
  });
});
```

Create `src/components/ErrorState.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TmdbError } from '../api/client';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('gives a setup-specific message for 401', () => {
    render(<ErrorState error={new TmdbError(401, 'Invalid API key.')} onRetry={vi.fn()} />);

    expect(screen.getByText(/VITE_TMDB_TOKEN/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('offers retry for a server error', () => {
    render(<ErrorState error={new TmdbError(503, 'Service unavailable.')} onRetry={vi.fn()} />);

    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('distinguishes a network failure from an API error', () => {
    render(<ErrorState error={new TypeError('Failed to fetch')} onRetry={vi.fn()} />);

    expect(screen.getByText(/check your connection/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components`
Expected: FAIL — cannot resolve `./MovieGrid` and `./ErrorState`.

- [ ] **Step 3: Implement Poster**

Create `src/components/Poster.tsx`:

```tsx
import { posterUrl, type PosterSize } from '../lib/images';

interface PosterProps {
  path: string | null;
  alt: string;
  size?: PosterSize;
}

export function Poster({ path, alt, size = 'w342' }: PosterProps) {
  const url = posterUrl(path, size);

  if (!url) {
    return (
      <div className="flex aspect-[2/3] w-full items-center justify-center rounded-lg bg-neutral-800 text-xs text-neutral-500">
        No artwork
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className="aspect-[2/3] w-full rounded-lg bg-neutral-800 object-cover"
    />
  );
}
```

- [ ] **Step 4: Implement MovieCard**

Create `src/components/MovieCard.tsx`:

```tsx
import { Link } from 'react-router-dom';
import type { TmdbMovieSummary } from '../api/types';
import { Poster } from './Poster';

interface MovieCardProps {
  movie: TmdbMovieSummary;
  to: string;
}

export function MovieCard({ movie, to }: MovieCardProps) {
  const year = movie.release_date ? movie.release_date.slice(0, 4) : '—';

  return (
    <li>
      <Link to={to} className="group block focus:outline-none">
        <div className="relative">
          <Poster path={movie.poster_path} alt={movie.title} />
          <span className="absolute right-1 top-1 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white">
            {movie.vote_average.toFixed(1)}
          </span>
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm font-medium text-neutral-100 group-hover:underline group-focus-visible:underline">
          {movie.title}
        </h3>
        <p className="text-xs text-neutral-400">{year}</p>
      </Link>
    </li>
  );
}
```

- [ ] **Step 5: Implement EmptyState and ErrorState**

Create `src/components/EmptyState.tsx`:

```tsx
interface EmptyStateProps {
  onClearFilters?: () => void;
}

export function EmptyState({ onClearFilters }: EmptyStateProps) {
  return (
    <div className="py-16 text-center">
      <p className="text-neutral-300">No movies match these filters.</p>
      <p className="mt-1 text-sm text-neutral-500">
        Try widening the year range or selecting more providers.
      </p>
      {onClearFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-4 rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
```

Create `src/components/ErrorState.tsx`:

```tsx
import { TmdbError } from '../api/client';

interface ErrorStateProps {
  error: unknown;
  onRetry: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  // A 401 is a setup problem, not a runtime one. A generic "something went
  // wrong" here costs an hour on first run.
  if (error instanceof TmdbError && error.status === 401) {
    return (
      <div className="py-16 text-center">
        <p className="text-neutral-300">TMDB rejected the API token.</p>
        <p className="mt-1 text-sm text-neutral-500">
          Check that <code className="text-neutral-300">VITE_TMDB_TOKEN</code> is set in
          your <code className="text-neutral-300">.env</code> file, then restart the dev
          server.
        </p>
      </div>
    );
  }

  const isNetworkFailure = !(error instanceof TmdbError);
  const message = isNetworkFailure
    ? 'Could not reach TMDB — check your connection.'
    : (error as TmdbError).message;

  return (
    <div className="py-16 text-center">
      <p className="text-neutral-300">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white"
      >
        Try again
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Implement LoadMoreButton**

Create `src/components/LoadMoreButton.tsx`:

```tsx
import { useEffect, useRef } from 'react';

interface LoadMoreButtonProps {
  onLoadMore: () => void;
  isFetching: boolean;
}

/**
 * A real button that an IntersectionObserver activates on scroll. Pure
 * scroll-triggered loading is unreachable by keyboard and hostile to screen
 * readers; the button also provides a manual fallback if the observer misfires.
 */
export function LoadMoreButton({ onLoadMore, isFetching }: LoadMoreButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || isFetching) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: '400px' },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [onLoadMore, isFetching]);

  return (
    <div className="flex justify-center py-8">
      <button
        ref={ref}
        type="button"
        onClick={onLoadMore}
        disabled={isFetching}
        className="rounded-md border border-neutral-700 px-6 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
      >
        {isFetching ? 'Loading…' : 'Load more'}
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Implement MovieGrid**

Create `src/components/MovieGrid.tsx`:

```tsx
import type { TmdbMovieSummary } from '../api/types';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { LoadMoreButton } from './LoadMoreButton';
import { MovieCard } from './MovieCard';

export interface MovieGridProps {
  movies: TmdbMovieSummary[];
  status: 'pending' | 'error' | 'success';
  error: unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  onClearFilters?: () => void;
  linkFor: (movie: TmdbMovieSummary) => string;
}

const GRID_CLASSES =
  'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';

function GridSkeleton() {
  return (
    <div className={GRID_CLASSES} data-testid="grid-skeleton" aria-busy="true">
      {Array.from({ length: 12 }, (_, index) => (
        <div key={index}>
          {/* Skeletons match the card shape so the layout does not jump. */}
          <div className="aspect-[2/3] w-full animate-pulse rounded-lg bg-neutral-800" />
          <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-neutral-800" />
        </div>
      ))}
    </div>
  );
}

export function MovieGrid({
  movies,
  status,
  error,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onRetry,
  onClearFilters,
  linkFor,
}: MovieGridProps) {
  if (status === 'pending') return <GridSkeleton />;
  if (status === 'error') return <ErrorState error={error} onRetry={onRetry} />;
  if (movies.length === 0) return <EmptyState onClearFilters={onClearFilters} />;

  return (
    <>
      <ul className={GRID_CLASSES}>
        {movies.map((movie) => (
          <MovieCard key={movie.id} movie={movie} to={linkFor(movie)} />
        ))}
      </ul>

      {hasNextPage ? (
        <LoadMoreButton onLoadMore={onLoadMore} isFetching={isFetchingNextPage} />
      ) : (
        <p className="py-8 text-center text-sm text-neutral-500">End of results.</p>
      )}
    </>
  );
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/components`
Expected: PASS, 9 tests.

- [ ] **Step 9: Commit**

```bash
git add src/components
git commit -m "feat: add movie grid with loading, empty, error, and end states"
```

---

## Task 8: App shell, routing, and region handling

**Files:**
- Create: `src/app/useRegion.ts`, `src/app/RegionPicker.tsx`, `src/app/HeaderSearch.tsx`, `src/app/Layout.tsx`, `src/components/ErrorBoundary.tsx`, `src/components/RegionLink.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`
- Test: `src/app/Layout.test.tsx`

**Interfaces:**
- Consumes: `useRegions` from `src/api/queries.ts`; `defaultRegion`, `parseFilters` from `src/features/browse/filters.ts`; `createQueryClient` from `src/lib/queryClient.ts`
- Produces:
  - `useRegion(): { region: string; setRegion: (next: string) => void }`
  - `withRegion(path: string, region: string, extra?: Record<string, string>): string`
  - `Layout()` — renders header plus `<Outlet />`
  - `ErrorBoundary({ children }: { children: ReactNode })`

- [ ] **Step 1: Write the failing shell tests**

Create `src/app/Layout.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route, useLocation } from 'react-router-dom';
import { server } from '../test/server';
import { regionsFixture } from '../test/fixtures';
import { renderWithProviders } from '../test/utils';
import { Layout } from './Layout';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderShell(route: string) {
  server.use(
    http.get('https://api.themoviedb.org/3/watch/providers/regions', () =>
      HttpResponse.json({ results: regionsFixture }),
    ),
  );

  return renderWithProviders(
    <Routes>
      <Route element={<Layout />}>
        <Route path="/browse" element={<LocationProbe />} />
        <Route path="/search" element={<LocationProbe />} />
      </Route>
    </Routes>,
    { route },
  );
}

describe('Layout', () => {
  it('changes the region in the URL without leaving the route', async () => {
    renderShell('/browse?region=NL');

    await waitFor(() =>
      expect(screen.getByLabelText(/region/i)).toHaveValue('NL'),
    );

    await userEvent.selectOptions(screen.getByLabelText(/region/i), 'US');

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/browse?region=US'),
    );
  });

  it('navigates to search carrying the region forward', async () => {
    renderShell('/browse?region=NL');

    await userEvent.type(screen.getByRole('searchbox'), 'blade runner');

    await waitFor(
      () => {
        const location = screen.getByTestId('location').textContent ?? '';
        expect(location).toContain('/search');
        expect(location).toContain('q=blade+runner');
        expect(location).toContain('region=NL');
      },
      { timeout: 2000 },
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/Layout.test.tsx`
Expected: FAIL — cannot resolve `./Layout`.

- [ ] **Step 3: Implement the region hook and link helper**

Create `src/app/useRegion.ts`:

```ts
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRegions } from '../api/queries';
import { defaultRegion } from '../features/browse/filters';

export function withRegion(
  path: string,
  region: string,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams({ ...extra, region });
  return `${path}?${params.toString()}`;
}

/**
 * Region lives in the URL on every route rather than in a context provider, so
 * a shared link resolves to the same streaming availability for the recipient.
 */
export function useRegion(): { region: string; setRegion: (next: string) => void } {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: regions } = useRegions();

  const supported = regions?.map((r) => r.iso_3166_1);
  const fromUrl = searchParams.get('region')?.toUpperCase();
  const isValid = fromUrl !== undefined && (!supported || supported.includes(fromUrl));

  const region = isValid ? fromUrl : defaultRegion(navigator.language, supported);

  const setRegion = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams);
      params.set('region', next);
      setSearchParams(params);
    },
    [searchParams, setSearchParams],
  );

  return { region, setRegion };
}
```

- [ ] **Step 4: Implement RegionLink**

Create `src/components/RegionLink.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { withRegion } from '../app/useRegion';

interface RegionLinkProps {
  to: string;
  region: string;
  children: ReactNode;
  className?: string;
}

export function RegionLink({ to, region, children, className }: RegionLinkProps) {
  return (
    <Link to={withRegion(to, region)} className={className}>
      {children}
    </Link>
  );
}
```

- [ ] **Step 5: Implement RegionPicker**

Create `src/app/RegionPicker.tsx`:

```tsx
import { useRegions } from '../api/queries';
import { useRegion } from './useRegion';

export function RegionPicker() {
  const { data: regions, isPending } = useRegions();
  const { region, setRegion } = useRegion();

  return (
    <label className="flex items-center gap-2 text-sm text-neutral-400">
      <span>Region</span>
      <select
        value={region}
        disabled={isPending}
        onChange={(event) => setRegion(event.target.value)}
        className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100"
      >
        {(regions ?? [{ iso_3166_1: region, english_name: region, native_name: region }]).map(
          (item) => (
            <option key={item.iso_3166_1} value={item.iso_3166_1}>
              {item.english_name}
            </option>
          ),
        )}
      </select>
    </label>
  );
}
```

- [ ] **Step 6: Implement HeaderSearch**

Create `src/app/HeaderSearch.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useRegion } from './useRegion';

const DEBOUNCE_MS = 300;

/**
 * A navigation control, not a stateful one: it pushes `q` into the URL and the
 * search page reads it from there, which keeps results shareable.
 */
export function HeaderSearch() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { region } = useRegion();
  const [value, setValue] = useState(searchParams.get('q') ?? '');

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === (searchParams.get('q') ?? '')) return;

    const timer = setTimeout(() => {
      if (trimmed === '') return;
      const params = new URLSearchParams({ q: trimmed, region });
      navigate(`/search?${params.toString()}`);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, region, navigate, searchParams]);

  return (
    <input
      type="search"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      placeholder="Search movies…"
      aria-label="Search movies"
      className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500"
    />
  );
}
```

- [ ] **Step 7: Implement Layout and ErrorBoundary**

Create `src/app/Layout.tsx`:

```tsx
import { Link, Outlet } from 'react-router-dom';
import { HeaderSearch } from './HeaderSearch';
import { RegionPicker } from './RegionPicker';
import { useRegion } from './useRegion';
import { withRegion } from './useRegion';

export function Layout() {
  const { region } = useRegion();

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
          <Link to={withRegion('/browse', region)} className="text-lg font-semibold">
            Streaming Catalog
          </Link>
          <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
            <HeaderSearch />
          </div>
          <RegionPicker />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
```

Create `src/components/ErrorBoundary.tsx`:

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render-time crashes so one malformed record cannot blank the app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-center text-neutral-300">
          <p>Something went wrong rendering this page.</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-4 rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

- [ ] **Step 8: Wire the route table**

Replace `src/App.tsx`:

```tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './app/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/browse" replace />} />
          <Route path="/browse" element={<div>Browse placeholder</div>} />
          <Route path="/search" element={<div>Search placeholder</div>} />
          <Route path="/movie/:id" element={<div>Detail placeholder</div>} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
```

The three placeholders are replaced in Tasks 9, 11, and 12 respectively.

- [ ] **Step 9: Wire the providers**

Replace `src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { createQueryClient } from './lib/queryClient';
import './index.css';

const queryClient = createQueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run src/app/Layout.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 11: Verify the app boots**

Run: `npm run dev`
Expected: `/` redirects to `/browse`, the header renders, and the region select populates. Stop the server afterward.

- [ ] **Step 12: Commit**

```bash
git add src/app src/App.tsx src/main.tsx src/components/ErrorBoundary.tsx \
  src/components/RegionLink.tsx
git commit -m "feat: add app shell with routing, region picker, and header search"
```

---

## Task 9: Browse page and filter bar

**Files:**
- Create: `src/features/browse/useBrowseFilters.ts`, `src/features/browse/FilterBar.tsx`, `src/features/browse/BrowsePage.tsx`
- Modify: `src/App.tsx` (replace the browse placeholder)
- Test: `src/features/browse/BrowsePage.test.tsx`

**Interfaces:**
- Consumes: `parseFilters`, `serialiseFilters`, `BrowseFilters`, `SORT_OPTIONS` from `./filters`; `useDiscoverMovies`, `flattenPages` from `./useMovieList`; `useGenres`, `useProviders`, `useRegions` from `src/api/queries.ts`; `MovieGrid` from `src/components/MovieGrid.tsx`; `withRegion` from `src/app/useRegion.ts`
- Produces:
  - `useBrowseFilters(): { filters: BrowseFilters; updateFilters: (patch: Partial<BrowseFilters>) => void; clearFilters: () => void }`
  - `FilterBar({ filters, updateFilters }: { filters: BrowseFilters; updateFilters: (patch: Partial<BrowseFilters>) => void })`
  - `BrowsePage()`

- [ ] **Step 1: Write the failing integration test**

Create `src/features/browse/BrowsePage.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { server } from '../../test/server';
import { genresFixture, movieSummaryFixture, providersFixture, regionsFixture } from '../../test/fixtures';
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

    expect(await screen.findByRole('button', { name: /remove action/i })).toBeInTheDocument();

    await userEvent.click(await screen.findByRole('button', { name: /clear filters/i }));

    await waitFor(() => {
      const search = screen.getByTestId('location').textContent ?? '';
      expect(search).not.toContain('genres=');
      expect(search).not.toContain('rating=');
      expect(search).toContain('region=NL');
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/browse/BrowsePage.test.tsx`
Expected: FAIL — cannot resolve `./BrowsePage`.

- [ ] **Step 3: Implement useBrowseFilters**

Create `src/features/browse/useBrowseFilters.ts`:

```ts
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGenres, useProviders, useRegions } from '../../api/queries';
import {
  parseFilters,
  serialiseFilters,
  type BrowseFilters,
  DEFAULT_SORT,
} from './filters';

export function useBrowseFilters(): {
  filters: BrowseFilters;
  updateFilters: (patch: Partial<BrowseFilters>) => void;
  clearFilters: () => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: regions } = useRegions();
  const { data: genres } = useGenres();

  const regionFromUrl = searchParams.get('region')?.toUpperCase();
  const { data: providers } = useProviders(regionFromUrl ?? '');

  const vocabulary = useMemo(
    () => ({
      supportedRegions: regions?.map((r) => r.iso_3166_1),
      validGenreIds: genres?.map((g) => g.id),
      validProviderIds: providers?.map((p) => p.provider_id),
    }),
    [regions, genres, providers],
  );

  const filters = useMemo(
    () => parseFilters(searchParams, vocabulary),
    [searchParams, vocabulary],
  );

  const updateFilters = useCallback(
    (patch: Partial<BrowseFilters>) => {
      setSearchParams(serialiseFilters({ ...filters, ...patch }));
    },
    [filters, setSearchParams],
  );

  const clearFilters = useCallback(() => {
    setSearchParams(
      serialiseFilters({
        region: filters.region,
        providers: [],
        genres: [],
        sort: DEFAULT_SORT,
      }),
    );
  }, [filters.region, setSearchParams]);

  return { filters, updateFilters, clearFilters };
}
```

- [ ] **Step 4: Implement FilterBar**

Create `src/features/browse/FilterBar.tsx`:

```tsx
import { useState } from 'react';
import { useGenres, useProviders } from '../../api/queries';
import { logoUrl } from '../../lib/images';
import { SORT_OPTIONS, type BrowseFilters, type SortOption } from './filters';

interface FilterBarProps {
  filters: BrowseFilters;
  updateFilters: (patch: Partial<BrowseFilters>) => void;
}

const SORT_LABELS: Record<SortOption, string> = {
  'popularity.desc': 'Most popular',
  'popularity.asc': 'Least popular',
  'vote_average.desc': 'Highest rated',
  'vote_average.asc': 'Lowest rated',
  'primary_release_date.desc': 'Newest first',
  'primary_release_date.asc': 'Oldest first',
  'title.asc': 'Title A–Z',
  'title.desc': 'Title Z–A',
};

function toggleId(list: number[], id: number): number[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

export function FilterBar({ filters, updateFilters }: FilterBarProps) {
  const { data: genres } = useGenres();
  const { data: providers } = useProviders(filters.region);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="mb-6">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="mb-3 rounded-md border border-neutral-700 px-3 py-1.5 text-sm md:hidden"
      >
        Filters
      </button>

      <div className={`${isOpen ? 'block' : 'hidden'} space-y-4 md:block`}>
        <fieldset>
          <legend className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
            Providers
          </legend>
          <div className="flex flex-wrap gap-2">
            {(providers ?? []).slice(0, 16).map((provider) => {
              const active = filters.providers.includes(provider.provider_id);
              const logo = logoUrl(provider.logo_path, 'w45');
              return (
                <button
                  key={provider.provider_id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    updateFilters({
                      providers: toggleId(filters.providers, provider.provider_id),
                    })
                  }
                  className={`flex items-center gap-2 rounded-md border px-2 py-1 text-sm ${
                    active
                      ? 'border-neutral-100 bg-neutral-100 text-neutral-900'
                      : 'border-neutral-700 text-neutral-300'
                  }`}
                >
                  {logo && <img src={logo} alt="" className="h-5 w-5 rounded" />}
                  {provider.provider_name}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
            Genres
          </legend>
          <div className="flex flex-wrap gap-2">
            {(genres ?? []).map((genre) => {
              const active = filters.genres.includes(genre.id);
              return (
                <button
                  key={genre.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => updateFilters({ genres: toggleId(filters.genres, genre.id) })}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    active
                      ? 'border-neutral-100 bg-neutral-100 text-neutral-900'
                      : 'border-neutral-700 text-neutral-300'
                  }`}
                >
                  {genre.name}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm text-neutral-400">
            <span className="mb-1 block">From year</span>
            <input
              type="number"
              value={filters.from ?? ''}
              min={1874}
              onChange={(event) =>
                updateFilters({
                  from: event.target.value === '' ? undefined : Number(event.target.value),
                })
              }
              className="w-24 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100"
            />
          </label>

          <label className="text-sm text-neutral-400">
            <span className="mb-1 block">To year</span>
            <input
              type="number"
              value={filters.to ?? ''}
              min={1874}
              onChange={(event) =>
                updateFilters({
                  to: event.target.value === '' ? undefined : Number(event.target.value),
                })
              }
              className="w-24 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100"
            />
          </label>

          <label className="text-sm text-neutral-400">
            <span className="mb-1 block">Min rating</span>
            <input
              type="number"
              value={filters.rating ?? ''}
              min={0}
              max={10}
              step={0.5}
              onChange={(event) =>
                updateFilters({
                  rating: event.target.value === '' ? undefined : Number(event.target.value),
                })
              }
              className="w-24 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100"
            />
          </label>

          <label className="text-sm text-neutral-400">
            <span className="mb-1 block">Sort by</span>
            <select
              value={filters.sort}
              onChange={(event) => updateFilters({ sort: event.target.value as SortOption })}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {SORT_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Implement BrowsePage**

Create `src/features/browse/BrowsePage.tsx`:

```tsx
import { useGenres, useProviders } from '../../api/queries';
import { withRegion } from '../../app/useRegion';
import { MovieGrid } from '../../components/MovieGrid';
import { FilterBar } from './FilterBar';
import { useBrowseFilters } from './useBrowseFilters';
import { flattenPages, useDiscoverMovies } from './useMovieList';

export function BrowsePage() {
  const { filters, updateFilters, clearFilters } = useBrowseFilters();
  const { data: genres } = useGenres();
  const { data: providers } = useProviders(filters.region);
  const query = useDiscoverMovies(filters);

  const chips = [
    ...filters.genres.map((id) => ({
      key: `genre-${id}`,
      label: genres?.find((genre) => genre.id === id)?.name ?? `Genre ${id}`,
      remove: () => updateFilters({ genres: filters.genres.filter((g) => g !== id) }),
    })),
    ...filters.providers.map((id) => ({
      key: `provider-${id}`,
      label:
        providers?.find((provider) => provider.provider_id === id)?.provider_name ??
        `Provider ${id}`,
      remove: () => updateFilters({ providers: filters.providers.filter((p) => p !== id) }),
    })),
    ...(filters.rating !== undefined
      ? [
          {
            key: 'rating',
            label: `Rating ≥ ${filters.rating}`,
            remove: () => updateFilters({ rating: undefined }),
          },
        ]
      : []),
  ];

  return (
    <>
      <FilterBar filters={filters} updateFilters={updateFilters} />

      {chips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.remove}
              aria-label={`Remove ${chip.label}`}
              className="rounded-full bg-neutral-800 px-3 py-1 text-xs text-neutral-200"
            >
              {chip.label} ×
            </button>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-neutral-400 underline"
          >
            Clear filters
          </button>
        </div>
      )}

      <MovieGrid
        movies={flattenPages(query.data)}
        status={query.status}
        error={query.error}
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        onLoadMore={() => void query.fetchNextPage()}
        onRetry={() => void query.refetch()}
        onClearFilters={clearFilters}
        linkFor={(movie) => withRegion(`/movie/${movie.id}`, filters.region)}
      />
    </>
  );
}
```

- [ ] **Step 6: Wire the route**

In `src/App.tsx`, add the import and replace the browse placeholder:

```tsx
import { BrowsePage } from './features/browse/BrowsePage';
```

```tsx
<Route path="/browse" element={<BrowsePage />} />
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/features/browse/BrowsePage.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 8: Commit**

```bash
git add src/features/browse/useBrowseFilters.ts src/features/browse/FilterBar.tsx \
  src/features/browse/BrowsePage.tsx src/features/browse/BrowsePage.test.tsx src/App.tsx
git commit -m "feat: add browse page with filter bar and active filter chips"
```

---

## Task 10: Search page

**Files:**
- Create: `src/features/search/SearchPage.tsx`
- Modify: `src/App.tsx` (replace the search placeholder)
- Test: `src/features/search/SearchPage.test.tsx`

**Interfaces:**
- Consumes: `useSearchMovies`, `flattenPages` from `src/features/browse/useMovieList.ts`; `MovieGrid` from `src/components/MovieGrid.tsx`; `useRegion`, `withRegion` from `src/app/useRegion.ts`
- Produces: `SearchPage()`

Note: `src/features/search/` importing `useMovieList` from `src/features/browse/` would violate the import rule. Move the shared hook module first.

- [ ] **Step 1: Move the shared query hooks out of the browse feature**

`useMovieList.ts` and `pagination.ts` are now used by two features, so per the import rule they move down a level.

```bash
git mv src/features/browse/useMovieList.ts src/api/useMovieList.ts
git mv src/features/browse/useMovieList.test.tsx src/api/useMovieList.test.tsx
git mv src/features/browse/pagination.ts src/api/pagination.ts
git mv src/features/browse/pagination.test.ts src/api/pagination.test.ts
```

Update the import paths inside the moved files:

- In `src/api/useMovieList.ts`: `'../../api/movies'` becomes `'./movies'`, `'../../api/types'` becomes `'./types'`, `'./filters'` becomes `'../features/browse/filters'`, `'./pagination'` stays `'./pagination'`.
- In `src/api/pagination.ts`: `'../../api/types'` becomes `'./types'`.
- In `src/api/useMovieList.test.tsx`: `'../../test/server'` becomes `'../test/server'`, `'../../test/fixtures'` becomes `'../test/fixtures'`, `'./filters'` becomes `'../features/browse/filters'`, `'./useMovieList'` stays.
- In `src/api/pagination.test.ts`: `'./pagination'` stays.
- In `src/features/browse/BrowsePage.tsx`: `'./useMovieList'` becomes `'../../api/useMovieList'`.

- [ ] **Step 2: Run the full suite to confirm the move broke nothing**

Run: `npm test`
Expected: PASS, all existing tests.

- [ ] **Step 3: Write the failing search tests**

Create `src/features/search/SearchPage.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { server } from '../../test/server';
import { movieSummaryFixture, regionsFixture } from '../../test/fixtures';
import { renderWithProviders } from '../../test/utils';
import { SearchPage } from './SearchPage';

function renderSearch(route: string) {
  server.use(
    http.get('https://api.themoviedb.org/3/watch/providers/regions', () =>
      HttpResponse.json({ results: regionsFixture }),
    ),
  );

  return renderWithProviders(
    <Routes>
      <Route path="/search" element={<SearchPage />} />
    </Routes>,
    { route },
  );
}

describe('SearchPage', () => {
  it('queries TMDB with the q param from the URL', async () => {
    let seenQuery: string | null = null;

    server.use(
      http.get('https://api.themoviedb.org/3/search/movie', ({ request }) => {
        seenQuery = new URL(request.url).searchParams.get('query');
        return HttpResponse.json({
          page: 1,
          results: [movieSummaryFixture()],
          total_pages: 1,
          total_results: 1,
        });
      }),
    );

    renderSearch('/search?q=fight+club&region=NL');

    expect(await screen.findByText('Fight Club')).toBeInTheDocument();
    expect(seenQuery).toBe('fight club');
  });

  it('links results to the detail route carrying the region', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/search/movie', () =>
        HttpResponse.json({
          page: 1,
          results: [movieSummaryFixture()],
          total_pages: 1,
          total_results: 1,
        }),
      ),
    );

    renderSearch('/search?q=fight+club&region=NL');

    expect(await screen.findByRole('link', { name: /fight club/i })).toHaveAttribute(
      'href',
      '/movie/550?region=NL',
    );
  });

  it('prompts for a query when none is present', () => {
    renderSearch('/search?region=NL');

    expect(screen.getByText(/type a movie title/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/features/search/SearchPage.test.tsx`
Expected: FAIL — cannot resolve `./SearchPage`.

- [ ] **Step 5: Implement SearchPage**

Create `src/features/search/SearchPage.tsx`:

```tsx
import { useSearchParams } from 'react-router-dom';
import { flattenPages, useSearchMovies } from '../../api/useMovieList';
import { useRegion, withRegion } from '../../app/useRegion';
import { MovieGrid } from '../../components/MovieGrid';

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const { region } = useRegion();
  const query = searchParams.get('q')?.trim() ?? '';
  const results = useSearchMovies(query);

  if (query === '') {
    return (
      <p className="py-16 text-center text-neutral-400">
        Type a movie title in the search box above.
      </p>
    );
  }

  return (
    <>
      <h1 className="mb-6 text-lg text-neutral-300">
        Results for <span className="font-semibold text-neutral-100">{query}</span>
      </h1>

      {/* Search is global: TMDB's /search/movie accepts no provider filters, so
          streaming availability only appears on the detail page. */}
      <MovieGrid
        movies={flattenPages(results.data)}
        status={results.status}
        error={results.error}
        hasNextPage={results.hasNextPage}
        isFetchingNextPage={results.isFetchingNextPage}
        onLoadMore={() => void results.fetchNextPage()}
        onRetry={() => void results.refetch()}
        linkFor={(movie) => withRegion(`/movie/${movie.id}`, region)}
      />
    </>
  );
}
```

- [ ] **Step 6: Wire the route**

In `src/App.tsx`, add the import and replace the search placeholder:

```tsx
import { SearchPage } from './features/search/SearchPage';
```

```tsx
<Route path="/search" element={<SearchPage />} />
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/features/search/SearchPage.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 8: Commit**

```bash
git add src/api/useMovieList.ts src/api/useMovieList.test.tsx src/api/pagination.ts \
  src/api/pagination.test.ts src/features/search src/features/browse/BrowsePage.tsx src/App.tsx
git commit -m "feat: add search page and move shared query hooks into api layer"
```

---

## Task 11: Movie detail page

**Files:**
- Modify: `src/api/movies.ts` (append detail fetch), `src/api/queries.ts` (append detail hook), `src/App.tsx`
- Create: `src/features/movie/MovieDetailPage.tsx`, `src/features/movie/ProviderList.tsx`
- Test: `src/features/movie/MovieDetailPage.test.tsx`

**Interfaces:**
- Consumes: `tmdbFetch` from `src/api/client.ts`; `TmdbMovieDetail` from `src/api/types.ts`; `backdropUrl`, `logoUrl`, `posterUrl` from `src/lib/images.ts`; `useRegion`, `withRegion` from `src/app/useRegion.ts`
- Produces:
  - `fetchMovie(id: number): Promise<TmdbMovieDetail>`
  - `useMovie(id: number)` — `UseQueryResult<TmdbMovieDetail>`
  - `ProviderList({ movie, region }: { movie: TmdbMovieDetail; region: string })`
  - `MovieDetailPage()`

- [ ] **Step 1: Write the failing detail tests**

Create `src/features/movie/MovieDetailPage.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { server } from '../../test/server';
import { providersFixture, regionsFixture } from '../../test/fixtures';
import { renderWithProviders } from '../../test/utils';
import type { TmdbMovieDetail } from '../../api/types';
import { MovieDetailPage } from './MovieDetailPage';

function detailFixture(overrides: Partial<TmdbMovieDetail> = {}): TmdbMovieDetail {
  return {
    id: 550,
    title: 'Fight Club',
    overview: 'A ticking-time-bomb insomniac.',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    release_date: '1999-10-15',
    vote_average: 8.4,
    vote_count: 27000,
    runtime: 139,
    genres: [{ id: 18, name: 'Drama' }],
    'watch/providers': {
      results: { NL: { link: 'https://example.test', flatrate: [providersFixture[0]] } },
    },
    ...overrides,
  };
}

function renderDetail(route: string) {
  server.use(
    http.get('https://api.themoviedb.org/3/watch/providers/regions', () =>
      HttpResponse.json({ results: regionsFixture }),
    ),
  );

  return renderWithProviders(
    <Routes>
      <Route path="/movie/:id" element={<MovieDetailPage />} />
    </Routes>,
    { route },
  );
}

describe('MovieDetailPage', () => {
  it('requests the movie with watch providers appended', async () => {
    let seenAppend: string | null = null;

    server.use(
      http.get('https://api.themoviedb.org/3/movie/550', ({ request }) => {
        seenAppend = new URL(request.url).searchParams.get('append_to_response');
        return HttpResponse.json(detailFixture());
      }),
    );

    renderDetail('/movie/550?region=NL');

    expect(await screen.findByRole('heading', { name: 'Fight Club' })).toBeInTheDocument();
    expect(seenAppend).toBe('watch/providers');
    expect(screen.getByText('139 min')).toBeInTheDocument();
    expect(screen.getByText('Drama')).toBeInTheDocument();
  });

  it('lists subscription providers for the selected region', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/movie/550', () =>
        HttpResponse.json(detailFixture()),
      ),
    );

    renderDetail('/movie/550?region=NL');

    expect(await screen.findByText('Netflix')).toBeInTheDocument();
  });

  it('says so plainly when nothing streams it in the region', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/movie/550', () =>
        HttpResponse.json(detailFixture({ 'watch/providers': { results: {} } })),
      ),
    );

    renderDetail('/movie/550?region=NL');

    expect(await screen.findByText(/not streaming on any subscription service/i)).toBeInTheDocument();
  });

  it('renders a not-found view for a 404 rather than an error view', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/movie/999999', () =>
        HttpResponse.json(
          { status_code: 34, status_message: 'The resource you requested could not be found.' },
          { status: 404 },
        ),
      ),
    );

    renderDetail('/movie/999999?region=NL');

    expect(await screen.findByText(/we could not find that movie/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/movie/MovieDetailPage.test.tsx`
Expected: FAIL — cannot resolve `./MovieDetailPage`.

- [ ] **Step 3: Add the detail endpoint and hook**

Append to `src/api/movies.ts`:

```ts
export function fetchMovie(id: number): Promise<TmdbMovieDetail> {
  // append_to_response folds the providers request into this one.
  return tmdbFetch<TmdbMovieDetail>(`/movie/${id}`, {
    append_to_response: 'watch/providers',
  });
}
```

Add `TmdbMovieDetail` to the existing `import type` list from `./types`.

Append to `src/api/queries.ts`:

```ts
const ONE_HOUR = 60 * 60 * 1000;

export function useMovie(id: number): UseQueryResult<TmdbMovieDetail> {
  return useQuery({
    queryKey: ['movie', id],
    queryFn: () => fetchMovie(id),
    staleTime: ONE_HOUR,
    enabled: Number.isInteger(id) && id > 0,
  });
}
```

Add `fetchMovie` to the existing import from `./movies` and `TmdbMovieDetail` to the import from `./types`.

- [ ] **Step 4: Implement ProviderList**

Create `src/features/movie/ProviderList.tsx`:

```tsx
import type { TmdbMovieDetail } from '../../api/types';
import { logoUrl } from '../../lib/images';

interface ProviderListProps {
  movie: TmdbMovieDetail;
  region: string;
}

export function ProviderList({ movie, region }: ProviderListProps) {
  const flatrate = movie['watch/providers']?.results[region]?.flatrate ?? [];

  if (flatrate.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        Not streaming on any subscription service in {region}.
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap gap-3">
      {flatrate.map((provider) => {
        const logo = logoUrl(provider.logo_path, 'w92');
        return (
          <li
            key={provider.provider_id}
            className="flex items-center gap-2 rounded-md border border-neutral-800 px-3 py-2 text-sm text-neutral-200"
          >
            {logo && <img src={logo} alt="" className="h-6 w-6 rounded" />}
            {provider.provider_name}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 5: Implement MovieDetailPage**

Create `src/features/movie/MovieDetailPage.tsx`:

```tsx
import { useNavigate, useParams } from 'react-router-dom';
import { TmdbError } from '../../api/client';
import { useMovie } from '../../api/queries';
import { useRegion } from '../../app/useRegion';
import { ErrorState } from '../../components/ErrorState';
import { Poster } from '../../components/Poster';
import { backdropUrl } from '../../lib/images';
import { ProviderList } from './ProviderList';

export function MovieDetailPage() {
  const { id } = useParams();
  const { region } = useRegion();
  const navigate = useNavigate();
  const query = useMovie(Number(id));

  if (query.isPending) {
    return <div className="h-96 animate-pulse rounded-lg bg-neutral-900" />;
  }

  if (query.isError) {
    if (query.error instanceof TmdbError && query.error.status === 404) {
      return (
        <p className="py-16 text-center text-neutral-300">
          We could not find that movie.
        </p>
      );
    }
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const movie = query.data;
  const backdrop = backdropUrl(movie.backdrop_path);
  const year = movie.release_date ? movie.release_date.slice(0, 4) : '—';

  return (
    <article>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 text-sm text-neutral-400 underline"
      >
        Back to results
      </button>

      {backdrop && (
        <img
          src={backdrop}
          alt=""
          className="mb-6 h-64 w-full rounded-lg object-cover opacity-60"
        />
      )}

      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="w-40 shrink-0">
          <Poster path={movie.poster_path} alt={movie.title} size="w342" />
        </div>

        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{movie.title}</h1>

          <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-neutral-400">
            <span>{year}</span>
            {movie.runtime !== null && <span>{movie.runtime} min</span>}
            <span>{movie.vote_average.toFixed(1)} / 10</span>
          </p>

          <ul className="mt-3 flex flex-wrap gap-2">
            {movie.genres.map((genre) => (
              <li
                key={genre.id}
                className="rounded-full bg-neutral-800 px-3 py-1 text-xs text-neutral-300"
              >
                {genre.name}
              </li>
            ))}
          </ul>

          <p className="mt-4 max-w-prose text-neutral-300">{movie.overview}</p>

          <h2 className="mt-8 mb-3 text-sm uppercase tracking-wide text-neutral-500">
            Streaming in {region}
          </h2>
          <ProviderList movie={movie} region={region} />
        </div>
      </div>
    </article>
  );
}
```

- [ ] **Step 6: Wire the route**

In `src/App.tsx`, add the import and replace the detail placeholder:

```tsx
import { MovieDetailPage } from './features/movie/MovieDetailPage';
```

```tsx
<Route path="/movie/:id" element={<MovieDetailPage />} />
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/features/movie/MovieDetailPage.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 8: Commit**

```bash
git add src/api/movies.ts src/api/queries.ts src/features/movie src/App.tsx
git commit -m "feat: add movie detail page with regional streaming providers"
```

---

## Task 12: End-to-end verification against the real API

This task adds no features. It verifies the app works against TMDB rather than against fixtures — the one thing the test suite by construction cannot prove.

**Files:**
- Create: `README.md`
- Modify: none

**Interfaces:**
- Consumes: the complete app
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS, all tests across every file. Record the count.

- [ ] **Step 2: Type-check and lint the whole project**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. Fix any that appear — `noUnusedLocals` commonly catches leftover imports from the Task 10 file moves.

- [ ] **Step 3: Obtain a real token and configure the environment**

Copy `.env.example` to `.env` and fill in a TMDB API Read Access Token from
https://www.themoviedb.org/settings/api. Confirm `.env` is gitignored:

```bash
git check-ignore .env && echo "ignored correctly"
```

Expected output: `ignored correctly`. Do not proceed if this prints nothing.

- [ ] **Step 4: Verify the golden path in a browser**

Run: `npm run dev`, open the app, and confirm each of these:

1. `/` redirects to `/browse` and shows a populated grid of posters.
2. The region picker lists real countries; changing it updates the URL and the results.
3. Selecting a provider updates the URL and narrows results to that service.
4. Selecting a genre adds a chip; clicking the chip removes it and results widen.
5. Scrolling to the bottom loads more results without a visible jump.
6. Clicking a movie opens its detail page showing runtime, genres, synopsis, and providers.
7. "Back to results" returns to the grid with the filters still applied.
8. Searching a title navigates to `/search?q=…` and returns matching results.
9. Copying the browse URL into a new tab reproduces exactly the same filtered view.

- [ ] **Step 5: Verify the error and empty paths**

1. Set `VITE_TMDB_TOKEN` to a wrong value, restart the dev server, and confirm the app shows the "check `VITE_TMDB_TOKEN`" message rather than a generic error. Restore the real token afterward.
2. Apply a deliberately impossible filter combination (a narrow year range plus a high minimum rating plus one provider) and confirm the empty state appears with a working "Clear filters" action.
3. Visit `/movie/999999999?region=US` and confirm the not-found view appears.

- [ ] **Step 6: Write the README**

Create `README.md`:

````markdown
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

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm test` | Run the test suite once |
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
````

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs: add setup instructions and known constraints"
```

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| Base URL, bearer auth | 2 |
| `response.ok` check, `TmdbError` mapping | 2 |
| Retry policy (429/5xx retry, 4xx not) | 4 |
| Hardcoded image URLs | 3 |
| Reference data with `staleTime: Infinity` | 4 |
| Discover 5-minute cache, detail 1-hour cache | 6, 11 |
| `append_to_response=watch/providers` | 11 |
| URL param schema and validation | 5 |
| Untrusted URL input dropped, not errored | 5 |
| `flatrate` always sent | 5 |
| `vote_count.gte=100` with rating only | 5 |
| Region default from `navigator.language`, no persistence | 5, 8 |
| Genres and providers OR-joined with pipes | 5 |
| Page-500 cap | 6 |
| `region` on every route | 8 |
| Header search as navigation control, debounced | 8 |
| Region picker app-wide | 8 |
| Filter bar with mobile collapse | 9 |
| Active filter chips | 9 |
| Grid: loading skeleton, empty, error, end-of-results | 7 |
| Infinite scroll via observer-activated button | 7 |
| Detail page fields and provider list | 11 |
| "Not streaming here" stated plainly | 11 |
| Search reuses the grid, no provider filters | 10 |
| 401 setup-specific message | 7 |
| 404 not-found view | 11 |
| Network failure distinguished | 7 |
| Route-level error boundary | 8 |
| Feature import rule | 8, 10 |
| Strict TypeScript, ESLint, Prettier | 1, 12 |
| `.env` gitignored, `.env.example` committed | 1, 12 |

No gaps.

**2. Placeholder scan**

No "TBD", "TODO", "handle edge cases", or "similar to Task N" instances. The three route placeholders in Task 8 are deliberate, named, and each replaced by an explicitly identified later task.

**3. Type consistency**

- `TmdbParams` is defined in Task 2 and imported by Tasks 5 and 6.
- `BrowseFilters` is defined in Task 5 and consumed identically in Tasks 6 and 9.
- `flattenPages` and `useDiscoverMovies` / `useSearchMovies` are defined in Task 6 and their import path changes exactly once, in Task 10 Step 1, which also updates every consumer.
- `MovieGridProps` in Task 7 matches the props passed in Tasks 9 and 10, including `linkFor`.
- `withRegion` is defined in Task 8 and used in Tasks 9, 10, and 11 with the same signature.
- `TmdbMovieDetail['watch/providers']` is defined in Task 2 and read in Task 11 via the same key.

One issue found and fixed during review: Tasks 9 and 10 both needed `useMovieList`, which would have made `features/search` import from `features/browse` and break the import rule stated in Global Constraints. Task 10 Step 1 now moves that module into `src/api/` before the search feature is written, with every affected import path listed explicitly.
