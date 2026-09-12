# Deployment and TMDB Proxy — Design

**Date:** 2026-09-12
**Status:** Approved design, ready for implementation planning
**Supersedes:** the "Accepted risks" section of `2026-09-10-movie-catalog-design.md` regarding the publicly-readable API token

> **Amendment (2026-09-12, during implementation planning).** Vercel does not
> support catch-all function filenames (`[...path].ts`) outside Next.js, so the
> proxy cannot live at `api/tmdb/[...path].ts` as described below. It is instead
> a single function at `api/tmdb.ts`, reached through a `vercel.json` rewrite of
> `/api/tmdb/:path*` to `/api/tmdb?tmdb_path=:path*`, with its logic in
> `server/tmdbProxy.ts` so the tests can sit outside `api/`, where every file
> becomes a public endpoint. Browser-facing URLs, the allowlist, the origin
> check, and every other decision below are unchanged. Details are in
> `docs/superpowers/plans/2026-09-12-deployment-and-tmdb-proxy.md`.

## Purpose

Deploy the movie catalog to a public URL, and move the TMDB API token out of
the client bundle and onto the server before doing so.

This is the first of two projects. The second — user accounts with favorites, a
wishlist, and a watched tag — is deliberately out of scope here and gets its own
spec.

## Why this project exists separately

The original spec accepted a publicly-readable API token as a reasonable
trade-off for a local learning project. Deploying publicly invalidates that
reasoning on three counts:

- The token is the owner's personal TMDB credential, and every visitor's
  requests would count against it.
- TMDB's scanners revoke tokens found in public bundles.
- There is no longer a single user who can be told to fix their own `.env`.

The original design anticipated this. `src/api/client.ts` was built as the sole
module knowing the base URL and auth header, specifically so a proxy could be
introduced as a contained change. This project collects on that.

## Scope

In scope:

- A serverless proxy function that holds the token and forwards TMDB requests.
- An origin check and a path allowlist on that proxy.
- Renaming the token so it can no longer reach the browser.
- A private GitHub repository and a Vercel project deploying from it.
- Updating the existing test suite to the new request URLs.

Out of scope:

- User accounts, authentication, and persisted lists. That is project A.
- Supabase. Nothing in this project needs it.
- Rate limiting backed by shared state. See Accepted risks.
- A custom domain.
- Fixing the two parked issues from the previous project (back-link filter loss,
  inverted year-range display).
- A security review of the deployed surface. Worth doing before sharing the URL
  widely, but it is a separate pass.

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Host | Vercel | First-class Vite support, serverless functions in the same repo, deploy on push |
| Proxy shape | One catch-all function with a path allowlist | The client already funnels all TMDB access through one module; a generic forwarder matches that shape |
| Proxy runtime | Vercel Edge | The work is a `fetch` forward; the Web-standard `Request`/`Response` signature is also directly unit-testable |
| Abuse defence | Origin check only | Honest protection. See Accepted risks for why in-memory rate limiting was rejected |
| Local dev | `vercel dev` | Runs Vite and the function together, so dev exercises the same code path as production |
| Repository | Private GitHub repo | Vercel deploys from private repos on the free tier |

## Architecture

### The proxy function

Location: **`api/tmdb/[...path].ts`** at the repository root.

Vercel serves functions from `/api` at the root. This sits confusingly close to
the existing `src/api/`, which is browser code. They are unrelated and both
files should carry a comment saying so.

```
Browser → /api/tmdb/discover/movie?… → Edge function → https://api.themoviedb.org/3/discover/movie?…
                                       (adds Authorization: Bearer)
```

The function runs on the Edge runtime with the Web-standard signature:

```ts
export const config = { runtime: 'edge' };
export default async function handler(request: Request): Promise<Response>
```

It performs four steps, in order:

**1. Origin check.** This must be built on `Sec-Fetch-Site`, **not** `Origin`.

Browsers do not send an `Origin` header on same-origin `GET` requests — and
every request this app makes is exactly that. A check that requires `Origin`
would reject 100% of legitimate traffic. This is the single easiest way to get
this function wrong, and it fails closed in production while passing any unit
test that constructs its own `Request`.

The check, in order:

- **`Sec-Fetch-Site: same-origin` → allow.** Modern browsers send this
  automatically on every fetch, and it is a forbidden header name, so page
  scripts cannot forge it.
- **Otherwise, if `Referer` is present**, its origin must match one of:
  - `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` — the stable production domain
  - `https://${process.env.VERCEL_URL}` — the current deployment, covering previews
  - `http://localhost:*` — local development
- **Otherwise `403`.**

The `Referer` branch exists for browsers that omit `Sec-Fetch-Site` and for
requests whose referrer policy strips detail; it is a fallback, not the primary
gate.

Because this logic fails closed and is invisible until deployed, the
implementation plan must include a manual check against the real deployment —
loading the app and confirming requests succeed — not only unit tests, which
construct their own headers and will happily pass against a broken rule.

**2. Path allowlist.** The forwarded path must match one of exactly six
patterns, corresponding to the endpoints the application uses:

| Pattern | Endpoint |
|---|---|
| `/genre/movie/list` | Genre filter options |
| `/watch/providers/regions` | Region picker |
| `/watch/providers/movie` | Providers in a region |
| `/discover/movie` | The catalog |
| `/search/movie` | Title search |
| `/movie/{digits}` | Detail page |

Anything else gets `404` without contacting TMDB. The allowlist is what stops
the proxy being a general-purpose public TMDB mirror; a bare pass-through would
be more useful to an abuser than to its owner. Adding an endpoint to the app
means adding it here — a deliberate gate, not an oversight.

**3. Forward.** The matched path and the original query string are sent to
`https://api.themoviedb.org/3` with `Authorization: Bearer ${process.env.TMDB_TOKEN}`.

**4. Return TMDB's response verbatim** — status code and body unchanged.

### Error passthrough is load-bearing

The client's behaviour depends on receiving TMDB's own status codes and body:

- `ErrorState` special-cases `401`.
- `MovieDetailPage` renders not-found on `404`.
- `shouldRetry` retries `429` and `5xx` but never other `4xx`.
- `TmdbError` reads `status_code` and `status_message` from the body.

If the proxy wraps errors in its own envelope, every one of those paths breaks
silently. It must not.

Proxy-originated rejections must be distinguishable from TMDB's own, so that a
developer can tell "my proxy blocked this" from "TMDB said no". They carry a
body of `{ "error": "origin_not_allowed" }` or `{ "error": "path_not_allowed" }`
— note the shape differs from TMDB's `status_code`/`status_message`, which is
what makes them distinguishable.

### Client changes

`src/api/client.ts`:

- `BASE_URL` becomes `/api/tmdb`. Same-origin, so no CORS handling is needed.
- **The `Authorization` header is removed entirely.** The browser has no token.

Nothing else in `src/` changes. `tmdbFetch`'s signature, `TmdbError`, the retry
policy, and every calling module are untouched.

## The token rename

`VITE_TMDB_TOKEN` becomes **`TMDB_TOKEN`**.

Vite inlines any `VITE_`-prefixed variable into the client bundle — that is the
prefix's entire meaning. Keeping the prefix would ship the token to the browser
exactly as it does today and the proxy would accomplish nothing. The unprefixed
name is readable only by the serverless function, via `process.env`.

The rename cascades:

| File | Change |
|---|---|
| `api/tmdb/[...path].ts` | Reads `process.env.TMDB_TOKEN` |
| `src/api/client.ts` | Stops reading any token; sends no auth header |
| `vite.config.ts` | The `test.env.VITE_TMDB_TOKEN` entry is removed |
| `.env.example` | Documents `TMDB_TOKEN`, and no longer warns that the value is publicly visible |
| `.env` | The variable inside it is renamed (the file keeps its name), so `vercel dev` can read it |
| `src/components/ErrorState.tsx` | The 401 message is rewritten — see below |

### The 401 message must change

It currently reads "Check `VITE_TMDB_TOKEN` in your `.env`". That was actionable
when the only user was the developer. On a public deployment a visitor seeing a
401 can do nothing about it — it means the *server* is misconfigured. The message
must say so without implying the visitor is at fault, and point the operator at
the Vercel environment variable rather than a local file.

## SPA routing

Client-side routes (`/browse`, `/movie/550`) must serve `index.html`, but the
rewrite must **not** capture `/api/*` or the proxy becomes unreachable.

```json
{
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

If Vercel's Vite preset already provides SPA fallback, verify that `/api/tmdb/…`
still resolves to the function before relying on it.

## Testing

### New tests for the proxy

The Edge signature is `Request → Response`, so the handler is callable directly
with a constructed `Request`. Four tests cover the logic that matters:

1. An allowlisted path forwards to TMDB with the bearer token attached, and the
   query string is preserved.
2. A non-allowlisted path returns `404` **and never calls TMDB** — assert the
   absence of the outbound request, not merely the status.
3. A disallowed origin returns `403`.
4. **A TMDB `401` comes back as a `401` with TMDB's body intact.** This is the
   regression guard for the error-passthrough requirement above.

### Changes to the existing suite

Every MSW handler currently matches `https://api.themoviedb.org/3/…` — **38
occurrences across 8 test files** (`client.test.ts`, `queries.test.tsx`,
`useMovieList.test.tsx`, `App.test.tsx`, `Layout.test.tsx`,
`BrowsePage.test.tsx`, `SearchPage.test.tsx`, `MovieDetailPage.test.tsx`). All
become `/api/tmdb/…`. The assertions themselves do not change. This is
mechanical but touches every test file that talks to the network, and is the
bulk of the diff.

MSW matches relative paths against the jsdom origin, so `/api/tmdb/movie/550`
works as a handler pattern without naming a host.

`src/api/client.test.ts`'s first test inverts: instead of asserting
`Bearer test-token`, it asserts the client sends **no** `Authorization` header
and requests `/api/tmdb`. This is a stronger test — it pins the security
property rather than an implementation detail.

All 90 existing tests must still pass.

## Deployment

1. A **private** GitHub repository, with `main` as the deploy branch.
2. A Vercel project linked to it, deploying on push to `main`.
3. `TMDB_TOKEN` set in Vercel's environment variables for **both** Production and
   Preview environments. Preview deployments hit the same proxy code and will
   401 without it.
4. `.env` remains gitignored and is never committed.

## Local development

`vercel dev` replaces `npm run dev` as the daily command: it runs Vite and the
serverless function together, so local development exercises the same code path
as production. This requires the Vercel CLI.

`npm run dev` alone will 404 on every TMDB request, because nothing serves
`/api/tmdb`. The README must say so, or the next person to clone this loses an
hour.

## Accepted risks

- **The proxy is an open relay within its allowlist.** The origin check rejects
  casual misuse, but `Origin` and `Referer` are trivially forged by a non-browser
  client. Someone determined can use the deployment's quota against the six
  allowlisted read-only endpoints. This is strictly better than the current state
  — the token itself is no longer extractable, and abuse is visible in Vercel's
  logs and revocable by changing the deployment — but it is not eliminated.
- **No per-IP rate limiting.** In-memory counters on serverless functions are
  security theatre: each instance has its own memory, cold starts reset it, and
  many instances run concurrently. Genuine limiting requires shared state
  (Upstash Redis has a free tier). Deferred deliberately rather than shipping
  something that looks like protection and is not. The proxy is one file, so
  adding it later is a contained change.
- **The token remains a personal TMDB credential.** Protecting it from
  extraction does not change whose account absorbs the traffic.

## Deferred to project A

User accounts, Supabase, favorites, wishlist, and the watched tag. Two decisions
already taken there, recorded so this project does not foreclose them:

- Authentication will be **email magic link** via Supabase.
- **Wishlist and watched are mutually exclusive** — marking a movie watched
  removes it from the wishlist.

Nothing in this project should make either harder.
