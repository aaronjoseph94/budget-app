-- Stand-ins for the objects Supabase manages, so the migrations can be applied
-- to a throwaway local database exactly as written.
--
-- Used only by scripts/verify-migrations.sh. It is never applied to the hosted
-- project, where Supabase provides all of this itself. The point is that the
-- migrations under supabase/migrations/ are tested verbatim: a migration that
-- has to be edited to be testable is not the migration that runs in production.

-- so it can be applied and exercised locally exactly as written.
create schema if not exists auth;
create schema if not exists storage;

create table auth.users (id uuid primary key default gen_random_uuid());

-- The columns of Supabase's auth.sessions that 0030 reads: a sign-in lives
-- while its row does. Signing out, and Disconnect (revokeGrant), delete it.
create table auth.sessions (
  id        uuid primary key,
  user_id   uuid not null references auth.users (id) on delete cascade,
  not_after timestamptz
);

create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$ select string_to_array(name, '/') $$;

-- auth.uid() and auth.jwt() read session settings as Supabase's do: the sub
-- setting when one is set, else the claims PostgREST sets from the token. So
-- the schema gate can set a client_id claim and act as an AI app (0019).
create or replace function auth.jwt() returns jsonb
  language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                    nullif(current_setting('request.jwt.claims', true), ''))::jsonb
  $$;
create or replace function auth.uid() returns uuid
  language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
  $$;

-- The roles Supabase requests arrive as, and the default grants Supabase gives
-- them. Mirrored so a migration's REVOKE is tested against the privileges it
-- will actually be revoking in production: without these, 0004's revokes would
-- name roles that do not exist here, and the browser's real write access could
-- not be asserted at all.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
grant usage on schema public, auth, storage to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
grant all on all tables in schema storage to authenticated;

-- service_role is how the AI helper reaches the database (0016). As in
-- Supabase, it bypasses row-level security and gets every default grant;
-- 0016's functions are granted to it and to no other role, which the schema
-- gate can only prove if the role is here to be granted to.
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
grant usage on schema public, auth, storage to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on functions to service_role;
