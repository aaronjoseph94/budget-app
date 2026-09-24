-- 0010_month_balances.sql
--
-- The bank balance a month started with, as the owner typed it.
--
-- The workbook asks for it on every month tab (Jan!D9, note: "Type in the Bank
-- Balance you started the month with!") and projects the month's ending
-- balance from it (Jan!D15). The owner chose to type it once a month (plan
-- decision 6, option B).
--
-- It is typed, not derived: the ending balance, and the Year's balances, are
-- computed by packages/core on every read and stored nowhere (CLAUDE.md).
-- Last month's projected ending balance is not copied in here either; the
-- bank's real figure is what the owner types.
--
-- Forward-only: 0001–0009 are applied, or queued to be, and are not edited.

begin;

create table public.month_balances (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users (id) on delete cascade,
  -- Named by its first day, so a month has one spelling.
  month                   date not null,
  -- Signed: an overdrawn account starts a month below zero. Not null: a month
  -- nobody typed a balance for has no row, and the engine shows no ending
  -- balance for it rather than counting from $0 (N9). Clearing it deletes
  -- the row.
  starting_balance_cents  bigint not null,
  created_at              timestamptz not null default now(),
  constraint month_balances_month_is_first_day
    check (extract(day from month) = 1),
  -- One balance per month, and the conflict target the app upserts on.
  unique (user_id, month)
);

alter table public.month_balances enable row level security;

create policy month_balances_own_rows on public.month_balances
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

commit;
