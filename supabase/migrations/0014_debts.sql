-- 0014_debts.sql
--
-- Workbook's Debt Calculator: each debt's typed figures, and extra payments.
--
-- For each debt the calculator takes a Starting Balance, a Minimum Payment
-- and an APR (Debt Calculator J18:J20), and a Start Date the balance is as of
-- (D6). Any one-off Extra Payment is typed against a month of the payoff
-- schedule (I26:I494). These are the inputs packages/core's amortize() works
-- the whole schedule from. Balances, payments, the payoff date and progress
-- are all worked out on every read and stored nowhere.
--
-- Two choices go beyond the sheet:
--
-- - The start month is per debt, not one for the whole calculator. Workbook's
--   single D6 means a loan taken out next year would need every other
--   debt's balance retyped as of the new date. When every debt shares a
--   start month, as all of Workbook's do, the schedule is the same.
-- - An extra payment is kept against a calendar month, not a month number.
--   Workbook's month 3 is "the third row", which moves if D6 changes; money
--   paid in March was paid in March. Core turns the month into amortize()'s
--   month number from the debt's start month.
--
-- A debt names no category. The calculator reads no charges (its balances
-- come from the schedule alone), and the debt most likely to be entered, a
-- card paid off from the bank, is deliberately not a Debts-list row (plan
-- §3.3, decision 14), so a link would show none of its payments. Whether
-- recorded payments should move a debt's balance is a question for S17
-- (NOTICED N53); a nullable link can be added then without a backfill.
--
-- Forward-only: 0001–0013 are applied, or queued to be, and are not edited.

begin;

create table public.debts (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users (id) on delete cascade,
  -- amortize() tells debts apart by name, so no two of one user's share one.
  name                    public.ingested_text not null,
  -- J18, as of start_date. Zero is a debt already paid off, not a blank.
  starting_balance_cents  bigint not null,
  -- J19.
  minimum_payment_cents   bigint not null,
  -- J20 in hundredths of a percent: 5% is 500, 19.99% is 1999.
  apr_basis_points        integer not null,
  -- The month the starting balance is as of, named by its first day. Workbook
  -- snaps D6 to the first of its month (C26); so does this.
  start_date              date not null,
  -- Order on the Debts screen, as START HERE's Debts list gives the cards'.
  sort_order              integer not null default 0,
  created_at              timestamptz not null default now(),
  constraint debts_balance_not_negative check (starting_balance_cents >= 0),
  constraint debts_minimum_not_negative check (minimum_payment_cents >= 0),
  constraint debts_apr_not_negative check (apr_basis_points >= 0),
  constraint debts_start_is_first_day check (extract(day from start_date) = 1),
  unique (user_id, name),
  -- For debt_extra_payments' composite key.
  unique (id, user_id)
);

alter table public.debts enable row level security;

create policy debts_own_rows on public.debts
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table public.debt_extra_payments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  debt_id      uuid not null,
  -- The month it is paid in, named by its first day.
  month        date not null,
  -- A blank cell is no row, so an extra of zero is never stored.
  amount_cents bigint not null,
  created_at   timestamptz not null default now(),
  constraint debt_extra_payments_month_is_first_day check (extract(day from month) = 1),
  constraint debt_extra_payments_positive check (amount_cents > 0),
  -- One cell per debt per month, as Workbook has, and the conflict target the
  -- app upserts on.
  unique (user_id, debt_id, month),
  -- So an extra can never name another user's debt. An extra is part of its
  -- debt's plan, not a ledger row, so it goes with the debt.
  foreign key (debt_id, user_id)
    references public.debts (id, user_id) on delete cascade
);

alter table public.debt_extra_payments enable row level security;

create policy debt_extra_payments_own_rows on public.debt_extra_payments
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- An extra payment falls in or after its debt's start month
-- ---------------------------------------------------------------------------
-- Before it, amortize() has no month to put it in, and dropping it quietly
-- would change the payoff date with nothing said. Both triggers raise
-- check_violation (23514), like 0009's.
--
-- Neither is SECURITY DEFINER: each runs as the caller, under RLS, reading
-- only the caller's own rows. FOR SHARE holds the start month steady until
-- the extra commits, so an extra added on one device while the start month
-- moves past it on another cannot both succeed.
create function public.debt_extra_payments_after_start()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_start date;
begin
  select d.start_date into v_start
    from public.debts d
   where d.id = new.debt_id and d.user_id = new.user_id
     for share;
  -- Not found is left to the composite foreign key, which refuses it next.
  if found and new.month < v_start then
    raise exception 'an extra payment cannot come before its debt''s start month'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger debt_extra_payments_after_start
  before insert or update on public.debt_extra_payments
  for each row execute function public.debt_extra_payments_after_start();

create function public.debts_start_before_extras()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (select 1
               from public.debt_extra_payments e
              where e.debt_id = old.id and e.user_id = old.user_id
                and e.month < new.start_date) then
    raise exception 'remove the extra payments made before the new start month first'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger debts_start_before_extras
  before update of start_date on public.debts
  for each row
  when (new.start_date > old.start_date)
  execute function public.debts_start_before_extras();

commit;
