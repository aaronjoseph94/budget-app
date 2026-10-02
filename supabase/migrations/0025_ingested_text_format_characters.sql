-- 0025_ingested_text_format_characters.sql
--
-- Stored text refuses what IngestedTextSchema refuses (backend-a-06).
--
-- 0001 says the ingested_text domain mirrors IngestedTextSchema and that
-- the database, not zod, is where a rule is true. It refused only C0 and
-- DEL. The schema also refuses C1 controls (U+0080-009F), the line and
-- paragraph separators (U+2028, U+2029), the bidi embeddings and overrides
-- (U+202A-202E) and the isolates (U+2066-2069): a right-to-left override
-- shows a merchant reversed while storing it as it is, so the owner, in
-- Review, approves one thing having read another. Statement and model text
-- already pass zod; names typed in Setup, the SQL editor, or any future
-- writer that skips zod did not.
--
-- The escapes are written as \uXXXX, which Postgres's regular expressions
-- read, so this file holds no invisible characters. Adding the check tests
-- every stored value; one that holds such a character stops this update,
-- and nothing changes.
--
-- Forward-only: 0001–0024 are not edited.

-- paste-order-check start
do $$
begin
  if to_regprocedure('public.schema_level()') is null or public.schema_level() < 24 then
    raise exception 'Paste 0024 first: 0025 needs 0024_learned_shops_own_category.sql, which is not in yet';
  end if;
end $$;
-- paste-order-check end

begin;

alter domain public.ingested_text
  add constraint ingested_text_no_format_characters
  check (value !~ '[\u0080-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]');

create or replace function public.schema_level()
returns integer
language sql
immutable
as $$ select 25 $$;

commit;
