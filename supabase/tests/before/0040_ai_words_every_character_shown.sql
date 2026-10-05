-- Applied by scripts/verify-migrations.sh immediately BEFORE 0040 runs.
--
-- 0040 adds two lines to ai_app_add_candidate and re-creates
-- _ai_app_words_shown, _ai_app_shown_shop and the two level functions.
-- This keeps every function in public as it stood just before, so
-- schema-assertions.sql can prove those are the only changes, and can
-- check 0039's changes against the bodies 0039 left.
create table verify.before_0040 as
  select p.oid::regprocedure::text as fn, p.prosrc, p.prosecdef,
         p.provolatile, p.proconfig, p.proacl::text as acl
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace;
