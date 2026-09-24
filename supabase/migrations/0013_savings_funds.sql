-- 0013_savings_funds.sql
--
-- A savings goal becomes one of the workbook's savings funds.
--
-- The workbook's Savings tab gives every fund on the START HERE Savings list a card
-- (Savings!C4 = 'START HERE'!H7) and a row in "How To Reach These Goals",
-- with a typed Start Date (N14) beside the Goal Date (R14) that
-- savings_goals.target_date already holds. So a goal names the Savings-list
-- category it is for, and when saving towards it began.
--
-- The owner chose to type a fund's balance once and have recorded transfers
-- add to it (plan decision 7, D16 option B). saved_cents stays what the owner
-- typed; balance_as_of says when that was true. The balance on any later day
-- is that amount plus the transfers into the fund's category after
-- balance_as_of, worked out by packages/core on every read and stored
-- nowhere.
--
-- Every new column is nullable. The goal the Settings card already saves has
-- no category, no start date and no as-of date, and keeps working as a typed
-- balance, as it does today.
--
-- Forward-only: 0001–0012 are applied, or queued to be, and are not edited.

begin;

alter table public.savings_goals
  -- The Savings-list category whose transfers fill this fund.
  add column category_id    uuid,
  -- Savings!N14. With target_date (R14) it gives the workbook's Months Remaining.
  add column start_date     date,
  -- The day saved_cents was typed as true, at the end of that day: transfers
  -- dated after it add to the balance, and ones on or before it are already
  -- in the typed amount.
  add column balance_as_of  date,
  -- One fund per category. Two funds filled by the same transfers would each
  -- count every one of them.
  add constraint savings_goals_one_fund_per_category unique (category_id),
  -- A fund linked to a category must say from when its transfers count;
  -- without it, which transfers are already in the typed amount is a guess.
  add constraint savings_goals_linked_has_as_of
    check (category_id is null or balance_as_of is not null),
  -- The composite key from 0005, so a fund can never name another user's
  -- category. RESTRICT, not SET NULL: on a composite key SET NULL nulls every
  -- column in it, user_id included, which is NOT NULL, so removing the
  -- category would fail anyway, with a less honest code. And not CASCADE:
  -- removing a category must not quietly delete a goal and its typed balance.
  add constraint savings_goals_category_fk
    foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete restrict;

-- Only a Savings-list category fills a fund. On a bill or a variable expense
-- the "transfers" added to the balance would be spending. Raises
-- check_violation (23514), like 0009's and 0011's triggers.
--
-- Not SECURITY DEFINER: it runs as the caller, under RLS, and reads only the
-- caller's own category. Like 0011 it takes no lock, because nothing refuses
-- moving a fund's category to another list (NOTICED N52); a lock would hold
-- still a list that nothing checks.
create function public.savings_goals_only_on_savings()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_kind public.category_kind;
begin
  if new.category_id is null then
    return new;
  end if;
  select k.kind into v_kind
    from public.categories k
   where k.id = new.category_id and k.user_id = new.user_id;
  -- Not found is left to the composite foreign key, which refuses it next.
  if found and v_kind <> 'savings' then
    raise exception 'only a savings fund can have a savings goal'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger savings_goals_only_on_savings
  before insert or update on public.savings_goals
  for each row execute function public.savings_goals_only_on_savings();

commit;
