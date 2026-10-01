-- Applied by scripts/verify-migrations.sh immediately BEFORE 0032 runs.
--
-- 0032 changes a few lines of approve_candidate and
-- recategorise_transaction. This keeps every SECURITY DEFINER function a
-- signed-in browser may call as it stood just before, so
-- schema-assertions.sql can prove those lines are the only change, and can
-- check 0019's guard against the bodies 0019 left.
create table verify.before_0032 as
  select p.oid::regprocedure::text as fn, p.prosrc, p.prosecdef,
         p.provolatile, p.proconfig, p.proacl::text as acl
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'execute');
