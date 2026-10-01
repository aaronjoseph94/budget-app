-- 0031_ai_app_hash_own_kind.sql
--
-- What an AI app adds can never take a statement line's place (security
-- review mcp-2-01).
--
-- 0020 checked an AI app's dedupe hash against its own arguments, rebuilt
-- from the same bytes as packages/statement-parsers/src/dedupe.ts uses for
-- statement rows: v1, the account, the date, the signed cents, the words
-- and occurrence:<n>. Every argument is the caller's to choose. So an AI
-- app (a model talked into it by words hidden in a shop name, say) could
-- add a pending row whose words, amount and day were exactly next month's
-- subscription line. When the statement came, save_import counted the
-- real charge as already waiting and did not add it; if the owner then
-- rejected the row marked Added by an AI app, as they would, the charge
-- was in neither Review nor the ledger. That is the silent drop dedupe.ts
-- calls the worst failure.
--
-- An AI app's row is now hashed with its own discriminator, ai_app:<n>,
-- which no statement, receipt or typed row ever has (theirs say
-- occurrence:<n> or issuer_id:<id>), so its hash can never equal theirs.
-- The server computes the same bytes (dedupe.ts's 'ai_app' kind) and this
-- function checks them; an older server, or this update missing under a
-- newer server, gets needs_update and adds nothing.
--
-- The cost: an AI-added purchase and the same charge on the statement now
-- both wait in Review, where the owner sees both and rejects one. That is
-- the visible, cheap failure dedupe.ts prefers (PLAN risk 14).
--
-- Changing the hash's inputs is an ask-first item (CLAUDE.md). The owner's
-- words of 2026-10-01, "don't ask me any questions; auto-allow and say yes
-- to everything", answer it; ADR 0012 records it. dedupe_hash_v stays 1:
-- no existing hash changes, because only the new kind's bytes are new and
-- no row with them exists yet (nothing needs a backfill).
--
-- Forward-only: 0001–0030 are not edited.

-- paste-order-check start
do $$
begin
  if to_regprocedure('public.ai_app_update_level()') is null then
    raise exception 'Paste 0030 first: 0031 needs 0030_ai_app_gate_live_session.sql, which is not in yet';
  end if;
end $$;
-- paste-order-check end

begin;

create or replace function public._ai_app_dedupe_hash(p_account uuid, p_posted_on date, p_amount_cents bigint, p_words text, p_occurrence integer)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select encode(sha256(
    convert_to('v1', 'UTF8') || '\x00'::bytea ||
    convert_to(p_account::text, 'UTF8') || '\x00'::bytea ||
    convert_to(to_char(p_posted_on, 'YYYY-MM-DD'), 'UTF8') || '\x00'::bytea ||
    convert_to(p_amount_cents::text, 'UTF8') || '\x00'::bytea ||
    convert_to(p_words, 'UTF8') || '\x00'::bytea ||
    convert_to('ai_app:' || p_occurrence::text, 'UTF8')), 'hex')
$$;

revoke all on function public._ai_app_dedupe_hash(uuid, date, bigint, text, integer) from public, anon, authenticated;

create or replace function public.ai_app_update_level()
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$ select 31 $$;

commit;
