-- 0008_category_budgets.sql
--
-- The budgets and goals typed on a month.
--
-- Workbook's month tabs each have their own typed Budgeted column for Bills,
-- Debts, Subscriptions and Variable expenses (Jan!D22:D44, J22:J44, O22:O44,
-- T22:T44) and a Goal column for Income and Savings (O10:O16, T10:T16). This
-- is where the app keeps them. Income goals and savings goals are the same
-- kind of number, so they share the table (docs/workbook-plan.md §4).
--
-- What is stored is what the owner meant when they typed it, not a copy per
-- month (D12). "From this month on" writes an 'onward' row for that month;
-- "just this month" writes an 'only' row. packages/core resolves a month on
-- every read: an 'only' row for that month wins, else the latest 'onward' row
-- at or before it, else there is no budget. Copying a value into later months
-- instead would go stale the moment an earlier month was changed.
--
-- Nothing derived is stored here or anywhere: Remaining, Difference and Left
-- to spend are computed from these and the ledger on every read (CLAUDE.md).
--
-- Forward-only: 0001–0007 are applied, or queued to be, and are not edited.

begin;

create type public.budget_applies as enum ('onward', 'only');

create table public.category_budgets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  category_id   uuid not null,
  -- A month is named by its first day, so one month has one spelling and the
  -- unique key below cannot be dodged by typing the 15th.
  month         date not null,
  applies       public.budget_applies not null,
  -- Null is a typed "no budget": an 'onward' row with no amount stops an
  -- earlier budget from carrying forward, which a missing row cannot say.
  -- A budget is a limit, never a debt, so it is never negative.
  budget_cents  bigint,
  created_at    timestamptz not null default now(),
  constraint category_budgets_month_is_first_day
    check (extract(day from month) = 1),
  constraint category_budgets_not_negative
    check (budget_cents >= 0),
  -- One value per meaning per month. It is also the conflict target the app
  -- upserts on, so typing over a budget replaces it rather than adding a row.
  unique (user_id, category_id, month, applies),
  -- On (category_id, user_id), not category_id alone (0005): a budget can
  -- never name one user's category under another user's id, which a plain key
  -- would allow and only RLS would hide. A removed category takes its budgets
  -- with it; they mean nothing without it.
  foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete cascade
);

alter table public.category_budgets enable row level security;

create policy category_budgets_own_rows on public.category_budgets
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

commit;
