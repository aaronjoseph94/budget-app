-- 0019_ai_apps_cannot_write.sql
--
-- AI apps cannot write (ADR 0012; docs/design/mcp/PLAN.md §2.5 and §2.12).
--
-- An AI app the owner connects, such as Claude or ChatGPT, signs in through
-- Supabase's OAuth server, and its token carries a client_id claim that the
-- owner's own sign-in never has. Supabase gives such a token the same access
-- to the owner's rows as the owner's own session, so the tools the AI apps
-- server offers are not the boundary. The database is:
--
-- - On every table, a restrictive policy for insert, update and delete: a
--   token with client_id changes no row, whatever else would allow it.
-- - On the receipts bucket, the same for every command, reading included:
--   an AI app never needs a photo.
-- - Row-level security does not bind a SECURITY DEFINER function, so each
--   one a signed-in browser may call is re-created exactly as it stands,
--   with one first statement added: public._not_an_ai_app(), which refuses
--   a token with client_id (42501, "AI apps cannot do this").
--
-- The owner's own session, without client_id, is unaffected. The one write
-- an AI app may make, an entry waiting in Review, comes with 0020 and makes
-- its own checks.
--
-- It also adds the 'ai_app' source that 0020 uses. Postgres refuses to use
-- a new enum label in the transaction that added it, and a paste may run as
-- one, so it is added here, a paste earlier. Nothing in this file uses it.
--
-- Forward-only: 0001–0018 are not edited. Pasted twice, it is refused where
-- it creates _not_an_ai_app, and nothing changes.

-- Paste 0018 first. This re-creates 0016's and 0018's functions; pasted
-- before 0018, a later paste of 0018 would put its functions back without
-- the guard, and nothing would say so.
-- paste-order-check start
do $$
begin
  if to_regprocedure('public.clear_candidate_suggestion(uuid)') is null then
    raise exception 'Paste 0018 first: 0019 needs 0018_category_suggestions.sql, which is not in yet';
  end if;
end $$;
-- paste-order-check end

alter type public.ingest_source add value if not exists 'ai_app';

begin;

-- Returns for the owner's own session; refuses an AI app's token.
create function public._not_an_ai_app()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.jwt() ->> 'client_id') is not null then
    raise exception 'AI apps cannot do this' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public._not_an_ai_app() from public, anon;
grant execute on function public._not_an_ai_app() to authenticated;

-- Every table: no insert, update or delete with client_id. Restrictive, so
-- it narrows each table's owner policy rather than adding to it.
do $$
declare
  t    text;
  mine constant text := '((select auth.jwt() ->> ''client_id'') is null)';
begin
  foreach t in array array[
    'accounts', 'categories', 'transactions', 'ingest_batches', 'ingest_candidates',
    'ingest_unreadable_lines', 'merchant_rules', 'savings_goals', 'category_budgets',
    'category_plans', 'month_balances', 'pay_schedules', 'debts', 'debt_extra_payments',
    'ai_settings', 'ai_provider_keys', 'ai_usage', 'ai_provider_state', 'ai_notes',
    'insight_dismissals', 'coach_answers'
  ] loop
    execute format('create policy ai_apps_cannot_insert on public.%I as restrictive for insert to authenticated with check %s', t, mine);
    execute format('create policy ai_apps_cannot_update on public.%I as restrictive for update to authenticated using %s with check %s', t, mine, mine);
    execute format('create policy ai_apps_cannot_delete on public.%I as restrictive for delete to authenticated using %s', t, mine);
  end loop;
end $$;

-- Receipts: nothing at all with client_id, reading included.
create policy receipts_not_for_ai_apps on storage.objects
  as restrictive
  for all
  to authenticated
  using (bucket_id <> 'receipts' or (select auth.jwt() ->> 'client_id') is null)
  with check (bucket_id <> 'receipts' or (select auth.jwt() ->> 'client_id') is null);

-- Each SECURITY DEFINER function a signed-in browser may call, re-created
-- from its own definition as it stands, with the guard as its first
-- statement: after `begin` in PL/pgSQL, before the query in SQL. Nothing
-- else changes, and create or replace keeps its grants. The schema gate
-- compares each body before and after, character for character.
do $$
declare
  f   regprocedure;
  src text;
  def text;
  new text;
begin
  foreach f in array array[
    'public.save_import(uuid, public.ingest_source, integer, jsonb, jsonb)',
    'public.save_import(uuid, public.ingest_source, integer, jsonb, jsonb, date, date)',
    'public.approve_candidate(uuid, uuid)',
    'public.reject_candidate(uuid)',
    'public.add_typed_transaction(uuid, date, bigint, text, text, uuid)',
    'public.recategorise_transaction(uuid, uuid, boolean)',
    'public.dismiss_unreadable_line(uuid)',
    'public.ai_key_status()',
    'public.ai_key_forget(public.ai_provider)',
    'public.suggest_candidate_categories(jsonb)',
    'public.clear_candidate_suggestion(uuid)'
  ]::regprocedure[] loop
    select p.prosrc,
           case l.lanname
             when 'plpgsql' then regexp_replace(p.prosrc, E'\nbegin\n', E'\nbegin\n  perform public._not_an_ai_app();\n')
             when 'sql' then E'\n  select public._not_an_ai_app();' || p.prosrc
           end
      into src, new
      from pg_proc p join pg_language l on l.oid = p.prolang
     where p.oid = f;
    def := pg_get_functiondef(f);
    if new is null or new = src or strpos(def, '$function$' || src || '$function$') = 0 then
      raise exception 'could not add the guard to %', f;
    end if;
    execute replace(def, '$function$' || src || '$function$', '$function$' || new || '$function$');
  end loop;
end $$;

commit;
