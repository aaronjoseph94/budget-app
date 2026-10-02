-- 0033_ai_search_masked.sql
--
-- An AI app's search sees shop names as it is shown them, long numbers
-- masked (security review mcp-2-04).
--
-- The AI apps server masks every run of six or more digits in a shop's
-- name before an AI app sees it: statements carry card, phone and
-- reference numbers. But ai_app_search (0020) matched the words against the
-- stored names, numbers and all, and says how many rows matched. So
-- 'NETFLIX.COM 8' finding one row and 'NETFLIX.COM 87' none read a masked
-- number back a digit at a time, in about a hundred searches, well inside
-- the day's 300.
--
-- Now both sides are masked the same way before they are compared: each
-- run of six or more digits in the stored names becomes '*', runs of '*'
-- become one, and the words searched for have their runs of '*' made one
-- too, so the shop as the AI app was shown it ('NETFLIX.COM **********
-- CA') still finds it. Words that hold six or more digits in a row are
-- refused like any other bad search: such a number is never shown, so
-- there is nothing it could rightly match.
--
-- The function is re-created from its own definition as it stands, with
-- those three lines changed and nothing else; create or replace keeps its
-- settings (SECURITY INVOKER, VOLATILE, search_path pinned) and grants. A
-- definition that does not hold the lines expected stops this update, and
-- nothing changes.
--
-- Forward-only: 0001–0032 are not edited.

-- paste-order-check start
do $$
begin
  -- Two checks, not one with 'or': plpgsql plans an expression whole,
  -- so naming ai_app_update_level() before it exists fails as "does not exist".
  if to_regprocedure('public.ai_app_update_level()') is null then
    raise exception 'Paste 0032 first: 0033 needs 0032_ai_rows_teach_no_rule.sql, which is not in yet';
  end if;
  if public.ai_app_update_level() < 32 then
    raise exception 'Paste 0032 first: 0033 needs 0032_ai_rows_teach_no_rule.sql, which is not in yet';
  end if;
end $$;
-- paste-order-check end

begin;

do $$
declare
  f     constant regprocedure := 'public.ai_app_search(text, date, date, bigint, bigint, text[], text, text, integer)';
  edits constant text[][] := array[
    array[$x$or coalesce(cardinality(p_categories), 0) > 10 or length(coalesce(p_text, '')) > 60 then$x$,
          $x$or coalesce(cardinality(p_categories), 0) > 10 or length(coalesce(p_text, '')) > 60
     or p_text ~ '[0-9]{6,}' then$x$],
    array[$x$else '%' || replace(replace(replace(p_text, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;$x$,
          $x$else '%' || replace(replace(replace(regexp_replace(p_text, '\*+', '*', 'g'), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;$x$],
    array[$x$and (v_like is null or t.merchant_raw ilike v_like escape '\' or t.merchant ilike v_like escape '\')$x$,
          $x$-- As the AI app is shown them: long numbers masked (0033).
       and (v_like is null
            or regexp_replace(regexp_replace(t.merchant_raw, '[0-9]{6,}', '*', 'g'), '\*+', '*', 'g') ilike v_like escape '\'
            or regexp_replace(regexp_replace(t.merchant, '[0-9]{6,}', '*', 'g'), '\*+', '*', 'g') ilike v_like escape '\')$x$]];
  src text;
  new text;
  def text;
  i   int;
begin
  select p.prosrc into src from pg_proc p where p.oid = f;
  new := src;
  for i in 1 .. array_length(edits, 1) loop
    -- Each expected line is there exactly once, or nothing changes.
    if (length(new) - length(replace(new, edits[i][1], ''))) / length(edits[i][1]) <> 1 then
      raise exception 'could not change ai_app_search: it is not as 0020 left it';
    end if;
    new := replace(new, edits[i][1], edits[i][2]);
  end loop;
  def := pg_get_functiondef(f);
  if strpos(def, '$function$' || src || '$function$') = 0 then
    raise exception 'could not change ai_app_search';
  end if;
  execute replace(def, '$function$' || src || '$function$', '$function$' || new || '$function$');
end $$;

create or replace function public.ai_app_update_level()
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$ select 33 $$;

commit;
