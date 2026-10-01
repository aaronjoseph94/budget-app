-- 0030_ai_app_gate_live_session.sql
--
-- A disconnected AI app is refused at once (security review mcp-1-01, with
-- mcp-3-02 merged into it).
--
-- Disconnect (Settings → AI apps) revokes the app's grant, and Supabase
-- deletes the sign-in's row in auth.sessions with it. The AI apps server
-- then refuses the app straight away, because it asks /auth/v1/user. But
-- PostgREST checks only a token's signature and expiry, so the same access
-- token, sent straight to /rest/v1/rpc/ai_app_*, still passed 0020's gate
-- for up to an hour: it could read the budget and add up to 30 rows to
-- Review.
--
-- The gate now also asks whether the token's sign-in is still live: its
-- session_id claim must name a row of auth.sessions that belongs to the
-- caller and has not passed its end. A token with no session_id, or one
-- that is not an id, matches nothing and is refused too. The refusal is a
-- new code, 'disconnected'. Every ai_app_* function calls the gate first,
-- and 0020's restrictive select policy lets an AI app read a row only after
-- the gate said yes, so this one check closes reads and adds alike.
--
-- Everything else in the gate is 0020's, word for word: the same settings
-- (SECURITY DEFINER, VOLATILE, search_path pinned) and the same grants,
-- restated below. The owner's own session never reaches the new check: it
-- carries no client_id, and gets not_an_ai_app as before.
--
-- Three things only the hosted project can show, in HANDOFF §4 before the
-- first question: that an AI app's token carries session_id, that the
-- gate's owner may read auth.sessions, and that Disconnect deletes the
-- session. If any fails, every AI app question is refused, which is
-- visible and safe.
--
-- It also adds public.ai_app_update_level(): the number of the last of
-- these security updates that is in (30 here; 0031 onwards re-create it
-- with their own). One-time updates asks it, since nothing else here can
-- be seen from the owner's session, and each later update's paste-order
-- check reads it. It is not schema_level(): another line of updates may
-- use that name, and these must not move it.
--
-- Why 0030 and not 0021: other updates were being prepared at the same
-- time from 0021 upwards. These start at 0030 so the numbers never
-- collide; nothing here depends on 0021-0029, and they touch none of
-- these functions, so the two lines may be pasted in either order.
--
-- Forward-only: 0001–0020 are not edited.

-- paste-order-check start
do $$
begin
  if to_regprocedure('public._ai_app_gate(text)') is null then
    raise exception 'Paste 0020 first: 0030 needs 0020_ai_apps.sql, which is not in yet';
  end if;
end $$;
-- paste-order-check end

begin;

create or replace function public._ai_app_gate(p_kind text)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_client  text := auth.jwt() ->> 'client_id';
  v_session text := auth.jwt() ->> 'session_id';
  v_access  public.ai_app_access;
  v_calls   integer;
begin
  if v_user is null then
    return 'not_signed_in';
  end if;
  if v_client is null or v_client !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return 'not_an_ai_app';
  end if;
  -- The sign-in this token came from must still be live. Checked as text
  -- first, so a claim that is not an id is refused, never an error.
  if v_session is null or v_session !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or not exists (select 1 from auth.sessions s
                     where s.id = v_session::uuid and s.user_id = v_user
                       and (s.not_after is null or s.not_after > now())) then
    return 'disconnected';
  end if;
  if p_kind is null or p_kind not in ('read', 'add') then
    raise exception 'unknown kind' using errcode = '22023';
  end if;
  select * into v_access from public.ai_app_access a where a.user_id = v_user;
  if not found or not v_access.enabled then
    return 'ai_apps_off';
  end if;
  if p_kind = 'add' and not v_access.allow_add then
    return 'adding_off';
  end if;

  insert into public.ai_app_usage as u (user_id, day, kind, calls)
  values (v_user, (now() at time zone v_access.time_zone)::date, p_kind, 1)
  on conflict (user_id, day, kind) do update set calls = u.calls + 1
    where u.calls < case p_kind when 'read' then 300 else 30 end
  returning u.calls into v_calls;
  if v_calls is null then
    return 'limit_reached';
  end if;

  insert into public.ai_app_last_use (user_id, client_id, last_used_at)
  values (v_user, v_client::uuid, now())
  on conflict (user_id, client_id) do update set last_used_at = excluded.last_used_at;

  -- Transaction-local: it ends with the one request that called the gate.
  perform set_config('budget.ai_app_read', 'on', true);
  return null;
end;
$$;

revoke all on function public._ai_app_gate(text) from public, anon;
grant execute on function public._ai_app_gate(text) to authenticated;

-- Which of these security updates is in. Reads nothing; the same for everyone.
create or replace function public.ai_app_update_level()
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$ select 30 $$;

revoke all on function public.ai_app_update_level() from public, anon;
grant execute on function public.ai_app_update_level() to authenticated;

commit;
