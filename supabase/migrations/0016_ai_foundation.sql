-- 0016_ai_foundation.sql
--
-- Where the AI helper keeps what it needs, and the only doors to it (plan
-- slice A09, ADR 0004).
--
-- On 2026-09-24 the owner asked for the app to be AI first, with free
-- Google Gemini and room for paid services. Every AI call goes through one
-- Edge Function, `ai`, which holds the owner's keys. This adds:
--
-- - ai_settings: the owner's choices, which the browser reads and writes.
-- - ai_provider_keys: each pasted key, encrypted by the helper. The browser
--   has no grant on it at all, not even on its own rows.
-- - ai_usage and ai_provider_state: how many calls were made today, and
--   which services are resting. The browser may read its own rows, never
--   write one: a count the browser could lower is not a limit.
-- - Functions only the helper may call (granted to service_role alone), and
--   two the browser may call, which see its own keys without ciphertext.
--
-- Counting calls is bookkeeping, not money: a count is never shown as money
-- and never goes into a figure, so keeping it here, where it can be claimed
-- in one step, does not break CLAUDE.md's rule that SQL computes no figures
-- (ADR 0004). No money value is stored.
--
-- Every table has row-level security and the owner policy, as every table
-- must, even the ones the browser cannot reach. The day for every counter is
-- the Pacific day, because the free services reset at midnight Pacific.
--
-- Forward-only: 0001–0015 are applied, or queued to be, and are not edited.
-- Plain CREATE throughout, so pasting this file twice is refused.

begin;

create type public.ai_provider as enum ('gemini', 'groq', 'openrouter', 'openai', 'anthropic');

-- A CHECK cannot hold a subquery, so these two small tests are functions.
-- Each service at most once in the order they are tried in; a null counts
-- as a repeat, so none can be stored.
create function public.ai_providers_once(p public.ai_provider[])
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$ select cardinality(p) = (select count(distinct x) from unnest(p) as x) $$;

-- A model per service: an object whose keys are services and whose values
-- are model ids, never an address. The helper still checks each against
-- its own list, and never builds a URL from one; this only keeps anything
-- else out of the row the browser writes.
create function public.ai_models_valid(p jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when jsonb_typeof(p) <> 'object' then false
    else not exists (
      select 1 from jsonb_each(p) as e (k, v)
       where k not in ('gemini', 'groq', 'openrouter', 'openai', 'anthropic')
          or jsonb_typeof(v) <> 'string'
          or (v #>> '{}') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$'
          or position('//' in (v #>> '{}')) > 0)
  end
$$;

-- The Pacific day the counters are kept by.
create function public.ai_today()
returns date
language sql
stable
set search_path = public, pg_temp
as $$ select (now() at time zone 'America/Los_Angeles')::date $$;

create table public.ai_settings (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  enabled          boolean not null default true,
  provider_order   public.ai_provider[] not null default '{gemini,groq,openrouter,openai,anthropic}',
  models           jsonb not null default '{}',
  -- Calls a day, in all. Each task and each free service has its own lower
  -- limit in the helper; this is the owner's own ceiling over all of them.
  daily_cap        integer not null default 40,
  -- Paid services are tried only when this is on, so a paid key is never
  -- spent by a fallback the owner did not choose.
  allow_paid       boolean not null default false,
  tone             text not null default 'cheerleader',
  share_shop_names boolean not null default true,
  updated_at       timestamptz not null default now(),
  constraint ai_settings_order_once check (public.ai_providers_once(provider_order)),
  constraint ai_settings_models_by_service check (public.ai_models_valid(models)),
  constraint ai_settings_cap_range check (daily_cap between 10 and 150),
  constraint ai_settings_tone check (tone in ('cheerleader', 'straight'))
);

alter table public.ai_settings enable row level security;

create policy ai_settings_own_rows on public.ai_settings
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A pasted key, encrypted by the helper with AES-256-GCM (ADR 0004). Only
-- the helper can open it; the database alone, a dump or a screenshot of the
-- SQL editor, shows ciphertext. key_hint is the last four characters, for
-- "key ending …abcd". status is what the last test found: ok, busy,
-- rejected, or locked when a Supabase key change left it unopenable.
create table public.ai_provider_keys (
  user_id    uuid not null references auth.users (id) on delete cascade,
  provider   public.ai_provider not null,
  ciphertext text not null,
  iv         text not null,
  kek_id     text not null,
  key_v      smallint not null default 1,
  key_hint   text not null,
  status     text not null default 'ok',
  model      text,
  tested_at  timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider),
  -- Base64. A key is 20 to 200 characters, and GCM adds 16 bytes.
  constraint ai_provider_keys_ciphertext check (
    ciphertext ~ '^[A-Za-z0-9+/]+={0,2}$' and char_length(ciphertext) between 48 and 400),
  -- Twelve random bytes, in base64.
  constraint ai_provider_keys_iv check (iv ~ '^[A-Za-z0-9+/]{16}$'),
  -- Eight bytes naming which root locked it, in hex.
  constraint ai_provider_keys_kek_id check (kek_id ~ '^[0-9a-f]{16}$'),
  constraint ai_provider_keys_version check (key_v >= 1),
  constraint ai_provider_keys_hint check (key_hint ~ '^[A-Za-z0-9_.:-]{1,4}$'),
  constraint ai_provider_keys_status check (status in ('ok', 'busy', 'rejected', 'locked')),
  constraint ai_provider_keys_model check (model is null or model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$')
);

alter table public.ai_provider_keys enable row level security;

create policy ai_provider_keys_own_rows on public.ai_provider_keys
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- The policy is there because every table must have it. The grants are
-- what keep the browser out: not a row, not even its own.
revoke all on public.ai_provider_keys from anon, authenticated;

-- One row per day, service, model and task: attempts claimed, estimated
-- tokens sent, and how many answered.
create table public.ai_usage (
  user_id    uuid not null references auth.users (id) on delete cascade,
  day        date not null,
  provider   public.ai_provider not null,
  model      text not null,
  task       text not null,
  attempts   integer not null default 0,
  tokens_est integer not null default 0,
  ok         integer not null default 0,
  primary key (user_id, day, provider, model, task),
  constraint ai_usage_task check (task in (
    'narrate_daily', 'narrate_checkin', 'narrate_report', 'categorise', 'quick_add', 'ask', 'receipt', 'test')),
  constraint ai_usage_model check (model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$'),
  constraint ai_usage_counts check (attempts >= 0 and tokens_est >= 0 and ok between 0 and attempts)
);

alter table public.ai_usage enable row level security;

create policy ai_usage_own_rows on public.ai_usage
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

-- Which service and model is resting, until when, and what it last said.
create table public.ai_provider_state (
  user_id        uuid not null references auth.users (id) on delete cascade,
  provider       public.ai_provider not null,
  model          text not null,
  cooldown_until timestamptz,
  last_code      text not null,
  updated_at     timestamptz not null default now(),
  primary key (user_id, provider, model),
  constraint ai_provider_state_model check (model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$'),
  constraint ai_provider_state_code check (last_code in (
    'ok', 'rate_limited', 'rejected', 'model_not_found', 'provider_error', 'timeout', 'unreachable'))
);

alter table public.ai_provider_state enable row level security;

create policy ai_provider_state_own_rows on public.ai_provider_state
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.ai_provider_state from anon, authenticated;
grant select on public.ai_provider_state to authenticated;

-- ---------------------------------------------------------------------------
-- For the helper alone. Each is SECURITY DEFINER with search_path pinned,
-- takes the user explicitly (the helper learned who is calling from
-- /auth/v1/user, never from the request), and is callable by service_role
-- and nobody else.
-- ---------------------------------------------------------------------------

-- Everything a request needs in one call: the owner's settings (the
-- defaults when none are saved), the saved keys, today's use and what is
-- resting now.
create function public.ai_context_for(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'day', public.ai_today(),
    -- The column defaults above, for an owner who has saved no choice.
    'settings', coalesce(
      (select jsonb_build_object(
                'enabled', s.enabled, 'provider_order', to_jsonb(s.provider_order), 'models', s.models,
                'daily_cap', s.daily_cap, 'allow_paid', s.allow_paid, 'tone', s.tone,
                'share_shop_names', s.share_shop_names)
         from public.ai_settings s where s.user_id = p_user),
      jsonb_build_object(
        'enabled', true, 'provider_order', to_jsonb('{gemini,groq,openrouter,openai,anthropic}'::public.ai_provider[]),
        'models', '{}'::jsonb, 'daily_cap', 40, 'allow_paid', false, 'tone', 'cheerleader',
        'share_shop_names', true)),
    'keys', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'provider', k.provider, 'ciphertext', k.ciphertext, 'iv', k.iv, 'kek_id', k.kek_id,
                'key_v', k.key_v, 'key_hint', k.key_hint, 'status', k.status, 'model', k.model,
                'tested_at', k.tested_at) order by k.provider)
         from public.ai_provider_keys k where k.user_id = p_user),
      '[]'::jsonb),
    'usage', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'provider', u.provider, 'model', u.model, 'task', u.task,
                'attempts', u.attempts, 'tokens_est', u.tokens_est, 'ok', u.ok)
                order by u.provider, u.model, u.task)
         from public.ai_usage u where u.user_id = p_user and u.day = public.ai_today()),
      '[]'::jsonb),
    'resting', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'provider', r.provider, 'model', r.model, 'until', r.cooldown_until, 'code', r.last_code)
                order by r.provider, r.model)
         from public.ai_provider_state r where r.user_id = p_user and r.cooldown_until > now()),
      '[]'::jsonb))
$$;

-- A key the helper has tested and encrypted, saved or replaced.
create function public.ai_key_put(
  p_user uuid, p_provider public.ai_provider, p_ciphertext text, p_iv text, p_kek_id text,
  p_key_v smallint, p_key_hint text, p_status text, p_model text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.ai_provider_keys
    (user_id, provider, ciphertext, iv, kek_id, key_v, key_hint, status, model, tested_at, updated_at)
  values (p_user, p_provider, p_ciphertext, p_iv, p_kek_id, p_key_v, p_key_hint, p_status, p_model, now(), now())
  on conflict (user_id, provider) do update
    set ciphertext = excluded.ciphertext, iv = excluded.iv, kek_id = excluded.kek_id,
        key_v = excluded.key_v, key_hint = excluded.key_hint, status = excluded.status,
        model = excluded.model, tested_at = excluded.tested_at, updated_at = excluded.updated_at
$$;

-- What a saved key's latest test found. False when there is no such key.
create function public.ai_key_mark(p_user uuid, p_provider public.ai_provider, p_status text, p_model text default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.ai_provider_keys
     set status = p_status, model = coalesce(p_model, model), tested_at = now(), updated_at = now()
   where user_id = p_user and provider = p_provider;
  return found;
end;
$$;

-- Claim one attempt before it is made, or say which limit refuses it:
-- 'ok', 'daily_cap' (the owner's total for the day, from ai_settings),
-- 'task_cap' (this task's own limit) or 'service_cap' (this free service's
-- soft limit, in calls or estimated tokens). The helper passes the task's
-- and the service's limits, which live beside its list of services; a
-- limit of null is none, as for a paid service, which counts toward the
-- total only.
--
-- One claim at a time per user: the total spans many rows, and an INSERT
-- ... ON CONFLICT locks only the row it writes, so two requests at once
-- could each take the day's last call. The lock is held to the end of the
-- transaction, so reading the counts and writing the claim are one step.
create function public.ai_usage_claim(
  p_user uuid, p_provider public.ai_provider, p_model text, p_task text, p_tokens integer,
  p_task_limit integer, p_service_limit integer, p_service_tokens integer)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day     date := public.ai_today();
  v_cap     integer;
  v_all     integer;
  v_task    integer;
  v_service integer;
  v_tokens  integer;
begin
  if p_tokens is null or p_tokens < 0 or p_task_limit is null or p_task_limit < 0
     or p_service_limit < 0 or p_service_tokens < 0 then
    raise exception 'a claim needs its tokens and limits, none below zero' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_usage_claim:' || p_user::text, 0));

  select coalesce((select s.daily_cap from public.ai_settings s where s.user_id = p_user), 40) into v_cap;

  -- No row today is no call made, so none counts as 0 here: these are
  -- counts of attempts, not money.
  select coalesce(sum(u.attempts), 0),
         coalesce(sum(u.attempts) filter (where u.task = p_task), 0),
         coalesce(sum(u.attempts) filter (where u.provider = p_provider and u.model = p_model), 0),
         coalesce(sum(u.tokens_est) filter (where u.provider = p_provider and u.model = p_model), 0)
    into v_all, v_task, v_service, v_tokens
    from public.ai_usage u
   where u.user_id = p_user and u.day = v_day;

  if v_all >= v_cap then return 'daily_cap'; end if;
  if v_task >= p_task_limit then return 'task_cap'; end if;
  if p_service_limit is not null and v_service >= p_service_limit then return 'service_cap'; end if;
  if p_service_tokens is not null and v_tokens + p_tokens > p_service_tokens then return 'service_cap'; end if;

  insert into public.ai_usage (user_id, day, provider, model, task, attempts, tokens_est)
  values (p_user, v_day, p_provider, p_model, p_task, 1, p_tokens)
  on conflict (user_id, day, provider, model, task) do update
    set attempts = public.ai_usage.attempts + 1,
        tokens_est = public.ai_usage.tokens_est + excluded.tokens_est;
  return 'ok';
end;
$$;

-- What an attempt came to, and how long its service rests: a 429 for its
-- Retry-After, a daily quota until midnight Pacific. A rest is never more
-- than a day and an hour, so a wrong date cannot silence a service for
-- good. An answer that worked is counted against its claim.
create function public.ai_note_outcome(
  p_user uuid, p_provider public.ai_provider, p_model text, p_task text, p_code text,
  p_cooldown_until timestamptz)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- least() skips a null, so a rest of none must stay none by hand.
  v_until timestamptz :=
    case when p_cooldown_until is null then null else least(p_cooldown_until, now() + interval '25 hours') end;
begin
  insert into public.ai_provider_state (user_id, provider, model, cooldown_until, last_code, updated_at)
  values (p_user, p_provider, p_model, v_until, p_code, now())
  on conflict (user_id, provider, model) do update
    set cooldown_until = excluded.cooldown_until, last_code = excluded.last_code, updated_at = excluded.updated_at;

  if p_code = 'ok' then
    update public.ai_usage
       set ok = ok + 1
     where user_id = p_user and day = public.ai_today() and provider = p_provider
       and model = p_model and task = p_task and ok < attempts;
  end if;
end;
$$;

revoke all on function public.ai_context_for(uuid) from public, anon, authenticated;
revoke all on function public.ai_key_put(uuid, public.ai_provider, text, text, text, smallint, text, text, text)
  from public, anon, authenticated;
revoke all on function public.ai_key_mark(uuid, public.ai_provider, text, text) from public, anon, authenticated;
revoke all on function public.ai_usage_claim(uuid, public.ai_provider, text, text, integer, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.ai_note_outcome(uuid, public.ai_provider, text, text, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.ai_context_for(uuid) to service_role;
grant execute on function public.ai_key_put(uuid, public.ai_provider, text, text, text, smallint, text, text, text)
  to service_role;
grant execute on function public.ai_key_mark(uuid, public.ai_provider, text, text) to service_role;
grant execute on function public.ai_usage_claim(uuid, public.ai_provider, text, text, integer, integer, integer, integer)
  to service_role;
grant execute on function public.ai_note_outcome(uuid, public.ai_provider, text, text, text, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- For the browser. It has no grant on ai_provider_keys, so these read and
-- remove through the owner's rights, and only ever the caller's own rows.
-- ---------------------------------------------------------------------------

-- Which services have a saved key, its last four characters, what its last
-- test found and when. Never the ciphertext, the IV or which root locked it.
create function public.ai_key_status()
returns table (provider public.ai_provider, key_hint text, status text, model text, tested_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select k.provider, k.key_hint, k.status, k.model, k.tested_at
    from public.ai_provider_keys k
   where k.user_id = auth.uid()
   order by k.provider
$$;

-- Remove Key. True when the caller had a key for that service; it can only
-- ever remove the caller's own.
create function public.ai_key_forget(p_provider public.ai_provider)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  delete from public.ai_provider_keys where user_id = v_user and provider = p_provider;
  return found;
end;
$$;

revoke all on function public.ai_key_status() from public, anon;
revoke all on function public.ai_key_forget(public.ai_provider) from public, anon;
grant execute on function public.ai_key_status() to authenticated;
grant execute on function public.ai_key_forget(public.ai_provider) to authenticated;

commit;
