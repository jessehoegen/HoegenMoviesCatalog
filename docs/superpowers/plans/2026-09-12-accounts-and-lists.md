# Accounts and Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let visitors sign in with an email magic link and keep three movie lists (favorites, wishlist, watched), stored in Supabase and protected by row-level security.

**Architecture:** The browser talks to Supabase directly through one client (`src/lib/supabase.ts`). Supabase's publishable key is public by design; the security boundary is the database's RLS policies, which let each signed-in user touch only rows where `user_id = auth.uid()`. One table, `movie_entries`, holds one row per (user, movie); a single `status` column makes wishlist and watched mutually exclusive by construction. Account deletion is a `security definer` database function. The TMDB proxy is untouched.

**Tech Stack:** Supabase (Postgres, Auth, PostgREST) via `@supabase/supabase-js` 2.116, PGlite 0.5.8 for database-rule tests, React 19, React Router 7, TanStack Query 5, TypeScript (strict), Vitest 5, MSW 2.

**Spec:** `docs/superpowers/specs/2026-09-12-accounts-and-lists-design.md`

## Deviations from the spec

Found while planning, each verified with a throwaway probe on 2026-09-12
(supabase-js 2.116.0, PGlite 0.5.8 / Postgres 18.3, Vitest 5.0.0, jsdom,
MSW 2.15.0). The spec's amendment note records the same list.

1. **The migration revokes everything from both API roles, then grants four
   privileges.** Under Supabase's pre-May-2026 defaults, `authenticated` gets
   *every* table privilege, including `TRUNCATE`, which ignores RLS. The spec's
   SQL only revoked from `anon`. Probe: with the spec's SQL, `authenticated`
   held `TRUNCATE`, `REFERENCES` and `TRIGGER`; with the fix it holds exactly
   `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
2. **The Supabase client is created with `db: { retry: false }`.** supabase-js
   retries failed GET requests on its own: up to 3 retries on 503, 520 or a
   network failure, waiting 1 s, 2 s, then 4 s (a 7-second test in the probe).
   Retrying is TanStack Query's job in this app, so the built-in retries are
   off.
3. **The "never retry a 4xx" rule lives in the shared `shouldRetry`** in
   `src/lib/queryClient.ts`, which learns to recognise `ListsError`, instead
   of a separate rule per list hook. One retry policy in one place, and the
   test `QueryClient`'s `retry: false` keeps applying to list queries.
4. **The wrong-browser case is a client-side error.** When the PKCE code
   verifier is missing (link opened in another browser, or the code already
   used), supabase-js fails *without contacting Supabase*, with code
   `pkce_code_verifier_not_found`. That code and `bad_code_verifier` map to
   "open it in the same browser"; `flow_state_not_found` (a code older than
   5 minutes or already exchanged) and `otp_expired` map to "expired".
5. **Missing Supabase variables use a placeholder client.** `createClient`
   throws on an empty URL, which would blank the whole app at import time. The
   client is created with a placeholder URL instead, and an exported
   `isSupabaseConfigured` flag lets the sign-in page show the operator message.
6. **`AuthProvider` uses the `INITIAL_SESSION` event** that
   `onAuthStateChange` emits on subscribe, instead of a separate
   `getSession()` call. One source of session state.
7. **The lists page renders its own error message.** `ErrorState`'s text is
   TMDB-specific ("Could not reach TMDB"). `MovieGrid` gains one optional prop,
   `hideEndOfResults`, so a finished list doesn't end with "End of results."
8. **The account page guards itself.** After deletion it must show "Your
   account has been deleted" to a user who is by then signed out, which a
   generic signed-in guard would redirect away from. A small shared
   `SignInRedirect` component does the redirect for both pages.
9. **Database-rule tests build one base database per file and `clone()` it
   per test.** A fresh PGlite takes 3–5 s on this machine; a clone takes
   0.75 s.
10. **`supabase/` is type-checked through `tsconfig.server.json`**, whose
    `include` gains `"supabase"`.

## Global Constraints

Every task's requirements implicitly include this section.

- **Environment variable names are exactly `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.** Both are public by design. No Supabase `service_role` / secret key appears anywhere in this repository, in `.env`, or in Vercel.
- **Database names are exact:** table `public.movie_entries`; columns `user_id`, `movie_id`, `is_favorite`, `status`, `title`, `poster_path`, `release_date`, `vote_average`, `updated_at`; constraint `entry_not_empty`; functions `public.delete_my_account()` and `public.touch_updated_at()`.
- **`status` holds `'wishlist'`, `'watched'`, or `null`.** Never both, never another value.
- **Every list query key starts with `['lists', userId]`.** Sign-out and account deletion remove `['lists']` from the cache.
- **The URL is the single source of truth for page state,** and every internal link carries `region` via `withRegion` from `src/app/useRegion.ts`.
- **Tests never reach the network.** Supabase's test URL is `https://test.supabase.co` (set in `vite.config.ts`); MSW intercepts it. `onUnhandledRequest: 'error'` stays on.
- **Import rules:** `src/` never imports from `supabase/`, `server/`, or `api/`. Only `src/lib/supabase.ts` calls `createClient`. In application code, only `src/features/auth/authApi.ts` and `src/features/lists/api.ts` call methods on the client, plus `AuthProvider.tsx` for `onAuthStateChange`. Test files may call the client directly to set up a session.
- **TypeScript runs in `strict` mode.** No `any` in committed code.
- **Commit messages:** a subject line, a blank line, then the trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. The blank line matters: without it git folds the trailer into the subject (this happened in the previous project).
- **User-facing copy is exact.** Where a step quotes a string, use it verbatim; tests assert on it.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/20260912000000_accounts_and_lists.sql` | Create | Table, trigger, RLS policies, grants, `delete_my_account` |
| `supabase/tests/authStub.sql` | Create | Test-only stand-in for Supabase's `auth` schema, roles, and old default grants |
| `supabase/tests/movieEntries.test.ts` | Create | Database-rule tests in PGlite |
| `tsconfig.server.json` | Modify | Type-check `supabase/` |
| `src/lib/supabase.ts` | Create | The single Supabase client and `isSupabaseConfigured` |
| `src/features/auth/useSession.ts` | Create | `AuthState` type, `AuthContext`, `useSession()` |
| `src/features/auth/AuthProvider.tsx` | Create | Session state from `onAuthStateChange` |
| `src/features/auth/authApi.ts` | Create | Magic link, code exchange, sign-out, account deletion; maps Supabase errors |
| `src/features/auth/safeNext.ts` | Create | Validates the `?next=` return path |
| `src/features/auth/SignInPage.tsx` | Create | `/sign-in` |
| `src/features/auth/AuthCallbackPage.tsx` | Create | `/auth/callback` |
| `src/features/auth/signInPath.ts` | Create | Builds `/sign-in?next=…&region=…` |
| `src/features/auth/SignInRedirect.tsx` | Create | Sends a signed-out visitor to `/sign-in?next=<here>` |
| `src/features/lists/toggle.ts` | Create | Pure button logic |
| `src/features/lists/api.ts` | Create | `ListsError`, reads and writes for `movie_entries` |
| `src/features/lists/queries.ts` | Create | TanStack Query hooks and cache helpers |
| `src/features/lists/ListButtons.tsx` | Create | The three buttons on the detail page |
| `src/features/lists/ListsPage.tsx` | Create | `/lists` |
| `src/features/account/AccountPage.tsx` | Create | `/account` |
| `src/app/AccountNav.tsx` | Create | Header links: Sign in, or My lists + Account |
| `src/lib/queryClient.ts` | Modify | `shouldRetry` recognises `ListsError` |
| `src/components/MovieGrid.tsx` | Modify | Optional `hideEndOfResults` |
| `src/features/movie/MovieDetailPage.tsx` | Modify | Renders `ListButtons` |
| `src/app/Layout.tsx` | Modify | Renders `AccountNav` |
| `src/App.tsx` | Modify | Routes `/sign-in`, `/auth/callback`, `/lists`, `/account` |
| `src/main.tsx` | Modify | Wraps the app in `AuthProvider` |
| `src/test/utils.tsx` | Modify | `auth` option; returns the `queryClient` |
| `src/test/auth.ts` | Create | `testUser`, `signedIn`, `signedOut`, `authLoading` |
| `src/test/supabase.ts` | Create | Supabase test URLs, row fixture, fake session response |
| `src/test/setup.ts` | Modify | Clears `localStorage` after each test |
| `vite.config.ts` | Modify | Test values for the two Supabase variables |
| `.env.example`, `README.md` | Modify | Document Supabase setup |
| `docs/superpowers/specs/2026-09-12-accounts-and-lists-design.md` | Modified during planning | Amendment note listing the deviations above |

Steps marked **👤 USER** need the human: they involve the Supabase or Vercel
dashboards, or an inbox. An agent executing this plan must stop at those steps
and ask the user to do them, then continue once they confirm.

---

### Task 1: Database schema and rule tests

**Files:**
- Create: `supabase/migrations/20260912000000_accounts_and_lists.sql`
- Create: `supabase/tests/authStub.sql`
- Create: `supabase/tests/movieEntries.test.ts`
- Modify: `tsconfig.server.json` (`include`)
- Modify: `package.json` (dev dependency, via npm)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (later tasks and Task 10's manual checks rely on these exact names):
  - Table `public.movie_entries` with columns `user_id uuid`, `movie_id integer`, `is_favorite boolean`, `status text` (`'wishlist' | 'watched' | null`), `title text`, `poster_path text | null`, `release_date text | null`, `vote_average real | null`, `updated_at timestamptz`; primary key `(user_id, movie_id)`.
  - `public.delete_my_account() returns void`, executable by `authenticated` only.

- [ ] **Step 1: Install PGlite and type-check `supabase/`**

```bash
npm install --save-dev @electric-sql/pglite@^0.5.8
```

In `tsconfig.server.json`, change the `include` line to:

```json
  "include": ["api", "server", "supabase"]
```

- [ ] **Step 2: Write the auth stand-in**

Create `supabase/tests/authStub.sql`:

```sql
-- TEST-ONLY. A stand-in for the parts of Supabase that the migration depends
-- on, so the migration can run in PGlite (plain Postgres). Never run this
-- against a real Supabase project: there, all of this already exists.

create schema auth;

create table auth.users (
  id    uuid primary key,
  email text
);

-- Supabase's own definition: the user id is the `sub` claim of the request's
-- JWT, which Supabase's API puts in the request.jwt.claims setting.
create function auth.uid() returns uuid
  language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

-- The two roles Supabase's API switches to: visitors without a session, and
-- signed-in users.
create role anon nologin;
create role authenticated nologin;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;

-- Supabase's defaults before 30 May 2026: every new table and function in
-- public is granted in full to both API roles. This is the most permissive
-- starting point the migration can meet, so the tests start from it.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
```

- [ ] **Step 3: Write the failing tests**

Create `supabase/tests/movieEntries.test.ts`:

```ts
// @vitest-environment node
// Database-rule tests. They run the real migration in PGlite (Postgres compiled
// to WebAssembly, running inside this process), so the RLS policies, grants and
// checks are enforced by a real Postgres, with no Docker and no Supabase
// project. Task 10's manual checks confirm the same rules on real Supabase.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ALICE = '00000000-0000-4000-8000-00000000000a';
const BOB = '00000000-0000-4000-8000-00000000000b';

const authStub = readFileSync(new URL('./authStub.sql', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL('../migrations/20260912000000_accounts_and_lists.sql', import.meta.url),
  'utf8',
);

// Starting a PGlite takes 3-5 seconds on this machine; cloning one takes under
// one. So the schema is built once, and every test gets its own clone: tests
// stay isolated without paying the start-up cost sixteen times.
let base: PGlite;
let db: PGlite;

beforeAll(async () => {
  base = new PGlite();
  await base.exec(authStub);
  await base.exec(migration);
  await base.exec(`
    insert into auth.users (id, email) values
      ('${ALICE}', 'alice@example.com'),
      ('${BOB}', 'bob@example.com');
    insert into public.movie_entries (user_id, movie_id, status, title) values
      ('${ALICE}', 550, 'wishlist', 'Fight Club'),
      ('${BOB}', 603, 'watched', 'The Matrix');
  `);
}, 60_000);

beforeEach(async () => {
  db = await base.clone();
});

afterEach(async () => {
  await db.close();
});

/**
 * Act the way Supabase's API does for a request: put the JWT claims in the
 * request.jwt.claims setting, then switch to the request's role. PGlite's own
 * connection is a superuser, and superusers bypass RLS, so every assertion
 * about RLS must run after this.
 */
async function actAs(role: 'authenticated' | 'anon', userId?: string): Promise<void> {
  await db.exec('reset role');
  const claims = userId ? JSON.stringify({ sub: userId, role }) : '';
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
  // A role name can't be a query parameter; `role` is one of two literals.
  await db.exec(`set role ${role}`);
}

async function actAsSuperuser(): Promise<void> {
  await db.exec('reset role');
}

/** Runs a statement that should fail, and returns the error message (null if it succeeded). */
async function errorFrom(sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await db.query(sql, params);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

describe('movie_entries: row-level security', () => {
  it('lets a user read only their own entries', async () => {
    await actAs('authenticated', ALICE);

    const { rows } = await db.query<{ movie_id: number }>(
      'select movie_id from public.movie_entries',
    );

    expect(rows).toEqual([{ movie_id: 550 }]);
  });

  it("changes nothing when a user updates someone else's entry", async () => {
    await actAs('authenticated', ALICE);

    const { rows } = await db.query(
      `update public.movie_entries set title = 'changed' where user_id = $1 returning movie_id`,
      [BOB],
    );

    expect(rows).toHaveLength(0);
  });

  it("removes nothing when a user deletes someone else's entry", async () => {
    await actAs('authenticated', ALICE);

    const { rows } = await db.query(
      'delete from public.movie_entries where movie_id = 603 returning movie_id',
    );

    expect(rows).toHaveLength(0);
  });

  it('refuses an entry created on behalf of another user', async () => {
    await actAs('authenticated', ALICE);

    const error = await errorFrom(
      `insert into public.movie_entries (user_id, movie_id, status, title)
       values ($1, 13, 'wishlist', 'Forrest Gump')`,
      [BOB],
    );

    expect(error).toMatch(/row-level security/);
  });

  it('refuses to hand an entry over to another user', async () => {
    await actAs('authenticated', ALICE);

    const error = await errorFrom(
      'update public.movie_entries set user_id = $1 where movie_id = 550',
      [BOB],
    );

    expect(error).toMatch(/row-level security/);
  });

  it('lets a user add their own entry', async () => {
    await actAs('authenticated', ALICE);

    const error = await errorFrom(
      `insert into public.movie_entries (user_id, movie_id, is_favorite, title)
       values ($1, 13, true, 'Forrest Gump')`,
      [ALICE],
    );
    const { rows } = await db.query('select movie_id from public.movie_entries');

    expect(error).toBeNull();
    expect(rows).toHaveLength(2);
  });

  it('gives visitors without a session no rows, even if they held table privileges', async () => {
    // Re-grant what the migration revoked, so this test isolates RLS: the
    // grants test below covers the privilege layer on its own.
    await actAsSuperuser();
    await db.exec('grant select, insert on public.movie_entries to anon');
    await actAs('anon');

    const { rows } = await db.query('select * from public.movie_entries');
    const insertError = await errorFrom(
      `insert into public.movie_entries (user_id, movie_id, status, title)
       values ($1, 13, 'wishlist', 'Forrest Gump')`,
      [ALICE],
    );

    expect(rows).toHaveLength(0);
    expect(insertError).toMatch(/row-level security/);
  });

  it('filters through RLS, not through missing data (control)', async () => {
    await actAsSuperuser();

    const { rows } = await db.query('select * from public.movie_entries');

    expect(rows).toHaveLength(2);
  });
});

describe('movie_entries: grants', () => {
  const PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];

  async function privilegesOf(role: string): Promise<string[]> {
    const { rows } = await db.query<{ privilege: string }>(
      `select privilege from unnest($1::text[]) as privilege
       where has_table_privilege($2, 'public.movie_entries', privilege)`,
      [PRIVILEGES, role],
    );
    return rows.map((row) => row.privilege);
  }

  it('gives visitors without a session no privileges at all', async () => {
    await actAsSuperuser();

    expect(await privilegesOf('anon')).toEqual([]);
  });

  it('gives signed-in users exactly select, insert, update and delete', async () => {
    // TRUNCATE in particular must be absent: it empties the table and RLS does
    // not apply to it. Supabase's old defaults granted it.
    await actAsSuperuser();

    expect(await privilegesOf('authenticated')).toEqual(['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
  });
});

describe('movie_entries: checks', () => {
  it('accepts only wishlist or watched as a status', async () => {
    await actAs('authenticated', ALICE);

    const error = await errorFrom(
      `update public.movie_entries set status = 'both' where movie_id = 550`,
    );

    expect(error).toMatch(/violates check constraint/);
  });

  it('refuses an entry that is neither a favorite nor on a list', async () => {
    await actAs('authenticated', ALICE);

    const error = await errorFrom(
      `insert into public.movie_entries (user_id, movie_id, title) values ($1, 13, 'Forrest Gump')`,
      [ALICE],
    );

    expect(error).toMatch(/entry_not_empty/);
  });

  it('refuses an oversized title or poster path', async () => {
    await actAs('authenticated', ALICE);

    const titleError = await errorFrom(
      `insert into public.movie_entries (user_id, movie_id, is_favorite, title)
       values ($1, 13, true, $2)`,
      [ALICE, 'x'.repeat(501)],
    );
    const posterError = await errorFrom(
      `insert into public.movie_entries (user_id, movie_id, is_favorite, title, poster_path)
       values ($1, 14, true, 'Big', $2)`,
      [ALICE, '/'.repeat(201)],
    );

    expect(titleError).toMatch(/violates check constraint/);
    expect(posterError).toMatch(/violates check constraint/);
  });

  it('moves updated_at forward on every update', async () => {
    // Inserted as superuser with an old timestamp: the trigger fires on
    // update only, so the old value survives the insert.
    await actAsSuperuser();
    await db.query(
      `insert into public.movie_entries (user_id, movie_id, is_favorite, title, updated_at)
       values ($1, 13, true, 'Forrest Gump', '2000-01-01')`,
      [ALICE],
    );
    await actAs('authenticated', ALICE);

    await db.query(`update public.movie_entries set status = 'watched' where movie_id = 13`);
    const { rows } = await db.query<{ moved: boolean }>(
      `select updated_at > '2001-01-01' as moved from public.movie_entries where movie_id = 13`,
    );

    expect(rows).toEqual([{ moved: true }]);
  });
});

describe('delete_my_account', () => {
  it("deletes the caller and the caller's entries, and nobody else", async () => {
    await actAs('authenticated', ALICE);

    await db.query('select public.delete_my_account()');
    await actAsSuperuser();
    const users = await db.query<{ id: string }>('select id from auth.users');
    const entries = await db.query<{ movie_id: number }>(
      'select movie_id from public.movie_entries',
    );

    expect(users.rows).toEqual([{ id: BOB }]);
    expect(entries.rows).toEqual([{ movie_id: 603 }]);
  });

  it('cannot be run by a visitor without a session', async () => {
    await actAs('anon');

    const error = await errorFrom('select public.delete_my_account()');

    expect(error).toMatch(/permission denied/);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run supabase/tests/movieEntries.test.ts`
Expected: FAIL. Every test errors with `ENOENT: no such file or directory` naming `20260912000000_accounts_and_lists.sql`.

- [ ] **Step 5: Write the migration**

Create `supabase/migrations/20260912000000_accounts_and_lists.sql`:

```sql
-- Accounts and lists: one row per (user, movie).
-- Run once in the Supabase SQL editor (see README). Tested in
-- supabase/tests/movieEntries.test.ts.

create table public.movie_entries (
  user_id      uuid        not null default auth.uid()
                           references auth.users (id) on delete cascade,
  movie_id     integer     not null check (movie_id > 0),
  is_favorite  boolean     not null default false,
  -- One column for both lists makes "wishlist and watched are mutually
  -- exclusive" a property of the table: it can only hold one value.
  status       text        check (status in ('wishlist', 'watched')),  -- null = neither
  -- Copied from TMDB when a button is pressed, so the lists page needs no
  -- TMDB request per movie. The size checks stop one row from being inflated.
  title        text        not null check (char_length(title) between 1 and 500),
  poster_path  text        check (char_length(poster_path) <= 200),
  release_date text        check (char_length(release_date) <= 10),
  vote_average real        check (vote_average between 0 and 10),
  updated_at   timestamptz not null default now(),
  primary key (user_id, movie_id),
  -- An entry with nothing set is deleted by the app, never stored.
  constraint entry_not_empty check (is_favorite or status is not null)
);

-- Keeps updated_at honest without trusting the client's clock.
create function public.touch_updated_at() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger movie_entries_touch_updated_at
  before update on public.movie_entries
  for each row execute function public.touch_updated_at();

alter table public.movie_entries enable row level security;

-- Grants are explicit. Supabase projects created after 30 May 2026 grant the
-- API roles nothing on new tables (existing projects follow on 30 October
-- 2026); older projects granted them everything, TRUNCATE included, and RLS
-- does not apply to TRUNCATE. Revoking everything first makes this file
-- correct under both.
revoke all on public.movie_entries from anon, authenticated;
grant select, insert, update, delete on public.movie_entries to authenticated;

-- (select auth.uid()) rather than auth.uid(): Postgres evaluates it once per
-- query instead of once per row. Supabase's own performance guidance.
create policy "Read own entries" on public.movie_entries
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Add own entries" on public.movie_entries
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Change own entries" on public.movie_entries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Delete own entries" on public.movie_entries
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- security definer: runs with its owner's rights, which is what allows it to
-- delete from auth.users. It takes no arguments and uses only auth.uid(), so
-- it cannot be pointed at another account. search_path = '' blocks hijacking
-- through a look-alike object in another schema. on delete cascade removes
-- the caller's entries in the same statement.
create function public.delete_my_account() returns void
  language sql security definer set search_path = '' as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run supabase/tests/movieEntries.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 7: Prove the grants test can fail**

Temporarily change the migration's revoke line to the spec's original,
`revoke all on public.movie_entries from anon;`, and run the same command.
Expected: exactly one failure, "gives signed-in users exactly select, insert,
update and delete", listing `TRUNCATE`, `REFERENCES`, `TRIGGER` as extra.
Restore the line to `revoke all on public.movie_entries from anon, authenticated;`
and run again: 16 pass.

- [ ] **Step 8: Run the full checks**

Run: `npm test && npm run build && npm run lint`
Expected: every test file passes (the 116 existing tests plus these 16, 132 in
all), the build succeeds, and lint reports no problems.

- [ ] **Step 9: Commit**

```bash
git add supabase tsconfig.server.json package.json package-lock.json
git commit -F - <<'EOF'
feat: add the movie_entries schema with RLS, and test it in PGlite

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Supabase client and session state

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `src/features/auth/useSession.ts`
- Create: `src/features/auth/AuthProvider.tsx`
- Create: `src/features/auth/AuthProvider.test.tsx`
- Create: `src/test/auth.ts`
- Create: `src/test/supabase.ts`
- Modify: `src/test/utils.tsx`, `src/test/setup.ts`, `src/main.tsx`, `vite.config.ts`, `.env.example`
- Modify: `package.json` (dependency, via npm)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `src/lib/supabase.ts`: `export const supabase: SupabaseClient`; `export const isSupabaseConfigured: boolean`.
  - `src/features/auth/useSession.ts`:
    - `export interface AppUser { id: string; email: string }`
    - `export type AuthState = { status: 'loading'; user: null } | { status: 'signed-out'; user: null } | { status: 'signed-in'; user: AppUser }`
    - `export const AuthContext: React.Context<AuthState>` (default `{ status: 'signed-out', user: null }`)
    - `export function useSession(): AuthState`
  - `src/features/auth/AuthProvider.tsx`: `export function AuthProvider({ children }: { children: ReactNode }): JSX.Element`
  - `src/test/auth.ts`: `testUser: AppUser` (id `00000000-0000-4000-8000-000000000001`, email `reader@example.com`), `signedIn`, `signedOut`, `authLoading` (all `AuthState`).
  - `src/test/supabase.ts`: `SUPABASE_URL = 'https://test.supabase.co'`, `restUrl(path: string): string`, `authUrl(path: string): string`, `sessionResponse(user?: AppUser)`.
  - `renderWithProviders(ui, { route?, auth? })` now returns `RenderResult & { queryClient: QueryClient }`; `auth` defaults to `signedOut`.

- [ ] **Step 1: Install supabase-js and give tests fake Supabase settings**

```bash
npm install @supabase/supabase-js@^2.116.0
```

In `vite.config.ts`, add an `env` entry to the `test` block:

```ts
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Fake Supabase settings. MSW intercepts this URL, so no test reaches a
    // real Supabase project.
    env: {
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    },
  },
```

Append to `.env.example`:

```bash

# Supabase project URL and publishable key: Supabase dashboard → Project
# Settings → API Keys. Unlike TMDB_TOKEN, these are PUBLIC by design and end up
# in the browser code (hence the VITE_ prefix). The key only says which project
# a request is for; row-level security in the database protects the data.
# Older projects call the publishable key the "anon" key; either value works.
# In production, set both in Vercel for Production and Preview, with no custom
# preview branch.
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

- [ ] **Step 2: Create the client**

Create `src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

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
```

- [ ] **Step 3: Create the session context**

Create `src/features/auth/useSession.ts`:

```ts
import { createContext, useContext } from 'react';

/** The app's own view of a user: just what the UI needs. */
export interface AppUser {
  id: string;
  email: string;
}

// A union rather than { status; user: AppUser | null }: when status is
// 'signed-in', TypeScript then knows user is not null.
export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'signed-out'; user: null }
  | { status: 'signed-in'; user: AppUser };

// The default applies outside an AuthProvider, which in practice means
// component tests that don't ask for a session. Signed out rather than
// loading, so those render as they would for a visitor instead of waiting
// forever.
export const AuthContext = createContext<AuthState>({ status: 'signed-out', user: null });

export function useSession(): AuthState {
  return useContext(AuthContext);
}
```

- [ ] **Step 4: Create the test helpers**

Create `src/test/auth.ts`:

```ts
import type { AppUser, AuthState } from '../features/auth/useSession';

export const testUser: AppUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'reader@example.com',
};

export const signedIn: AuthState = { status: 'signed-in', user: testUser };
export const signedOut: AuthState = { status: 'signed-out', user: null };
export const authLoading: AuthState = { status: 'loading', user: null };
```

Create `src/test/supabase.ts`:

```ts
import type { AppUser } from '../features/auth/useSession';
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
```

In `src/test/setup.ts`, add a second `afterEach` directly below the existing
`afterEach(() => server.resetHandlers());`:

```ts
// Supabase keeps the session and the PKCE verifier in localStorage. A test must
// never inherit another test's sign-in.
afterEach(() => localStorage.clear());
```

Replace `src/test/utils.tsx` with:

```tsx
import type { ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthState } from '../features/auth/useSession';
import { signedOut } from './auth';

interface RenderOptions {
  route?: string;
  /** The session state components see. Tests never need a real Supabase session. */
  auth?: AuthState;
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', auth = signedOut }: RenderOptions = {},
): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );

  // Returned so a test can check what's in the cache, e.g. that signing out
  // cleared the lists.
  return { ...result, queryClient };
}
```

- [ ] **Step 5: Write the failing test**

Create `src/features/auth/AuthProvider.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, render, screen } from '@testing-library/react';
import { supabase } from '../../lib/supabase';
import { server } from '../../test/server';
import { authUrl, sessionResponse } from '../../test/supabase';
import { AuthProvider } from './AuthProvider';
import { useSession } from './useSession';

function SessionProbe() {
  const session = useSession();
  return (
    <p>{session.status === 'signed-in' ? `signed in as ${session.user.email}` : session.status}</p>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <SessionProbe />
    </AuthProvider>,
  );
}

describe('AuthProvider', () => {
  it('starts loading, then reports signed out when no session is stored', async () => {
    renderProvider();

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(await screen.findByText('signed-out')).toBeInTheDocument();
  });

  it('follows the session through a magic-link sign-in and a sign-out', async () => {
    server.use(
      http.post(authUrl('otp'), () => HttpResponse.json({})),
      http.post(authUrl('token'), () => HttpResponse.json(sessionResponse())),
      http.post(authUrl('logout'), () => new HttpResponse(null, { status: 204 })),
    );
    renderProvider();
    await screen.findByText('signed-out');

    // The real sign-in sequence: asking for a link stores the PKCE verifier in
    // this browser, and exchanging the link's code turns it into a session.
    await act(async () => {
      await supabase.auth.signInWithOtp({ email: 'reader@example.com' });
      await supabase.auth.exchangeCodeForSession('code-from-the-email');
    });
    expect(await screen.findByText('signed in as reader@example.com')).toBeInTheDocument();

    await act(async () => {
      await supabase.auth.signOut({ scope: 'local' });
    });
    expect(await screen.findByText('signed-out')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/features/auth/AuthProvider.test.tsx`
Expected: FAIL: `Failed to resolve import "./AuthProvider"`.

- [ ] **Step 7: Implement the provider**

Create `src/features/auth/AuthProvider.tsx`:

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { AuthContext, type AuthState } from './useSession';

function toAuthState(session: Session | null): AuthState {
  if (!session) return { status: 'signed-out', user: null };
  return {
    status: 'signed-in',
    user: { id: session.user.id, email: session.user.email ?? '' },
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  useEffect(() => {
    // Supabase calls this straight away with INITIAL_SESSION (the session saved
    // in this browser, or null), then again on every sign-in, sign-out and
    // token refresh. So this one subscription is the only source of session
    // state. The callback only sets state and is deliberately not async:
    // calling other supabase.auth methods from inside it can deadlock, per
    // Supabase's own documentation.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(toAuthState(session));
    });

    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/features/auth/AuthProvider.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 9: Wrap the app**

In `src/main.tsx`, add the import and wrap the router:

```tsx
import { AuthProvider } from './features/auth/AuthProvider';
```

```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 10: Run the full checks**

Run: `npm test && npm run build && npm run lint`
Expected: 134 tests pass, the build succeeds, lint is clean. The existing
suites are unaffected: `renderWithProviders` defaults to signed out, and
nothing renders Supabase-backed UI yet.

- [ ] **Step 11: Commit**

```bash
git add src/lib/supabase.ts src/features/auth src/test vite.config.ts src/main.tsx .env.example package.json package-lock.json
git commit -F - <<'EOF'
feat: add the Supabase client and app-wide session state

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Sign-in and callback pages

**Files:**
- Create: `src/features/auth/safeNext.ts`, `src/features/auth/safeNext.test.ts`
- Create: `src/features/auth/signInPath.ts`
- Create: `src/features/auth/authApi.ts`, `src/features/auth/authApi.test.ts`
- Create: `src/features/auth/SignInPage.tsx`, `src/features/auth/SignInPage.test.tsx`, `src/features/auth/SignInPage.unconfigured.test.tsx`
- Create: `src/features/auth/AuthCallbackPage.tsx`, `src/features/auth/AuthCallbackPage.test.tsx`
- Modify: `src/App.tsx`, `src/App.test.tsx`

**Interfaces:**
- Consumes (Task 2): `supabase`, `isSupabaseConfigured` from `src/lib/supabase.ts`; `useSession`, `AuthState` from `useSession.ts`; `signedIn` from `src/test/auth.ts`; `authUrl`, `sessionResponse` from `src/test/supabase.ts`; `renderWithProviders(ui, { route, auth })`.
- Produces:
  - `export function safeNext(raw: string | null | undefined): string` (returns `raw` or `'/browse'`)
  - `export function signInPath(region: string, next: string): string` (returns `/sign-in?next=<next>&region=<region>`)
  - `export type SendLinkResult = { ok: true } | { ok: false; reason: 'rate-limited' | 'invalid-email' | 'failed' }`
  - `export async function sendMagicLink(email: string, next: string): Promise<SendLinkResult>`
  - `export type ExchangeResult = { ok: true } | { ok: false; reason: 'expired' | 'other-browser' }`
  - `export async function exchangeCode(code: string): Promise<ExchangeResult>`
  - Routes `/sign-in` and `/auth/callback`, both inside `Layout`.

- [ ] **Step 1: Write the failing tests for `safeNext`**

Create `src/features/auth/safeNext.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { safeNext } from './safeNext';

describe('safeNext', () => {
  it.each(['/movie/550?region=NL', '/lists'])('keeps a path on this site: %s', (path) => {
    expect(safeNext(path)).toBe(path);
  });

  it.each([
    ['missing', null],
    ['empty', ''],
    ['another website', 'https://evil.example'],
    ['a protocol-relative URL', '//evil.example'],
    ['a backslash trick', '/\\evil.example'],
    ['a script URL', 'javascript:alert(1)'],
    ['a relative path', 'movie/550'],
  ])('falls back to /browse for %s', (_label, raw) => {
    expect(safeNext(raw)).toBe('/browse');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/auth/safeNext.test.ts`
Expected: FAIL: `Failed to resolve import "./safeNext"`.

- [ ] **Step 3: Implement `safeNext` and `signInPath`**

Create `src/features/auth/safeNext.ts`:

```ts
const FALLBACK = '/browse';

/**
 * The page to return to after signing in, taken from ?next=. Only a path on
 * this site is accepted. Without this check, a crafted sign-in link could send
 * someone to another website right after they sign in (an "open redirect").
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/')) return FALLBACK;
  // Browsers read "//evil.example" and "/\evil.example" as another host.
  if (raw.startsWith('//') || raw.startsWith('/\\')) return FALLBACK;
  return raw;
}
```

Create `src/features/auth/signInPath.ts`:

```ts
import { withRegion } from '../../app/useRegion';

/** The sign-in page, set to return to `next` afterwards. */
export function signInPath(region: string, next: string): string {
  return withRegion('/sign-in', region, { next });
}
```

Run: `npx vitest run src/features/auth/safeNext.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 4: Write the failing tests for `authApi`**

Create `src/features/auth/authApi.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { authUrl, sessionResponse } from '../../test/supabase';
import { exchangeCode, sendMagicLink } from './authApi';

/** Supabase Auth's error body shape, as observed from supabase-js 2.116. */
function authError(status: number, errorCode: string) {
  return HttpResponse.json({ code: status, error_code: errorCode, msg: errorCode }, { status });
}

describe('sendMagicLink', () => {
  it('asks Supabase for a link that comes back to /auth/callback with next', async () => {
    let redirectTo: string | null = null;
    server.use(
      http.post(authUrl('otp'), ({ request }) => {
        redirectTo = new URL(request.url).searchParams.get('redirect_to');
        return HttpResponse.json({});
      }),
    );

    const result = await sendMagicLink('reader@example.com', '/movie/550?region=NL');

    expect(result).toEqual({ ok: true });
    expect(redirectTo).toBe(
      `${window.location.origin}/auth/callback?next=%2Fmovie%2F550%3Fregion%3DNL`,
    );
  });

  it('reports the email rate limit', async () => {
    server.use(http.post(authUrl('otp'), () => authError(429, 'over_email_send_rate_limit')));

    expect(await sendMagicLink('reader@example.com', '/lists')).toEqual({
      ok: false,
      reason: 'rate-limited',
    });
  });

  it('reports an address Supabase will not send to', async () => {
    server.use(http.post(authUrl('otp'), () => authError(400, 'email_address_invalid')));

    expect(await sendMagicLink('reader@example.test', '/lists')).toEqual({
      ok: false,
      reason: 'invalid-email',
    });
  });

  it('reports any other failure generically', async () => {
    server.use(http.post(authUrl('otp'), () => authError(500, 'unexpected_failure')));

    expect(await sendMagicLink('reader@example.com', '/lists')).toEqual({
      ok: false,
      reason: 'failed',
    });
  });
});

describe('exchangeCode', () => {
  it('turns the code from the email into a session', async () => {
    server.use(
      http.post(authUrl('otp'), () => HttpResponse.json({})),
      http.post(authUrl('token'), () => HttpResponse.json(sessionResponse())),
    );
    // Asking for the link is what stores the PKCE verifier in this browser.
    await sendMagicLink('reader@example.com', '/lists');

    expect(await exchangeCode('code-from-the-email')).toEqual({ ok: true });
  });

  it('says "other browser", without contacting Supabase, when this browser never asked for a link', async () => {
    // No handlers: MSW fails the test on any request, which proves supabase-js
    // gives up before sending one (error code pkce_code_verifier_not_found).
    expect(await exchangeCode('code-from-the-email')).toEqual({
      ok: false,
      reason: 'other-browser',
    });
  });

  it('says "expired" when Supabase no longer knows the code', async () => {
    server.use(
      http.post(authUrl('otp'), () => HttpResponse.json({})),
      http.post(authUrl('token'), () => authError(404, 'flow_state_not_found')),
    );
    await sendMagicLink('reader@example.com', '/lists');

    expect(await exchangeCode('an-old-code')).toEqual({ ok: false, reason: 'expired' });
  });
});
```

- [ ] **Step 5: Run them to verify they fail**

Run: `npx vitest run src/features/auth/authApi.test.ts`
Expected: FAIL: `Failed to resolve import "./authApi"`.

- [ ] **Step 6: Implement `authApi`**

Create `src/features/auth/authApi.ts`:

```ts
import { supabase } from '../../lib/supabase';

// This module turns Supabase's error codes into the few outcomes the UI
// distinguishes, so pages never need to know Supabase's vocabulary.

export type SendLinkResult =
  | { ok: true }
  | { ok: false; reason: 'rate-limited' | 'invalid-email' | 'failed' };

export async function sendMagicLink(email: string, next: string): Promise<SendLinkResult> {
  const redirect = new URL('/auth/callback', window.location.origin);
  redirect.searchParams.set('next', next);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Supabase only honours this address if it is on the project's Redirect
    // URLs list; otherwise the link silently goes to the Site URL (README).
    options: { emailRedirectTo: redirect.toString() },
  });

  if (!error) return { ok: true };
  if (error.code === 'over_email_send_rate_limit') return { ok: false, reason: 'rate-limited' };
  if (error.code === 'email_address_invalid') return { ok: false, reason: 'invalid-email' };
  return { ok: false, reason: 'failed' };
}

export type ExchangeResult = { ok: true } | { ok: false; reason: 'expired' | 'other-browser' };

// This browser doesn't hold the secret the link was issued for: it was opened
// in a different browser than the one that asked for it. supabase-js detects
// the missing verifier itself, before sending any request.
const OTHER_BROWSER_CODES = new Set(['pkce_code_verifier_not_found', 'bad_code_verifier']);

export async function exchangeCode(code: string): Promise<ExchangeResult> {
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (!error) return { ok: true };
  if (error.code && OTHER_BROWSER_CODES.has(error.code)) {
    return { ok: false, reason: 'other-browser' };
  }
  // otp_expired, flow_state_not_found (the code is older than 5 minutes or was
  // already used), and anything unexpected: a new link fixes all of them.
  return { ok: false, reason: 'expired' };
}
```

Run: `npx vitest run src/features/auth/authApi.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Write the failing tests for the sign-in page**

Create `src/features/auth/SignInPage.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { server } from '../../test/server';
import { signedIn } from '../../test/auth';
import { authUrl } from '../../test/supabase';
import { renderWithProviders } from '../../test/utils';
import { SignInPage } from './SignInPage';
import type { AuthState } from './useSession';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderSignIn(route: string, auth?: AuthState) {
  return renderWithProviders(
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { route, auth },
  );
}

/** Answers POST /auth/v1/otp and records the return address Supabase would email. */
function mockOtp(respond: () => Response = () => HttpResponse.json({})) {
  const seen: { redirectTo: string | null } = { redirectTo: null };
  server.use(
    http.post(authUrl('otp'), ({ request }) => {
      seen.redirectTo = new URL(request.url).searchParams.get('redirect_to');
      return respond();
    }),
  );
  return seen;
}

async function requestLink(email = 'reader@example.com') {
  await userEvent.type(screen.getByLabelText('Email address'), email);
  await userEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));
}

describe('SignInPage', () => {
  it('sends a link that returns to next, then says to check your email', async () => {
    const seen = mockOtp();
    renderSignIn('/sign-in?next=%2Fmovie%2F550%3Fregion%3DNL&region=NL');

    await requestLink();

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText('reader@example.com')).toBeInTheDocument();
    expect(seen.redirectTo).toContain('/auth/callback?next=%2Fmovie%2F550%3Fregion%3DNL');
  });

  it('returns to /browse instead of a next that leaves the site', async () => {
    const seen = mockOtp();
    renderSignIn('/sign-in?next=https%3A%2F%2Fevil.example');

    await requestLink();

    await screen.findByRole('heading', { name: 'Check your email' });
    expect(seen.redirectTo).toContain('/auth/callback?next=%2Fbrowse');
  });

  it('explains the email rate limit', async () => {
    mockOtp(() =>
      HttpResponse.json(
        { code: 429, error_code: 'over_email_send_rate_limit', msg: 'rate limit' },
        { status: 429 },
      ),
    );
    renderSignIn('/sign-in');

    await requestLink();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many sign-in emails. Wait a few minutes and try again.',
    );
  });

  it('explains an address Supabase will not send to', async () => {
    mockOtp(() =>
      HttpResponse.json(
        { code: 400, error_code: 'email_address_invalid', msg: 'invalid' },
        { status: 400 },
      ),
    );
    renderSignIn('/sign-in');

    await requestLink('reader@example.test');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "That email address can't be used.",
    );
  });

  it('says what is stored, next to the form', () => {
    renderSignIn('/sign-in');

    expect(
      screen.getByText(
        'We store your email address and your lists. You can delete your account at any time.',
      ),
    ).toBeInTheDocument();
  });

  it('goes back to the form to use a different email', async () => {
    mockOtp();
    renderSignIn('/sign-in');
    await requestLink();
    await screen.findByRole('heading', { name: 'Check your email' });

    await userEvent.click(screen.getByRole('button', { name: 'Use a different email' }));

    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });

  it('sends someone already signed in straight to next', () => {
    renderSignIn('/sign-in?next=%2Flists%3Fregion%3DNL', signedIn);

    expect(screen.getByTestId('location')).toHaveTextContent('/lists?region=NL');
  });
});
```

Create `src/features/auth/SignInPage.unconfigured.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/utils';
import { SignInPage } from './SignInPage';

// A separate file because vi.mock applies to a whole file: here the Supabase
// variables are "missing", everywhere else they are set by vite.config.ts.
vi.mock('../../lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/supabase')>()),
  isSupabaseConfigured: false,
}));

describe('SignInPage without Supabase settings', () => {
  it('tells the site owner which variables to set, and offers no form', () => {
    renderWithProviders(<SignInPage />, { route: '/sign-in' });

    expect(
      screen.getByText("Sign-in isn't available because this site is misconfigured.", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('VITE_SUPABASE_URL')).toBeInTheDocument();
    expect(screen.getByText('VITE_SUPABASE_PUBLISHABLE_KEY')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run them to verify they fail**

Run: `npx vitest run src/features/auth/SignInPage`
Expected: FAIL: `Failed to resolve import "./SignInPage"` in both files.

- [ ] **Step 9: Implement the sign-in page**

Create `src/features/auth/SignInPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { isSupabaseConfigured } from '../../lib/supabase';
import { sendMagicLink, type SendLinkResult } from './authApi';
import { safeNext } from './safeNext';
import { useSession } from './useSession';

type FailureReason = Extract<SendLinkResult, { ok: false }>['reason'];

type Phase =
  | { name: 'editing' }
  | { name: 'sending' }
  | { name: 'sent'; email: string }
  | { name: 'failed'; reason: FailureReason };

const FAILURE_MESSAGES: Record<FailureReason, string> = {
  'rate-limited': 'Too many sign-in emails. Wait a few minutes and try again.',
  'invalid-email': "That email address can't be used.",
  failed: "Couldn't send the sign-in email. Try again.",
};

export function SignInPage() {
  const [searchParams] = useSearchParams();
  const session = useSession();
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<Phase>({ name: 'editing' });
  const next = safeNext(searchParams.get('next'));

  // Same pattern as ErrorState's TMDB_TOKEN message: a visitor can't fix
  // this, so say so, and tell the site owner exactly what is missing.
  if (!isSupabaseConfigured) {
    return (
      <div className="py-16 text-center">
        <p className="text-neutral-300">
          Sign-in isn't available because this site is misconfigured. This isn't something
          you can fix from here.
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          Site owner: set <code className="text-neutral-300">VITE_SUPABASE_URL</code> and{' '}
          <code className="text-neutral-300">VITE_SUPABASE_PUBLISHABLE_KEY</code> in the Vercel
          project's environment variables, then redeploy.
        </p>
      </div>
    );
  }

  // Already signed in, e.g. after pressing Back past the sign-in: nothing to do.
  if (session.status === 'signed-in') {
    return <Navigate to={next} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    setPhase({ name: 'sending' });
    const result = await sendMagicLink(address, next);
    setPhase(result.ok ? { name: 'sent', email: address } : { name: 'failed', reason: result.reason });
  }

  if (phase.name === 'sent') {
    return (
      <section className="mx-auto max-w-sm py-12">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="mt-3 text-neutral-300">
          We sent a sign-in link to <strong className="text-neutral-100">{phase.email}</strong>.
        </p>
        <button
          type="button"
          onClick={() => setPhase({ name: 'editing' })}
          className="mt-6 text-sm text-neutral-400 underline"
        >
          Use a different email
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-sm py-12">
      <h1 className="text-2xl font-semibold">Sign in</h1>

      <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 flex flex-col gap-3">
        <label htmlFor="sign-in-email" className="text-sm text-neutral-300">
          Email address
        </label>
        <input
          id="sign-in-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100"
        />
        <button
          type="submit"
          disabled={phase.name === 'sending'}
          className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-50"
        >
          Send sign-in link
        </button>
        {phase.name === 'failed' && (
          <p role="alert" className="text-sm text-red-300">
            {FAILURE_MESSAGES[phase.reason]}
          </p>
        )}
      </form>

      <p className="mt-6 text-xs text-neutral-500">
        We store your email address and your lists. You can delete your account at any time.
      </p>
    </section>
  );
}
```

Run: `npx vitest run src/features/auth/SignInPage`
Expected: PASS, 8 tests across the two files.

- [ ] **Step 10: Write the failing tests for the callback page**

Create `src/features/auth/AuthCallbackPage.test.tsx`:

```tsx
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { server } from '../../test/server';
import { regionsFixture } from '../../test/fixtures';
import { authUrl, sessionResponse } from '../../test/supabase';
import { renderWithProviders } from '../../test/utils';
import { sendMagicLink } from './authApi';
import { AuthCallbackPage } from './AuthCallbackPage';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderCallback(route: string, { strict = false } = {}) {
  // The "Send a new link" link carries the region, which useRegion resolves
  // against TMDB's region list.
  server.use(
    http.get('/api/tmdb/watch/providers/regions', () =>
      HttpResponse.json({ results: regionsFixture }),
    ),
  );
  const routes = (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>
  );
  return renderWithProviders(strict ? <StrictMode>{routes}</StrictMode> : routes, { route });
}

/** Counts POST /auth/v1/token calls, answering with a session or an error. */
function mockToken(respond: () => Response = () => HttpResponse.json(sessionResponse())) {
  const calls = { count: 0 };
  server.use(
    http.post(authUrl('token'), () => {
      calls.count += 1;
      return respond();
    }),
  );
  return calls;
}

/** Asks for a link first, as the real flow does: that stores the PKCE verifier. */
async function askForLinkInThisBrowser() {
  server.use(http.post(authUrl('otp'), () => HttpResponse.json({})));
  await sendMagicLink('reader@example.com', '/lists');
}

describe('AuthCallbackPage', () => {
  it('signs in, then goes to next', async () => {
    await askForLinkInThisBrowser();
    mockToken();

    renderCallback('/auth/callback?code=abc&next=%2Flists%3Fregion%3DNL');

    expect(await screen.findByTestId('location')).toHaveTextContent('/lists?region=NL');
  });

  it('goes to /browse when next points off the site', async () => {
    await askForLinkInThisBrowser();
    mockToken();

    renderCallback('/auth/callback?code=abc&next=https%3A%2F%2Fevil.example');

    expect(await screen.findByTestId('location')).toHaveTextContent('/browse');
  });

  it('exchanges the code exactly once under StrictMode', async () => {
    await askForLinkInThisBrowser();
    const calls = mockToken();

    renderCallback('/auth/callback?code=abc&next=%2Flists', { strict: true });

    await screen.findByTestId('location');
    expect(calls.count).toBe(1);
  });

  it('asks for the same browser when this one never requested the link', async () => {
    renderCallback('/auth/callback?code=abc&next=%2Flists');

    expect(
      await screen.findByText('Open the sign-in link in the same browser where you asked for it.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Send a new link' }).getAttribute('href')).toContain(
      '/sign-in?next=%2Flists',
    );
  });

  it('says expired, without an exchange, when Supabase redirected with an error', async () => {
    const calls = mockToken();

    renderCallback(
      '/auth/callback?error=access_denied&error_code=otp_expired&error_description=expired&next=%2Flists',
    );

    expect(await screen.findByText('This sign-in link has expired.')).toBeInTheDocument();
    expect(calls.count).toBe(0);
  });

  it('says expired when the link carries no code', async () => {
    renderCallback('/auth/callback?next=%2Flists');

    expect(await screen.findByText('This sign-in link has expired.')).toBeInTheDocument();
  });

  it('says expired when Supabase no longer knows the code', async () => {
    await askForLinkInThisBrowser();
    mockToken(() =>
      HttpResponse.json(
        { code: 404, error_code: 'flow_state_not_found', msg: 'no flow state' },
        { status: 404 },
      ),
    );

    renderCallback('/auth/callback?code=old&next=%2Flists');

    expect(await screen.findByText('This sign-in link has expired.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 11: Run them to verify they fail**

Run: `npx vitest run src/features/auth/AuthCallbackPage.test.tsx`
Expected: FAIL: `Failed to resolve import "./AuthCallbackPage"`.

- [ ] **Step 12: Implement the callback page**

Create `src/features/auth/AuthCallbackPage.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useRegion } from '../../app/useRegion';
import { exchangeCode, type ExchangeResult } from './authApi';
import { safeNext } from './safeNext';
import { signInPath } from './signInPath';

type FailureReason = Extract<ExchangeResult, { ok: false }>['reason'];

const FAILURE_MESSAGES: Record<FailureReason, string> = {
  expired: 'This sign-in link has expired.',
  'other-browser': 'Open the sign-in link in the same browser where you asked for it.',
};

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { region } = useRegion();
  const [exchangeFailure, setExchangeFailure] = useState<FailureReason | null>(null);

  const next = safeNext(searchParams.get('next'));
  const code = searchParams.get('code');
  // Supabase redirects here with ?error=... when it rejected the link itself,
  // for example an expired one. A link with no code at all is treated the same.
  const linkFailure: FailureReason | null = searchParams.get('error') || !code ? 'expired' : null;

  // The code works once. React StrictMode runs effects twice in development,
  // and a second exchange would fail after the first succeeded, showing an
  // error to someone who had just signed in. A ref survives StrictMode's
  // simulated remount, so this guard makes the exchange run once.
  const exchangeStarted = useRef(false);

  useEffect(() => {
    if (linkFailure || !code || exchangeStarted.current) return;
    exchangeStarted.current = true;

    void exchangeCode(code).then((result) => {
      if (result.ok) navigate(next, { replace: true });
      else setExchangeFailure(result.reason);
    });
  }, [code, linkFailure, navigate, next]);

  const failure = linkFailure ?? exchangeFailure;

  if (!failure) {
    return (
      <p role="status" className="py-16 text-center text-neutral-400">
        Signing you in…
      </p>
    );
  }

  return (
    <div className="py-16 text-center">
      <p className="text-neutral-300">{FAILURE_MESSAGES[failure]}</p>
      <Link
        to={signInPath(region, next)}
        className="mt-4 inline-block rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white"
      >
        Send a new link
      </Link>
    </div>
  );
}
```

Run: `npx vitest run src/features/auth/AuthCallbackPage.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 13: Add the routes, with a routing test**

Add to `src/App.test.tsx`, inside the `describe` block:

```tsx
  it('serves the sign-in page inside the layout', () => {
    server.use(
      http.get('/api/tmdb/watch/providers/regions', () =>
        HttpResponse.json({ results: regionsFixture }),
      ),
    );

    renderWithProviders(<App />, { route: '/sign-in?region=NL' });

    expect(screen.getByRole('link', { name: /streaming catalog/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
```

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL: the new test finds "That page does not exist." instead of the heading.

In `src/App.tsx`, add the imports:

```tsx
import { AuthCallbackPage } from './features/auth/AuthCallbackPage';
import { SignInPage } from './features/auth/SignInPage';
```

and the two routes, directly above `<Route path="*" element={<NotFound />} />`:

```tsx
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
```

Run: `npx vitest run src/App.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 14: Run the full checks**

Run: `npm test && npm run build && npm run lint`
Expected: 166 tests pass, the build succeeds, lint is clean.

- [ ] **Step 15: Commit**

```bash
git add src/features/auth src/App.tsx src/App.test.tsx
git commit -F - <<'EOF'
feat: add magic-link sign-in and the auth callback page

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Lists data layer

**Files:**
- Create: `src/features/lists/toggle.ts`, `src/features/lists/toggle.test.ts`
- Create: `src/features/lists/api.ts`, `src/features/lists/api.test.ts`
- Create: `src/features/lists/queries.ts`
- Modify: `src/lib/queryClient.ts`, `src/lib/queryClient.test.ts`
- Modify: `src/test/supabase.ts` (add `entryRow`)

**Interfaces:**
- Consumes (Task 2): `supabase` from `src/lib/supabase.ts`; `useSession` from `src/features/auth/useSession.ts`; `testUser` from `src/test/auth.ts`; `restUrl` from `src/test/supabase.ts`. `TmdbMovieSummary` from `src/api/types.ts` (existing).
- Produces:
  - `toggle.ts`: `export type ListStatus = 'wishlist' | 'watched'`; `export interface EntryFlags { isFavorite: boolean; status: ListStatus | null }`; `export type ListAction = 'favorite' | 'wishlist' | 'watched'`; `export function nextFlags(current: EntryFlags | null, action: ListAction): EntryFlags | null`
  - `api.ts`: `export class ListsError extends Error { readonly status: number }` (0 = no response); `export interface MovieEntryRow { user_id: string; movie_id: number; is_favorite: boolean; status: ListStatus | null; title: string; poster_path: string | null; release_date: string | null; vote_average: number | null; updated_at: string }`; `export type MovieSnapshot = Pick<TmdbMovieSummary, 'id' | 'title' | 'poster_path' | 'release_date' | 'vote_average'>`; `fetchEntryFlags(userId: string, movieId: number): Promise<EntryFlags | null>`; `fetchAllEntries(userId: string): Promise<MovieEntryRow[]>`; `saveEntry(userId: string, movie: MovieSnapshot, flags: EntryFlags | null): Promise<EntryFlags | null>`; `entryToMovieSummary(row: MovieEntryRow): TmdbMovieSummary`
  - `queries.ts`: `listsKeys.user(userId)`, `listsKeys.entry(userId, movieId)`, `listsKeys.all(userId)`; `useMovieEntry(movieId: number): UseQueryResult<EntryFlags | null>`; `useMyEntries(): UseQueryResult<MovieEntryRow[]>`; `useSaveEntry(movie: MovieSnapshot): UseMutationResult<EntryFlags | null, Error, EntryFlags | null>`; `clearListsCache(queryClient: QueryClient): void`
  - `src/test/supabase.ts`: `entryRow(overrides?: Partial<MovieEntryRow>): MovieEntryRow` (Fight Club, id 550, on the wishlist, owned by `testUser`)

- [ ] **Step 1: Write the failing tests for the button logic**

Create `src/features/lists/toggle.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nextFlags } from './toggle';

describe('nextFlags', () => {
  it('favorites a movie that has no entry yet', () => {
    expect(nextFlags(null, 'favorite')).toEqual({ isFavorite: true, status: null });
  });

  it('removes the entry when the last flag is cleared', () => {
    expect(nextFlags({ isFavorite: true, status: null }, 'favorite')).toBeNull();
    expect(nextFlags({ isFavorite: false, status: 'wishlist' }, 'wishlist')).toBeNull();
  });

  it('adds a movie to the wishlist', () => {
    expect(nextFlags(null, 'wishlist')).toEqual({ isFavorite: false, status: 'wishlist' });
  });

  it('moves a wishlisted movie to watched in one step', () => {
    expect(nextFlags({ isFavorite: false, status: 'wishlist' }, 'watched')).toEqual({
      isFavorite: false,
      status: 'watched',
    });
  });

  it('keeps the favorite when a status is cleared', () => {
    expect(nextFlags({ isFavorite: true, status: 'watched' }, 'watched')).toEqual({
      isFavorite: true,
      status: null,
    });
  });

  it('keeps the status when favorite is toggled', () => {
    expect(nextFlags({ isFavorite: false, status: 'wishlist' }, 'favorite')).toEqual({
      isFavorite: true,
      status: 'wishlist',
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/lists/toggle.test.ts`
Expected: FAIL: `Failed to resolve import "./toggle"`.

- [ ] **Step 3: Implement the button logic**

Create `src/features/lists/toggle.ts`:

```ts
export type ListStatus = 'wishlist' | 'watched';

/** A movie's place in one user's lists. Mirrors a movie_entries row's two flags. */
export interface EntryFlags {
  isFavorite: boolean;
  status: ListStatus | null;
}

export type ListAction = 'favorite' | 'wishlist' | 'watched';

/**
 * What pressing one button does. `null` in and out means "no entry": a null
 * result tells the caller to delete the row, because the table refuses an
 * entry with nothing set.
 *
 * Wishlist and watched share `status`, so pressing Watched on a wishlisted
 * movie replaces the status rather than adding a second one: the database's
 * "mutually exclusive" rule and this function agree by construction.
 */
export function nextFlags(current: EntryFlags | null, action: ListAction): EntryFlags | null {
  const flags = current ?? { isFavorite: false, status: null };

  const next: EntryFlags =
    action === 'favorite'
      ? { ...flags, isFavorite: !flags.isFavorite }
      : { ...flags, status: flags.status === action ? null : action };

  return next.isFavorite || next.status !== null ? next : null;
}
```

Run: `npx vitest run src/features/lists/toggle.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 4: Add the row fixture**

Append to `src/test/supabase.ts` (and add `import type { MovieEntryRow } from '../features/lists/api';` to its imports):

```ts
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
```

- [ ] **Step 5: Write the failing tests for the database calls**

Create `src/features/lists/api.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { testUser } from '../../test/auth';
import { entryRow, restUrl } from '../../test/supabase';
import {
  ListsError,
  entryToMovieSummary,
  fetchAllEntries,
  fetchEntryFlags,
  saveEntry,
  type MovieSnapshot,
} from './api';

const fightClub: MovieSnapshot = {
  id: 550,
  title: 'Fight Club',
  poster_path: '/poster.jpg',
  release_date: '1999-10-15',
  vote_average: 8.4,
};

/** Runs `run`, expecting it to throw a ListsError, and returns that error. */
async function listsErrorFrom(run: () => Promise<unknown>): Promise<ListsError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ListsError) return error;
    throw error;
  }
  throw new Error('expected a ListsError, but nothing was thrown');
}

describe('fetchEntryFlags', () => {
  it("asks for this user's entry for this movie, and returns its flags", async () => {
    let url: URL | undefined;
    server.use(
      http.get(restUrl('movie_entries'), ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json([{ is_favorite: true, status: 'wishlist' }]);
      }),
    );

    const flags = await fetchEntryFlags(testUser.id, 550);

    expect(flags).toEqual({ isFavorite: true, status: 'wishlist' });
    expect(url?.searchParams.get('user_id')).toBe(`eq.${testUser.id}`);
    expect(url?.searchParams.get('movie_id')).toBe('eq.550');
  });

  it('returns null when the movie is on none of the lists', async () => {
    server.use(http.get(restUrl('movie_entries'), () => HttpResponse.json([])));

    expect(await fetchEntryFlags(testUser.id, 550)).toBeNull();
  });

  it('throws a ListsError with the status, after a single request', async () => {
    let requests = 0;
    server.use(
      http.get(restUrl('movie_entries'), () => {
        requests += 1;
        return HttpResponse.json({ message: 'Service Unavailable' }, { status: 503 });
      }),
    );

    const error = await listsErrorFrom(() => fetchEntryFlags(testUser.id, 550));

    expect(error.status).toBe(503);
    // One request, not four: supabase-js's own retries are off (db.retry).
    expect(requests).toBe(1);
  });

  it('reports status 0 when no response arrives', async () => {
    server.use(http.get(restUrl('movie_entries'), () => HttpResponse.error()));

    const error = await listsErrorFrom(() => fetchEntryFlags(testUser.id, 550));

    expect(error.status).toBe(0);
  });
});

describe('fetchAllEntries', () => {
  it("returns this user's entries, newest first", async () => {
    let url: URL | undefined;
    server.use(
      http.get(restUrl('movie_entries'), ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json([entryRow()]);
      }),
    );

    expect(await fetchAllEntries(testUser.id)).toEqual([entryRow()]);
    expect(url?.searchParams.get('user_id')).toBe(`eq.${testUser.id}`);
    expect(url?.searchParams.get('order')).toBe('updated_at.desc');
  });
});

describe('saveEntry', () => {
  it('upserts the flags together with a fresh copy of the movie details', async () => {
    let body: unknown;
    let url: URL | undefined;
    let prefer: string | null = null;
    server.use(
      http.post(restUrl('movie_entries'), async ({ request }) => {
        url = new URL(request.url);
        prefer = request.headers.get('prefer');
        body = await request.json();
        return HttpResponse.json([{ is_favorite: false, status: 'watched' }], { status: 201 });
      }),
    );

    const saved = await saveEntry(
      testUser.id,
      { ...fightClub, release_date: '' },
      { isFavorite: false, status: 'watched' },
    );

    expect(saved).toEqual({ isFavorite: false, status: 'watched' });
    expect(url?.searchParams.get('on_conflict')).toBe('user_id,movie_id');
    expect(prefer).toContain('resolution=merge-duplicates');
    expect(body).toEqual({
      user_id: testUser.id,
      movie_id: 550,
      is_favorite: false,
      status: 'watched',
      title: 'Fight Club',
      poster_path: '/poster.jpg',
      // TMDB's "" for an unknown date is stored as null.
      release_date: null,
      vote_average: 8.4,
    });
  });

  it('deletes the entry when nothing is left set', async () => {
    let url: URL | undefined;
    server.use(
      http.delete(restUrl('movie_entries'), ({ request }) => {
        url = new URL(request.url);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    expect(await saveEntry(testUser.id, fightClub, null)).toBeNull();
    expect(url?.searchParams.get('user_id')).toBe(`eq.${testUser.id}`);
    expect(url?.searchParams.get('movie_id')).toBe('eq.550');
  });

  it('throws a ListsError when the database refuses the write', async () => {
    server.use(
      http.post(restUrl('movie_entries'), () =>
        HttpResponse.json(
          { code: '42501', message: 'new row violates row-level security policy' },
          { status: 403 },
        ),
      ),
    );

    const error = await listsErrorFrom(() =>
      saveEntry(testUser.id, fightClub, { isFavorite: true, status: null }),
    );

    expect(error.status).toBe(403);
    expect(error.message).toBe('new row violates row-level security policy');
  });
});

describe('entryToMovieSummary', () => {
  it('shapes a row like the TMDB summaries that MovieCard displays', () => {
    expect(entryToMovieSummary(entryRow({ release_date: null, vote_average: null }))).toEqual({
      id: 550,
      title: 'Fight Club',
      overview: '',
      poster_path: '/poster.jpg',
      release_date: '',
      vote_average: 0,
      vote_count: 0,
    });
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run src/features/lists/api.test.ts`
Expected: FAIL: `Failed to resolve import "./api"`.

- [ ] **Step 7: Implement the database calls**

Create `src/features/lists/api.ts`:

```ts
import type { TmdbMovieSummary } from '../../api/types';
import { supabase } from '../../lib/supabase';
import type { EntryFlags, ListStatus } from './toggle';

// The only module that reads or writes movie_entries. Row-level security
// already limits every request to the signed-in user's rows; the explicit
// user_id filters below say so in the code as well.

/**
 * A failed request to Supabase's database API. `status` is the HTTP status,
 * or 0 when no response arrived (network failure, or a paused project).
 */
export class ListsError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message || `Request failed (${status})`);
    this.name = 'ListsError';
    this.status = status;
  }
}

/**
 * A movie_entries row as PostgREST returns it. Typed by hand to match the
 * migration: generating types from the schema needs the Supabase CLI.
 */
export interface MovieEntryRow {
  user_id: string;
  movie_id: number;
  is_favorite: boolean;
  status: ListStatus | null;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number | null;
  updated_at: string;
}

type FlagsRow = Pick<MovieEntryRow, 'is_favorite' | 'status'>;

/** The movie details copied into an entry, so the lists page needs no TMDB calls. */
export type MovieSnapshot = Pick<
  TmdbMovieSummary,
  'id' | 'title' | 'poster_path' | 'release_date' | 'vote_average'
>;

const TABLE = 'movie_entries';

function toFlags(row: FlagsRow): EntryFlags {
  return { isFavorite: row.is_favorite, status: row.status };
}

export async function fetchEntryFlags(userId: string, movieId: number): Promise<EntryFlags | null> {
  const { data, error, status } = await supabase
    .from(TABLE)
    .select('is_favorite, status')
    .eq('user_id', userId)
    .eq('movie_id', movieId);

  if (error) throw new ListsError(status, error.message);
  const row = (data as FlagsRow[])[0];
  return row ? toFlags(row) : null;
}

export async function fetchAllEntries(userId: string): Promise<MovieEntryRow[]> {
  const { data, error, status } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw new ListsError(status, error.message);
  return data as MovieEntryRow[];
}

/**
 * Stores the result of nextFlags(): upserts the entry, refreshing the copied
 * movie details, or deletes it when `flags` is null. Returns what the
 * database now holds, which is what the buttons then show.
 */
export async function saveEntry(
  userId: string,
  movie: MovieSnapshot,
  flags: EntryFlags | null,
): Promise<EntryFlags | null> {
  if (flags === null) {
    const { error, status } = await supabase
      .from(TABLE)
      .delete()
      .eq('user_id', userId)
      .eq('movie_id', movie.id);

    if (error) throw new ListsError(status, error.message);
    return null;
  }

  const { data, error, status } = await supabase
    .from(TABLE)
    .upsert(
      {
        user_id: userId,
        movie_id: movie.id,
        is_favorite: flags.isFavorite,
        status: flags.status,
        title: movie.title,
        poster_path: movie.poster_path,
        // TMDB sends "" for an unknown release date; the table stores null.
        release_date: movie.release_date || null,
        vote_average: movie.vote_average,
      },
      // Insert, or update the existing row for this user and movie.
      { onConflict: 'user_id,movie_id' },
    )
    .select('is_favorite, status');

  if (error) throw new ListsError(status, error.message);
  return toFlags((data as FlagsRow[])[0]);
}

/** Shapes a row like the TMDB summaries MovieCard already knows how to display. */
export function entryToMovieSummary(row: MovieEntryRow): TmdbMovieSummary {
  return {
    id: row.movie_id,
    title: row.title,
    overview: '',
    poster_path: row.poster_path,
    release_date: row.release_date ?? '',
    vote_average: row.vote_average ?? 0,
    vote_count: 0,
  };
}
```

Run: `npx vitest run src/features/lists/api.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 8: Teach the shared retry rule about lists errors (test first)**

Add to `src/lib/queryClient.test.ts` (and add `import { ListsError } from '../features/lists/api';`):

```ts
  it('does not retry a lists request the database refused', () => {
    expect(shouldRetry(0, new ListsError(403, 'new row violates row-level security policy'))).toBe(
      false,
    );
    expect(shouldRetry(0, new ListsError(400, 'violates check constraint'))).toBe(false);
  });

  it('retries a lists request that got no response or a 5xx', () => {
    expect(shouldRetry(0, new ListsError(0, 'TypeError: fetch failed'))).toBe(true);
    expect(shouldRetry(1, new ListsError(503, 'Service Unavailable'))).toBe(true);
    expect(shouldRetry(2, new ListsError(503, 'Service Unavailable'))).toBe(false);
  });
```

Run: `npx vitest run src/lib/queryClient.test.ts`
Expected: FAIL: "does not retry a lists request the database refused" (a `ListsError` is not a `TmdbError`, so it is retried).

Replace `shouldRetry` in `src/lib/queryClient.ts` (and add `import { ListsError } from '../features/lists/api';`):

```ts
export function shouldRetry(failureCount: number, error: unknown): boolean {
  // 4xx means the request itself is wrong (for lists: an RLS refusal or a
  // failed check), so repeating it is just slower failure. 429 is the
  // exception: it means "wrong for now".
  const status =
    error instanceof TmdbError || error instanceof ListsError ? error.status : undefined;

  if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
    return false;
  }
  return failureCount < MAX_RETRIES;
}
```

Run: `npx vitest run src/lib/queryClient.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 9: Add the query hooks**

Create `src/features/lists/queries.ts`. The hooks are exercised through the
components that use them in Tasks 5 and 6.

```ts
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useSession } from '../auth/useSession';
import {
  fetchAllEntries,
  fetchEntryFlags,
  saveEntry,
  type MovieEntryRow,
  type MovieSnapshot,
} from './api';
import type { EntryFlags } from './toggle';

// Every key starts with ['lists', userId]. That gives one prefix to clear on
// sign-out, and a different account can never be served another's cache.
export const listsKeys = {
  user: (userId: string) => ['lists', userId] as const,
  entry: (userId: string, movieId: number) => ['lists', userId, 'entry', movieId] as const,
  all: (userId: string) => ['lists', userId, 'all'] as const,
};

/** The signed-in user's id, or '' when there is none (queries stay disabled). */
function useUserId(): string {
  const session = useSession();
  return session.status === 'signed-in' ? session.user.id : '';
}

export function useMovieEntry(movieId: number): UseQueryResult<EntryFlags | null> {
  const userId = useUserId();
  return useQuery({
    queryKey: listsKeys.entry(userId, movieId),
    queryFn: () => fetchEntryFlags(userId, movieId),
    enabled: userId !== '',
  });
}

export function useMyEntries(): UseQueryResult<MovieEntryRow[]> {
  const userId = useUserId();
  return useQuery({
    queryKey: listsKeys.all(userId),
    queryFn: () => fetchAllEntries(userId),
    enabled: userId !== '',
  });
}

export function useSaveEntry(
  movie: MovieSnapshot,
): UseMutationResult<EntryFlags | null, Error, EntryFlags | null> {
  const userId = useUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (flags: EntryFlags | null) => saveEntry(userId, movie, flags),
    onSuccess: (saved) => {
      // What the database confirmed becomes the button state at once...
      queryClient.setQueryData(listsKeys.entry(userId, movie.id), saved);
      // ...and the lists page refetches the next time it is shown.
      void queryClient.invalidateQueries({ queryKey: listsKeys.all(userId) });
    },
  });
}

/**
 * Forgets every cached list. Called on sign-out and account deletion, so the
 * next person on this computer sees nothing of the previous user's lists.
 */
export function clearListsCache(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: ['lists'] });
}
```

- [ ] **Step 10: Run the full checks**

Run: `npm test && npm run build && npm run lint`
Expected: 183 tests pass, the build succeeds, lint is clean.

- [ ] **Step 11: Commit**

```bash
git add src/features/lists src/lib/queryClient.ts src/lib/queryClient.test.ts src/test/supabase.ts
git commit -F - <<'EOF'
feat: add the lists data layer: button logic, Supabase calls, query hooks

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: List buttons on the detail page

**Files:**
- Create: `src/features/lists/ListButtons.tsx`, `src/features/lists/ListButtons.test.tsx`
- Modify: `src/features/movie/MovieDetailPage.tsx`, `src/features/movie/MovieDetailPage.test.tsx`

**Interfaces:**
- Consumes: `useMovieEntry`, `useSaveEntry` (Task 4, `queries.ts`); `nextFlags`, `EntryFlags`, `ListAction` (Task 4, `toggle.ts`); `MovieSnapshot` (Task 4, `api.ts`); `useSession`, `AuthState` (Task 2); `signInPath(region, next)` (Task 3); `signedIn`, `signedOut`, `authLoading` (Task 2, `src/test/auth.ts`); `restUrl` (Task 2, `src/test/supabase.ts`).
- Produces: `export function ListButtons({ movie }: { movie: MovieSnapshot }): JSX.Element`. Accessible names are exactly `Favorite`, `Wishlist`, `Watched` (the heart is `aria-hidden`).

- [ ] **Step 1: Write the failing tests**

Create `src/features/lists/ListButtons.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { server } from '../../test/server';
import { regionsFixture } from '../../test/fixtures';
import { signedIn, signedOut } from '../../test/auth';
import { restUrl } from '../../test/supabase';
import { renderWithProviders } from '../../test/utils';
import type { AuthState } from '../auth/useSession';
import type { MovieSnapshot } from './api';
import { ListButtons } from './ListButtons';
import type { EntryFlags } from './toggle';

const fightClub: MovieSnapshot = {
  id: 550,
  title: 'Fight Club',
  poster_path: '/poster.jpg',
  release_date: '1999-10-15',
  vote_average: 8.4,
};

function renderButtons(auth: AuthState) {
  server.use(
    http.get('/api/tmdb/watch/providers/regions', () =>
      HttpResponse.json({ results: regionsFixture }),
    ),
  );
  return renderWithProviders(
    <Routes>
      <Route path="/movie/:id" element={<ListButtons movie={fightClub} />} />
    </Routes>,
    { route: '/movie/550?region=NL', auth },
  );
}

/** The movie's current entry, as GET /rest/v1/movie_entries returns it. */
function mockEntry(flags: EntryFlags | null) {
  server.use(
    http.get(restUrl('movie_entries'), () =>
      HttpResponse.json(flags ? [{ is_favorite: flags.isFavorite, status: flags.status }] : []),
    ),
  );
}

function button(name: 'Favorite' | 'Wishlist' | 'Watched') {
  return screen.getByRole('button', { name });
}

describe('ListButtons', () => {
  it('offers the three lists to visitors as links to sign in and come back', () => {
    renderButtons(signedOut);

    for (const name of ['Favorite', 'Wishlist', 'Watched']) {
      expect(screen.getByRole('link', { name }).getAttribute('href')).toContain(
        '/sign-in?next=%2Fmovie%2F550%3Fregion%3DNL',
      );
    }
  });

  it("shows which lists the movie is on", async () => {
    mockEntry({ isFavorite: false, status: 'wishlist' });
    renderButtons(signedIn);

    await waitFor(() => expect(button('Wishlist')).toHaveAttribute('aria-pressed', 'true'));
    expect(button('Watched')).toHaveAttribute('aria-pressed', 'false');
    expect(button('Favorite')).toHaveAttribute('aria-pressed', 'false');
  });

  it('moves a wishlisted movie to watched in one save', async () => {
    mockEntry({ isFavorite: false, status: 'wishlist' });
    let body: { status?: string } | undefined;
    server.use(
      http.post(restUrl('movie_entries'), async ({ request }) => {
        body = (await request.json()) as { status?: string };
        return HttpResponse.json([{ is_favorite: false, status: 'watched' }], { status: 201 });
      }),
    );
    renderButtons(signedIn);
    await waitFor(() => expect(button('Wishlist')).toBeEnabled());

    await userEvent.click(button('Watched'));

    await waitFor(() => expect(button('Watched')).toHaveAttribute('aria-pressed', 'true'));
    expect(button('Wishlist')).toHaveAttribute('aria-pressed', 'false');
    expect(body?.status).toBe('watched');
  });

  it('deletes the entry when the last list is cleared', async () => {
    mockEntry({ isFavorite: false, status: 'wishlist' });
    let deleted = false;
    server.use(
      http.delete(restUrl('movie_entries'), () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderButtons(signedIn);
    await waitFor(() => expect(button('Wishlist')).toHaveAttribute('aria-pressed', 'true'));

    await userEvent.click(button('Wishlist'));

    await waitFor(() => expect(button('Wishlist')).toHaveAttribute('aria-pressed', 'false'));
    expect(deleted).toBe(true);
  });

  it('disables the buttons until the database confirms the save', async () => {
    mockEntry(null);
    let release: () => void = () => {};
    const confirmed = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post(restUrl('movie_entries'), async () => {
        await confirmed;
        return HttpResponse.json([{ is_favorite: true, status: null }], { status: 201 });
      }),
    );
    renderButtons(signedIn);
    await waitFor(() => expect(button('Favorite')).toBeEnabled());

    await userEvent.click(button('Favorite'));

    // Not yet confirmed: nothing pressed, nothing clickable.
    await waitFor(() => expect(button('Favorite')).toBeDisabled());
    expect(button('Favorite')).toHaveAttribute('aria-pressed', 'false');
    release();
    await waitFor(() => expect(button('Favorite')).toHaveAttribute('aria-pressed', 'true'));
    expect(button('Favorite')).toBeEnabled();
  });

  it('says so when a save fails, and keeps showing the saved state', async () => {
    mockEntry(null);
    server.use(
      http.post(restUrl('movie_entries'), () =>
        HttpResponse.json({ message: 'Service Unavailable' }, { status: 503 }),
      ),
    );
    renderButtons(signedIn);
    await waitFor(() => expect(button('Favorite')).toBeEnabled());

    await userEvent.click(button('Favorite'));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save. Try again.");
    expect(button('Favorite')).toHaveAttribute('aria-pressed', 'false');
  });

  it('offers a retry when the lists cannot be loaded', async () => {
    server.use(
      http.get(restUrl('movie_entries'), () =>
        HttpResponse.json({ message: 'Service Unavailable' }, { status: 503 }),
      ),
    );
    renderButtons(signedIn);

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your lists.");

    mockEntry({ isFavorite: true, status: null });
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(button('Favorite')).toHaveAttribute('aria-pressed', 'true'));
  });
});
```

In `src/features/movie/MovieDetailPage.test.tsx`:

1. Add imports:

```tsx
import { signedIn } from '../../test/auth';
import { restUrl } from '../../test/supabase';
import type { AuthState } from '../auth/useSession';
```

2. Give `renderDetail` an optional session. Change its signature and its
   `renderWithProviders` call:

```tsx
function renderDetail(route: string, auth?: AuthState) {
```

```tsx
    { route, auth },
```

3. Add this test inside the `describe` block:

```tsx
  it('still shows the movie when the lists cannot be loaded', async () => {
    server.use(
      http.get('/api/tmdb/movie/550', () => HttpResponse.json(detailFixture())),
      http.get(restUrl('movie_entries'), () =>
        HttpResponse.json({ message: 'Service Unavailable' }, { status: 503 }),
      ),
    );

    renderDetail('/movie/550?region=NL', signedIn);

    expect(await screen.findByText("Couldn't load your lists.")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fight Club' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/lists/ListButtons.test.tsx src/features/movie/MovieDetailPage.test.tsx`
Expected: FAIL: `Failed to resolve import "./ListButtons"`, and the new
detail-page test fails because "Couldn't load your lists." never appears.

- [ ] **Step 3: Implement the buttons**

Create `src/features/lists/ListButtons.tsx`:

```tsx
import { Link, useLocation } from 'react-router-dom';
import { useRegion } from '../../app/useRegion';
import { signInPath } from '../auth/signInPath';
import { useSession } from '../auth/useSession';
import type { MovieSnapshot } from './api';
import { useMovieEntry, useSaveEntry } from './queries';
import { nextFlags, type EntryFlags, type ListAction } from './toggle';

const BUTTONS: { action: ListAction; label: string }[] = [
  { action: 'favorite', label: 'Favorite' },
  { action: 'wishlist', label: 'Wishlist' },
  { action: 'watched', label: 'Watched' },
];

const BASE_CLASSES = 'rounded-full border px-4 py-1.5 text-sm';
const OFF_CLASSES = 'border-neutral-700 text-neutral-300 hover:bg-neutral-800';
const ON_CLASSES = 'border-neutral-100 bg-neutral-100 text-neutral-900';

function isOn(flags: EntryFlags | null, action: ListAction): boolean {
  if (!flags) return false;
  return action === 'favorite' ? flags.isFavorite : flags.status === action;
}

function Label({ action, label }: { action: ListAction; label: string }) {
  return (
    <>
      {/* Decorative: the accessible name stays exactly "Favorite". */}
      {action === 'favorite' && <span aria-hidden="true">♥ </span>}
      {label}
    </>
  );
}

export function ListButtons({ movie }: { movie: MovieSnapshot }) {
  const session = useSession();
  const location = useLocation();
  const { region } = useRegion();
  const entry = useMovieEntry(movie.id);
  const save = useSaveEntry(movie);

  if (session.status === 'signed-out') {
    // Visitors see the same three controls, so they learn the feature exists.
    // Each leads to sign-in and back to this page. Nothing is remembered:
    // after signing in, they press the button again.
    const href = signInPath(region, location.pathname + location.search);
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        {BUTTONS.map(({ action, label }) => (
          <Link key={action} to={href} className={`${BASE_CLASSES} ${OFF_CLASSES}`}>
            <Label action={action} label={label} />
          </Link>
        ))}
      </div>
    );
  }

  if (entry.isError) {
    // TMDB and Supabase are separate: the movie above still renders.
    return (
      <div role="alert" className="mt-4 flex items-center gap-3 text-sm text-neutral-300">
        Couldn't load your lists.
        <button type="button" onClick={() => void entry.refetch()} className="underline">
          Retry
        </button>
      </div>
    );
  }

  const flags = entry.data ?? null;
  // Disabled while the session or the entry is still loading, and while a save
  // is in flight. The new state appears only once the database confirms it,
  // so the screen never shows something that wasn't saved.
  const busy = session.status === 'loading' || entry.isPending || save.isPending;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {BUTTONS.map(({ action, label }) => {
          const on = isOn(flags, action);
          return (
            <button
              key={action}
              type="button"
              aria-pressed={on}
              disabled={busy}
              onClick={() => save.mutate(nextFlags(flags, action))}
              className={`${BASE_CLASSES} ${on ? ON_CLASSES : OFF_CLASSES} disabled:opacity-50`}
            >
              <Label action={action} label={label} />
            </button>
          );
        })}
      </div>
      {save.isError && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          Couldn't save. Try again.
        </p>
      )}
    </div>
  );
}
```

In `src/features/movie/MovieDetailPage.tsx`, add the import:

```tsx
import { ListButtons } from '../lists/ListButtons';
```

and render the buttons directly after the year/runtime/rating paragraph (the
`<p className="mt-1 flex flex-wrap gap-x-3 ...">` that closes before the
genres `<ul>`):

```tsx
          <ListButtons movie={movie} />
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/features/lists/ListButtons.test.tsx src/features/movie/MovieDetailPage.test.tsx`
Expected: PASS. 7 tests in `ListButtons.test.tsx`; every detail-page test,
including the new one. The existing detail-page tests render signed out, so
they see the links and make no Supabase requests.

- [ ] **Step 5: Run the full checks**

Run: `npm test && npm run build && npm run lint`
Expected: 191 tests pass, the build succeeds, lint is clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/lists/ListButtons.tsx src/features/lists/ListButtons.test.tsx src/features/movie
git commit -F - <<'EOF'
feat: add Favorite, Wishlist and Watched buttons to the movie page

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 6: My lists page

**Files:**
- Create: `src/features/auth/SignInRedirect.tsx`
- Create: `src/features/lists/ListsPage.tsx`, `src/features/lists/ListsPage.test.tsx`
- Modify: `src/components/MovieGrid.tsx` (optional `hideEndOfResults`)
- Modify: `src/App.tsx`, `src/App.test.tsx`

**Interfaces:**
- Consumes: `useMyEntries` (Task 4, `queries.ts`); `entryToMovieSummary`, `MovieEntryRow` (Task 4, `api.ts`); `useSession` (Task 2); `signInPath` (Task 3); `entryRow`, `restUrl` (Tasks 2 and 4, `src/test/supabase.ts`); `signedIn`, `signedOut` (Task 2). Existing: `MovieGrid`, `withRegion`, `useRegion`.
- Produces:
  - `export function SignInRedirect(): JSX.Element`: redirects (replacing history) to `signInPath(region, <current path and query>)`. Task 7 uses it.
  - `export function ListsPage(): JSX.Element` at route `/lists`.
  - `MovieGrid` prop `hideEndOfResults?: boolean` (default `false`).
  - Tab links are named `<Label> (<count>)`, e.g. `Wishlist (1)`, once the entries have loaded.

- [ ] **Step 1: Write the failing tests**

Create `src/features/lists/ListsPage.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { server } from '../../test/server';
import { regionsFixture } from '../../test/fixtures';
import { signedIn, signedOut } from '../../test/auth';
import { entryRow, restUrl } from '../../test/supabase';
import { renderWithProviders } from '../../test/utils';
import type { AuthState } from '../auth/useSession';
import type { MovieEntryRow } from './api';
import { ListsPage } from './ListsPage';

const ROWS: MovieEntryRow[] = [
  entryRow({ movie_id: 550, title: 'Fight Club', status: 'wishlist' }),
  entryRow({ movie_id: 603, title: 'The Matrix', status: 'watched', is_favorite: true }),
  entryRow({ movie_id: 13, title: 'Forrest Gump', status: null, is_favorite: true }),
];

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function mockEntries(rows: MovieEntryRow[]) {
  server.use(http.get(restUrl('movie_entries'), () => HttpResponse.json(rows)));
}

function renderLists(route: string, auth: AuthState = signedIn) {
  server.use(
    http.get('/api/tmdb/watch/providers/regions', () =>
      HttpResponse.json({ results: regionsFixture }),
    ),
  );
  return renderWithProviders(
    <Routes>
      <Route path="/lists" element={<ListsPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { route, auth },
  );
}

describe('ListsPage', () => {
  it('opens on the wishlist, with a count on every tab', async () => {
    mockEntries(ROWS);
    renderLists('/lists?region=NL');

    expect(await screen.findByText('Fight Club')).toBeInTheDocument();
    expect(screen.queryByText('The Matrix')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Wishlist (1)' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Watched (1)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Favorites (2)' })).toBeInTheDocument();
    // A list is complete by nature; the browse grid's footer would read oddly.
    expect(screen.queryByText('End of results.')).not.toBeInTheDocument();
  });

  it('shows the tab named in the URL', async () => {
    mockEntries(ROWS);
    renderLists('/lists?tab=favorites&region=NL');

    expect(await screen.findByText('The Matrix')).toBeInTheDocument();
    expect(screen.getByText('Forrest Gump')).toBeInTheDocument();
    expect(screen.queryByText('Fight Club')).not.toBeInTheDocument();
  });

  it('falls back to the wishlist for an unknown tab', async () => {
    mockEntries(ROWS);
    renderLists('/lists?tab=nonsense&region=NL');

    expect(await screen.findByText('Fight Club')).toBeInTheDocument();
  });

  it('links each card to its movie, keeping the region', async () => {
    mockEntries(ROWS);
    renderLists('/lists?region=NL');

    const card = await screen.findByRole('link', { name: /fight club/i });

    expect(card.getAttribute('href')).toBe('/movie/550?region=NL');
  });

  it('says a tab is empty and points back to the catalog', async () => {
    mockEntries([]);
    renderLists('/lists?region=NL');

    expect(await screen.findByText('Nothing on your wishlist yet.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Browse the catalog' }).getAttribute('href'),
    ).toBe('/browse?region=NL');
  });

  it('offers a retry when the lists cannot be loaded', async () => {
    server.use(
      http.get(restUrl('movie_entries'), () =>
        HttpResponse.json({ message: 'Service Unavailable' }, { status: 503 }),
      ),
    );
    renderLists('/lists?region=NL');

    expect(await screen.findByText("Couldn't load your lists.")).toBeInTheDocument();

    mockEntries(ROWS);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Fight Club')).toBeInTheDocument();
  });

  it('sends a visitor to sign in, and back here afterwards', () => {
    renderLists('/lists?region=NL', signedOut);

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/sign-in?next=%2Flists%3Fregion%3DNL&region=NL',
    );
  });
});
```

Add to `src/App.test.tsx`, inside the `describe` block (and add
`import { signedIn } from './test/auth';` and
`import { restUrl } from './test/supabase';` to its imports):

```tsx
  it('serves My lists inside the layout', async () => {
    server.use(
      http.get('/api/tmdb/watch/providers/regions', () =>
        HttpResponse.json({ results: regionsFixture }),
      ),
      http.get(restUrl('movie_entries'), () => HttpResponse.json([])),
    );

    renderWithProviders(<App />, { route: '/lists?region=NL', auth: signedIn });

    expect(await screen.findByRole('heading', { name: 'My lists' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/lists/ListsPage.test.tsx src/App.test.tsx`
Expected: FAIL: `Failed to resolve import "./ListsPage"`, and the new App test
finds "That page does not exist." instead of the heading.

- [ ] **Step 3: Let `MovieGrid` leave out its end-of-results line**

In `src/components/MovieGrid.tsx`, add to `MovieGridProps` (after `emptyState`):

```tsx
  /** For lists that are complete by nature, where "End of results." reads oddly. */
  hideEndOfResults?: boolean;
```

add `hideEndOfResults = false,` to the destructured props (after `emptyState,`),
and change the end-of-results branch from

```tsx
      {!hasNextPage ? (
        <p className="py-8 text-center text-sm text-neutral-500">End of results.</p>
      ) : isFetchNextPageError ? (
```

to

```tsx
      {!hasNextPage ? (
        hideEndOfResults ? null : (
          <p className="py-8 text-center text-sm text-neutral-500">End of results.</p>
        )
      ) : isFetchNextPageError ? (
```

- [ ] **Step 4: Add the shared redirect**

Create `src/features/auth/SignInRedirect.tsx`:

```tsx
import { Navigate, useLocation } from 'react-router-dom';
import { useRegion } from '../../app/useRegion';
import { signInPath } from './signInPath';

/** Sends a signed-out visitor to sign in, and back to this page afterwards. */
export function SignInRedirect() {
  const location = useLocation();
  const { region } = useRegion();

  // replace: Back from the sign-in page must not land here and bounce again.
  return <Navigate to={signInPath(region, location.pathname + location.search)} replace />;
}
```

- [ ] **Step 5: Implement the page**

Create `src/features/lists/ListsPage.tsx`:

```tsx
import { Link, useSearchParams } from 'react-router-dom';
import { useRegion, withRegion } from '../../app/useRegion';
import { MovieGrid } from '../../components/MovieGrid';
import { SignInRedirect } from '../auth/SignInRedirect';
import { useSession } from '../auth/useSession';
import { entryToMovieSummary, type MovieEntryRow } from './api';
import { useMyEntries } from './queries';

interface TabConfig {
  tab: 'wishlist' | 'watched' | 'favorites';
  label: string;
  empty: string;
  includes: (row: MovieEntryRow) => boolean;
}

const TABS: TabConfig[] = [
  {
    tab: 'wishlist',
    label: 'Wishlist',
    empty: 'Nothing on your wishlist yet.',
    includes: (row) => row.status === 'wishlist',
  },
  {
    tab: 'watched',
    label: 'Watched',
    empty: 'Nothing marked as watched yet.',
    includes: (row) => row.status === 'watched',
  },
  {
    tab: 'favorites',
    label: 'Favorites',
    empty: 'No favorites yet.',
    includes: (row) => row.is_favorite,
  },
];

const TAB_CLASSES = 'rounded-full px-4 py-1.5 text-sm';
const ACTIVE_TAB_CLASSES = 'bg-neutral-100 text-neutral-900';
const INACTIVE_TAB_CLASSES = 'text-neutral-300 hover:bg-neutral-800';

export function ListsPage() {
  const session = useSession();
  const [searchParams] = useSearchParams();
  const { region } = useRegion();
  const entries = useMyEntries();

  if (session.status === 'loading') {
    return <div className="h-96 animate-pulse rounded-lg bg-neutral-900" />;
  }
  if (session.status === 'signed-out') {
    return <SignInRedirect />;
  }

  // The tab lives in the URL like all page state. Missing or unknown means
  // the wishlist.
  const current = TABS.find((item) => item.tab === searchParams.get('tab')) ?? TABS[0];
  // One query loads every entry; each tab is a filter over it, which also
  // gives the counts without extra requests.
  const rows = entries.data ?? [];

  return (
    <section>
      <h1 className="mb-4 text-2xl font-semibold">My lists</h1>

      <nav aria-label="Lists" className="mb-6 flex flex-wrap gap-2">
        {TABS.map((item) => {
          const active = item.tab === current.tab;
          return (
            <Link
              key={item.tab}
              to={withRegion('/lists', region, { tab: item.tab })}
              aria-current={active ? 'page' : undefined}
              className={`${TAB_CLASSES} ${active ? ACTIVE_TAB_CLASSES : INACTIVE_TAB_CLASSES}`}
            >
              {item.label}
              {entries.data && ` (${rows.filter(item.includes).length})`}
            </Link>
          );
        })}
      </nav>

      {/* Not ErrorState: its wording is about TMDB, and this is Supabase. */}
      {entries.isError ? (
        <div className="py-16 text-center">
          <p className="text-neutral-300">Couldn't load your lists.</p>
          <button
            type="button"
            onClick={() => void entries.refetch()}
            className="mt-4 rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white"
          >
            Try again
          </button>
        </div>
      ) : (
        <MovieGrid
          movies={rows.filter(current.includes).map(entryToMovieSummary)}
          status={entries.isPending ? 'pending' : 'success'}
          error={null}
          hasNextPage={false}
          isFetchingNextPage={false}
          hideEndOfResults
          onLoadMore={() => {}}
          onRetry={() => void entries.refetch()}
          emptyState={
            <div className="py-16 text-center">
              <p className="text-neutral-300">{current.empty}</p>
              <Link
                to={withRegion('/browse', region)}
                className="mt-4 inline-block text-sm text-neutral-400 underline"
              >
                Browse the catalog
              </Link>
            </div>
          }
          linkFor={(movie) => withRegion(`/movie/${movie.id}`, region)}
        />
      )}
    </section>
  );
}
```

In `src/App.tsx`, add `import { ListsPage } from './features/lists/ListsPage';`
and, directly above the catch-all route:

```tsx
        <Route path="/lists" element={<ListsPage />} />
```

- [ ] **Step 6: Run them to verify they pass**

Run: `npx vitest run src/features/lists/ListsPage.test.tsx src/App.test.tsx src/components/MovieGrid.test.tsx`
Expected: PASS. 7 tests in `ListsPage.test.tsx`, 3 in `App.test.tsx`, and
every existing `MovieGrid` test (the new prop defaults to the old behaviour).

- [ ] **Step 7: Run the full checks**

Run: `npm test && npm run build && npm run lint`
Expected: 199 tests pass, the build succeeds, lint is clean.

- [ ] **Step 8: Commit**

```bash
git add src/features/auth/SignInRedirect.tsx src/features/lists/ListsPage.tsx src/features/lists/ListsPage.test.tsx src/components/MovieGrid.tsx src/App.tsx src/App.test.tsx
git commit -F - <<'EOF'
feat: add the My lists page with wishlist, watched and favorites tabs

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Account page: sign out and delete account

**Files:**
- Modify: `src/features/auth/authApi.ts`, `src/features/auth/authApi.test.ts`
- Create: `src/features/account/AccountPage.tsx`, `src/features/account/AccountPage.test.tsx`
- Modify: `src/App.tsx`, `src/App.test.tsx`

**Interfaces:**
- Consumes: `sendMagicLink`, `exchangeCode` (Task 3); `SignInRedirect` (Task 6); `clearListsCache`, `listsKeys` (Task 4); `useSession` (Task 2); `signedIn`, `signedOut`, `testUser` (Task 2); `authUrl`, `restUrl`, `sessionResponse`, `entryRow` (Tasks 2 and 4).
- Produces:
  - `export async function signOut(): Promise<boolean>` (true when this browser's session is gone)
  - `export async function deleteMyAccount(): Promise<boolean>` (true when the account is deleted)
  - `export function AccountPage(): JSX.Element` at route `/account`

- [ ] **Step 1: Write the failing tests for the two new auth calls**

Append to `src/features/auth/authApi.test.ts` (and add `deleteMyAccount`,
`signOut` to its import from `./authApi`, and `restUrl` to its import from
`../../test/supabase`):

```ts
/** A real session in this browser: ask for a link, then exchange its code. */
async function signInForReal() {
  server.use(
    http.post(authUrl('otp'), () => HttpResponse.json({})),
    http.post(authUrl('token'), () => HttpResponse.json(sessionResponse())),
  );
  await sendMagicLink('reader@example.com', '/account');
  await exchangeCode('code-from-the-email');
}

describe('signOut', () => {
  it("ends this browser's session", async () => {
    await signInForReal();
    server.use(http.post(authUrl('logout'), () => new HttpResponse(null, { status: 204 })));

    expect(await signOut()).toBe(true);
  });

  it('reports failure when Supabase could not end the session', async () => {
    await signInForReal();
    server.use(
      http.post(authUrl('logout'), () =>
        HttpResponse.json({ code: 500, error_code: 'unexpected_failure', msg: 'boom' }, { status: 500 }),
      ),
    );

    expect(await signOut()).toBe(false);
  });
});

describe('deleteMyAccount', () => {
  it('calls delete_my_account', async () => {
    let called = false;
    server.use(
      http.post(restUrl('rpc/delete_my_account'), () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    expect(await deleteMyAccount()).toBe(true);
    expect(called).toBe(true);
  });

  it('reports failure when the database refuses', async () => {
    server.use(
      http.post(restUrl('rpc/delete_my_account'), () =>
        HttpResponse.json({ message: 'Service Unavailable' }, { status: 503 }),
      ),
    );

    expect(await deleteMyAccount()).toBe(false);
  });
});
```

Run: `npx vitest run src/features/auth/authApi.test.ts`
Expected: FAIL: `signOut` and `deleteMyAccount` are not exported.

- [ ] **Step 2: Implement them**

Append to `src/features/auth/authApi.ts`:

```ts
/** Ends the session in this browser. False when Supabase couldn't end it. */
export async function signOut(): Promise<boolean> {
  // 'local': this browser only. Other devices stay signed in.
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  return !error;
}

/**
 * Deletes the signed-in user's account and all their entries through the
 * delete_my_account database function, then clears this browser's session.
 * False when the database refused, in which case nothing was deleted.
 */
export async function deleteMyAccount(): Promise<boolean> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) return false;

  // The user no longer exists, so Supabase answers this request with an
  // error. supabase-js still clears the local session for such answers
  // (401, 403, 404), and that's the only part left to do.
  await supabase.auth.signOut({ scope: 'local' });
  return true;
}
```

Run: `npx vitest run src/features/auth/authApi.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 3: Write the failing tests for the page**

Create `src/features/account/AccountPage.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { server } from '../../test/server';
import { regionsFixture } from '../../test/fixtures';
import { signedIn, signedOut, testUser } from '../../test/auth';
import { authUrl, entryRow, restUrl, sessionResponse } from '../../test/supabase';
import { renderWithProviders } from '../../test/utils';
import { exchangeCode, sendMagicLink } from '../auth/authApi';
import type { AuthState } from '../auth/useSession';
import { listsKeys } from '../lists/queries';
import { AccountPage } from './AccountPage';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderAccount(auth: AuthState = signedIn) {
  server.use(
    http.get('/api/tmdb/watch/providers/regions', () =>
      HttpResponse.json({ results: regionsFixture }),
    ),
  );
  const rendered = renderWithProviders(
    <Routes>
      <Route path="/account" element={<AccountPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { route: '/account?region=NL', auth },
  );
  // Something cached for the page to clear on sign-out or deletion.
  rendered.queryClient.setQueryData(listsKeys.all(testUser.id), [entryRow()]);
  return rendered;
}

function mockDeleteFunction(respond: () => Response) {
  const calls = { count: 0 };
  server.use(
    http.post(restUrl('rpc/delete_my_account'), () => {
      calls.count += 1;
      return respond();
    }),
  );
  return calls;
}

describe('AccountPage', () => {
  it('shows who is signed in', () => {
    renderAccount();

    expect(screen.getByText('reader@example.com')).toBeInTheDocument();
  });

  it('signs out, clears the lists from the cache, and returns to the catalog', async () => {
    const { queryClient } = renderAccount();

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByTestId('location')).toHaveTextContent('/browse?region=NL');
    expect(queryClient.getQueryData(listsKeys.all(testUser.id))).toBeUndefined();
  });

  it('says so when signing out fails', async () => {
    // A real session, so that signing out has to ask Supabase.
    server.use(
      http.post(authUrl('otp'), () => HttpResponse.json({})),
      http.post(authUrl('token'), () => HttpResponse.json(sessionResponse())),
      http.post(authUrl('logout'), () =>
        HttpResponse.json({ code: 500, error_code: 'unexpected_failure', msg: 'boom' }, { status: 500 }),
      ),
    );
    await sendMagicLink('reader@example.com', '/account');
    await exchangeCode('code-from-the-email');
    renderAccount();

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't sign out. Try again.");
  });

  it('asks for confirmation before deleting, and can be cancelled', async () => {
    const calls = mockDeleteFunction(() => new HttpResponse(null, { status: 204 }));
    renderAccount();

    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));

    expect(
      screen.getByText('This permanently deletes your account and all your lists.'),
    ).toBeInTheDocument();
    expect(calls.count).toBe(0);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Delete account' })).toBeInTheDocument();
  });

  it('deletes the account, clears the cache, and says it is done', async () => {
    const calls = mockDeleteFunction(() => new HttpResponse(null, { status: 204 }));
    const { queryClient } = renderAccount();

    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    expect(await screen.findByText('Your account has been deleted.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the catalog' }).getAttribute('href')).toBe(
      '/browse?region=NL',
    );
    expect(calls.count).toBe(1);
    expect(queryClient.getQueryData(listsKeys.all(testUser.id))).toBeUndefined();
  });

  it('says so when deletion fails, and keeps the account', async () => {
    mockDeleteFunction(() => HttpResponse.json({ message: 'Service Unavailable' }, { status: 503 }));
    renderAccount();

    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't delete your account. Try again.",
    );
    expect(screen.getByRole('button', { name: 'Delete my account' })).toBeEnabled();
  });

  it('sends a visitor to sign in, and back here afterwards', () => {
    renderAccount(signedOut);

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/sign-in?next=%2Faccount%3Fregion%3DNL&region=NL',
    );
  });
});
```

Add to `src/App.test.tsx`, inside the `describe` block:

```tsx
  it('serves the account page inside the layout', () => {
    server.use(
      http.get('/api/tmdb/watch/providers/regions', () =>
        HttpResponse.json({ results: regionsFixture }),
      ),
    );

    renderWithProviders(<App />, { route: '/account?region=NL', auth: signedIn });

    expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument();
  });
```

Run: `npx vitest run src/features/account src/App.test.tsx`
Expected: FAIL: `Failed to resolve import "./AccountPage"`, and the new App
test finds "That page does not exist.".

- [ ] **Step 4: Implement the page**

Create `src/features/account/AccountPage.tsx`:

```tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useRegion, withRegion } from '../../app/useRegion';
import { deleteMyAccount, signOut } from '../auth/authApi';
import { SignInRedirect } from '../auth/SignInRedirect';
import { useSession } from '../auth/useSession';
import { clearListsCache } from '../lists/queries';

type Phase = 'idle' | 'signing-out' | 'confirming-delete' | 'deleting' | 'deleted';

const SECONDARY_BUTTON =
  'rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50';

export function AccountPage() {
  const session = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { region } = useRegion();
  const [phase, setPhase] = useState<Phase>('idle');
  const [failure, setFailure] = useState<'sign-out' | 'delete' | null>(null);
  const leaving = phase === 'signing-out' || phase === 'deleting';

  // This page guards itself instead of sending every signed-out visitor to
  // sign in: after deleting their account the user *is* signed out, and must
  // still see this message.
  if (phase === 'deleted') {
    return (
      <div className="py-16 text-center">
        <p className="text-neutral-300">Your account has been deleted.</p>
        <Link
          to={withRegion('/browse', region)}
          className="mt-4 inline-block text-sm text-neutral-400 underline"
        >
          Back to the catalog
        </Link>
      </div>
    );
  }

  // While leaving, the session ends a moment before this page moves on. A
  // placeholder in between stops the sign-in redirect from winning that race.
  if (session.status === 'loading' || (leaving && session.status === 'signed-out')) {
    return <div className="h-40 animate-pulse rounded-lg bg-neutral-900" />;
  }
  if (session.status === 'signed-out') {
    return <SignInRedirect />;
  }

  async function handleSignOut() {
    setFailure(null);
    setPhase('signing-out');
    if (await signOut()) {
      clearListsCache(queryClient);
      navigate(withRegion('/browse', region));
    } else {
      setPhase('idle');
      setFailure('sign-out');
    }
  }

  async function handleDelete() {
    setFailure(null);
    setPhase('deleting');
    if (await deleteMyAccount()) {
      clearListsCache(queryClient);
      setPhase('deleted');
    } else {
      setPhase('confirming-delete');
      setFailure('delete');
    }
  }

  return (
    <section className="mx-auto max-w-md py-12">
      <h1 className="text-2xl font-semibold">Account</h1>
      <p className="mt-3 text-neutral-300">
        Signed in as <strong className="text-neutral-100">{session.user.email}</strong>
      </p>

      <button
        type="button"
        disabled={leaving}
        onClick={() => void handleSignOut()}
        className={`mt-6 ${SECONDARY_BUTTON}`}
      >
        Sign out
      </button>
      {failure === 'sign-out' && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          Couldn't sign out. Try again.
        </p>
      )}

      <div className="mt-10 border-t border-neutral-800 pt-6">
        {phase === 'confirming-delete' || phase === 'deleting' ? (
          <>
            <p className="text-neutral-300">
              This permanently deletes your account and all your lists.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                disabled={phase === 'deleting'}
                onClick={() => void handleDelete()}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                Delete my account
              </button>
              <button
                type="button"
                disabled={phase === 'deleting'}
                onClick={() => {
                  setPhase('idle');
                  setFailure(null);
                }}
                className={SECONDARY_BUTTON}
              >
                Cancel
              </button>
            </div>
            {failure === 'delete' && (
              <p role="alert" className="mt-2 text-sm text-red-300">
                Couldn't delete your account. Try again.
              </p>
            )}
          </>
        ) : (
          <button
            type="button"
            disabled={leaving}
            onClick={() => setPhase('confirming-delete')}
            className="text-sm text-red-300 underline disabled:opacity-50"
          >
            Delete account
          </button>
        )}
      </div>
    </section>
  );
}
```

In `src/App.tsx`, add `import { AccountPage } from './features/account/AccountPage';`
and, directly above the catch-all route:

```tsx
        <Route path="/account" element={<AccountPage />} />
```

- [ ] **Step 5: Run them to verify they pass**

Run: `npx vitest run src/features/account src/App.test.tsx`
Expected: PASS. 7 tests in `AccountPage.test.tsx`, 4 in `App.test.tsx`.

- [ ] **Step 6: Run the full checks**

Run: `npm test && npm run build && npm run lint`
Expected: 211 tests pass, the build succeeds, lint is clean.

- [ ] **Step 7: Commit**

```bash
git add src/features/auth/authApi.ts src/features/auth/authApi.test.ts src/features/account src/App.tsx src/App.test.tsx
git commit -F - <<'EOF'
feat: add the account page with sign-out and account deletion

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Header links

**Files:**
- Create: `src/app/AccountNav.tsx`
- Modify: `src/app/Layout.tsx`, `src/app/Layout.test.tsx`

**Interfaces:**
- Consumes: `useSession`, `AuthState` (Task 2); `signInPath` (Task 3); `signedIn`, `authLoading` (Task 2). Existing: `withRegion`.
- Produces: `export function AccountNav({ region }: { region: string }): JSX.Element | null`. Link names are exactly `Sign in`, `My lists`, `Account`.

- [ ] **Step 1: Write the failing tests**

In `src/app/Layout.test.tsx`:

1. Add imports:

```tsx
import { authLoading, signedIn } from '../test/auth';
import type { AuthState } from '../features/auth/useSession';
```

2. Let `renderShell` take a session, and give it a `/sign-in` route. Replace
   the function with:

```tsx
function renderShell(route: string, auth?: AuthState) {
  mockRegions();

  return renderWithProviders(
    <Routes>
      <Route element={<Layout />}>
        <Route path="/browse" element={<LocationProbe />} />
        <Route path="/search" element={<SearchRoute />} />
        <Route path="/movie/:id" element={<LocationProbe />} />
        <Route path="/sign-in" element={<LocationProbe />} />
      </Route>
    </Routes>,
    { route, auth },
  );
}
```

3. Add a new `describe` block at the end of the file:

```tsx
describe('Layout account links', () => {
  it('offers visitors a sign-in link that comes back to this page', () => {
    renderShell('/browse?region=NL');

    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toContain(
      '/sign-in?next=%2Fbrowse%3Fregion%3DNL',
    );
  });

  it('shows My lists and Account once signed in', () => {
    renderShell('/browse?region=NL', signedIn);

    expect(screen.getByRole('link', { name: 'My lists' }).getAttribute('href')).toBe(
      '/lists?region=NL',
    );
    expect(screen.getByRole('link', { name: 'Account' }).getAttribute('href')).toBe(
      '/account?region=NL',
    );
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('shows nothing while the session is loading, so "Sign in" never flashes', () => {
    renderShell('/browse?region=NL', authLoading);

    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'My lists' })).not.toBeInTheDocument();
  });

  it('hides the sign-in link on the sign-in page itself', () => {
    renderShell('/sign-in?next=%2Flists&region=NL');

    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/app/Layout.test.tsx`
Expected: FAIL: the first two new tests find no such links (the header has none
yet). The other two pass already, because nothing is rendered.

- [ ] **Step 3: Implement the links**

Create `src/app/AccountNav.tsx`:

```tsx
import { Link, useLocation } from 'react-router-dom';
import { signInPath } from '../features/auth/signInPath';
import { useSession } from '../features/auth/useSession';
import { withRegion } from './useRegion';

// On these pages a "Sign in" link would point at the page you're already on,
// and replace its ?next= with the sign-in page itself.
const AUTH_PAGES = ['/sign-in', '/auth/callback'];

const LINK_CLASSES = 'text-sm text-neutral-300 hover:text-neutral-100 hover:underline';

export function AccountNav({ region }: { region: string }) {
  const session = useSession();
  const location = useLocation();

  // Nothing while loading, so a signed-in user never sees "Sign in" flash.
  if (session.status === 'loading') return null;

  if (session.status === 'signed-in') {
    return (
      <nav aria-label="Account" className="flex gap-4">
        <Link to={withRegion('/lists', region)} className={LINK_CLASSES}>
          My lists
        </Link>
        <Link to={withRegion('/account', region)} className={LINK_CLASSES}>
          Account
        </Link>
      </nav>
    );
  }

  if (AUTH_PAGES.includes(location.pathname)) return null;

  return (
    <Link to={signInPath(region, location.pathname + location.search)} className={LINK_CLASSES}>
      Sign in
    </Link>
  );
}
```

In `src/app/Layout.tsx`, add `import { AccountNav } from './AccountNav';` and
render it directly after `<RegionPicker />`:

```tsx
          <RegionPicker />
          <AccountNav region={region} />
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/app/Layout.test.tsx`
Expected: PASS, every test in the file (the existing five and the new four).

- [ ] **Step 5: Run the full checks**

Run: `npm test && npm run build && npm run lint`
Expected: 215 tests pass, the build succeeds, lint is clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/AccountNav.tsx src/app/Layout.tsx src/app/Layout.test.tsx
git commit -F - <<'EOF'
feat: add Sign in, My lists and Account links to the header

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 9: README and final automated checks

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above. Produces documentation only.

- [ ] **Step 1: Document the Supabase setup**

In `README.md`:

1. In **Setup**, replace the paragraph starting "Add a TMDB API Read Access
   Token" with:

```markdown
Add a TMDB API Read Access Token to `.env` as `TMDB_TOKEN`. Create one at
https://www.themoviedb.org/settings/api.

Accounts and lists need a Supabase project (see **Accounts and lists** below).
Add its URL and publishable key to `.env` as `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. Without them, browsing and search still work;
the sign-in page explains what is missing.
```

2. Add this section directly before **Deployment**:

```markdown
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

**Until a custom email provider is set up, magic links only reach members of
the Supabase project's team, at most 2 per hour.** That is Supabase's built-in
email service. Opening sign-up to the public needs a domain verified with an
email provider such as Resend, entered in Supabase's SMTP settings. See
"Launch prerequisites" in the spec.
```

3. In **Deployment**, replace the paragraph with:

```markdown
Pushing to `main` deploys to production on Vercel; other branches get preview
deployments. Set `TMDB_TOKEN`, `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` in the Vercel project's environment variables
for both Production and Preview, **without** a custom preview branch: a
variable tied to one branch is Preview-only, and Production silently gets
nothing. `.env` is gitignored and never committed.
```

4. Add to **Known constraints**:

```markdown
- Supabase's free plan pauses a project after a week without enough database
  activity. Sign-in and lists then fail until it is resumed from the dashboard
  (data is kept); browsing and search are unaffected.
- A magic link only works in the browser that asked for it: that browser holds
  the secret the link is issued against (PKCE). Opening it elsewhere shows how
  to get a new one.
```

- [ ] **Step 2: Run the full checks**

```bash
npm test && npm run build && npm run lint && npx prettier --check src supabase README.md vite.config.ts
```

Expected: 215 tests pass, the build and lint succeed, Prettier reports all
files formatted. If Prettier lists files, run `npx prettier --write` on exactly
those files, rerun the checks, and include them in the commit.

- [ ] **Step 3: Check the bundle holds no secrets**

```bash
grep -rl "service_role" dist && echo "LEAK: service_role in dist/" || echo "clean: no service_role"
token=$(sed -n 's/^TMDB_TOKEN=//p' .env | tr -d "\"'"); suffix=${token: -24}
if [ -z "$suffix" ]; then echo "TMDB_TOKEN is empty in .env — cannot check";
elif grep -rqF "$suffix" dist; then echo "LEAK: TMDB token in dist/";
else echo "clean: TMDB token not in dist/"; fi
```

Expected: `clean: no service_role` and `clean: TMDB token not in dist/`. The
Supabase URL and publishable key appearing in `dist/` is expected and fine.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -F - <<'EOF'
docs: document Supabase setup, accounts and lists

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 10: Set up Supabase, deploy, and verify for real

Unit tests stub Supabase's auth pieces, and MSW stands in for its API. This
task checks the real thing: that the stand-in `auth.uid()` behaves like
Supabase's, and that the real project's grants and policies are what the
migration says.

**Files:** none. If a check fails, fix the cause in the relevant task's files
with a new commit, then repeat the check.

- [ ] **Step 1: 👤 USER: create the Supabase project and run the migration**

1. At https://supabase.com, create a free project. A region close to your
   users (for example, Frankfurt) keeps requests fast.
2. Open **SQL Editor**, paste the whole of
   `supabase/migrations/20260912000000_accounts_and_lists.sql`, and run it.
   Expected: "Success. No rows returned."
3. Open **Table Editor → movie_entries**. It should say RLS is enabled.

- [ ] **Step 2: 👤 USER: configure sign-in addresses**

In **Authentication → URL Configuration**, set the Site URL to
`https://hoegen-movies-catalog.vercel.app`, and add the three Redirect URLs
listed in the README's **Accounts and lists** section.

- [ ] **Step 3: 👤 USER: set the variables**

From **Project Settings → API Keys**, copy the project URL and the publishable
key.

1. Add both to the local `.env` as `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. In Vercel → **Settings → Environment Variables**, add both for
   **Production and Preview**. Don't click "Select a Custom Preview Branch".

- [ ] **Step 4: Check the grants in the real project**

👤 USER: in the SQL editor, run:

```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'movie_entries' and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;
```

Expected: exactly four rows, all for `authenticated`: `DELETE`, `INSERT`,
`SELECT`, `UPDATE`. No `anon` rows, no `TRUNCATE`.

Then the agent runs a request with only the publishable key, as any stranger
could:

```bash
set -a; . ./.env; set +a
curl -s "$VITE_SUPABASE_URL/rest/v1/movie_entries?select=*" -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY"; echo
```

Expected: a permission error (`"code":"42501"`) or `[]`. Never rows.

- [ ] **Step 5: Push and check the preview**

Push the branch: `git push -u origin HEAD`. In the Vercel dashboard, open the
new preview deployment of `accounts-lists` once it's ready. If it was built
before Step 3, redeploy it so it picks up the variables.

👤 USER, in the browser on the preview URL:
1. Open a movie. The Favorite / Wishlist / Watched buttons show. Signed out,
   pressing one goes to the sign-in page.
2. Sign in with your own email address (as a project team member, the
   built-in email service will send to you). Open the link **in the same
   browser**. You land back on the movie.
3. Press Wishlist, then Watched: Watched takes over from Wishlist. Press
   Favorite.
4. Open **My lists**. The movie is under Watched and Favorites, not Wishlist,
   and the counts match.
5. Reload `/lists?tab=favorites` directly. It still renders.

- [ ] **Step 6: 👤 USER: prove another user can't see your rows**

1. In Supabase → **Authentication → Users**, choose **Add user → Create new
   user** with any email and a password, and tick **Auto Confirm User**. No
   email is sent.
2. In the SQL editor, switch the role selector from `postgres` to
   `authenticated` and impersonate that new user. Run
   `select count(*) from public.movie_entries;` Expected: `0`.
3. Impersonate yourself and run it again. Expected: the number of movies
   you added in Step 5.

- [ ] **Step 7: 👤 USER: delete your account last**

On the preview, open **Account → Delete account → Delete my account**. The
page says your account has been deleted. In the Table Editor, your rows are
gone, and your user no longer appears under Authentication → Users. Signing
in again creates a fresh, empty account. Also delete the test user from
Step 6.

- [ ] **Step 8: Merge to `main`**

Use superpowers:finishing-a-development-branch. There is no `gh` CLI on this
machine, so the user opens the pull request from GitHub's compare page. After
the merge, Vercel deploys production.

- [ ] **Step 9: 👤 USER: smoke-test production**

On `https://hoegen-movies-catalog.vercel.app`: sign in, add a movie to a list,
see it on My lists, and sign out. Browsing and search still work.

When every check passes, the feature is done. It is **not yet ready for public
sign-ups**: that needs the spec's launch prerequisites (a domain with custom
email, and a security review of the deployed site).
