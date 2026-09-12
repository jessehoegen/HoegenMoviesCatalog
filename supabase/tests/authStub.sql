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
