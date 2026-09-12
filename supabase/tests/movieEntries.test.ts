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
  db = (await base.clone()) as PGlite;
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
