# Deployment and TMDB Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the TMDB token out of the browser bundle into a server-side Vercel proxy, then deploy the app publicly on Vercel from GitHub.

**Architecture:** The browser calls `/api/tmdb/<tmdb path>` on its own origin with no credentials. A `vercel.json` rewrite routes every such request to a single Vercel Edge function, `api/tmdb.ts`, which delegates to `server/tmdbProxy.ts`. That module checks the request came from the app (`Sec-Fetch-Site`, falling back to `Referer`), checks the path against a six-entry allowlist, forwards to `https://api.themoviedb.org/3` with `Authorization: Bearer $TMDB_TOKEN`, and returns TMDB's status and body unchanged.

**Tech Stack:** Vercel (Edge runtime functions, `vercel.json` rewrites, Vercel CLI), Vite, React 19, TypeScript (strict), Vitest, MSW v2.

**Spec:** `docs/superpowers/specs/2026-09-12-deployment-and-tmdb-proxy-design.md`

## Deviations from the spec

Found while planning and verified against Vercel's documentation. The spec has
been amended to match. None of these change the spec's security properties.

1. **No catch-all filename.** Vercel does not support catch-all function files
   (`[...path].ts`) outside Next.js, so `api/tmdb/[...path].ts` would not route.
   The function is instead **`api/tmdb.ts`**, and `vercel.json` rewrites
   `/api/tmdb/:path*` to `/api/tmdb?tmdb_path=:path*`. The proxy accepts both the
   direct form (`/api/tmdb/movie/550`) and the rewritten form
   (`/api/tmdb?tmdb_path=movie/550`), so it does not depend on which URL Vercel
   presents to the function after the rewrite.
2. **Logic lives in `server/tmdbProxy.ts`.** Every file under `api/` becomes a
   public endpoint, so the proxy's test file cannot sit there. `api/tmdb.ts` is
   a five-line wrapper; the logic and its tests live in `server/`. The logic
   takes its environment as a parameter, which keeps the tests free of
   `process.env` stubbing.
3. **The client needs a URL base.** `new URL('/api/tmdb/movie/550')` throws
   ("Invalid URL") because the URL is relative. The client passes
   `window.location.origin` as the base.

## Global Constraints

Every task's requirements implicitly include this section.

- **The token variable is `TMDB_TOKEN`**, exactly. No `VITE_` prefix anywhere — Vite inlines `VITE_*` variables into the browser bundle. It is read only in `api/tmdb.ts`.
- **The browser sends no `Authorization` header.** `src/api/client.ts` is the only browser module that knows the proxy URL, and its `BASE_URL` is exactly `/api/tmdb`.
- **The proxy allowlist is exactly six patterns:** `/genre/movie/list`, `/watch/providers/regions`, `/watch/providers/movie`, `/discover/movie`, `/search/movie`, `/movie/{digits}`. Anything else returns 404 without contacting TMDB.
- **The origin check is built on `Sec-Fetch-Site`, never `Origin`.** Browsers send no `Origin` header on same-origin GETs.
- **Proxy rejections have exactly these bodies:** `403` → `{ "error": "origin_not_allowed" }`, `404` → `{ "error": "path_not_allowed" }`.
- **TMDB's responses pass through unchanged** — status code and body. Never wrap them.
- **`.env` is never committed.** It is already gitignored.
- **Import rule:** `src/` never imports from `server/` or `api/`. `server/` never imports from `src/`, except test files importing `src/test/server`.
- **TypeScript runs in `strict` mode.** No `any` in committed code.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `server/tmdbProxy.ts` | Create | Origin check, path allowlist, forwarding, rejections |
| `server/tmdbProxy.test.ts` | Create | Proxy unit tests (Vitest node environment) |
| `api/tmdb.ts` | Create | Vercel Edge function entry point; passes env to the proxy |
| `tsconfig.server.json` | Create | Type-checks `api/` and `server/` during `tsc -b` |
| `tsconfig.json` | Modify | References the new server config |
| `src/api/client.ts` | Modify | `BASE_URL` → `/api/tmdb`; no auth header; URL base |
| `src/api/client.test.ts` | Modify | First test inverted to pin "no Authorization header" |
| 7 other test files | Modify | MSW handler URLs → `/api/tmdb/…` (mechanical) |
| `vite.config.ts` | Modify | Remove `test.env.VITE_TMDB_TOKEN` |
| `src/components/ErrorState.tsx` | Modify | 401 message for visitors and the operator |
| `src/components/ErrorState.test.tsx` | Modify | Assert the new 401 message |
| `.env.example` | Modify | Documents `TMDB_TOKEN` |
| `.env` | Modify (local only) | Variable renamed; never committed |
| `README.md` | Modify | `vercel dev` workflow, proxy, deployment |
| `vercel.json` | Create | Proxy rewrite and SPA fallback |
| `.gitignore` | Modify | Ignore `.vercel/` (created by `vercel link`) |

Steps marked **👤 USER** need the human: they involve logging in to Vercel or
using its dashboard. An agent executing this plan must stop at those steps and
ask the user to do them, then continue once they confirm.

---

### Task 1: The proxy

**Files:**
- Create: `server/tmdbProxy.ts`
- Create: `server/tmdbProxy.test.ts`
- Create: `api/tmdb.ts`
- Create: `tsconfig.server.json`
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: `server` from `src/test/server.ts` (MSW `setupServer()`; started and reset by `src/test/setup.ts` for every test file).
- Produces:
  - `export interface ProxyEnv { TMDB_TOKEN?: string; VERCEL_URL?: string; VERCEL_PROJECT_PRODUCTION_URL?: string }`
  - `export async function handleTmdbProxy(request: Request, env: ProxyEnv): Promise<Response>`
  - `export const PATH_PARAM = 'tmdb_path'` — the query parameter Task 4's `vercel.json` rewrite must use.
  - `api/tmdb.ts` default export `handler(request: Request): Promise<Response>` with `export const config = { runtime: 'edge' }`.

- [ ] **Step 1: Write the failing tests**

Create `server/tmdbProxy.test.ts`:

```ts
// @vitest-environment node
// The proxy runs on Vercel's Edge runtime, not in a browser, so these tests use
// the node environment. MSW (started in src/test/setup.ts) intercepts the
// proxy's outbound calls to TMDB.
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../src/test/server';
import { handleTmdbProxy, type ProxyEnv } from './tmdbProxy';

const env: ProxyEnv = {
  TMDB_TOKEN: 'server-token',
  VERCEL_PROJECT_PRODUCTION_URL: 'movie-catalog.vercel.app',
  VERCEL_URL: 'movie-catalog-git-abc123.vercel.app',
};

const SAME_ORIGIN = { 'Sec-Fetch-Site': 'same-origin' };

function proxyRequest(
  pathAndQuery: string,
  headers: Record<string, string> = SAME_ORIGIN,
): Request {
  return new Request(`https://movie-catalog.vercel.app${pathAndQuery}`, { headers });
}

// Records every request that reaches TMDB, so a test can assert that none did.
function recordTmdbCalls(): string[] {
  const calls: string[] = [];
  server.use(
    http.all('https://api.themoviedb.org/*', ({ request }) => {
      calls.push(request.url);
      return HttpResponse.json({});
    }),
  );
  return calls;
}

describe('handleTmdbProxy', () => {
  it('forwards an allowlisted path to TMDB with the bearer token and the query string', async () => {
    let seenUrl = '';
    let seenAuth: string | null = null;

    server.use(
      http.get('https://api.themoviedb.org/3/discover/movie', ({ request }) => {
        seenUrl = request.url;
        seenAuth = request.headers.get('Authorization');
        return HttpResponse.json({ page: 1 });
      }),
    );

    const response = await handleTmdbProxy(
      proxyRequest('/api/tmdb/discover/movie?watch_region=NL&page=2'),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ page: 1 });
    expect(seenAuth).toBe('Bearer server-token');
    const forwarded = new URL(seenUrl);
    expect(forwarded.searchParams.get('watch_region')).toBe('NL');
    expect(forwarded.searchParams.get('page')).toBe('2');
  });

  it('accepts the rewritten form vercel.json produces and does not forward the path parameter', async () => {
    let seenUrl = '';

    server.use(
      http.get('https://api.themoviedb.org/3/movie/550', ({ request }) => {
        seenUrl = request.url;
        return HttpResponse.json({ id: 550 });
      }),
    );

    const response = await handleTmdbProxy(
      proxyRequest('/api/tmdb?tmdb_path=movie/550&append_to_response=watch/providers'),
      env,
    );

    expect(response.status).toBe(200);
    const forwarded = new URL(seenUrl);
    expect(forwarded.pathname).toBe('/3/movie/550');
    expect(forwarded.searchParams.get('append_to_response')).toBe('watch/providers');
    expect(forwarded.searchParams.has('tmdb_path')).toBe(false);
  });

  it.each([
    '/api/tmdb/account',
    '/api/tmdb/movie/550/credits',
    '/api/tmdb/movie/abc',
    '/api/tmdb?tmdb_path=account',
    '/api/tmdb',
  ])('rejects %s with 404 without contacting TMDB', async (pathAndQuery) => {
    const calls = recordTmdbCalls();

    const response = await handleTmdbProxy(proxyRequest(pathAndQuery), env);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'path_not_allowed' });
    // The allowlist's job is to never reach TMDB, not merely to return 404.
    expect(calls).toEqual([]);
  });

  it.each<[string, Record<string, string>]>([
    ['no Sec-Fetch-Site and no Referer', {}],
    ['a foreign Referer', { Referer: 'https://evil.example/page' }],
    [
      'a cross-site fetch',
      { 'Sec-Fetch-Site': 'cross-site', Referer: 'https://evil.example/page' },
    ],
  ])('rejects a request with %s with 403 without contacting TMDB', async (_label, headers) => {
    const calls = recordTmdbCalls();

    const response = await handleTmdbProxy(proxyRequest('/api/tmdb/movie/550', headers), env);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'origin_not_allowed' });
    expect(calls).toEqual([]);
  });

  it.each([
    ['the production domain', 'https://movie-catalog.vercel.app/browse'],
    ['the current deployment', 'https://movie-catalog-git-abc123.vercel.app/browse'],
    ['local development', 'http://localhost:5173/browse'],
  ])('allows a Referer from %s when Sec-Fetch-Site is absent', async (_label, referer) => {
    recordTmdbCalls();

    const response = await handleTmdbProxy(
      proxyRequest('/api/tmdb/movie/550', { Referer: referer }),
      env,
    );

    expect(response.status).toBe(200);
  });

  // Regression guard: the client's 401 message, not-found page, retry policy,
  // and TmdbError all depend on TMDB's own status and body arriving intact.
  it('passes a TMDB 401 through with its status and body intact', async () => {
    const tmdbBody = {
      status_code: 7,
      status_message: 'Invalid API key: You must be granted a valid key.',
      success: false,
    };
    server.use(
      http.get('https://api.themoviedb.org/3/movie/550', () =>
        HttpResponse.json(tmdbBody, { status: 401 }),
      ),
    );

    const response = await handleTmdbProxy(proxyRequest('/api/tmdb/movie/550'), env);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(tmdbBody);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run server/tmdbProxy.test.ts`
Expected: FAIL — the import of `./tmdbProxy` cannot be resolved.

- [ ] **Step 3: Implement the proxy**

Create `server/tmdbProxy.ts`:

```ts
// Server-side code: runs in the Vercel Edge function api/tmdb.ts, never in the
// browser. Unrelated to src/api/, which is browser code that calls this proxy.

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const PROXY_PREFIX = '/api/tmdb';

// vercel.json rewrites /api/tmdb/<path> to /api/tmdb?tmdb_path=<path>, because
// Vercel does not support catch-all function filenames outside Next.js.
export const PATH_PARAM = 'tmdb_path';

// One entry per TMDB endpoint the app calls (see src/api/movies.ts). This is
// what stops the proxy being a general-purpose public TMDB mirror. Adding an
// endpoint to the app means adding it here — a deliberate gate.
const ALLOWED_PATHS: readonly RegExp[] = [
  /^\/genre\/movie\/list$/,
  /^\/watch\/providers\/regions$/,
  /^\/watch\/providers\/movie$/,
  /^\/discover\/movie$/,
  /^\/search\/movie$/,
  /^\/movie\/\d+$/,
];

export interface ProxyEnv {
  TMDB_TOKEN?: string;
  VERCEL_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
}

export async function handleTmdbProxy(request: Request, env: ProxyEnv): Promise<Response> {
  if (!isAllowedOrigin(request, env)) {
    return rejection(403, 'origin_not_allowed');
  }

  const url = new URL(request.url);
  const tmdbPath = extractTmdbPath(url);
  if (tmdbPath === null || !ALLOWED_PATHS.some((pattern) => pattern.test(tmdbPath))) {
    return rejection(404, 'path_not_allowed');
  }

  const upstreamUrl = new URL(TMDB_BASE_URL + tmdbPath);
  for (const [key, value] of url.searchParams) {
    if (key !== PATH_PARAM) upstreamUrl.searchParams.append(key, value);
  }

  const upstream = await fetch(upstreamUrl, {
    headers: {
      Authorization: `Bearer ${env.TMDB_TOKEN}`,
      accept: 'application/json',
    },
  });

  // Status and body pass through untouched. The client's 401 message, 404
  // not-found page, retry policy, and TmdbError all read TMDB's own response;
  // wrapping it in a proxy envelope would break every one of them silently.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
    },
  });
}

// Built on Sec-Fetch-Site, not Origin: browsers send no Origin header on
// same-origin GETs, which is every request this app makes, so an Origin check
// would reject all legitimate traffic. Sec-Fetch-Site is a forbidden header
// name, so page scripts cannot forge it. Non-browser clients can — see the
// spec's accepted risks.
function isAllowedOrigin(request: Request, env: ProxyEnv): boolean {
  if (request.headers.get('sec-fetch-site') === 'same-origin') return true;

  // Fallback for browsers that omit Sec-Fetch-Site.
  const referer = request.headers.get('referer');
  if (!referer) return false;

  let refererUrl: URL;
  try {
    refererUrl = new URL(referer);
  } catch {
    return false;
  }

  if (refererUrl.protocol === 'http:' && refererUrl.hostname === 'localhost') return true;

  // Vercel supplies both as bare hostnames: the stable production domain, and
  // the current deployment (which covers preview URLs).
  const allowedOrigins = [env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_URL]
    .filter((host): host is string => Boolean(host))
    .map((host) => `https://${host}`);

  return allowedOrigins.includes(refererUrl.origin);
}

// Accepts both /api/tmdb/movie/550 and the rewritten /api/tmdb?tmdb_path=movie/550.
// Which one the function sees depends on how Vercel presents a rewritten
// request; handling both keeps that platform detail out of the security logic.
// Either way the result must still pass the anchored allowlist.
function extractTmdbPath(url: URL): string | null {
  if (url.pathname.startsWith(PROXY_PREFIX + '/')) {
    return url.pathname.slice(PROXY_PREFIX.length);
  }
  if (url.pathname === PROXY_PREFIX) {
    const rewritten = url.searchParams.get(PATH_PARAM);
    return rewritten ? '/' + rewritten : null;
  }
  return null;
}

// Shaped differently from TMDB's { status_code, status_message } on purpose, so
// "the proxy blocked this" is distinguishable from "TMDB said no".
function rejection(
  status: 403 | 404,
  error: 'origin_not_allowed' | 'path_not_allowed',
): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run server/tmdbProxy.test.ts`
Expected: PASS — 14 tests.

- [ ] **Step 5: Create the Vercel function entry point**

Create `api/tmdb.ts`:

```ts
// Vercel Edge function: the TMDB proxy's entry point. Server-side only.
// Unrelated to src/api/, which is browser code that calls this endpoint.
// The logic lives in server/tmdbProxy.ts so its tests can sit outside api/ —
// every file in this directory becomes a public endpoint.
import { handleTmdbProxy } from '../server/tmdbProxy';

export const config = { runtime: 'edge' };

export default function handler(request: Request): Promise<Response> {
  // Read each variable by name rather than passing process.env whole: the Edge
  // runtime exposes variables by name, not as an enumerable object.
  return handleTmdbProxy(request, {
    TMDB_TOKEN: process.env.TMDB_TOKEN,
    VERCEL_URL: process.env.VERCEL_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  });
}
```

- [ ] **Step 6: Type-check `api/` and `server/` as part of the build**

`tsconfig.app.json` only includes `src/`, so without this step the build never type-checks the proxy.

Create `tsconfig.server.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.server.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "module": "esnext",
    "types": ["node"],
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["api", "server"]
}
```

`DOM` supplies the Web-standard `Request`/`Response`/`fetch` types the Edge runtime implements; `node` supplies `process.env`.

Replace `tsconfig.json` with:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.server.json" }
  ]
}
```

- [ ] **Step 7: Verify types, lint, and the whole suite**

Run: `npx tsc -b`
Expected: no output, exit code 0.

Run: `npm run lint`
Expected: no errors.

Run: `npm test`
Expected at the time this task was implemented: `Test Files  16 passed (16)` and `Tests  104 passed (104)` — the original 90 plus 14 new. (The final whole-branch review's F1–F4 fixes later added 12 more test cases to these same files, bringing the repo's current total to 116 — see the note after Task 5.)

- [ ] **Step 8: Format and commit**

```bash
npx prettier --write server api tsconfig.json tsconfig.server.json
git add server api tsconfig.json tsconfig.server.json
git commit -m "feat: add a server-side TMDB proxy with an origin check and path allowlist"
```

---

### Task 2: Point the client at the proxy

The client change and the test-URL migration must land together: once the
client calls `/api/tmdb`, every MSW handler still matching
`https://api.themoviedb.org/3` stops matching, and MSW's
`onUnhandledRequest: 'error'` fails those tests.

**Files:**
- Modify: `src/api/client.ts`
- Modify: `src/api/client.test.ts:7-24` (first test replaced), plus handler URLs
- Modify (handler URLs only): `src/api/queries.test.tsx`, `src/api/useMovieList.test.tsx`, `src/App.test.tsx`, `src/app/Layout.test.tsx`, `src/features/browse/BrowsePage.test.tsx`, `src/features/search/SearchPage.test.tsx`, `src/features/movie/MovieDetailPage.test.tsx`
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: nothing from Task 1 at the code level. `/api/tmdb/<path>` is the URL contract Task 1's proxy serves.
- Produces: unchanged — `tmdbFetch<T>(path: string, params?: TmdbParams): Promise<T>`, `TmdbError`, `TmdbParams`. No caller changes.

- [ ] **Step 1: Replace the first client test with the security property**

In `src/api/client.test.ts`, replace the whole first test (`it('requests the TMDB base URL with a bearer token', …)`, lines 7–24) with:

```ts
  it('calls the same-origin proxy and sends no Authorization header', async () => {
    let seenUrl = '';
    let seenAuth: string | null | undefined;

    server.use(
      http.get('/api/tmdb/movie/550', ({ request }) => {
        seenUrl = request.url;
        seenAuth = request.headers.get('Authorization');
        return HttpResponse.json({ id: 550 });
      }),
    );

    const data = await tmdbFetch<{ id: number }>('/movie/550');

    expect(data).toEqual({ id: 550 });
    expect(seenUrl).toBe(`${window.location.origin}/api/tmdb/movie/550`);
    // The property this project exists for: the browser holds no token.
    expect(seenAuth).toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/api/client.test.ts -t "same-origin proxy"`
Expected: FAIL — the client still requests `https://api.themoviedb.org/3/movie/550`, which no handler matches.

- [ ] **Step 3: Change the client**

In `src/api/client.ts`, replace line 3:

```ts
const BASE_URL = 'https://api.themoviedb.org/3';
```

with:

```ts
// The same-origin proxy (api/tmdb.ts, server-side) adds the TMDB token. The
// browser never holds it, so nothing here sends an Authorization header.
// Despite the similar name, this file is browser code, unrelated to the root
// api/ directory.
const BASE_URL = '/api/tmdb';
```

Replace:

```ts
  const url = new URL(BASE_URL + path);
```

with:

```ts
  // BASE_URL is relative, and new URL() rejects a relative URL without a base.
  const url = new URL(BASE_URL + path, window.location.origin);
```

Replace:

```ts
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_TMDB_TOKEN}`,
      accept: 'application/json',
    },
  });
```

with:

```ts
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
  });
```

- [ ] **Step 4: Migrate every MSW handler URL**

Run:

```bash
sed -i '' 's#https://api\.themoviedb\.org/3#/api/tmdb#g' \
  src/api/client.test.ts \
  src/api/queries.test.tsx \
  src/api/useMovieList.test.tsx \
  src/App.test.tsx \
  src/app/Layout.test.tsx \
  src/features/browse/BrowsePage.test.tsx \
  src/features/search/SearchPage.test.tsx \
  src/features/movie/MovieDetailPage.test.tsx
```

(`sed -i ''` is the macOS form. On Linux use `sed -i`.)

Then run: `grep -rn "api.themoviedb.org" src`
Expected: no output. The TMDB host now appears only in `server/`.

MSW resolves relative handler paths like `/api/tmdb/movie/550` against the
jsdom origin, so they match the client's absolute request URLs. This was
verified while writing the plan.

- [ ] **Step 5: Remove the test token from the Vite config**

In `vite.config.ts`, delete these lines from the `test` block:

```ts
    env: {
      VITE_TMDB_TOKEN: 'test-token',
    },
```

The `test` block becomes:

```ts
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
```

- [ ] **Step 6: Verify**

Run: `npm test`
Expected at the time this task was implemented: `Tests  104 passed (104)`. No assertions other than the replaced first test changed. (Current total: 116 — see the note after Task 5.)

Run: `grep -rn "VITE_TMDB_TOKEN\|import.meta.env\|Bearer" src/api vite.config.ts`
Expected: no output. The browser-side API code no longer reads any token or builds any auth header. (`src/components/ErrorState*` still name `VITE_TMDB_TOKEN`; Task 3 fixes that.)

Run: `npx tsc -b && npm run lint`
Expected: no errors.

- [ ] **Step 7: Format and commit**

```bash
npx prettier --write src vite.config.ts
git add src vite.config.ts
git commit -m "feat: call TMDB through the same-origin proxy and stop sending a token"
```

---

### Task 3: Rename the token and rewrite the operator-facing copy

**Files:**
- Modify: `src/components/ErrorState.tsx:9-22`
- Modify: `src/components/ErrorState.test.tsx:7-14`
- Modify: `.env.example`
- Modify: `README.md`
- Modify (local only, never committed): `.env`

**Interfaces:**
- Consumes: `TmdbError` from `src/api/client.ts` (unchanged).
- Produces: nothing new. `ErrorState` keeps its props `{ error: unknown; onRetry: () => void }`.

- [ ] **Step 1: Write the failing test**

In `src/components/ErrorState.test.tsx`, replace the first test (`it('gives a setup-specific message for 401', …)`) with:

```tsx
  it('tells a visitor the server is misconfigured on 401, and tells the operator where the token lives', () => {
    render(
      <ErrorState error={new TmdbError(401, 'Invalid API key.')} onRetry={vi.fn()} />,
    );

    // A visitor cannot fix a 401, so the message must not imply they can.
    expect(screen.getByText(/isn't something you can fix/i)).toBeInTheDocument();
    // The operator is pointed at the Vercel variable, not a local file.
    expect(screen.getByText(/TMDB_TOKEN/)).toBeInTheDocument();
    expect(screen.getByText(/Vercel/)).toBeInTheDocument();
    expect(screen.queryByText(/\.env/)).not.toBeInTheDocument();
    expect(screen.queryByText(/VITE_/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/ErrorState.test.tsx`
Expected: FAIL — `Unable to find an element with the text: /isn't something you can fix/i`.

- [ ] **Step 3: Rewrite the 401 message**

In `src/components/ErrorState.tsx`, replace the 401 block (the comment and the `if` statement, lines 9–22) with:

```tsx
  // A 401 means the server's TMDB token is missing or wrong. A visitor can do
  // nothing about that, so say so plainly, and tell the operator where the
  // token lives.
  if (error instanceof TmdbError && error.status === 401) {
    return (
      <div className="py-16 text-center">
        <p className="text-neutral-300">
          Movie data is unavailable because this site is misconfigured. This isn't
          something you can fix from here.
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          Site owner: set <code className="text-neutral-300">TMDB_TOKEN</code> in the
          Vercel project's environment variables, then redeploy.
        </p>
      </div>
    );
  }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/ErrorState.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Update `.env.example`**

Replace the whole file with:

```
# TMDB API Read Access Token — https://www.themoviedb.org/settings/api
# Read only by the server-side proxy (api/tmdb.ts); never sent to the browser.
# No VITE_ prefix on purpose: Vite inlines VITE_* variables into the client bundle.
# In production, set this in the Vercel project's environment variables
# (Production and Preview) instead of a file.
TMDB_TOKEN=
```

- [ ] **Step 6: Rename the variable in the local `.env`**

`.env` is gitignored and holds the real token. Rename the variable without printing its value:

```bash
sed -i '' 's/^VITE_TMDB_TOKEN=/TMDB_TOKEN=/' .env
sed -E 's/=.*/=<hidden>/' .env
```

Expected output of the second command includes the line `TMDB_TOKEN=<hidden>` and no `VITE_TMDB_TOKEN` line.

Never `git add .env`. Confirm with `git status --short` — `.env` must not appear.

- [ ] **Step 7: Update the README**

Replace `README.md` with the following. Keep the owner's one-line description exactly as written.

````markdown
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
````

- [ ] **Step 8: Verify**

Run: `grep -rn "VITE_TMDB_TOKEN" --exclude-dir=node_modules --exclude-dir=docs --exclude-dir=dist --exclude-dir=.git . ; echo "exit $?"`
Expected: no matching lines, then `exit 1` (grep found nothing). The `docs/` specs and plans keep the old name as history.

Run: `npm test && npx tsc -b && npm run lint`
Expected at the time this task was implemented: `Tests  104 passed (104)`, no type or lint errors. (Current total: 116 — see the note after Task 5.)

- [ ] **Step 9: Format and commit**

```bash
npx prettier --write src/components README.md
git add src/components .env.example README.md
git status --short   # .env must not be listed as staged
git commit -m "feat: rename the token to TMDB_TOKEN and address the 401 message to the operator"
```

---

### Task 4: Vercel routing

**Files:**
- Create: `vercel.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `PATH_PARAM = 'tmdb_path'` from `server/tmdbProxy.ts` (Task 1). The rewrite's query parameter name must match it exactly.
- Produces: the public URL contract — `/api/tmdb/<tmdb path>` reaches the function; every other non-`/api/` path serves `index.html`.

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    { "source": "/api/tmdb/:path*", "destination": "/api/tmdb?tmdb_path=:path*" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

How Vercel applies this:
- Real files win first: built assets and the function at `/api/tmdb` are served directly, before any rewrite.
- Rule 1 sends `/api/tmdb/movie/550?…` to the function. The original query string is kept, and `tmdb_path=movie/550` is added.
- Rule 2 serves `index.html` for client-side routes such as `/browse` and `/movie/550`, so deep links and refreshes work. Vercel's Vite preset does not do this on its own. The rule skips `/api/`, so an unknown `/api/…` path returns 404 instead of the app.

- [ ] **Step 2: Ignore the Vercel CLI's link folder**

`npx vercel link` (Task 5) creates `.vercel/`, which holds project IDs and should not be committed. Append to `.gitignore`:

```
# Vercel CLI project link
.vercel
```

- [ ] **Step 3: Verify the config parses and the parameter name matches**

Run: `node -e "const c = JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log(c.rewrites.length, 'rewrites')"`
Expected: `2 rewrites`

Run: `grep -c "tmdb_path" vercel.json server/tmdbProxy.ts`
Expected: `vercel.json:1` and a non-zero count for `server/tmdbProxy.ts`.

Routing can only be exercised by Vercel itself. Task 5 does that locally and on real deployments.

- [ ] **Step 4: Format and commit**

```bash
npx prettier --write vercel.json
git add vercel.json .gitignore
git commit -m "feat: route /api/tmdb through the proxy and serve index.html for client routes"
```

---

### Task 5: Deploy and verify against real Vercel

Unit tests construct their own headers, so they pass even when the origin check
is wrong for real browsers. The check fails closed, which means a mistake would
block every visitor while every test still passes. The spec therefore requires
this manual verification against a real deployment.

**Files:** none. If a check fails, fix the cause in the relevant earlier task's files with a new commit, then repeat the check.

**Interfaces:**
- Consumes: everything above, plus the GitHub repo `jessehoegen/HoegenMoviesCatalog` (private, `main` is the deploy branch).

- [ ] **Step 1: 👤 USER — set up the Vercel project and token**

1. At https://vercel.com/new, sign in with GitHub and import `HoegenMoviesCatalog`. Skip this if you've already imported it. Vercel detects Vite, so leave the build settings at their defaults.
2. In the project, open **Settings → Environment Variables**:
   - Add `TMDB_TOKEN` with your token, and tick **Production** and **Preview**.
   - If a `VITE_TMDB_TOKEN` variable exists there, delete it.

- [ ] **Step 2: 👤 USER — link the CLI**

In the project folder, run:

```bash
npx vercel login
npx vercel link
```

When `vercel link` asks, choose the **existing** project from Step 1. Don't create a new one.

- [ ] **Step 3: Verify locally with `vercel dev`**

👤 USER: start the dev server with `npx vercel dev` and leave it running. It serves on `http://localhost:3000` unless it prints a different port.

In a second terminal, run:

```bash
# No browser headers at all, like a script would send: blocked by the origin check.
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/tmdb/movie/550
# Expected: 403

# Browser-like header, but a path outside the allowlist: blocked by the allowlist.
curl -s -H "Sec-Fetch-Site: same-origin" http://localhost:3000/api/tmdb/account
# Expected: {"error":"path_not_allowed"}

# Browser-like header and an allowlisted path: forwarded to TMDB.
curl -s -H "Sec-Fetch-Site: same-origin" \
  "http://localhost:3000/api/tmdb/movie/550?append_to_response=watch/providers" | head -c 120; echo
# Expected: JSON starting with TMDB movie data (contains "id":550)
```

👤 USER: open `http://localhost:3000` in a browser.
- The browse grid loads.
- In DevTools → Network, the `discover/movie` requests go to `/api/tmdb/…`, return `200`, and carry **no** `Authorization` request header.
- Search works, and opening a movie shows its detail page.

- [ ] **Step 4: Verify the token is not in the production bundle**

```bash
npm run build
token=$(sed -n 's/^TMDB_TOKEN=//p' .env | tr -d "\"'")
suffix=${token: -24}
if [ -z "$suffix" ]; then echo "TMDB_TOKEN is empty in .env — cannot check";
elif grep -rqF "$suffix" dist; then echo "LEAK: token found in dist/";
else echo "clean: token not in dist/"; fi
```

TMDB read tokens are JWTs, whose first 24 characters are the shared JWT
header — identical for every TMDB token, so matching on a prefix could pass
or fail regardless of which token is actually in `dist/`. The last 24
characters are unique to this token, so a match there is a real leak.

Expected: `clean: token not in dist/`

- [ ] **Step 5: Verify a preview deployment**

Push the working branch: `git push -u origin HEAD`. In the Vercel dashboard, open the new preview deployment once it's ready.

👤 USER, in the browser on the preview URL:
- The browse grid loads, which proves `Sec-Fetch-Site` works on real Vercel.
- Filters, search, and a movie detail page work.
- Load `/movie/550?region=NL` directly and refresh the page. The detail page renders, which proves the SPA rewrite works.

Skip curl checks against preview URLs. Vercel puts preview deployments behind a login by default, so curl would only reach Vercel's login page. Step 7 runs the curl checks against production.

- [ ] **Step 6: Merge to `main`**

Use superpowers:finishing-a-development-branch to merge the branch into `main` and push. Vercel then deploys to production.

- [ ] **Step 7: Verify production**

Replace `<prod>` below with the production domain Vercel shows, e.g. `hoegen-movies-catalog.vercel.app`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<prod>/api/tmdb/movie/550
# Expected: 403

curl -s -H "Sec-Fetch-Site: same-origin" https://<prod>/api/tmdb/account
# Expected: {"error":"path_not_allowed"}

curl -s -o /dev/null -w "%{http_code}\n" https://<prod>/api/unknown
# Expected: 404 (not the app's index.html)

curl -s -o /dev/null -w "%{http_code}\n" -H "Referer: https://<prod>/browse" https://<prod>/api/tmdb/movie/550
# Expected: 200

curl -s -o /dev/null -w "%{http_code}\n" -H "Referer: https://evil.example/" https://<prod>/api/tmdb/movie/550
# Expected: 403
```

The last two checks exercise the Referer fallback, which no browser check above reaches — modern browsers always send `Sec-Fetch-Site`. A 403 on the first of the two means Vercel's system environment variables
(`VERCEL_PROJECT_PRODUCTION_URL`) are not reaching the function — check
"Automatically expose System Environment Variables" in the project settings.

👤 USER: open `https://<prod>` and repeat Step 5's browser checks.

When every check passes, the project is done: the app is public and the token stays on the server.

---

### Note: final whole-branch review fixes (2026-09-12)

A review found four code issues, fixed in follow-up commits: a blank error
message when the proxy or platform rejects a request (F1, `src/api/client.ts`
and `src/api/types.ts`), the Referer fallback being reachable even when
`Sec-Fetch-Site` explicitly says `cross-site` (F2, `server/tmdbProxy.ts`), an
unhandled upstream `fetch` failure crashing the handler instead of returning
502 (F3, `server/tmdbProxy.ts`), and additional allowlist-bypass regression
tests (F4, `server/tmdbProxy.test.ts`). These added 12 test cases across
`src/api/client.test.ts` and `server/tmdbProxy.test.ts`, bringing the suite
from the 104 tests referenced earlier in this plan to **116**. Task 5's Step 4
and Step 7 above already reflect this review's other two fixes (the leak
check's last-24-characters comparison, and the Referer-fallback curl checks).
