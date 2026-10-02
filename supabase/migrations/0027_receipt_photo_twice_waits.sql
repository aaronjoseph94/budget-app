-- 0027_receipt_photo_twice_waits.sql
--
-- A second photo of a receipt already brought in waits in Review, even for
-- a learned shop (review-r-03).
--
-- Since ef59eae each receipt photo carries its own identity (the SHA-256 of
-- the photo), so two different purchases that read alike are two charges,
-- not one dropped as a repeat. But it also means a second photo of the SAME
-- paper receipt is a new candidate. save_import files any candidate whose
-- shop has a learned rule straight into the ledger, and approving a row
-- teaches one, so most shops have one. 0022's condition looks only at the
-- same hash and does not stop it. The duplicate went into the ledger and
-- the month's totals with nobody reviewing it, and Add said "filed
-- automatically".
--
-- Now a rule does not file a receipt photo when another receipt photo
-- already brought in has the same shop, day and total. It waits in Review,
-- where the owner sees both and approves it (two purchases alike) or
-- rejects it (the same receipt twice). An earlier one the owner rejected
-- still counts: waiting for a look is always the safe side. A receipt from
-- that shop with another day or total is still filed by its rule, and
-- statement rows are not affected. The counts still balance.
--
-- The one condition is added to the 5-argument save_import as 0022 left
-- it, right after 0022's own. Nothing else changes, and create or replace
-- keeps its settings and grants; the schema gate compares the body before
-- and after.
--
-- Forward-only: 0001–0026 are not edited.

-- paste-order-check start
do $$
begin
  if to_regprocedure('public.schema_level()') is null or public.schema_level() < 26 then
    raise exception 'Paste 0026 first: 0027 needs 0026_goal_check_on_link.sql, which is not in yet';
  end if;
end $$;
-- paste-order-check end

begin;

do $$
declare
  f    constant regprocedure := 'public.save_import(uuid, public.ingest_source, integer, jsonb, jsonb)';
  at   constant text := E'\n       and r.match_merchant = c.merchant'
                     || E'\n       and not exists (select 1 from public.ingest_candidates d'
                     || E'\n                        where d.user_id = v_user and d.dedupe_hash = c.dedupe_hash and d.id <> c.id)';
  cond constant text := E'\n       and not (c.source = ''receipt_photo'' and exists (select 1 from public.ingest_candidates e'
                     || E'\n                        where e.user_id = v_user and e.id <> c.id and e.source = ''receipt_photo'''
                     || E'\n                          and e.posted_on = c.posted_on and e.amount_cents = c.amount_cents'
                     || E'\n                          and e.merchant = c.merchant))';
  src  text;
  def  text;
begin
  select p.prosrc into src from pg_proc p where p.oid = f;
  def := pg_get_functiondef(f);
  if (length(src) - length(replace(src, at, ''))) / length(at) <> 1
     or strpos(def, '$function$' || src || '$function$') = 0 then
    raise exception 'save_import is not as 0022 left it; nothing was changed';
  end if;
  execute replace(def, '$function$' || src || '$function$', '$function$' || replace(src, at, at || cond) || '$function$');
end $$;

create or replace function public.schema_level()
returns integer
language sql
immutable
as $$ select 27 $$;

commit;
