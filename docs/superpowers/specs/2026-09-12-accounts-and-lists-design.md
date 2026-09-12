# Accounts and Lists — Design

**Date:** 2026-09-12
**Status:** Approved design, ready for implementation planning
**Builds on:** `2026-09-10-movie-catalog-design.md` and
`2026-09-12-deployment-and-tmdb-proxy-design.md` (its "Deferred to project A"
section recorded two decisions this spec keeps: email magic-link sign-in, and
wishlist and watched being mutually exclusive)

## Purpose

Let visitors create an account and keep three lists of movies: **favorites**,
a **wishlist**, and **watched**.

This is the first time the app stores anything about a person. Signups are
open to anyone who finds the site, so the security boundary is the database
itself: Supabase's row-level security (RLS) decides which rows a request may
touch, whoever sent it and however it was crafted. Getting those rules right,
and proving them with tests, is the core of this project.

## Scope

In scope:

- Email magic-link sign-in and sign-up through Supabase Auth.
- One database table for list entries, protected by RLS.
- Favorite / Wishlist / Watched buttons on the movie detail page.
- A **My lists** page with one tab per list.
- An **Account** page: your email, sign out, delete your account.
- A one-sentence privacy notice on the sign-in page.
- Tests at three layers: database rules in PGlite, UI through MSW, and manual
  checks against the real Supabase project.

Out of scope:

- Streaming availability on lists, and sharing lists with others.
- List buttons on the movie cards in the grid.
- Any other sign-in method (passwords, Google, GitHub).
- A custom domain and custom email sending. These are **launch prerequisites**
  (see the end of this spec), which are configuration, not code.
- A keep-alive job for Supabase's free-tier pausing.
- A cap on entries per user, CAPTCHA on signup, and paging on the lists page.
- The two parked v1 issues (back-link filter loss, inverted year-range
  display).

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Backend | Supabase (Postgres + Auth) | Settled before this spec. Auth, database, and RLS in one free tier |
| Sign-in | Email magic link, PKCE flow | Settled. PKCE keeps the one-time code out of anything but the requesting browser |
| Data access | Browser → Supabase directly; RLS is the gate | The standard Supabase design. No new server code, and the security lives in a few SQL policies that can be tested |
| Data model | One row per (user, movie); a single `status` column for wishlist/watched | The table enforces the mutual exclusivity by construction |
| Favorite | Independent of wishlist and watched | The user's choice. Each button does exactly one thing |
| Where the buttons live | Movie detail page only | Cards stay a single link (a button cannot sit inside a link) |
| Signed-out visitors | See the buttons; clicking one goes to sign-in | Visitors discover the feature. No "pending" action is remembered; after signing in they press the button again |
| Sign-in UI | A page (`/sign-in`), not a dialog | Has an address, works with Back, no focus trapping to build |
| Saving | Wait for the database to confirm, then show the new state | No rollback code, and the screen never shows an unsaved state |
| Account deletion | A `security definer` database function | Deletes only the caller, with no server secret anywhere |
| Email while building | Supabase's built-in email (team members only, 2 per hour) | Enough to build and test; custom email is a launch prerequisite |
| Testing the rules | PGlite (Postgres in-process) inside Vitest | Docker is not installed and this machine has 8 GB of RAM; a probe on 2026-09-12 confirmed PGlite enforces Supabase-style RLS |
| Free-tier pausing | Accepted | Data is kept; resuming is one click; browsing keeps working while paused |

Settled decisions from earlier projects still hold: the URL query string is the
single source of truth for page state, `region` is in the URL on every route
(the new ones included), and streaming availability means subscription
(`flatrate`) only.

## Architecture

```
Browser ──► /api/tmdb/*  (Vercel Edge proxy, unchanged) ──► TMDB
   │
   └──────► Supabase: Auth (magic link, sessions)
                      Postgres REST (movie_entries, delete_my_account)
                      └─ RLS: every row belongs to auth.uid()
```

The two paths are independent. TMDB data does not touch Supabase and Supabase
data does not touch the proxy, so either can fail without taking the other
down.

### File layout

```
supabase/
  migrations/20260912000000_accounts_and_lists.sql   the schema, policies, grants, function
  tests/authStub.sql            test-only stand-in for Supabase's auth schema and roles
  tests/movieEntries.test.ts    database-rule tests (PGlite)
src/
  lib/supabase.ts               the single Supabase client
  features/auth/
    AuthProvider.tsx            session state for the whole app
    useSession.ts               { status, user } hook
    safeNext.ts                 validates the ?next= return path
    SignInPage.tsx              /sign-in
    AuthCallbackPage.tsx        /auth/callback
  features/account/
    AccountPage.tsx             /account
  features/lists/
    api.ts                      Supabase reads and writes for movie_entries
    queries.ts                  TanStack Query hooks around api.ts
    toggle.ts                   pure button logic: current entry + action → next entry
    ListButtons.tsx             the three buttons on the detail page
    ListsPage.tsx               /lists
```

Tests sit next to the files they test, as they do today. `supabase/tests/` is
type-checked and linted the same way `server/` is (through a `tsconfig`
reference), so `npm run build` and `npm run lint` cover it.

Existing files that change: `App.tsx` (four routes), `Layout.tsx` (header
links), `MovieDetailPage.tsx` (renders `ListButtons`), `main.tsx` (wraps the
app in `AuthProvider`), `src/test/utils.tsx` (an `auth` option), the Vitest
config (test environment variables), `.env.example`, and `README.md`.

### The Supabase client

`src/lib/supabase.ts` creates one client:

```ts
createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
  },
});
```

- **These two variables are public on purpose,** so the `VITE_` prefix is
  correct. This is the opposite of the TMDB token, and the difference is worth
  stating: the TMDB token *was* the protection, so it had to stay on the
  server. Supabase's publishable key only says which project a request is for.
  Protection comes from RLS. (The dashboard calls it the *publishable* key;
  older projects call it the *anon* key. Either value works.)
- **`detectSessionInUrl: false`** because `/auth/callback` exchanges the code
  itself. With automatic detection the client would do the exchange on its own
  as the app starts, racing the callback page and leaving it no way to show a
  failure.
- **If either variable is missing,** browsing and search must still work. The
  sign-in page shows an operator-facing message naming both variables, the
  same pattern as the proxy's 401 message for `TMDB_TOKEN`. Nothing may throw
  at import time.

## Data model

One migration file holds everything the database needs:

```sql
create table public.movie_entries (
  user_id      uuid        not null default auth.uid()
                           references auth.users (id) on delete cascade,
  movie_id     integer     not null check (movie_id > 0),
  is_favorite  boolean     not null default false,
  status       text        check (status in ('wishlist', 'watched')),  -- null = neither
  title        text        not null check (char_length(title) between 1 and 500),
  poster_path  text        check (char_length(poster_path) <= 200),
  release_date text        check (char_length(release_date) <= 10),
  vote_average real        check (vote_average between 0 and 10),
  updated_at   timestamptz not null default now(),
  primary key (user_id, movie_id),
  constraint entry_not_empty check (is_favorite or status is not null)
);

-- Keeps updated_at honest without trusting the client's clock.
create function public.touch_updated_at() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger movie_entries_touch_updated_at
  before update on public.movie_entries
  for each row execute function public.touch_updated_at();

alter table public.movie_entries enable row level security;

-- Grants are explicit. Supabase projects created after 30 May 2026 grant the
-- API roles nothing on new tables by default (existing projects follow on
-- 30 October 2026); older projects granted everything. Stating the grants
-- makes this file correct under both.
revoke all on public.movie_entries from anon;
grant select, insert, update, delete on public.movie_entries to authenticated;

-- (select auth.uid()) rather than auth.uid(): Postgres evaluates it once per
-- query instead of once per row. Supabase's own performance guidance.
create policy "Read own entries" on public.movie_entries
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Add own entries" on public.movie_entries
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Change own entries" on public.movie_entries
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own entries" on public.movie_entries
  for delete to authenticated using ((select auth.uid()) = user_id);

create function public.delete_my_account() returns void
  language sql security definer set search_path = '' as $$
  delete from auth.users where id = auth.uid();
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
```

Why it is shaped this way:

- **Mutual exclusivity is structural.** `status` holds one value, so a movie
  cannot be on the wishlist and watched at once, whatever the client sends.
  Marking a wishlisted movie watched is a single update to `status`.
- **Empty entries are forbidden.** When the last flag is cleared, the client
  deletes the row. The `entry_not_empty` check turns a client bug that would
  leave an empty row into a visible error.
- **Title, poster, date and rating are copied in** when a button is pressed,
  so the lists page renders from one query instead of one TMDB request per
  movie. Every save refreshes the copy. TMDB's empty-string `release_date` is
  stored as `null`.
- **The size checks** stop one row from being inflated to megabytes.
- **`user_id` is sent explicitly** by the client on insert, even though it
  defaults to `auth.uid()`. The code then says whose row it is, and the insert
  policy guarantees it is the caller's own.
- **`delete_my_account`** runs with its owner's rights (`security definer`),
  which is what lets it delete from `auth.users`. It takes no arguments and
  uses only `auth.uid()`, so it cannot be pointed at another account.
  `set search_path = ''` blocks the known trick of hijacking a definer
  function through a look-alike object in another schema. The foreign key's
  `on delete cascade` removes the user's entries in the same statement.
- **The primary key `(user_id, movie_id)`** also serves as the index for
  "all of my entries", so no extra index is needed.

## Sign-in

1. **Starting points.** Signed out, the header shows **Sign in**, linking to
   `/sign-in?next=<current path and query>`. On a detail page, the three list
   buttons are also links to the same place.
2. **The form.** An email field and a send button. Sending calls
   `signInWithOtp({ email, options: { emailRedirectTo } })` with
   `emailRedirectTo = <origin>/auth/callback?next=<next>`. The page then shows
   "Check your email", with the address and a way to use a different one.
   Sign-up uses the same form: an unknown address creates an account.
3. **Privacy notice.** Under the form: "We store your email address and your
   lists. You can delete your account at any time."
4. **The callback.** `/auth/callback` reads `code` from the query string and
   calls `exchangeCodeForSession(code)`. On success it navigates, replacing the
   history entry, to `safeNext(next)`.
   - The exchange must run **exactly once per page load**. The app renders in
     React StrictMode, which runs effects twice in development, and the code
     is single-use, so a second call would fail and show an error after a
     successful sign-in.
   - Supabase can also redirect with `error`, `error_code`, and
     `error_description` in the query string (an expired link, for example).
     The page checks for those before looking for `code`.
5. **`safeNext(raw)`** returns `raw` only if it is a path on this site: it
   starts with a single `/`, and not `//` or `/\`. Anything else, including a
   missing value, becomes `/browse`. Without this check, a crafted sign-in
   link could send someone to another website after they sign in (an "open
   redirect").
6. **Session state.** `AuthProvider` calls `getSession()` on mount, subscribes
   to `onAuthStateChange`, and provides
   `{ status: 'loading' | 'signed-in' | 'signed-out', user }`. Supabase stores
   the session in the browser and refreshes it automatically.
7. **Header.** While loading, the account slot renders nothing, so it doesn't
   flash "Sign in" at a signed-in user. Signed in, it shows **My lists** and
   **Account**. On `/sign-in` and `/auth/callback` the **Sign in** link is
   hidden, because it would point at the page you're already on and replace
   its `next` with the sign-in page itself.
8. **Protected pages.** `/lists` and `/account` redirect a signed-out visitor
   to `/sign-in?next=…` and show a placeholder while loading.

**Sign-out** (Account page) calls `signOut()`, then removes every `['lists', …]`
query from the cache, so the next person on a shared computer sees nothing of
the previous user's lists. Then it goes to `/browse`.

**Account deletion** (Account page): **Delete account** reveals a confirmation,
"This permanently deletes your account and all your lists", with **Delete my
account** and **Cancel**. Confirming calls `rpc('delete_my_account')`, then
`signOut({ scope: 'local' })` (the server-side user is already gone; this
clears the browser), then clears the lists cache. The page then shows "Your
account has been deleted" with a link to the catalog.

## Lists

### The buttons

`ListButtons` sits under the year/runtime/rating line on the detail page:
**♥ Favorite**, **Wishlist**, **Watched**.

- They are toggle buttons with `aria-pressed`, so assistive technology
  announces them as pressed or not pressed.
- The logic is a pure function in `toggle.ts`:

  | Action | Effect |
  |---|---|
  | Favorite | flip `is_favorite` |
  | Wishlist | `status` becomes `'wishlist'`, or `null` if it already was |
  | Watched | `status` becomes `'watched'`, or `null` if it already was |

  If the result has `is_favorite = false` and `status = null`, the entry is
  deleted. Otherwise it is upserted with the movie's current title, poster,
  date and rating.
- While a save is in flight, all three buttons are disabled. The new state
  appears when the database confirms it.
- Signed out, they are links to `/sign-in?next=…` styled like the buttons.

### The My lists page

`/lists?tab=wishlist&region=NL`

- Tabs: **Wishlist** (default), **Watched**, **Favorites**, each with a count.
  A missing or unknown `tab` means Wishlist.
- One query loads all of the user's entries, newest `updated_at` first; the
  page splits them into tabs itself, which also gives the counts.
- The grid reuses `MovieGrid` and `MovieCard`, fed by mapping each entry to
  the `TmdbMovieSummary` shape the card already takes. Cards link to
  `/movie/:id` with the current region.
- An empty tab shows `EmptyState`, for example "Nothing on your wishlist yet",
  with a link to browse.

### Queries and cache

- `useMovieEntry(movieId)`: key `['lists', userId, 'entry', movieId]`, enabled
  only when signed in.
- `useMyEntries()`: key `['lists', userId, 'all']`, enabled only when signed
  in.
- A successful save invalidates everything under `['lists', userId]`.
- The user id is part of every key, so a different account can never be
  served the previous one's cached data.
- **Retry rule.** The app's `shouldRetry` only recognises `TmdbError`, so it
  would retry Supabase failures blindly. The list hooks use their own rule:
  retry (at most twice) on a network failure or a 5xx; never on a 4xx. A 4xx
  here is a refusal (an RLS denial or a failed check), and repeating it cannot
  succeed.

## Error handling

| Situation | What the user sees |
|---|---|
| Supabase unreachable or project paused, on a detail page | The movie still renders. The buttons area shows "Couldn't load your lists" with **Retry** |
| A save fails | "Couldn't save. Try again." beside the buttons. Nothing to undo, because the unsaved state was never shown |
| The lists page fails to load | The existing `ErrorState` with **Retry** |
| `over_email_send_rate_limit` | "Too many sign-in emails. Wait a few minutes and try again." (Common in development: the built-in email allows 2 per hour) |
| `email_address_invalid` | "That email address can't be used." |
| Any other send failure | "Couldn't send the sign-in email. Try again." |
| `otp_expired`, or an `error` in the callback query | "This sign-in link has expired." and **Send a new link** |
| `bad_code_verifier` or `flow_state_not_found` | "Open the sign-in link in the same browser where you asked for it." and **Send a new link** |
| Callback reached with no `code` and no `error` | Same as expired |
| Session can no longer be refreshed (expired, or the account was deleted on another device) | Supabase reports the user signed out; list queries stop and the buttons become sign-in links. Until that refresh (up to about an hour after a deletion elsewhere), reads return no rows and saves fail with "Couldn't save", because the user no longer exists |
| Supabase variables missing | The sign-in page shows an operator-facing message naming `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; browsing is unaffected |

**Send a new link** goes to `/sign-in` with the same `next`.

## Configuration

- **Environment variables:** `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env` and in `.env.example` (as empty
  placeholders with a comment explaining they are public by design). In
  Vercel, set both for **Production and Preview, with no custom preview
  branch**. On 2026-09-12 a branch-scoped variable silently left Production
  without `TMDB_TOKEN`, and Vercel refuses to combine a branch with
  Production anyway.
- **Supabase → Authentication → URL Configuration:**
  - Site URL: `https://hoegen-movies-catalog.vercel.app`
  - Redirect URLs, each ending in `/**` so the callback path and its `?next=`
    are allowed:
    - `https://hoegen-movies-catalog.vercel.app/**` (production)
    - `http://localhost:3000/**` (`vercel dev`)
    - `https://hoegen-movies-catalog-*-<team-slug>.vercel.app/**` (previews).
      The team slug is the last part of any preview URL in the Vercel
      dashboard. Including it matters: only this Vercel team can create
      addresses ending in it, so a stranger's deployment can't match.
  - If a sign-in link lands on the Site URL instead of `/auth/callback`, the
    redirect URL was not on this list. Supabase falls back silently.
- **Schema:** paste the migration into Supabase's SQL editor and run it once.
  No Supabase CLI or Docker is needed.
- **README:** the two variables, the Supabase setup above, and the note that
  magic links only reach team members until the launch prerequisites are done.

## Testing

### Layer 1: database rules (PGlite, part of `npm test`)

`supabase/tests/movieEntries.test.ts` runs in Vitest's `node` environment.
Each test gets a fresh in-memory PGlite database, loads `authStub.sql`, then
the real migration file.

`authStub.sql` provides only what the migration needs from Supabase:
the `auth` schema, an `auth.users` table, Supabase's own definition of
`auth.uid()` (it reads the `sub` claim from the `request.jwt.claims` setting),
and the `anon` and `authenticated` roles. It also applies the **old,
permissive default grants** (every table privilege to `anon` and
`authenticated`) before the migration runs. That is the worst case the
migration must survive, and it keeps the two layers separately testable.

A helper switches identity the way Supabase does: it sets
`request.jwt.claims` and runs `set role authenticated` (or `anon`). PGlite's
default connection is a superuser, which bypasses RLS, so no assertion may run
without switching role first.

Cases:

1. A reads only their own rows.
2. A's update aimed at B's row changes 0 rows.
3. A's delete aimed at B's row removes 0 rows.
4. A cannot insert a row owned by B.
5. A cannot hand their own row over to B.
6. A can insert their own row, with `user_id` explicit.
7. `status` rejects any value except `wishlist` and `watched`.
8. An entry with no favorite and no status is rejected.
9. An oversized title or poster path is rejected.
10. After the migration, `anon` has no privileges on the table (the grant
    layer).
11. With privileges re-granted to `anon` inside the test, `anon` still reads no
    rows and cannot insert (the RLS layer on its own).
12. `delete_my_account` run as A removes A and A's entries and leaves B's
    untouched.
13. `anon` cannot execute `delete_my_account`.
14. An update advances `updated_at`.
15. Control: as superuser, all rows are visible, proving the filtering in
    cases 1–3 came from RLS and not from missing data.

### Layer 2: components and hooks (MSW, as today)

- The Vitest config sets `VITE_SUPABASE_URL=https://test.supabase.co` and a
  dummy key, so MSW can intercept Supabase's REST and Auth endpoints the same
  way it intercepts `/api/tmdb`. The real Supabase client builds the requests,
  so tests assert on what is actually sent.
- `renderWithProviders` gains an `auth` option that provides a fixed session
  state (`signedIn(user)` or `signedOut`), so no test needs a real session.
- Pure functions get direct unit tests: `toggle.ts`, `safeNext.ts`, and the
  entry-to-card mapping.
- Component tests:
  - `ListButtons`: signed-out links carry `next`; each toggle sends the right
    request; Watched replaces Wishlist in one save; clearing the last flag
    sends a delete; buttons are disabled while saving; a save error shows the
    message; a load error leaves the movie visible.
  - `ListsPage`: tab from the URL, unknown tab → Wishlist, counts, empty tab,
    signed-out redirect.
  - `SignInPage`: `emailRedirectTo` carries `next`; the check-email state; the
    rate-limit and invalid-address messages; the missing-variables message.
  - `AuthCallbackPage`: success goes to a safe `next`; a hostile `next` goes to
    `/browse`; each error row in the table above; the exchange runs once.
  - `AccountPage`: sign-out clears the lists cache; deletion needs
    confirmation, calls the function, then shows the deleted message.
  - `Layout`: nothing while loading, **Sign in** when signed out, **My lists**
    and **Account** when signed in.

### Layer 3: manual checks against real Supabase

Run after deploying, like Task 5 of the previous plan:

1. Sign in on production with a magic link to your own (team member) address.
   You land on the page you started from.
2. Add movies to each list. `/lists` shows them in the right tabs; marking a
   wishlisted movie watched moves it.
3. In the dashboard, create a second user with **Add user** (no email is
   sent). In the SQL editor, run as that user (role `authenticated`,
   impersonating them) and select from `movie_entries`: 0 rows.
4. Call the REST endpoint with only the publishable key:
   `curl "$SUPABASE_URL/rest/v1/movie_entries?select=*" -H "apikey: $KEY"`.
   It returns a permission error or an empty list, never rows.
5. Delete your own account from the Account page last. Your rows are gone in
   the Table editor, and signing in again creates a fresh, empty account.

These cover what PGlite cannot: that the stand-in `auth.uid()` matches the real
one, and that the real project's grants and policies are what the migration
says.

## Accepted risks

- **Free-tier pausing.** After a week without enough database activity the
  project pauses. Sign-in and lists fail until it is resumed from the
  dashboard (data is kept; there is a one-year window). Browsing is
  unaffected.
- **No cap on entries per user.** A malicious account could fill the free
  tier's 500 MB database. The size checks keep each row small; a real cap
  needs a trigger or a quota and is deferred.
- **Copied movie details go stale.** A rating or poster refreshes only when
  the user changes that movie's lists.
- **Lists are cut off above 1,000 entries,** Supabase's per-request row limit.
- **A magic link works only in the browser that requested it.** The price of
  PKCE. The error message says what to do.
- **The test stand-in for `auth.uid()` could drift** from Supabase's. Layer 3
  catches that.
- **No CAPTCHA on signup.** Supabase supports one; it can be added later.

## Launch prerequisites

Before sharing the URL publicly or inviting others to sign up:

1. **Custom email.** Buy a domain (roughly €10–15 a year), verify it in Resend
   (free tier: 3,000 emails a month, 100 a day), enter Resend's SMTP settings
   in Supabase, and raise Supabase's email rate limit. Until then, magic links
   reach only members of the Supabase project's team, at most 2 per hour.
2. **Security review of the deployed surface.** Deferred from the previous
   project; user data makes it more pressing.

Neither changes the app's code.
