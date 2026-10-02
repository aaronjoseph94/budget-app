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

-- Learned shops that would share a new name: every rule under one of its
-- old names or already under it is ranked together, and all but the one
-- used or made most recently go. Ranking the whole group, not pairs, also
-- covers two old names that tidy to one ('IN*ZED SHOP', 'IN* ZED SHOP'),
-- which would otherwise both be renamed into the unique (user_id,
-- match_merchant) and stop the paste. This deletes the owner's rows; see
-- NOTICED-NOT-TOUCHING.md N146 for the backup step and the approval.
delete from public.merchant_rules
 where id in (
   select id from (
     select c.id, row_number() over (
              partition by c.user_id, c.new
              order by greatest(r.created_at, coalesce(r.last_matched_at, r.created_at)) desc, r.id desc) as k
       from (select distinct r.id, n.user_id, n.new
               from public.merchant_rules r
               join renamed n on r.user_id = n.user_id and r.match_merchant in (n.old, n.new)) c
       join public.merchant_rules r on r.id = c.id
   ) x
  where k > 1);

update public.merchant_rules r set match_merchant = n.new
  from renamed n where r.user_id = n.user_id and r.match_merchant = n.old;

create or replace function public.schema_level()
returns integer
language sql
immutable
as $$ select 30 $$;

commit;
