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

-- auth.uid() reads a session setting, the way Supabase reads the JWT claim.
create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
