-- Applied by scripts/verify-migrations.sh immediately BEFORE 0013 runs.
--
-- A goal written the way the Settings card has saved one since 0004, with no
-- category, start date or as-of date, so that schema-assertions.sql can check
-- it survives 0013 unchanged and can still be saved the same way. The hosted
-- project may already hold such a goal.
--
-- User 3 from before/0005, so the assertions' own users 1 and 2 are left
-- exactly as they expect to find them.
insert into public.savings_goals (id, user_id, name, target_cents, saved_cents, target_date)
  values ('dddddddd-0000-4000-8000-000000000300',
          '33333333-3333-4333-8333-333333333333', 'Goal Before Funds',
          200000, 13300, '2026-10-01');
