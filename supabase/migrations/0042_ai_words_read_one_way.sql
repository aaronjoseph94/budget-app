-- 0042_ai_words_read_one_way.sql
--
-- What an AI app writes reads one way only: no space but one ordinary
-- space between words, and each accented letter as one character (backend
-- review of 2026-11-09).
--
-- 0040 named the rule: words that read the same in Review must not hash
-- apart, past "already waiting", and a suggested name must not get past
-- name_taken to make a second category that reads the same. It closed
-- that for characters that draw as nothing and for a space of any kind at
-- either end. Three ways stayed open, each drawing exactly as the plain
-- words do:
-- - a space that is not the ordinary one, inside the words: the no-break
--   space (U+00A0), the thin and other typographic spaces (U+2000-U+200A,
--   U+202F, U+205F), the Ogham and ideographic spaces (U+1680, U+3000),
--   and the Braille blank (U+2800), which is no space to Unicode and
--   draws as one;
-- - two ordinary spaces in a row, which a page draws as one;
-- - an accent written as a letter and a separate combining mark (NFD)
--   beside the same letter stored as one character (NFC).
-- So 'Eating out' with a no-break space inside was suggested beside the
-- owner's 'Eating out', an 'e' and U+0301 beside the owner's U+00E9, and
-- 'Lunch at Subway' was added a second time over the one waiting.
--
-- Now such words are refused (bad_words), as the AI apps server from
-- 2026-11-09.1 refuses them. Refused, never rewritten: the words an AI
-- app adds are what the dedupe hash covers and what Review shows, so the
-- database stores them as given or not at all, and the hash's inputs are
-- as they were.
-- - ai_app_add_candidate: two conditions added after 0040's, each marked
--   "(0042)"; nothing else in it changes.
-- - _ai_app_words_shown (0039, 0040), which checks a suggestion's reason,
--   new name and added category's name: re-created with the same two.
-- - ai_app_updates_in(): re-created with 0042's marks (ADR 0012), and
--   ai_app_update_level() answers 42. schema_level() is not moved.
-- The escapes are written as \uXXXX, which Postgres's regular expressions
-- read, so this file holds none of these characters. "is nfc normalized"
-- needs PostgreSQL 13 and a UTF-8 database, as Supabase's is.
--
-- name_taken and "already waiting" still compare exactly, letter case and
-- all, as the database's own unique rule on a category's name does. That
-- is now enough for what an AI app writes: its words can no longer differ
-- from plain words by spacing or by how an accent is written, so two that
-- read the same in those ways are the same characters. _ai_app_proposal
-- and _ai_app_shown_shop are not changed.
--
-- Left as they are, on purpose:
-- - letters that only look alike: another script's (a Cyrillic 'a'), a
--   ligature or a fullwidth form. Nothing here tells them from a name in
--   that script, and requiring NFKC would refuse ordinary signs.
-- - a name the owner typed with such a space or accent. The owner's names
--   are stored as typed, by the app's own screens, and compared as stored;
--   an AI app's plain name beside one is not name_taken.
-- - rows and suggestions an AI app left before this update. None is
--   changed: that would change a stored hash.
-- - a shop's own name on a statement (the ingested_text domain), and the
--   AI helper's kept words (0017, 0028), as in 0040.
--
-- Pasted again with 0042 in, it is refused before anything changes. 0030
-- pasted again over it reads 0039 as missing; 0039 and then 0040 pasted
-- again put back their own weaker _ai_app_words_shown and answer 40:
-- One-time updates offers 0042 again, and pasting it puts back only what
-- was taken. Every step here is safe to run twice. A function body not as
-- 0040 left it stops this update, and nothing changes.
--
-- Numbering: the next number after 0041, which is not an AI-app update
-- and leaves no mark (ADR 0012). Needs 0040 only. Destroys nothing: it
-- re-creates functions in place.
--
-- Forward-only: 0001-0041 are not edited.

-- paste-order-check start
do $$
begin
  -- Two checks, not one with 'or': plpgsql plans an expression whole,
  -- so naming ai_app_updates_in() before it exists fails as "does not exist".
  if to_regprocedure('public.ai_app_updates_in()') is null then
    raise exception 'Paste 0040 first: 0042 needs 0040_ai_words_every_character_shown.sql, which is not in yet';
  end if;
  if public.ai_app_updates_in() < 40 then
    raise exception 'Paste 0040 first: 0042 needs 0040_ai_words_every_character_shown.sql, which is not in yet';
  end if;
  -- Read from 0042's own marks, so an earlier update pasted again over it
  -- lets it run again and put back what that one took away.
  if public.ai_app_updates_in() >= 42 then
    raise exception '0042 is already in; nothing to do';
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
  at  constant text := E'     or p_words ~ ''^[ \\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000]|[ \\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000]$'' -- a space of any kind at either end (0040)\n';
  add constant text := E'     or p_words ~ ''[\\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u2800\\u3000]| {2}'' -- a space that is not one ordinary space between words (0042)\n'
                    || E'     or p_words is not nfc normalized -- an accent as a letter and a separate mark (0042)\n';
  raw text;
  src text;
  def text;
begin
  -- As 0040 does: a body pasted from a Windows clipboard keeps CR LF line
  -- ends; the lines are matched without the CR, and written back without it.
  select p.prosrc into raw from pg_proc p where p.oid = f;
  src := replace(raw, E'\r', '');
  -- Already there: 0039 and 0040 pasted again over 0042 leave the add as it was.
  if strpos(src, add) > 0 then
    return;
  end if;
  -- 0040's line is there exactly once, or nothing changes.
  if (length(src) - length(replace(src, at, ''))) / length(at) <> 1 then
    raise exception 'could not change ai_app_add_candidate: it is not as 0040 left it';
  end if;
  def := pg_get_functiondef(f);
  if strpos(def, '$function$' || raw || '$function$') = 0 then
    raise exception 'could not change ai_app_add_candidate';
  end if;
  execute replace(def, '$function$' || raw || '$function$', '$function$' || replace(src, at, at || add) || '$function$');
end $$;

-- ---------------------------------------------------------------------------
-- What an AI app suggests: a reason, a new name, an added category's name
-- ---------------------------------------------------------------------------
-- Words an AI app writes: as 0020, 0034 and 0040 hold what it adds, every
-- character visible, trimmed, within a length, and read one way only.
-- Reads nothing.
create or replace function public._ai_app_words_shown(p_text text, p_most integer)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  -- (0040) Every character Unicode says draws as nothing is refused, and a
  -- space of any kind at either end, as the server's WordsSchema trims.
  -- (0042) And a space that is not one ordinary space between words, or an
  -- accent written as a letter and a separate mark: words that would read
  -- the same as plain ones and compare as different.
  select p_text is not null and length(p_text) between 1 and p_most and p_text = btrim(p_text)
     and p_text !~ '[\x01-\x1F\x7F-\x9F\u2028-\u202E\u2066-\u2069]'
     and p_text !~ '[\u00AD\u034F\u061C\u115F-\u1160\u17B4-\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFF8\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0000-\U000E0FFF]'
     and p_text !~ '^[ \u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]|[ \u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]$'
     and p_text !~ '[\u00A0\u1680\u2000-\u200A\u202F\u205F\u2800\u3000]| {2}'
     and p_text is nfc normalized
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
  -- what it left. 0042 lists every mark, its own too; 0038 and 0041 are
  -- not AI-app updates and leave none.
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
    (40, 'public._ai_app_shown_shop(text)', '(0040)'),
    -- And its own same_as_now test, which 0039 pasted again puts back.
    (40, 'public._ai_app_proposal(uuid, date, jsonb)', '(0040)'),
    (42, 'public.ai_app_add_candidate(uuid, date, bigint, text, integer, text, integer, text)', '(0042)'),
    -- 0039 or 0040 pasted again puts back its own words check: 0042 is not in.
    (42, 'public._ai_app_words_shown(text, integer)', '(0042)')
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
as $$ select 42 $$;

commit;
