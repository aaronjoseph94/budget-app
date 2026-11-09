-- Applied by scripts/verify-migrations.sh immediately BEFORE 0042 runs.
--
-- 0042 adds two lines to ai_app_add_candidate and re-creates
-- _ai_app_words_shown and the two level functions. This keeps every
-- function in public as it stood just before, so schema-assertions.sql can
-- prove those are the only changes, and can check 0041's changes against
-- the bodies 0041 left.
create table verify.before_0042 as
  select p.oid::regprocedure::text as fn, p.prosrc, p.prosecdef,
         p.provolatile, p.proconfig, p.proacl::text as acl
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace;
