-- 0006_recategorise.sql
--
-- Moving a posted row to another category.
--
-- 0004 took UPDATE on the ledger away from the browser, so that the only way
-- into `transactions` is through the functions it defined. That also removed
-- the only way to fix a charge filed under the wrong category. This is the
-- guarded way back: one row, one category, both proven to be the caller's.
--
-- Forward-only: 0001–0005 are applied and are not edited.

begin;

-- SECURITY DEFINER for the same reason as 0004's functions, and therefore with
-- the same care: row-level security does not apply inside it, so ownership of
-- both ids is checked against auth.uid() before either is used, and
-- search_path is pinned.
--
-- The source candidate is changed too. It is the record of how the row was
-- decided, and left alone it would go on saying the old category — and, for a
-- row a rule filed, that no human had looked at it. category_source becomes
-- 'user', and the auto-approval stamp is cleared: 0001's CHECKs allow that
-- stamp only beside a rule's category, and once a person has chosen the
-- category it is no longer true that the row was approved without one.
--
-- p_learn = true updates the merchant's rule exactly as approve_candidate does
-- in 0004: the same normalised `merchant`, taken as stored, with no further
-- normalisation, and the latest human decision wins.
--
-- Plain CREATE, not CREATE OR REPLACE: docs/setup.md tells the owner that
-- pasting a migration a second time is refused, and this file has no other
-- statement that would refuse it.
create function public.recategorise_transaction(
  p_transaction uuid,
  p_category    uuid,
  p_learn       boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user      uuid := auth.uid();
  v_cand      uuid;
  v_merchant  text;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.categories k where k.id = p_category and k.user_id = v_user) then
    raise exception 'category not found' using errcode = '42501';
  end if;

  update public.transactions t
     set category_id = p_category
   where t.id = p_transaction and t.user_id = v_user
  returning t.candidate_id, t.merchant into v_cand, v_merchant;

  if not found then
    raise exception 'transaction not found' using errcode = '42501';
  end if;

  -- Null only for a row posted before 0004 recorded provenance.
  if v_cand is not null then
    update public.ingest_candidates c
       set category_id = p_category,
           category_source = 'user',
           auto_approved_at = null
     where c.id = v_cand and c.user_id = v_user;
  end if;

  if p_learn then
    insert into public.merchant_rules (user_id, match_merchant, category_id)
    values (v_user, v_merchant, p_category)
    on conflict (user_id, match_merchant) do update set category_id = excluded.category_id;
  end if;
end;
$$;

-- Callable by a signed-in user, and by nobody else.
revoke all on function public.recategorise_transaction(uuid, uuid, boolean) from public, anon;
grant execute on function public.recategorise_transaction(uuid, uuid, boolean) to authenticated;

commit;
