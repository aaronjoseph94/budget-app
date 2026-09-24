-- 0011_pay_schedules.sql
--
-- When each income source pays.
--
-- The workbook's START HERE tab gives every income source a first pay date (C8:C14)
-- and a frequency picked from "Weekly, Bi-weekly, Monthly" (E8:E14). The
-- owner chose to have the Paycheck view find its pay period from these, and
-- to split a monthly bill by the pay frequency (F15, option B). The Bill
-- Calendar marks paydays from them too.
--
-- A schedule is typed input. Pay periods and paydays are worked out from it
-- by packages/core on every read; none is stored.
--
-- Forward-only: 0001–0010 are applied, or queued to be, and are not edited.

begin;

create type public.pay_frequency as enum ('weekly', 'biweekly', 'monthly');

create table public.pay_schedules (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  category_id     uuid not null,
  -- The payday the others are counted from, at the frequency. How they are
  -- counted is the engine's (S15b), not a rule stored here.
  first_pay_date  date not null,
  frequency       public.pay_frequency not null,
  created_at      timestamptz not null default now(),
  -- One schedule per income source, and the conflict target the app upserts
  -- on. Two schedules for one source would make its paydays a choice.
  unique (user_id, category_id),
  -- The composite key from 0005, so a schedule can never name another user's
  -- category. A removed income source takes its schedule with it.
  foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete cascade
);

alter table public.pay_schedules enable row level security;

create policy pay_schedules_own_rows on public.pay_schedules
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Only an income source has paydays. On a bill or a savings fund a schedule
-- would put paydays on the calendar for money that is never paid in. Raises
-- check_violation (23514), like 0009's triggers.
--
-- Not SECURITY DEFINER: it runs as the caller, under RLS, and reads only the
-- caller's own category. Unlike 0009 it takes no lock, because nothing yet
-- refuses moving an income source to another list while it has a schedule;
-- a lock would hold still a list that nothing checks.
create function public.pay_schedules_only_on_income()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_kind public.category_kind;
begin
  select k.kind into v_kind
    from public.categories k
   where k.id = new.category_id and k.user_id = new.user_id;
  -- Not found is left to the composite foreign key, which refuses it next.
  if found and v_kind <> 'income' then
    raise exception 'only an income source can have a pay schedule'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger pay_schedules_only_on_income
  before insert or update on public.pay_schedules
  for each row execute function public.pay_schedules_only_on_income();

commit;
