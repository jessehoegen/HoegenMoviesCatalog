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
