-- Applied by scripts/verify-migrations.sh immediately BEFORE 0034 runs.
--
-- 0034 adds one condition to ai_app_add_candidate. This keeps every
-- SECURITY DEFINER function a signed-in browser may call as it stood just
-- before, so schema-assertions.sql can prove that condition is the only
-- change, and can check 0032's changes against the bodies 0032 left.
create table verify.before_0034 as
  select p.oid::regprocedure::text as fn, p.prosrc, p.prosecdef,
         p.provolatile, p.proconfig, p.proacl::text as acl
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'execute');
