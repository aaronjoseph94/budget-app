-- 0035_ai_app_updates_in.sql
--
-- Which AI-app security updates are in, read from what each one left
-- behind, so pasting one again can never strand the owner (security
-- review, second pass).
--
-- 0030 to 0034 each end by re-creating ai_app_update_level() to answer its
-- own number. So pasting an earlier one again, which the Copy button makes
-- easy, set the number back: with 0034 in, 0030 pasted again said 30. One-
-- time updates then offered 0031 (which pastes) and 0032, which could
-- never paste again, because the lines it changes were already changed:
-- "could not change public.approve_candidate(uuid, uuid): it is not as
-- 0019 left it". Nothing was less safe, but the owner was stuck.
--
-- ai_app_updates_in() answers the last of 0030 onwards that is in, in an
-- unbroken run, read from the functions themselves, which pasting an
-- update again does not change:
--   0030  the gate refuses with 'disconnected'
--   0031  the AI app's hash uses its own kind, 'ai_app:'
--   0032  approve_candidate and recategorise_transaction carry "(0032)"
--   0033  ai_app_search carries "(0033)"
--   0034  ai_app_add_candidate carries "(0034)"
--   0035 to 0039  some function in public carries "(00NN)": this one
--         carries "(0035)", and each later update in the range leaves its
--         own mark the same way, so this function never needs re-creating.
-- One-time updates asks it, and falls back to ai_app_update_level() until
-- it is in. It is offered straight after 0020, before 0030, since it
-- needs nothing but 0020 and keeps every later step honest.
--
-- 0030 to 0034 are not edited: they may already have been offered by the
-- Copy button. Pasting one of them again still runs; 0030 and 0031 change
-- nothing but ai_app_update_level(), which only their own paste-order
-- checks read, and 0032 to 0034 are refused with nothing changed, as
-- before. Neither moves what this function answers.
--
-- Numbering: 0030 to 0039 are reserved for this line of updates
-- (ADR 0012). Reads pg_proc only; writes nothing; the same for everyone.
--
-- Forward-only: 0001–0034 are not edited.

-- paste-order-check start
do $$
begin
  if to_regprocedure('public._ai_app_gate(text)') is null then
    raise exception 'Paste 0020 first: 0035 needs 0020_ai_apps.sql, which is not in yet';
  end if;
end $$;
-- paste-order-check end

begin;

create or replace function public.ai_app_updates_in()
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  -- (0035) The last of 0030 onwards in, each read from what it left.
  with mark(n, fn, word) as (values
    (30, 'public._ai_app_gate(text)', '''disconnected'''),
    (31, 'public._ai_app_dedupe_hash(uuid, date, bigint, text, integer)', '''ai_app:'''),
    (32, 'public.approve_candidate(uuid, uuid)', '(0032)'),
    (32, 'public.recategorise_transaction(uuid, uuid, boolean)', '(0032)'),
    (33, 'public.ai_app_search(text, date, date, bigint, bigint, text[], text, text, integer)', '(0033)'),
    (34, 'public.ai_app_add_candidate(uuid, date, bigint, text, integer, text, integer, text)', '(0034)')
  ), missing(n) as (
    select m.n from mark m
     where coalesce(strpos((select p.prosrc from pg_catalog.pg_proc p where p.oid = to_regprocedure(m.fn)), m.word), 0) = 0
    union all
    select g.n from generate_series(35, 39) as g(n)
     where not exists (select 1 from pg_catalog.pg_proc p
                        where p.pronamespace = 'public'::regnamespace
                          and strpos(p.prosrc, '(00' || g.n::text || ')') > 0)
  )
  select coalesce(min(n), 40) - 1 from missing
$$;

revoke all on function public.ai_app_updates_in() from public, anon;
grant execute on function public.ai_app_updates_in() to authenticated;

commit;
