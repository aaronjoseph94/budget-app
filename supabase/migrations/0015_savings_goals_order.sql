-- 0015_savings_goals_order.sql
--
-- Savings goals, plural: which one leads, in what order, and which are paused
-- or reached (plan slice G1, formula decision F45, divergence D28).
--
-- savings_goals has held many goals since 0004, one per name, and 0013 links
-- each to a Savings-list fund, but nothing said which goal the Coach and the
-- Week should show, so the app showed the oldest. On 2026-09-24 the owner
-- asked for other goals besides flight training.
--
-- - sort_order is the goal's place in the owner's order. Ties fall back to
--   when each goal was made, and every goal already here starts at 0, so on
--   the day this is pasted the main goal is the oldest: the one the app
--   already shows. Nothing is backfilled.
-- - status is active, paused or reached. The main goal is the first active one.
-- - reached_on is the day the owner marked the goal reached. It is set
--   exactly when the goal is reached, so "reached, but on no day" and "active,
--   but reached on a day" cannot be stored.
--
-- Nothing derived is stored: which goal leads, and each goal's progress, are
-- worked out by packages/core on every read.
--
-- Row-level security already covers every column: 0004's savings_goals_own_rows
-- policy is for all commands.
--
-- Forward-only: 0001–0014 are applied to the hosted project and are not
-- edited. Every new NOT NULL column has a default, so no row already stored
-- is refused or changed.

begin;

create type public.goal_status as enum ('active', 'paused', 'reached');

alter table public.savings_goals
  add column sort_order integer not null default 0,
  add column status     public.goal_status not null default 'active',
  add column reached_on date,
  add constraint savings_goals_reached_on_its_day
    check ((status = 'reached') = (reached_on is not null));

commit;
