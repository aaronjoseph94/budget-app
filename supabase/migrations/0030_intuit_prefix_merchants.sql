-- 0030_intuit_prefix_merchants.sql
--
-- Shop names stored before 'IN*' was a processor prefix are tidied as the
-- app now tidies them (architecture-a-10).
--
-- statement-parsers' normalizeMerchant listed Intuit's prefix 'IN *' twice
-- and 'IN*' never, so 'IN*ACME PLUMBING' and 'IN *ACME PLUMBING' were two
-- shops, and a rule learned for one did not file the other. The app now
-- strips both. The names it stored before still begin 'IN*', and a learned
-- shop under such a name would never match a new row again. This rewrites
-- them the way the app now would: the prefix off, then any punctuation and
-- spaces it leaves at the front, and runs of spaces as one.
--
-- Only a row whose own statement text (merchant_raw) begins 'IN*' is
-- rewritten: 'SQ *IN*SHOP' is still tidied to 'IN*SHOP', one prefix only,
-- so a name that merely begins 'IN*' after another prefix is left alone.
-- A learned shop is renamed when a row rewritten here had its name. Where
-- the owner already has a learned shop under the new name, the one used or
-- made most recently is kept, as 0006's "the latest human decision is the
-- rule". merchant_raw and the dedupe hash are untouched: the hash is over
-- the raw text, so nothing is re-keyed.
--
-- Forward-only: 0001–0029 are not edited.

-- paste-order-check start
do $$
begin
  if to_regprocedure('public.schema_level()') is null or public.schema_level() < 29 then
    raise exception 'Paste 0029 first: 0030 needs 0029_lookalike_charge_waits.sql, which is not in yet';
  end if;
end $$;
-- paste-order-check end

begin;

create function pg_temp.tidied(old text) returns text language sql immutable as $$
  select case when t = '' then old else t end
    from (select btrim(regexp_replace(regexp_replace(substr(old, 4), '^[\s#*,.\-–—/\\|]+', ''), '\s+', ' ', 'g')) as t) x
$$;

create temp table renamed on commit drop as
  select distinct user_id, merchant as old, pg_temp.tidied(merchant) as new
    from (
      select user_id, merchant, merchant_raw from public.ingest_candidates
      union all
      select user_id, merchant, merchant_raw from public.transactions
    ) r
   where merchant like 'IN*%' and upper(btrim(merchant_raw)) like 'IN*%' and pg_temp.tidied(merchant) <> merchant;

update public.ingest_candidates c set merchant = n.new
  from renamed n where c.user_id = n.user_id and c.merchant = n.old and upper(btrim(c.merchant_raw)) like 'IN*%';
update public.transactions t set merchant = n.new
  from renamed n where t.user_id = n.user_id and t.merchant = n.old and upper(btrim(t.merchant_raw)) like 'IN*%';

-- Two learned shops would share the new name: the older one goes.
delete from public.merchant_rules r
 using renamed n, public.merchant_rules o
 where r.user_id = n.user_id and o.user_id = n.user_id
   and ((r.match_merchant = n.old and o.match_merchant = n.new) or (r.match_merchant = n.new and o.match_merchant = n.old))
   and (greatest(r.created_at, coalesce(r.last_matched_at, r.created_at)), r.id)
     < (greatest(o.created_at, coalesce(o.last_matched_at, o.created_at)), o.id);

update public.merchant_rules r set match_merchant = n.new
  from renamed n where r.user_id = n.user_id and r.match_merchant = n.old;

create or replace function public.schema_level()
returns integer
language sql
immutable
as $$ select 30 $$;

commit;
