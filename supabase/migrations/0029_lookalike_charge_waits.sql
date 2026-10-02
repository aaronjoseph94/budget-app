-- 0029_lookalike_charge_waits.sql
--
-- A charge that looks like one already in the ledger waits in Review, even
-- for a learned shop (architecture-c2-02).
--
-- The dedupe hash is over the raw shop text and the date exactly as the
-- statement wrote them, so the same charge read from a PDF statement and
-- from a CSV export of the same card has two hashes. dedupe.ts accepts that
-- on the promise that such a duplicate "appears in the review queue where a
-- human sees it and rejects it". save_import broke the promise: a row whose
-- normalised shop has a learned rule was filed straight into the ledger, so
-- an overlapping PDF and CSV counted the charge twice, with no review.
--
-- Now a rule files a candidate only when the ledger holds no charge on the
-- same account, for the same amount, at the same normalised shop, within
-- three days of it: the pair window F39 uses for "counted twice". Such a
-- row stays pending, unfiled, for the owner to approve or reject. The hash
-- does not change, so nothing is re-keyed; nothing is computed here, only
-- compared.
--
-- The one condition is added to the 5-argument save_import as it stands,
-- after 0022's and 0027's; 0007's 7-argument save_import calls it. Nothing
-- else changes, and create or replace keeps its settings and grants; the
-- schema gate compares the body before and after.
--
-- Forward-only: 0001–0028 are not edited.

-- paste-order-check start
do $$
begin
  -- Pasted again after it is in: refused before anything changes, so
  -- schema_level() never goes back (re-paste guard).
  if to_regprocedure('public.schema_level()') is not null then
    if public.schema_level() >= 29 then
      raise exception '0029 is already in; nothing to do';
    end if;
  end if;
  if to_regprocedure('public.schema_level()') is null or public.schema_level() < 28 then
    raise exception 'Paste 0028 first: 0029 needs 0028_ai_words_no_invisible_characters.sql, which is not in yet';
  end if;
end $$;
-- paste-order-check end

begin;

do $$
declare
  f    constant regprocedure := 'public.save_import(uuid, public.ingest_source, integer, jsonb, jsonb)';
  at   constant text := E'\n                          and e.merchant = c.merchant))';
  cond constant text := E'\n       and not exists (select 1 from public.transactions t'
                     || E'\n                        where t.user_id = v_user and t.account_id = c.account_id'
                     || E'\n                          and t.amount_cents = c.amount_cents and t.merchant = c.merchant'
                     || E'\n                          and t.posted_on between c.posted_on - 3 and c.posted_on + 3)';
  src  text;
  def  text;
begin
  select p.prosrc into src from pg_proc p where p.oid = f;
  def := pg_get_functiondef(f);
  if (length(src) - length(replace(src, at, ''))) / length(at) <> 1
     or strpos(def, '$function$' || src || '$function$') = 0 then
    raise exception 'save_import is not as 0027 left it; nothing was changed';
  end if;
  execute replace(def, '$function$' || src || '$function$', '$function$' || replace(src, at, at || cond) || '$function$');
end $$;

create or replace function public.schema_level()
returns integer
language sql
immutable
as $$ select 29 $$;

commit;
