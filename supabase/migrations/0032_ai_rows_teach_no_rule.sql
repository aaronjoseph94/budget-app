-- 0032_ai_rows_teach_no_rule.sql
--
-- A row an AI app added never teaches a learned shop (security review
-- mcp-2-02).
--
-- Approving a row in Review teaches its shop: approve_candidate writes
-- merchant_rules (shop -> category), and from then on save_import files
-- every statement line from that shop into that category with no review
-- (0004). For a row an AI app added, the shop is the AI's own words, and an
-- AI app can learn the exact names rules are kept under (its spending
-- tools hand them out). So one approval of a small AI-added entry with a
-- plausible suggested category could re-file every later NETFLIX.COM line
-- into Groceries, or start auto-filing a shop that had no rule, and none
-- of those later charges would pass through Review. That bends "model
-- output never reaches the ledger unreviewed".
--
-- Now:
-- - approve_candidate learns nothing from a candidate whose source is
--   'ai_app'. The row itself is approved and posted exactly as before.
-- - recategorise_transaction, asked to learn, learns nothing from a ledger
--   row whose source is 'ai_app'. The row still moves.
-- Rules from statements, receipts and typed entries are learned as before.
-- PLAN risk 19 already said such rules seldom file anything, so little is
-- lost.
--
-- Each function is re-created from its own definition as it stands, with
-- these few lines changed and nothing else: 0019's guard stays its first
-- statement, character for character, and create or replace keeps its
-- settings and grants. The schema gate compares each body before and
-- after. A definition that does not hold the lines expected stops this
-- update, and nothing changes.
--
-- Forward-only: 0001–0031 are not edited.

-- paste-order-check start
do $$
begin
  -- Two checks, not one with 'or': plpgsql plans an expression whole,
  -- so naming ai_app_update_level() before it exists fails as "does not exist".
  if to_regprocedure('public.ai_app_update_level()') is null then
    raise exception 'Paste 0031 first: 0032 needs 0031_ai_app_hash_own_kind.sql, which is not in yet';
  end if;
  if public.ai_app_update_level() < 31 then
    raise exception 'Paste 0031 first: 0032 needs 0031_ai_app_hash_own_kind.sql, which is not in yet';
  end if;
end $$;
-- paste-order-check end

begin;

do $$
declare
  edits constant jsonb := jsonb_build_object(
    'public.approve_candidate(uuid, uuid)', jsonb_build_array(
      jsonb_build_array(E'  v_merchant text;\nbegin\n',
                        E'  v_merchant text;\n  v_source   text;\nbegin\n'),
      jsonb_build_array(E'  returning c.merchant into v_merchant;\n',
                        E'  returning c.merchant, c.source::text into v_merchant, v_source;\n'),
      jsonb_build_array(
        E'  -- Learn. The latest human decision for a merchant is the rule for it.\n' ||
        E'  insert into public.merchant_rules (user_id, match_merchant, category_id)\n' ||
        E'  values (v_user, v_merchant, p_category)\n' ||
        E'  on conflict (user_id, match_merchant) do update set category_id = excluded.category_id;\n',
        E'  -- Learn. The latest human decision for a merchant is the rule for it.\n' ||
        E'  -- Never from an AI app''s row: its words are the AI''s, and a rule\n' ||
        E'  -- files later statement lines with no review (0032).\n' ||
        E'  if v_source is distinct from ''ai_app'' then\n' ||
        E'    insert into public.merchant_rules (user_id, match_merchant, category_id)\n' ||
        E'    values (v_user, v_merchant, p_category)\n' ||
        E'    on conflict (user_id, match_merchant) do update set category_id = excluded.category_id;\n' ||
        E'  end if;\n')),
    'public.recategorise_transaction(uuid, uuid, boolean)', jsonb_build_array(
      jsonb_build_array(E'  v_merchant  text;\nbegin\n',
                        E'  v_merchant  text;\n  v_source    text;\nbegin\n'),
      jsonb_build_array(E'  returning t.candidate_id, t.merchant into v_cand, v_merchant;\n',
                        E'  returning t.candidate_id, t.merchant, t.source::text into v_cand, v_merchant, v_source;\n'),
      jsonb_build_array(E'  if p_learn then\n',
                        E'  -- Never from an AI app''s row (0032).\n  if p_learn and v_source is distinct from ''ai_app'' then\n')));
  f    text;
  e    jsonb;
  src  text;
  new  text;
  def  text;
begin
  for f in select jsonb_object_keys(edits) loop
    select p.prosrc into src from pg_proc p where p.oid = f::regprocedure;
    new := src;
    for e in select jsonb_array_elements(edits -> f) loop
      -- Each expected line is there exactly once, or nothing changes.
      if (length(new) - length(replace(new, e ->> 0, ''))) / length(e ->> 0) <> 1 then
        raise exception 'could not change %: it is not as 0019 left it', f;
      end if;
      new := replace(new, e ->> 0, e ->> 1);
    end loop;
    def := pg_get_functiondef(f::regprocedure);
    if strpos(def, '$function$' || src || '$function$') = 0 then
      raise exception 'could not change %', f;
    end if;
    execute replace(def, '$function$' || src || '$function$', '$function$' || new || '$function$');
  end loop;
end $$;

create or replace function public.ai_app_update_level()
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$ select 32 $$;

commit;
