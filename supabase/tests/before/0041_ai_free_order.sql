-- Applied by scripts/verify-migrations.sh immediately BEFORE 0041 runs.
--
-- Two owners' AI choices as 0016 left them, so schema-assertions.sql can
-- check what 0041 made of them: one never touched the order and holds
-- 0016's default; the other moved Groq first. Users of their own, as
-- before/0037 does, so the assertions' own users are left as they expect.
insert into auth.users (id) values
  ('41414141-4141-4141-8141-414141414141'),
  ('41414141-4141-4141-8141-414141414142');
insert into public.ai_settings (user_id, provider_order)
  values ('41414141-4141-4141-8141-414141414141', '{gemini,groq,openrouter,openai,anthropic}');
insert into public.ai_settings (user_id, provider_order, daily_cap)
  values ('41414141-4141-4141-8141-414141414142', '{groq,gemini,openrouter,openai,anthropic}', 60);

-- 0041 re-creates ai_context_for and schema_level(). This keeps every
-- function in public as it stood just before, so schema-assertions.sql can
-- prove those are the only changes, and can check 0040's changes against
-- the bodies 0040 left.
create table verify.before_0041 as
  select p.oid::regprocedure::text as fn, p.prosrc, p.prosecdef,
         p.provolatile, p.proconfig, p.proacl::text as acl
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace;
