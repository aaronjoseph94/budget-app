-- 0009_category_plans.sql
--
-- A bill's monthly amount and the day it is paid.
--
-- Workbook's Bills tab gives each bill, debt and subscription a Day Paid and a
-- Monthly Amount (Bills!B/D, F/H, J/L), and every month tab counts that amount
-- when no real charge replaces it (D5). Workbook has one amount for all twelve
-- tabs. An app holding years of history cannot: raising the rent in October
-- would rewrite last January. So an amount applies from a month onward, until
-- a later row changes or stops it (D13), and packages/core resolves which one
-- is in effect on every read. Nothing derived is stored here.
--
-- Forward-only: 0001–0008 are applied, or queued to be, and are not edited.

begin;

create table public.category_plans (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  category_id      uuid not null,
  -- The first month this row applies to, named by its first day.
  effective_month  date not null,
  -- Null from a month means "stopped": no amount from then on, until a later
  -- row sets one again. A missing row could not say that.
  planned_cents    bigint,
  -- Workbook's Day Paid. Blank counts in a whole month but never in a week or a
  -- pay period (F8); 29–31 fall on a short month's last day (D6).
  due_day          smallint,
  created_at       timestamptz not null default now(),
  constraint category_plans_month_is_first_day
    check (extract(day from effective_month) = 1),
  constraint category_plans_not_negative
    check (planned_cents >= 0),
  constraint category_plans_due_day_in_a_month
    check (due_day between 1 and 31),
  -- One row per change, and the conflict target the app upserts on.
  unique (user_id, category_id, effective_month),
  -- The composite key from 0005, so a plan can never name another user's
  -- category. A removed category takes its plans with it.
  foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete cascade
);

alter table public.category_plans enable row level security;

create policy category_plans_own_rows on public.category_plans
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- A monthly amount belongs on a bill, a debt or a subscription only
-- ---------------------------------------------------------------------------
-- On any other list the amount would be counted nowhere, or counted twice: a
-- planned Groceries figure beside the real grocery charges. Both triggers
-- raise check_violation (23514), which Setup turns into its own sentence
-- (docs/workbook-plan.md §6.5; NOTICED N18).
--
-- Neither function is SECURITY DEFINER. Each runs as the caller, under RLS,
-- and reads only rows the caller owns; a trigger function cannot be called
-- directly, so there is no execute grant worth revoking.
--
-- FOR SHARE holds the category's list steady until this write commits.
-- Without it, a plan added on one device while the category is moved to
-- another list on a second could each pass its own check, and both commit.
create function public.category_plans_only_on_recurring()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_kind public.category_kind;
begin
  select k.kind into v_kind
    from public.categories k
   where k.id = new.category_id and k.user_id = new.user_id
     for share;
  -- Not found is left to the composite foreign key, which refuses it next
  -- with its own code, rather than reported here as the wrong list.
  if found and v_kind not in ('bill', 'debt', 'subscription') then
    raise exception 'only a bill, a debt or a subscription can have a monthly amount'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger category_plans_only_on_recurring
  before insert or update on public.category_plans
  for each row execute function public.category_plans_only_on_recurring();

-- A category keeps its list while it has a monthly amount (D11).
--
-- "Has one" means the amount in effect this month, or any amount set to start
-- in a later month: a rent rise typed for next month would otherwise come into
-- effect on a category already moved to Variable expenses. A plan stopped in
-- the past does not hold the category; its history stays, and counts only
-- while the category is on a list that reads plans. Moving between Bills,
-- Debts and Subscriptions is refused too, as D11 says: Workbook keeps each list's
-- amounts in its own columns.
--
-- The month is the database's (UTC). Near midnight on a month's last day it is
-- already next month there, which can only let a move through a few hours
-- early for an amount stopped from next month.
create function public.categories_keep_list_while_planned()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_month date := date_trunc('month', current_date)::date;
begin
  if (select p.planned_cents is not null
        from public.category_plans p
       where p.category_id = old.id and p.user_id = old.user_id
         and p.effective_month <= v_month
       order by p.effective_month desc
       limit 1)
     or exists (select 1
                  from public.category_plans p
                 where p.category_id = old.id and p.user_id = old.user_id
                   and p.effective_month > v_month
                   and p.planned_cents is not null) then
    raise exception 'remove the monthly amount before moving this category to another list'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger categories_keep_list_while_planned
  before update of kind on public.categories
  for each row
  when (old.kind is distinct from new.kind)
  execute function public.categories_keep_list_while_planned();

commit;
