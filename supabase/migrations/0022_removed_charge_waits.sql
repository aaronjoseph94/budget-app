-- 0022_removed_charge_waits.sql
--
-- A charge the owner already decided on is never filed by a learned shop on
-- its own (backend-c2-02).
--
-- save_import skips a row whose dedupe hash is in the ledger or already
-- waiting in Review. The owner may remove a charge from All transactions
-- (0004 keeps DELETE for that), and its hash then leaves the ledger. When
-- the same statement was brought in again, the charge came back as a new
-- candidate, and if a shop rule matched it (approving a row teaches one, so
-- most shops have one) it went straight back into the ledger and the month's
-- totals with no review. Help promises that a statement brought in again
-- adds nothing twice.
--
-- Now a rule files a candidate only when no earlier candidate has the same
-- hash. An earlier one means the owner already decided on that exact charge:
-- approved it and later removed it from the ledger (otherwise it would have
-- been skipped), or rejected it. Such a charge waits in Review, where the
-- owner sees it and can approve or reject it again. A new charge from the
-- same shop is still filed by its rule, and the counts still balance.
--
-- The one condition is added to the 5-argument save_import as it stands,
-- 0019's guard included; 0007's 7-argument save_import calls it. Nothing
-- else changes, and create or replace keeps its settings and grants; the
-- schema gate compares the body before and after.
--
-- Forward-only: 0001–0021 are not edited.

-- paste-order-check start
do $$
begin
  -- Pasted again after it is in: refused before anything changes, so
  -- schema_level() never goes back (re-paste guard).
  if to_regprocedure('public.schema_level()') is not null then
    if public.schema_level() >= 22 then
      raise exception '0022 is already in; nothing to do';
    end if;
  end if;
  if to_regprocedure('public.schema_level()') is null then
    raise exception 'Paste 0021 first: 0022 needs 0021_category_holds.sql, which is not in yet';
  end if;
end $$;
-- paste-order-check end

begin;

do $$
declare
  f    constant regprocedure := 'public.save_import(uuid, public.ingest_source, integer, jsonb, jsonb)';
  at   constant text := E'\n       and r.match_merchant = c.merchant';
  cond constant text := E'\n       and not exists (select 1 from public.ingest_candidates d\n                        where d.user_id = v_user and d.dedupe_hash = c.dedupe_hash and d.id <> c.id)';
  src  text;
  def  text;
begin
  select p.prosrc into src from pg_proc p where p.oid = f;
  def := pg_get_functiondef(f);
  if (length(src) - length(replace(src, at, ''))) / length(at) <> 1
     or strpos(def, '$function$' || src || '$function$') = 0 then
    raise exception 'save_import is not as 0019 left it; nothing was changed';
  end if;
  execute replace(def, '$function$' || src || '$function$', '$function$' || replace(src, at, at || cond) || '$function$');
end $$;

create or replace function public.schema_level()
returns integer
language sql
immutable
as $$ select 22 $$;

commit;
