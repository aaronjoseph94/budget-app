-- Applied by scripts/verify-migrations.sh immediately BEFORE 0005 runs.
--
-- A category written the way 0001–0004 allowed, with no list, so that
-- schema-assertions.sql can check what 0005's backfill made of it. Asserting a
-- backfill against an empty table would assert nothing: the hosted project
-- already holds categories, and those are the rows the default has to reach.
--
-- A third user, so the assertions' own users 1 and 2 are left exactly as they
-- expect to find them.
insert into auth.users (id) values ('33333333-3333-4333-8333-333333333333');

insert into public.categories (id, user_id, name)
  values ('cccccccc-0000-4000-8000-000000000300',
          '33333333-3333-4333-8333-333333333333', 'Made Before Lists');
