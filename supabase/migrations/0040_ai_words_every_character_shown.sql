-- 0040_ai_words_every_character_shown.sql
--
-- What an AI app writes has every character visible, by Unicode's own
-- list, and no space of any kind at either end (testing of 2026-10-05:
-- db-01, db-02 and mcp-01).
--
-- 0034 and 0039 refused fifteen characters that draw as nothing, in what
-- an AI app adds to Review and in a suggestion's reason and names. Many
-- more draw as nothing: the tag characters (U+E0000-U+E0FFF), which spell
-- whole words no one sees but a model reads, the variation selectors
-- (U+FE00-U+FE0F, U+E0100-U+E01EF), the combining grapheme joiner, the
-- Hangul fillers, the Khmer inherent vowels, the Mongolian selectors, the
-- deprecated format characters (U+206A-U+206F) and the shorthand and
-- musical format controls. So 'Coffee' and 'Coffee' with one of them were
-- ten pending rows that read the same in Review while hashing apart, past
-- "already waiting", and a suggested 'Groceries' with one got past
-- name_taken and would have made a second category that reads
-- 'Groceries'. And btrim takes off only the ASCII space, so a no-break
-- space, a thin space or an ideographic space at the end did the same,
-- though the server trims them all.
--
-- Now, as the AI apps server from 2026-10-05.2 already refuses them
-- (packages/schema's drawsAsNothing), the database refuses every
-- character Unicode marks Default_Ignorable_Code_Point, and a space of
-- any kind at either end:
-- - ai_app_add_candidate: two conditions added after 0034's, each marked
--   "(0040)"; nothing else in it changes.
-- - _ai_app_words_shown (0039), which checks a suggestion's reason, new
--   name and added category's name: re-created with the same two.
-- - _ai_app_shown_shop (0036): re-created to drop the same characters
--   before masking, as the server's cleanShop now does, so a search still
--   matches exactly the shop name an AI app is shown. It keeps 0036's
--   mark.
-- - ai_app_updates_in(): re-created with 0040's marks (ADR 0012), and
--   ai_app_update_level() answers 40. schema_level() is not moved.
-- The escapes are written as \uXXXX and \UXXXXXXXX, which Postgres's
-- regular expressions read, so this file holds none of these characters.
--
-- Only where an AI app writes: a shop's own name on a statement may need
-- U+200C or U+200D, so the ingested_text domain is unchanged. The AI
-- helper's kept words (ai_text_is_clean, 0017 and 0028) are left as they
-- are: an AI app's token cannot write them, the owner's own session is
-- the only writer, and the app holds every word a model writes to
-- ModelProse first, which refuses every format character (tags included)
-- before anything is kept (NOTICED-NOT-TOUCHING N164).
--
-- Pasted again with 0040 in, it is refused before anything changes.
-- 0030 or 0035 pasted again over it reads 0039 as missing, and 0039
-- pasted again then puts back its own weaker _ai_app_words_shown and
-- answers 39: One-time updates offers 0040 again, and pasting it puts
-- back only what was taken. Every step here is safe to run twice. A
-- function body not as 0034 left it stops this update, and nothing
-- changes.
--
-- Numbering: the next number after 0039 (ADR 0012). Destroys nothing: it
-- re-creates functions in place.
--
-- Forward-only: 0001-0039 are not edited.

-- paste-order-check start
do $$
begin
  -- Two checks, not one with 'or': plpgsql plans an expression whole,
  -- so naming ai_app_updates_in() before it exists fails as "does not exist".
  if to_regprocedure('public.ai_app_updates_in()') is null then
    raise exception 'Paste 0039 first: 0040 needs 0039_ai_apps_suggest_changes.sql, which is not in yet';
  end if;
  if public.ai_app_updates_in() < 39 then
    raise exception 'Paste 0039 first: 0040 needs 0039_ai_apps_suggest_changes.sql, which is not in yet';
  end if;
  -- Read from 0040's own marks, so an earlier update pasted again over it
  -- lets it run again and put back what that one took away.
  if public.ai_app_updates_in() >= 40 then
    raise exception '0040 is already in; nothing to do';
  end if;
end $$;
-- paste-order-check end

begin;

-- ---------------------------------------------------------------------------
-- What an AI app adds to Review
-- ---------------------------------------------------------------------------
do $$
declare
  f   constant regprocedure := 'public.ai_app_add_candidate(uuid, date, bigint, text, integer, text, integer, text)';
  at  constant text := E'     or p_words ~ ''[\\u00AD\\u061C\\u180E\\u200B-\\u200F\\u2060-\\u2065\\uFEFF]'' -- drawn as nothing (0034)\n';
  add constant text := E'     or p_words ~ ''[\\u00AD\\u034F\\u061C\\u115F-\\u1160\\u17B4-\\u17B5\\u180B-\\u180F\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u206F\\u3164\\uFE00-\\uFE0F\\uFEFF\\uFFA0\\uFFF0-\\uFFF8\\U0001BCA0-\\U0001BCA3\\U0001D173-\\U0001D17A\\U000E0000-\\U000E0FFF]'' -- drawn as nothing, as Unicode lists them (0040)\n'
                    || E'     or p_words ~ ''^[ \\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000]|[ \\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000]$'' -- a space of any kind at either end (0040)\n';
  src text;
  new text;
  def text;
begin
  select p.prosrc into src from pg_proc p where p.oid = f;
  -- Already there: 0039 pasted again over 0040 leaves the add as it was.
  if strpos(src, add) > 0 then
    return;
  end if;
  -- 0034's line is there exactly once, or nothing changes.
  if (length(src) - length(replace(src, at, ''))) / length(at) <> 1 then
    raise exception 'could not change ai_app_add_candidate: it is not as 0034 left it';
  end if;
  new := replace(src, at, at || add);
  def := pg_get_functiondef(f);
  if strpos(def, '$function$' || src || '$function$') = 0 then
    raise exception 'could not change ai_app_add_candidate';
  end if;
  execute replace(def, '$function$' || src || '$function$', '$function$' || new || '$function$');
end $$;

-- ---------------------------------------------------------------------------
-- What an AI app suggests: a reason, a new name, an added category's name
-- ---------------------------------------------------------------------------
-- Words an AI app writes: as 0020 and 0034 hold what it adds, every
-- character visible, trimmed, within a length. Reads nothing.
create or replace function public._ai_app_words_shown(p_text text, p_most integer)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  -- (0040) Every character Unicode says draws as nothing is refused, and a
  -- space of any kind at either end, as the server's WordsSchema trims.
  select p_text is not null and length(p_text) between 1 and p_most and p_text = btrim(p_text)
     and p_text !~ '[\x01-\x1F\x7F-\x9F\u2028-\u202E\u2066-\u2069]'
     and p_text !~ '[\u00AD\u034F\u061C\u115F-\u1160\u17B4-\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFF8\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0000-\U000E0FFF]'
     and p_text !~ '^[ \u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]|[ \u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]$'
$$;

-- ---------------------------------------------------------------------------
-- A shop's name, as an AI app is shown it
-- ---------------------------------------------------------------------------
create or replace function public._ai_app_shown_shop(p_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  -- (0036) A shop's name as cleanShop shows it: hidden characters out,
  -- each run of six or more digits masked, cut to 80 characters. (0040)
  -- Hidden is C0, DEL, C1, the line and paragraph separators, and every
  -- character Unicode says draws as nothing, tag characters too.
  select left(coalesce(string_agg(case when r.m[1] ~ '^[0-9]{6,}$' then repeat('*', length(r.m[1])) else r.m[1] end, '' order by r.i), ''), 80)
    from regexp_matches(
           regexp_replace(p_name, '[\u0001-\u001F\u007F-\u009F\u2028\u2029\u00AD\u034F\u061C\u115F-\u1160\u17B4-\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFF8\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0000-\U000E0FFF]', '', 'g'),
           '[0-9]+|[^0-9]+', 'g') with ordinality as r(m, i)
$$;

-- ---------------------------------------------------------------------------
-- Which AI-app updates are in
-- ---------------------------------------------------------------------------
create or replace function public.ai_app_updates_in()
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  -- (0035) The last AI-app update in, in an unbroken run, each read from
  -- what it left. 0040 lists every mark, its own too; 0038 is not one.
  with mark(n, fn, word) as (values
    (30, 'public._ai_app_gate(text)', '''disconnected'''),
    (31, 'public._ai_app_dedupe_hash(uuid, date, bigint, text, integer)', '''ai_app:'''),
    (32, 'public.approve_candidate(uuid, uuid)', '(0032)'),
    (32, 'public.recategorise_transaction(uuid, uuid, boolean)', '(0032)'),
    (33, 'public.ai_app_search(text, date, date, bigint, bigint, text[], text, text, integer)', '(0033)'),
    (34, 'public.ai_app_add_candidate(uuid, date, bigint, text, integer, text, integer, text)', '(0034)'),
    (35, 'public.ai_app_updates_in()', '(0035)'),
    (36, 'public._ai_app_shown_shop(text)', '(0036)'),
    (37, 'public._ai_app_clean_old_rows()', '(0037)'),
    (39, 'public.ai_app_propose(jsonb)', '(0039)'),
    -- 0030 pasted again puts back a gate without 0039's kind: 0039 is not in.
    (39, 'public._ai_app_gate(text)', '''suggesting_off'''),
    (40, 'public.ai_app_add_candidate(uuid, date, bigint, text, integer, text, integer, text)', '(0040)'),
    -- 0039 pasted again puts back its own words check: 0040 is not in.
    (40, 'public._ai_app_words_shown(text, integer)', '(0040)'),
    (40, 'public._ai_app_shown_shop(text)', '(0040)')
  ), missing(n) as (
    select m.n from mark m
     where coalesce(strpos((select p.prosrc from pg_catalog.pg_proc p where p.oid = to_regprocedure(m.fn)), m.word), 0) = 0
  )
  select coalesce((select max(m.n) from mark m where m.n < coalesce((select min(x.n) from missing x), 1000)), 29)
$$;

create or replace function public.ai_app_update_level()
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$ select 40 $$;

commit;
