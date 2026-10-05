-- Applied by scripts/verify-migrations.sh immediately BEFORE 0039 runs.
--
-- 0039 edits the gate, ai_app_review and ai_app_search in place, and
-- re-creates ai_app_updates_in() and ai_app_update_level(). This keeps
-- every function in public as it stood just before, so
-- schema-assertions.sql can prove those are the only changes, and can
-- check 0034's change against the bodies 0034 left.
create table verify.before_0039 as
  select p.oid::regprocedure::text as fn, p.prosrc, p.prosecdef,
         p.provolatile, p.proconfig, p.proacl::text as acl
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace;
