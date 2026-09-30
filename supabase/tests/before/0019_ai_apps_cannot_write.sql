-- Applied by scripts/verify-migrations.sh immediately BEFORE 0019 runs.
--
-- 0019 re-creates each SECURITY DEFINER function a signed-in browser may
-- call, adding one guard line. This keeps each one as it stood, in a schema
-- of its own outside public, so schema-assertions.sql can prove the guard is
-- the only change: not a character of the body, the settings or the grants.
create schema verify;
create table verify.guarded_before as
  select p.oid::regprocedure::text as fn, l.lanname as lang, p.prosrc, p.prosecdef,
         p.provolatile, p.proconfig, p.proacl::text as acl
    from pg_proc p
    join pg_language l on l.oid = p.prolang
   where p.pronamespace = 'public'::regnamespace
     and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'execute');
