-- 0024_learned_shops_own_category.sql
--
-- A learned shop is written only by approving or moving a charge, and names
-- only its owner's category (backend-a-05).
--
-- merchant_rules is what save_import files new charges by, with no review.
-- Two gaps were left open:
--
-- - Its category was held by 0001's single-column foreign key, so a rule
--   could name another account's category, and save_import (SECURITY
--   DEFINER) would post that account's category into this one's ledger,
--   and block the other account removing it. 0005 added categories'
--   unique (id, user_id) so a table can be held to its owner's categories;
--   0013 uses it, and now merchant_rules does too.
-- - 0004 took direct writes on the ledger and the review queue away from
--   the browser, but not on merchant_rules. The app only reads rules and
--   forgets them (Settings' learned shops); approve_candidate and
--   recategorise_transaction, both SECURITY DEFINER, write them. So the
--   browser keeps SELECT and DELETE, and loses INSERT and UPDATE.
--
-- Adding the constraint checks every stored rule. One naming another
-- account's category stops this update with a foreign key error, and
-- nothing changes; with one owner there is none.
--
-- Forward-only: 0001–0023 are not edited.

-- paste-order-check start
do $$
begin
  if to_regprocedure('public.schema_level()') is null or public.schema_level() < 23 then
    raise exception 'Paste 0023 first: 0024 needs 0023_typed_entry_once.sql, which is not in yet';
  end if;
end $$;
-- paste-order-check end

begin;

alter table public.merchant_rules
  add constraint merchant_rules_own_category
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict;

revoke insert, update on public.merchant_rules from anon, authenticated;

create or replace function public.schema_level()
returns integer
language sql
immutable
as $$ select 24 $$;

commit;
