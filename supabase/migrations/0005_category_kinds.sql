-- 0005_category_kinds.sql
--
-- Every category belongs to one of Workbook's lists.
--
-- Workbook's START HERE tab sorts every category into a list — Income, Savings,
-- Bills, Debts, Subscriptions, Variable expenses — and each month tab adds up
-- each list in its own block. Which list a category is on decides which block
-- a charge lands in and which totals it joins, so it is stored on the category
-- rather than guessed from its name. `transfer` is the app's own seventh list,
-- "Not spending": a card payment is neither spending nor income
-- (docs/workbook-plan.md §3.2, §3.3; divergence D9).
--
-- Forward-only: 0001–0004 are applied and are not edited.

begin;

-- Mirrored by packages/schema when the app starts reading it (Workbook plan S2a).
-- A code change that selects `kind` must not deploy before this has run.
create type public.category_kind as enum (
  'income', 'savings', 'bill', 'debt', 'subscription', 'variable', 'transfer'
);

-- The default exists for one statement: it files every category made before
-- lists existed under Variable expenses, which is where the app has been
-- counting them all along. It is then dropped, so a category written without a
-- list is refused (23502) instead of silently joining Variable expenses. A pay
-- category created from "I received" and defaulted there would show as a
-- negative spending row.
alter table public.categories
  add column kind public.category_kind not null default 'variable';
alter table public.categories
  alter column kind drop default;

-- Workbook's row order within a list. User input, like the name.
alter table public.categories
  add column sort_order integer not null default 0;

-- id alone is already unique. This is for the tables that follow (budgets,
-- plans, pay schedules): a foreign key on (category_id, user_id) makes it
-- impossible for one user's row to point at another user's category, which a
-- key on category_id alone would allow and only RLS would hide.
alter table public.categories
  add constraint categories_id_user_id_key unique (id, user_id);

commit;
