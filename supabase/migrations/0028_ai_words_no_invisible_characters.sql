-- 0028_ai_words_no_invisible_characters.sql
--
-- The AI's kept words refuse invisible characters (security-b-01).
--
-- 0017's ai_text_is_clean refuses digits and currency signs in ai_notes,
-- the database's backstop behind the app's text rule. It let through the
-- characters that draw nothing yet change what is read: a right-to-left
-- override around a blank draws the engine's $12.34 as 43.21$, and a
-- zero-width space or a soft hyphen inside "twenty" or "crypto" slips it
-- past the word rules. The app's rule (packages/schema prose.ts) now
-- refuses them; this holds kept words to the same: the soft hyphen, the
-- Arabic letter mark, the Mongolian vowel separator, zero-width and
-- direction marks (U+200B-200F), bidi embeddings and overrides
-- (U+202A-202E), invisible operators (U+2060-2064), isolates
-- (U+2066-2069), the byte-order mark and private-use characters.
--
-- The escapes are written as \uXXXX, which Postgres's regular expressions
-- read, so this file holds no invisible characters. jsonb's text form
-- writes these characters as themselves, so the pattern sees them.
--
-- The check is put back NOT VALID: a CHECK whose function changes is not
-- re-run on rows already kept, and validating could refuse this update
-- over words the app already refuses to show when it reads them back. New
-- and changed rows are checked. Nothing is deleted.
--
-- Forward-only: 0001–0027 are not edited.

-- paste-order-check start
do $$
begin
  if to_regprocedure('public.schema_level()') is null or public.schema_level() < 27 then
    raise exception 'Paste 0027 first: 0028 needs 0027_receipt_photo_twice_waits.sql, which is not in yet';
  end if;
end $$;
-- paste-order-check end

begin;

alter table public.ai_notes drop constraint ai_notes_body_clean;

create or replace function public.ai_text_is_clean(p_body jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_body is not null
     and p_body::text !~ '[0-9０-９٠-٩۰-۹०-९$＄%％€£¥¢₹]'
     and p_body::text !~ '[­؜᠎​-‏‪-‮⁠-⁤⁦-⁩﻿-]'
$$;

alter table public.ai_notes
  add constraint ai_notes_body_clean check (public.ai_text_is_clean(body)) not valid;

create or replace function public.schema_level()
returns integer
language sql
immutable
as $$ select 28 $$;

commit;
