-- 0037_ai_rows_before_the_fixes.sql
--
-- Cleans up what an AI app could leave before 0031 and 0032 were in
-- (security review, second pass on mcp-2-01 and mcp-2-02).
--
-- 0031 gave an AI app's new rows a hash kind of their own, and 0032 stopped
-- an AI row teaching a learned shop. Neither touched what was already
-- there:
-- - An AI row added under 0020 carries the hash a statement line with the
--   same account, date, amount and words would carry (occurrence:<n>). A
--   waiting one still stands in for that line, so the real charge is
--   skipped on import as already waiting; an approved one does the same
--   from the ledger. That is the silent drop dedupe.ts calls the worst
--   failure.
-- - A learned shop taught by approving or moving an AI row still files
--   every later statement line from that shop with no review.
--
-- Now:
-- - Every AI row (waiting, approved, rejected, and its ledger row) whose
--   hash is 0020's rule for occurrence 1 to 9 is hashed again with the same
--   fields under its own kind, ai_app:<n>, as 0031 hashes new ones. Should
--   that hash already be taken (the same entry added twice, once on each
--   side of 0031), the row gets one no other row can have, made from its
--   own id. Rows still wait, stay approved or stay rejected; nothing is
--   added or removed. dedupe_hash_v stays 1, as 0031 decided (ADR 0012):
--   the bytes of the version are unchanged, only the kind differs.
-- - A learned shop whose category is the one an AI row was approved or
--   moved into is put back to the category the owner last filed that shop
--   under from anything else (a statement, receipt or typed entry); with
--   no such filing it is unlearned. A learned shop any other row of the
--   owner's agrees with is left alone.
-- The clean-up is kept as public._ai_app_clean_old_rows(), which no browser
-- may call; it is run once here, and running it again finds nothing to do.
-- It leaves the mark "(0037)" for ai_app_updates_in() (0035). It reports
-- counts only.
--
-- Numbering: within 0030-0039, reserved for this line (ADR 0012).
--
-- Forward-only: 0001–0036 are not edited.

-- paste-order-check start
do $$
begin
  if to_regprocedure('public._ai_app_shown_shop(text)') is null then
    raise exception 'Paste 0036 first: 0037 needs 0036_ai_search_as_shown.sql, which is not in yet';
  end if;
end $$;
-- paste-order-check end

begin;

create or replace function public._ai_app_clean_old_rows()
returns jsonb
language plpgsql
volatile
set search_path = public, pg_temp
as $$
-- (0037) AI rows hashed as statement lines get their own kind; shops they taught are unlearned.
declare
  v_candidates integer;
  v_ledger     integer;
  v_rules      integer;
  v_unlearned  integer;
begin
  -- Each AI row whose hash is 0020's rule for some occurrence, with the
  -- hash its own kind gives that occurrence.
  create temp table old_ai on commit drop as
    select 'candidate'::text as kind, c.id, c.user_id, c.status::text as status,
           public._ai_app_dedupe_hash(c.account_id, c.posted_on, c.amount_cents, c.merchant_raw, n) as new_hash
      from public.ingest_candidates c
     cross join generate_series(1, 9) as n
     where c.source = 'ai_app'
       and c.dedupe_hash = encode(sha256(
             convert_to('v1', 'UTF8') || '\x00'::bytea || convert_to(c.account_id::text, 'UTF8') || '\x00'::bytea ||
             convert_to(to_char(c.posted_on, 'YYYY-MM-DD'), 'UTF8') || '\x00'::bytea ||
             convert_to(c.amount_cents::text, 'UTF8') || '\x00'::bytea ||
             convert_to(c.merchant_raw, 'UTF8') || '\x00'::bytea || convert_to('occurrence:' || n, 'UTF8')), 'hex')
    union all
    select 'ledger', t.id, t.user_id, null,
           public._ai_app_dedupe_hash(t.account_id, t.posted_on, t.amount_cents, t.merchant_raw, n)
      from public.transactions t
     cross join generate_series(1, 9) as n
     where t.source = 'ai_app'
       and t.dedupe_hash = encode(sha256(
             convert_to('v1', 'UTF8') || '\x00'::bytea || convert_to(t.account_id::text, 'UTF8') || '\x00'::bytea ||
             convert_to(to_char(t.posted_on, 'YYYY-MM-DD'), 'UTF8') || '\x00'::bytea ||
             convert_to(t.amount_cents::text, 'UTF8') || '\x00'::bytea ||
             convert_to(t.merchant_raw, 'UTF8') || '\x00'::bytea || convert_to('occurrence:' || n, 'UTF8')), 'hex');

  -- A hash already taken (a waiting row's among waiting rows, a ledger
  -- row's in the ledger) gives way to one made from the row's own id.
  update old_ai o set new_hash = encode(sha256(convert_to('ai_app_before_0031:' || o.id::text, 'UTF8')), 'hex')
   where (o.kind = 'candidate' and o.status = 'pending'
          and exists (select 1 from public.ingest_candidates c
                       where c.user_id = o.user_id and c.status = 'pending' and c.dedupe_hash = o.new_hash and c.id <> o.id))
      or (o.kind = 'ledger'
          and exists (select 1 from public.transactions t
                       where t.user_id = o.user_id and t.dedupe_hash = o.new_hash and t.id <> o.id));

  update public.ingest_candidates c set dedupe_hash = o.new_hash::public.dedupe_digest
    from old_ai o where o.kind = 'candidate' and o.id = c.id;
  get diagnostics v_candidates = row_count;
  update public.transactions t set dedupe_hash = o.new_hash::public.dedupe_digest
    from old_ai o where o.kind = 'ledger' and o.id = t.id;
  get diagnostics v_ledger = row_count;

  -- Learned shops an AI row taught: a rule in the category an AI row of
  -- that shop was approved or moved into, which no other row agrees with.
  create temp table taught on commit drop as
    select r.id, r.user_id, r.match_merchant,
           (select t.category_id from public.transactions t
             where t.user_id = r.user_id and t.merchant = r.match_merchant and t.source <> 'ai_app'
             order by t.created_at desc, t.posted_on desc, t.id desc limit 1) as owners
      from public.merchant_rules r
     where (exists (select 1 from public.transactions t
                     where t.user_id = r.user_id and t.merchant = r.match_merchant
                       and t.source = 'ai_app' and t.category_id = r.category_id)
            or exists (select 1 from public.ingest_candidates c
                        where c.user_id = r.user_id and c.merchant = r.match_merchant
                          and c.source = 'ai_app' and c.status = 'approved' and c.category_id = r.category_id))
       and not exists (select 1 from public.transactions t
                        where t.user_id = r.user_id and t.merchant = r.match_merchant
                          and t.source <> 'ai_app' and t.category_id = r.category_id);

  update public.merchant_rules r set category_id = k.owners
    from taught k where k.id = r.id and k.owners is not null;
  get diagnostics v_rules = row_count;
  delete from public.merchant_rules r using taught k where k.id = r.id and k.owners is null;
  get diagnostics v_unlearned = row_count;

  return jsonb_build_object('candidates_rehashed', v_candidates, 'ledger_rehashed', v_ledger,
                            'shops_put_back', v_rules, 'shops_unlearned', v_unlearned);
end;
$$;

revoke all on function public._ai_app_clean_old_rows() from public, anon, authenticated;

do $$
declare
  done jsonb := public._ai_app_clean_old_rows();
begin
  raise notice '0037: %', done;
end $$;

commit;
