-- 0021_category_holds.sql
--
-- A category is held only by what still files money into it (backend-a-01,
-- backend-a-02).
--
-- 0001's foreign key from a candidate to its category is ON DELETE RESTRICT,
-- and 0018 lets a category go by first clearing the AI's guesses on rows
-- still waiting in Review. Two kinds of candidate were left holding a
-- category with nothing behind them, so the category could never be removed
-- and Setup said it "still has charges":
--
-- - a row the AI guessed a category for, which the owner then rejected:
--   reject_candidate keeps the guess on the row;
-- - an approved row whose ledger row is gone: the owner removed the charge
--   from All transactions (0004 keeps DELETE for that), or approve_candidate
--   found the charge already in the ledger and posted nothing.
--
-- _clear_suggestions_of_category, 0018's trigger before a category is
-- deleted, now also lets go of both:
--
-- - a model's guess on a rejected row is cleared, as on a waiting one;
-- - an approved candidate with no ledger row naming it is marked rejected,
--   as 'already_in_ledger' when the ledger holds that charge under another
--   candidate and 'user_rejected' when the owner removed it, and its
--   category is cleared. Rejected rows are outside 0003's pending dedupe
--   index, so bringing the statement in again behaves as before.
--
-- A category that a ledger row, a learned shop or a fund's goal still names
-- is still refused, by those tables' own foreign keys. Only candidates whose
-- category is being removed are touched, so nothing else needs a backfill.
--
-- The trigger function is not one the browser may call (0018 revoked it), so
-- 0019's guard does not apply to it.
--
-- It also adds public.schema_level(), which answers the number of the last
-- of these updates that is in: 21 here, and each later update re-creates it
-- with its own number. Nothing else these updates change can be seen from
-- the app, so this is how Help's One-time updates knows which to offer. It
-- reads nothing and is the same for everyone.
--
-- Forward-only: 0001–0020 are not edited.

-- paste-order-check start
do $$
begin
  if to_regprocedure('public._clear_suggestions_of_category()') is null then
    raise exception 'Paste 0018 first: 0021 needs 0018_category_suggestions.sql, which is not in yet';
  end if;
end $$;
-- paste-order-check end

begin;

create or replace function public._clear_suggestions_of_category()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The AI's guesses, on rows waiting or rejected.
  update public.ingest_candidates c
     set category_id = null, category_source = null
   where c.category_id = old.id
     and c.user_id = old.user_id
     and c.status in ('pending', 'rejected')
     and c.category_source = 'model';

  -- Approvals with nothing left in the ledger.
  update public.ingest_candidates c
     set status = 'rejected',
         rejection_reason = case
           when exists (select 1 from public.transactions t
                         where t.user_id = c.user_id and t.dedupe_hash = c.dedupe_hash)
             then 'already_in_ledger'::public.rejection_reason
           else 'user_rejected'::public.rejection_reason
         end,
         category_id = null,
         category_source = null,
         auto_approved_at = null
   where c.category_id = old.id
     and c.user_id = old.user_id
     and c.status = 'approved'
     and not exists (select 1 from public.transactions t where t.candidate_id = c.id);
  return old;
end;
$$;

revoke all on function public._clear_suggestions_of_category() from public, anon, authenticated;

create or replace function public.schema_level()
returns integer
language sql
immutable
as $$ select 21 $$;

revoke all on function public.schema_level() from public, anon;
grant execute on function public.schema_level() to authenticated;

commit;
