-- Applied by scripts/verify-migrations.sh immediately BEFORE 0030 runs.
--
-- Every SECURITY DEFINER function a signed-in browser may call, as the
-- line of updates 0021 to 0029 left it, before the AI-app security line
-- (0030 to 0037) changes approve_candidate, recategorise_transaction,
-- ai_app_search and ai_app_add_candidate. schema-assertions.sql checks
-- 0029's "one condition and nothing else" against this, so those later,
-- separately checked changes are not read as 0029's (N154, at the merge of
-- the two lines).
create table verify.before_0030 as
  select p.oid::regprocedure::text as fn, p.prosrc, p.prosecdef,
         p.provolatile, p.proconfig, p.proacl::text as acl
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'execute');
