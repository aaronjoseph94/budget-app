-- 0034_ai_words_visible.sql
--
-- What an AI app adds has every character visible (security review
-- mcp-2-05).
--
-- 0020's add refused the control and direction characters
-- IngestedTextSchema refuses, but not those that draw as nothing: the soft
-- hyphen (U+00AD), the Arabic letter mark (U+061C), the Mongolian vowel
-- separator (U+180E), zero-width space and joiners and the LRM/RLM marks
-- (U+200B-U+200F), the word joiner and invisible operators
-- (U+2060-U+2065), and the byte order mark (U+FEFF). So 'Coffee' and
-- 'Coffee' with one of them were two pending rows that looked the same in
-- Review while hashing apart, past the "already waiting" answer meant to
-- stop repeats, and approving one taught a rule keyed on text that
-- differed invisibly from what the owner read.
--
-- ai_app_add_candidate now refuses them too (bad_words), as the server's
-- WordsSchema does. Only here: a shop's own name on a statement may need
-- U+200C or U+200D, so the ingested_text domain and every other path are
-- unchanged. The escapes are written as \uXXXX, which Postgres's regular
-- expressions read, so this file holds no invisible characters.
--
-- The function is re-created from its own definition as it stands, with one
-- condition added and nothing else; create or replace keeps its settings
-- (SECURITY DEFINER, VOLATILE, search_path pinned) and grants. A definition
-- that does not hold the line expected stops this update, and nothing
-- changes.
--
-- Forward-only: 0001–0033 are not edited.

-- paste-order-check start
do $$
begin
  if to_regprocedure('public.ai_app_update_level()') is null or public.ai_app_update_level() < 33 then
    raise exception 'Paste 0033 first: 0034 needs 0033_ai_search_masked.sql, which is not in yet';
  end if;
end $$;
-- paste-order-check end

begin;

do $$
declare
  f   constant regprocedure := 'public.ai_app_add_candidate(uuid, date, bigint, text, integer, text, integer, text)';
  at  constant text := E'  if p_words is null or length(p_words) not between 1 and 120 or p_words <> btrim(p_words)\n';
  add constant text := E'     or p_words ~ ''[\\u00AD\\u061C\\u180E\\u200B-\\u200F\\u2060-\\u2065\\uFEFF]'' -- drawn as nothing (0034)\n';
  src text;
  new text;
  def text;
begin
  select p.prosrc into src from pg_proc p where p.oid = f;
  -- The line is there exactly once, or nothing changes.
  if (length(src) - length(replace(src, at, ''))) / length(at) <> 1 then
    raise exception 'could not change ai_app_add_candidate: it is not as 0020 left it';
  end if;
  new := replace(src, at, at || add);
  def := pg_get_functiondef(f);
  if strpos(def, '$function$' || src || '$function$') = 0 then
    raise exception 'could not change ai_app_add_candidate';
  end if;
  execute replace(def, '$function$' || src || '$function$', '$function$' || new || '$function$');
end $$;

create or replace function public.ai_app_update_level()
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$ select 34 $$;

commit;
