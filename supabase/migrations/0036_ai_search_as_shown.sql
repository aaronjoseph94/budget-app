-- 0036_ai_search_as_shown.sql
--
-- An AI app's search matches exactly the shop name it is shown (security
-- review, second pass on mcp-2-04).
--
-- 0033 masked long digit runs in the stored names before matching. But the
-- AI apps server shows a name through cleanShop (packages/ai-apps/src/
-- money.ts), which first drops hidden characters, then masks each run of
-- six or more digits, then cuts the name to 80 characters. 0033 did
-- neither the first step nor the last, so the two sides masked different
-- text:
-- - '12345' + a zero-width space + '67890' is one masked number on screen,
--   but two five-digit halves to 0033, so a search could find either half;
-- - text past the 80th character is never shown, but could be found.
-- Either way, how many rows matched told the AI app about text it was
-- never shown.
--
-- Now public._ai_app_shown_shop(text) does what cleanShop does, step for
-- step, with the same hidden characters (C0, DEL and C1; U+200B-U+200F;
-- U+2028-U+202E; U+2060-U+2069; U+FEFF), and the search compares that,
-- with runs of '*' made one as 0033 did. It reads nothing and is the same
-- for everyone.
-- Those characters are written as \uXXXX escapes, which Postgres's
-- regular expressions read, so this file holds none of them as itself
-- (written so at the merge of 2026-10-02; the function is unchanged).
--
-- ai_app_search is re-created from its own definition as it stands, with
-- 0033's two compared lines changed and nothing else; create or replace
-- keeps its settings (SECURITY INVOKER, VOLATILE, search_path pinned) and
-- grants. A definition that does not hold the lines expected stops this
-- update, and nothing changes; pasted twice, it is refused the same way.
--
-- Numbering: within 0030-0039, reserved for this line (ADR 0012). It
-- leaves the mark "(0036)" for ai_app_updates_in() (0035).
--
-- Forward-only: 0001–0035 are not edited.

-- paste-order-check start
do $$
begin
  -- Two checks, so the second is read only once the function is there.
  if to_regprocedure('public.ai_app_updates_in()') is null then
    raise exception 'Paste 0035 first: 0036 needs 0035_ai_app_updates_in.sql, which is not in yet';
  end if;
  if public.ai_app_updates_in() < 35 then
    raise exception 'Paste 0035 first: 0036 needs 0030 to 0035, which are not all in yet';
  end if;
end $$;
-- paste-order-check end

begin;

create or replace function public._ai_app_shown_shop(p_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  -- (0036) A shop's name as cleanShop shows it: hidden characters out,
  -- each run of six or more digits masked, cut to 80 characters.
  select left(coalesce(string_agg(case when r.m[1] ~ '^[0-9]{6,}$' then repeat('*', length(r.m[1])) else r.m[1] end, '' order by r.i), ''), 80)
    from regexp_matches(
           regexp_replace(p_name, '[\u0001-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]', '', 'g'),
           '[0-9]+|[^0-9]+', 'g') with ordinality as r(m, i)
$$;

revoke all on function public._ai_app_shown_shop(text) from public, anon;
grant execute on function public._ai_app_shown_shop(text) to authenticated;

do $$
declare
  f     constant regprocedure := 'public.ai_app_search(text, date, date, bigint, bigint, text[], text, text, integer)';
  edits constant text[][] := array[
    array[$x$-- As the AI app is shown them: long numbers masked (0033).$x$,
          $x$-- As the AI app is shown them: long numbers masked (0033),
       -- hidden characters out and cut to 80 first, as cleanShop does (0036).$x$],
    array[$x$or regexp_replace(regexp_replace(t.merchant_raw, '[0-9]{6,}', '*', 'g'), '\*+', '*', 'g') ilike v_like escape '\'$x$,
          $x$or regexp_replace(public._ai_app_shown_shop(t.merchant_raw), '\*+', '*', 'g') ilike v_like escape '\'$x$],
    array[$x$or regexp_replace(regexp_replace(t.merchant, '[0-9]{6,}', '*', 'g'), '\*+', '*', 'g') ilike v_like escape '\')$x$,
          $x$or regexp_replace(public._ai_app_shown_shop(t.merchant), '\*+', '*', 'g') ilike v_like escape '\')$x$]];
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
      raise exception 'could not change ai_app_search: it is not as 0033 left it (if 0036 is already in, there is nothing to do)';
    end if;
    new := replace(new, edits[i][1], edits[i][2]);
  end loop;
  def := pg_get_functiondef(f);
  if strpos(def, '$function$' || src || '$function$') = 0 then
    raise exception 'could not change ai_app_search';
  end if;
  execute replace(def, '$function$' || src || '$function$', '$function$' || new || '$function$');
end $$;

commit;
