-- Assertions that the schema refuses what it claims to refuse.
--
-- Each block performs a write that MUST be rejected and raises if it succeeds,
-- so a constraint that silently stops biting fails this file rather than
-- passing it. CONSTRAINTS.md: a gate whose failure has not been observed is an
-- assumption, not a check.
--
-- Run by scripts/verify-migrations.sh against a throwaway database.

\set ON_ERROR_STOP on

-- app_user is a member of `authenticated` and holds nothing else, so every
-- assertion made as app_user is made with exactly the privileges a signed-in
-- browser has in production — including what 0004 revoked from it.
create role app_user nologin;
grant authenticated to app_user;

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

insert into public.accounts (id, user_id, name)
  values ('aaaaaaaa-0000-4000-8000-000000000001',
          '11111111-1111-4111-8111-111111111111', 'Main Card');
insert into public.categories (id, user_id, name, kind)
  values ('cccccccc-0000-4000-8000-000000000001',
          '11111111-1111-4111-8111-111111111111', 'Coffee', 'variable');
insert into public.ingest_batches (id, user_id, account_id, source, parsed, deduped, inserted, rejected)
  values ('bbbbbbbb-0000-4000-8000-000000000001',
          '11111111-1111-4111-8111-111111111111',
          'aaaaaaaa-0000-4000-8000-000000000001', 'card_csv', 0, 0, 0, 0);

-- Every refusal this schema promises, asserted by attempting it.
do $$
declare
  u   uuid := '11111111-1111-4111-8111-111111111111';
  acc uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  cat uuid := 'cccccccc-0000-4000-8000-000000000001';
  bat uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  refused int := 0;

  procedure_note text;
begin
  -- 1. A model-categorised candidate may never be auto-approved.
  begin
    insert into public.ingest_candidates
      (user_id,batch_id,account_id,posted_on,amount_cents,merchant,merchant_raw,
       category_id,category_source,status,dedupe_hash,dedupe_hash_v,source,auto_approved_at)
    values (u,bat,acc,'2025-03-04',-450,'COFFEE','COFFEE',
            cat,'model','approved',repeat('a',64),1,'card_csv',now());
    raise exception 'NOT REFUSED: a model-categorised candidate was auto-approved';
  exception when check_violation then refused := refused + 1;
  end;

  -- 2. Nor may a human decision auto-approve; only an exact rule match.
  begin
    insert into public.ingest_candidates
      (user_id,batch_id,account_id,posted_on,amount_cents,merchant,merchant_raw,
       category_id,category_source,status,dedupe_hash,dedupe_hash_v,source,auto_approved_at)
    values (u,bat,acc,'2025-03-04',-450,'COFFEE','COFFEE',
            cat,'user','approved',repeat('a',64),1,'card_csv',now());
    raise exception 'NOT REFUSED: a user-categorised candidate was auto-approved';
  exception when check_violation then refused := refused + 1;
  end;

  -- 3. An approved candidate must carry a category.
  begin
    insert into public.ingest_candidates
      (user_id,batch_id,account_id,posted_on,amount_cents,merchant,merchant_raw,
       status,dedupe_hash,dedupe_hash_v,source)
    values (u,bat,acc,'2025-03-04',-450,'X','X','approved',repeat('c',64),1,'card_csv');
    raise exception 'NOT REFUSED: an approved candidate had no category';
  exception when check_violation then refused := refused + 1;
  end;

  -- 4. A rejected candidate must say why.
  begin
    insert into public.ingest_candidates
      (user_id,batch_id,account_id,posted_on,amount_cents,merchant,merchant_raw,
       status,dedupe_hash,dedupe_hash_v,source)
    values (u,bat,acc,'2025-03-04',-450,'X','X','rejected',repeat('d',64),1,'card_csv');
    raise exception 'NOT REFUSED: a rejected candidate carried no reason';
  exception when check_violation then refused := refused + 1;
  end;

  -- 5. A category and its provenance travel together.
  begin
    insert into public.ingest_candidates
      (user_id,batch_id,account_id,posted_on,amount_cents,merchant,merchant_raw,
       category_id,status,dedupe_hash,dedupe_hash_v,source)
    values (u,bat,acc,'2025-03-04',-450,'X','X',cat,'pending',repeat('e',64),1,'card_csv');
    raise exception 'NOT REFUSED: a category was set with no source';
  exception when check_violation then refused := refused + 1;
  end;

  -- 6. Batch counts must balance.
  begin
    insert into public.ingest_batches (user_id,account_id,source,parsed,deduped,inserted,rejected)
      values (u,acc,'card_csv',10,3,5,1);
    raise exception 'NOT REFUSED: a batch lost a row and still wrote';
  exception when check_violation then refused := refused + 1;
  end;

  -- 7. Ingested text may not carry control characters.
  begin
    insert into public.categories (user_id,name,kind) values (u, E'BAD\x1bNAME', 'variable');
    raise exception 'NOT REFUSED: a control character reached stored text';
  exception when check_violation then refused := refused + 1;
  end;

  -- 8. A dedupe hash must be a lowercase hex digest.
  begin
    insert into public.transactions
      (user_id,account_id,posted_on,amount_cents,merchant,merchant_raw,category_id,
       dedupe_hash,dedupe_hash_v,source)
    values (u,acc,'2025-03-04',-450,'COFFEE','COFFEE',cat,'NOT-A-HASH',1,'card_csv');
    raise exception 'NOT REFUSED: a malformed dedupe hash was stored';
  exception when check_violation then refused := refused + 1;
  end;

  -- 9. A merchant rule is unique per user, so "an exact match" is unambiguous.
  insert into public.merchant_rules (user_id,match_merchant,category_id)
    values (u,'BLUE BOTTLE COFFEE',cat);
  begin
    insert into public.merchant_rules (user_id,match_merchant,category_id)
      values (u,'BLUE BOTTLE COFFEE',cat);
    raise exception 'NOT REFUSED: two rules matched one merchant';
  exception when unique_violation then refused := refused + 1;
  end;

  if refused <> 9 then
    raise exception 'expected 9 refusals, observed %', refused;
  end if;
  procedure_note := format('all %s refusals observed', refused);
  raise notice '%', procedure_note;
end $$;

-- A ledger row to read back, seeded as the superuser. The browser can no
-- longer write one directly (0004), which is asserted just below.
insert into public.transactions
  (user_id,account_id,posted_on,amount_cents,merchant,merchant_raw,category_id,
   dedupe_hash,dedupe_hash_v,source)
values ('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000001',
        '2025-03-04',-450,'COFFEE','COFFEE','cccccccc-0000-4000-8000-000000000001',
        repeat('f',64),1,'card_csv');

-- Row-level security, exercised as a non-superuser: superusers bypass it, so
-- asserting RLS while superuser would assert nothing.
set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare seen int;
begin
  -- The owner sees their row.
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
  select count(*) into seen from public.transactions;
  if seen <> 1 then raise exception 'owner saw % rows, expected 1', seen; end if;

  -- Another user sees nothing at all.
  perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
  select count(*) into seen from public.transactions;
  if seen <> 0 then raise exception 'RLS LEAK: another user saw % rows', seen; end if;

  -- THE ONE PATH. The signed-in browser cannot write a ledger row directly,
  -- not even its own. Before 0004 it could, and the approval invariant was a
  -- habit of one TypeScript file rather than a property of the database.
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
  begin
    insert into public.transactions
      (user_id,account_id,posted_on,amount_cents,merchant,merchant_raw,category_id,
       dedupe_hash,dedupe_hash_v,source)
    values ('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000001',
            '2025-03-05',-999,'DIRECT','DIRECT','cccccccc-0000-4000-8000-000000000001',
            repeat('9',64),1,'card_csv');
    raise exception 'ONE PATH BROKEN: the browser wrote a ledger row directly';
  exception when insufficient_privilege then null;
  end;

  -- Nor mark a candidate approved behind the approval function's back.
  begin
    update public.ingest_candidates set status = 'approved';
    raise exception 'ONE PATH BROKEN: the browser updated a candidate directly';
  exception when insufficient_privilege then null;
  end;

  raise notice 'RLS isolates, and the browser has no direct path into the ledger';
end $$;

reset role;

-- A line that never parsed is recorded without its content: the reason and the
-- line number are enough to act on, and the text could not be read anyway.
do $$
declare kept int;
begin
  insert into public.ingest_unreadable_lines (user_id, batch_id, source_line, reason)
  values ('11111111-1111-4111-8111-111111111111',
          'bbbbbbbb-0000-4000-8000-000000000001', 11, 'unparseable_date');
  select count(*) into kept from public.ingest_unreadable_lines;
  if kept <> 1 then raise exception 'unreadable line not recorded'; end if;

  -- The same line of the same import cannot be recorded twice, so re-running a
  -- failed import does not multiply the queue.
  begin
    insert into public.ingest_unreadable_lines (user_id, batch_id, source_line, reason)
    values ('11111111-1111-4111-8111-111111111111',
            'bbbbbbbb-0000-4000-8000-000000000001', 11, 'unparseable_date');
    raise exception 'NOT REFUSED: one line was recorded twice for one batch';
  exception when unique_violation then null;
  end;
  raise notice 'unreadable lines are recorded once, by line and reason only';
end $$;

-- Every table in public must have RLS on. This is the check that catches the
-- table someone adds later and forgets to protect.
do $$
declare unprotected text;
begin
  select string_agg(tablename, ', ') into unprotected
  from pg_tables
  where schemaname = 'public' and not rowsecurity;

  if unprotected is not null then
    raise exception 'tables without row-level security: %', unprotected;
  end if;
  raise notice 'every public table has row-level security enabled';
end $$;

-- RLS switched on with no policy is not protection, it is a table nobody can
-- read, and the flag check above passes it. A table whose only policy is
-- `using (true)` passes too. So every public table must also carry the owner
-- policy each migration writes: all commands, using and with check both
-- `user_id = auth.uid()`. Added with 0005; before it, only the flag was checked.
do $$
declare unowned text;
begin
  select string_agg(t.tablename, ', ') into unowned
  from pg_tables t
  where t.schemaname = 'public'
    and not exists (
      select 1 from pg_policies p
       where p.schemaname = 'public' and p.tablename = t.tablename
         and p.cmd = 'ALL'
         and p.qual = '(user_id = auth.uid())'
         and p.with_check = '(user_id = auth.uid())');

  if unowned is not null then
    raise exception 'tables without a user_id = auth.uid() owner policy: %', unowned;
  end if;
  raise notice 'every public table has an owner policy';
end $$;

-- The receipts bucket is private. A public bucket puts every receipt behind a
-- guessable URL with no authentication at all.
do $$
declare is_public boolean;
begin
  select public into is_public from storage.buckets where id = 'receipts';
  if is_public is null then raise exception 'the receipts bucket does not exist'; end if;
  if is_public then raise exception 'the receipts bucket is PUBLIC'; end if;
  raise notice 'the receipts bucket is private';
end $$;

-- ---------------------------------------------------------------------------
-- save_import (0003)
-- ---------------------------------------------------------------------------
-- The behaviour these assert is the reason the function exists. The client
-- previously did this in five round trips with no transaction, and computed
-- `deduped` by subtraction — which made the balance CHECK an algebraic
-- identity that could not fail however many rows went missing.
set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  r          record;
  candidates int;
  rows_in    jsonb := jsonb_build_array(
    jsonb_build_object('posted_on','2025-04-01','amount_cents',-1250,
      'merchant','BLUE BOTTLE','merchant_raw','SQ *BLUE BOTTLE',
      'dedupe_hash', repeat('a',64), 'dedupe_hash_v', 1),
    jsonb_build_object('posted_on','2025-04-02','amount_cents',-800,
      'merchant','CORNER SHOP','merchant_raw','CORNER SHOP #12',
      'dedupe_hash', repeat('b',64), 'dedupe_hash_v', 1));
  unreadable jsonb := jsonb_build_array(
    jsonb_build_object('source_line', 7, 'reason', 'unparseable_date'));
begin
  -- A first import writes everything and says so.
  select * into r from public.save_import(
    'aaaaaaaa-0000-4000-8000-000000000001','card_csv', 3, rows_in, unreadable);
  if r.inserted <> 2 or r.deduped <> 0 or r.rejected <> 1 or r.parsed <> 3 then
    raise exception 'first import reported parsed=% deduped=% inserted=% rejected=%',
      r.parsed, r.deduped, r.inserted, r.rejected;
  end if;

  -- The same file again adds NOTHING to the queue and reports both rows as
  -- already held. This is the case that previously doubled the review queue
  -- while reporting zero duplicates.
  select * into r from public.save_import(
    'aaaaaaaa-0000-4000-8000-000000000001','card_csv', 3, rows_in, unreadable);
  if r.inserted <> 0 or r.deduped <> 2 then
    raise exception 're-import reported deduped=% inserted=%, expected 2 and 0',
      r.deduped, r.inserted;
  end if;

  select count(*) into candidates from public.ingest_candidates;
  if candidates <> 2 then
    raise exception 'the queue holds % candidates after two identical imports', candidates;
  end if;

  -- A charge already in the LEDGER is skipped too, not just one already queued.
  -- repeat('f',64) was posted to transactions earlier in this file.
  select * into r from public.save_import(
    'aaaaaaaa-0000-4000-8000-000000000001','card_csv', 1,
    jsonb_build_array(jsonb_build_object('posted_on','2025-03-04','amount_cents',-450,
      'merchant','COFFEE','merchant_raw','COFFEE',
      'dedupe_hash', repeat('f',64), 'dedupe_hash_v', 1)),
    '[]'::jsonb);
  if r.inserted <> 0 or r.deduped <> 1 then
    raise exception 'a charge already in the ledger reported deduped=% inserted=%',
      r.deduped, r.inserted;
  end if;

  -- THE ONE THAT MATTERS. Claim more rows were read than were handed over, and
  -- the counts must refuse to balance. Under the old subtraction this was
  -- `parsed = parsed` and passed for any value at all.
  begin
    perform public.save_import(
      'aaaaaaaa-0000-4000-8000-000000000001','card_csv', 99,
      jsonb_build_array(jsonb_build_object('posted_on','2025-05-01','amount_cents',-100,
        'merchant','X','merchant_raw','X','dedupe_hash', repeat('c',64), 'dedupe_hash_v', 1)),
      '[]'::jsonb);
    raise exception 'COUNTS NOT CHECKED: an import claiming 99 rows for 1 was accepted';
  exception when check_violation then null;
  end;

  -- And that failure left nothing behind: no batch, no candidate.
  if exists (select 1 from public.ingest_candidates where dedupe_hash = repeat('c',64)) then
    raise exception 'a failed import left its candidate behind';
  end if;

  raise notice 'save_import is atomic, dedupes against queue and ledger, and its counts can fail';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 0004: approval, learning, typed entry, and the holes it closes
-- ---------------------------------------------------------------------------
-- The model-category hole, asserted as the superuser because it is a CHECK and
-- must hold for every writer, including the functions themselves.
do $$
begin
  begin
    insert into public.ingest_candidates
      (user_id,batch_id,account_id,posted_on,amount_cents,merchant,merchant_raw,
       category_id,category_source,status,dedupe_hash,dedupe_hash_v,source)
    values ('11111111-1111-4111-8111-111111111111','bbbbbbbb-0000-4000-8000-000000000001',
            'aaaaaaaa-0000-4000-8000-000000000001','2025-06-01',-100,'M','M',
            'cccccccc-0000-4000-8000-000000000001','model','approved',
            repeat('d',64),1,'card_csv');
    raise exception 'APPROVAL HOLE: a model-categorised candidate was stored as approved';
  exception when check_violation then null;
  end;
  raise notice 'a model category can never be the category of an approved row';
end $$;

set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  r        record;
  outcome  text;
  cand     uuid;
  n        int;
  one_row  jsonb := jsonb_build_array(jsonb_build_object(
    'posted_on','2025-07-01','amount_cents',-640,
    'merchant','LAVA GRILL','merchant_raw','LAVA GRILL RED DEER AB',
    'dedupe_hash', repeat('1',64), 'dedupe_hash_v', 1));
begin
  -- A merchant never seen before waits for a person.
  select * into r from public.save_import(
    'aaaaaaaa-0000-4000-8000-000000000001','card_csv', 1, one_row, '[]'::jsonb);
  if r.auto_approved <> 0 then
    raise exception 'an unknown merchant was approved without review';
  end if;

  select id into cand from public.ingest_candidates where dedupe_hash = repeat('1',64);

  -- Another user cannot approve it.
  perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
  begin
    perform public.approve_candidate(cand, 'cccccccc-0000-4000-8000-000000000001');
    raise exception 'OWNERSHIP: another user approved into a category they do not own';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

  -- The owner approves it: it posts, with provenance, and a rule is learned.
  outcome := public.approve_candidate(cand, 'cccccccc-0000-4000-8000-000000000001');
  if outcome <> 'approved' then raise exception 'approve returned %', outcome; end if;
  if not exists (select 1 from public.transactions where candidate_id = cand) then
    raise exception 'an approved candidate has no ledger row carrying its id';
  end if;
  if not exists (select 1 from public.merchant_rules where match_merchant = 'LAVA GRILL') then
    raise exception 'approving did not teach a rule';
  end if;

  -- Approving twice is a no-op, not a second posting.
  outcome := public.approve_candidate(cand, 'cccccccc-0000-4000-8000-000000000001');
  if outcome <> 'already_handled' then raise exception 'second approve returned %', outcome; end if;

  -- THE LOOP. The same merchant on a later statement goes straight to the
  -- ledger, categorised, with no review — because of an exact match, and only
  -- because of one.
  select * into r from public.save_import(
    'aaaaaaaa-0000-4000-8000-000000000001','card_pdf', 2,
    jsonb_build_array(
      jsonb_build_object('posted_on','2025-07-08','amount_cents',-910,
        'merchant','LAVA GRILL','merchant_raw','LAVA GRILL RED DEER AB',
        'dedupe_hash', repeat('2',64), 'dedupe_hash_v', 1),
      jsonb_build_object('posted_on','2025-07-08','amount_cents',-910,
        'merchant','LAVA GRILLE','merchant_raw','LAVA GRILLE',
        'dedupe_hash', repeat('3',64), 'dedupe_hash_v', 1)),
    '[]'::jsonb);
  if r.auto_approved <> 1 then
    raise exception 'expected exactly 1 auto-approval, got %', r.auto_approved;
  end if;
  -- LAVA GRILLE is one letter away. Close is not equal; it waits.
  select count(*) into n from public.ingest_candidates
   where dedupe_hash = repeat('3',64) and status = 'pending';
  if n <> 1 then raise exception 'a near-miss merchant was auto-approved'; end if;

  -- Rejecting removes it from the queue with a reason.
  select id into cand from public.ingest_candidates where dedupe_hash = repeat('3',64);
  outcome := public.reject_candidate(cand);
  if outcome <> 'rejected' then raise exception 'reject returned %', outcome; end if;

  -- Typed entry posts through the same candidate path.
  cand := public.add_typed_transaction('aaaaaaaa-0000-4000-8000-000000000001',
    '2025-07-09', -350, 'FARMERS MARKET', 'Farmers market',
    'cccccccc-0000-4000-8000-000000000001');
  if not exists (select 1 from public.transactions where candidate_id = cand and source = 'typed') then
    raise exception 'a typed entry did not reach the ledger through a candidate';
  end if;

  -- And it cannot post into someone else's account.
  perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
  begin
    perform public.add_typed_transaction('aaaaaaaa-0000-4000-8000-000000000001',
      '2025-07-09', -1, 'X', 'X', 'cccccccc-0000-4000-8000-000000000001');
    raise exception 'OWNERSHIP: a typed entry was written into another user''s account';
  exception when insufficient_privilege then null;
  end;

  raise notice 'approval posts with provenance, learns a rule, and only an exact match auto-approves';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 0005: every category belongs to one of the workbook's lists
-- ---------------------------------------------------------------------------
do $$
declare
  legacy record;
begin
  -- The backfill. supabase/tests/before/0005_category_kinds.sql wrote this row
  -- before 0005 ran, the way the hosted project's categories were written.
  select kind, sort_order into legacy
    from public.categories where id = 'cccccccc-0000-4000-8000-000000000300';
  if legacy is null or legacy.kind is distinct from 'variable' or legacy.sort_order <> 0 then
    raise exception 'BACKFILL: a category from before 0005 has kind=% sort_order=%',
      legacy.kind, legacy.sort_order;
  end if;

  -- The default was only there to backfill. A category written without a list
  -- is refused, so a new one can never land in Variable expenses by omission.
  begin
    insert into public.categories (user_id, name)
      values ('11111111-1111-4111-8111-111111111111', 'No List Given');
    raise exception 'NOT REFUSED: a category was created without a kind';
  exception when not_null_violation then null;
  end;

  -- The key later composite foreign keys point at, so a budget or a plan can
  -- never name one user's category under another user's id.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.categories'::regclass and contype = 'u'
       and conkey::int[] = array[
         (select attnum from pg_attribute where attrelid = 'public.categories'::regclass and attname = 'id'),
         (select attnum from pg_attribute where attrelid = 'public.categories'::regclass and attname = 'user_id')
       ]::int[]) then
    raise exception 'categories has no unique (id, user_id) for composite foreign keys';
  end if;

  raise notice 'existing categories became variable, and a new one must name its list';
end $$;

-- ---------------------------------------------------------------------------
-- 0006: moving a posted row to another category
-- ---------------------------------------------------------------------------
insert into public.categories (id, user_id, name, kind) values
  ('cccccccc-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Restaurants', 'variable'),
  ('cccccccc-0000-4000-8000-000000000201', '22222222-2222-4222-8222-222222222222', 'Theirs', 'variable');

set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  coffee  uuid := 'cccccccc-0000-4000-8000-000000000001';
  rest    uuid := 'cccccccc-0000-4000-8000-000000000002';
  theirs  uuid := 'cccccccc-0000-4000-8000-000000000201';
  tx      uuid;
  c       record;
begin
  -- The row approved by hand in the 0004 block. Moved without learning: the
  -- ledger and its candidate both say Restaurants, and the rule is untouched.
  select id into tx from public.transactions where dedupe_hash = repeat('1',64);
  perform public.recategorise_transaction(tx, rest, false);
  select t.category_id as t_cat, k.category_id as k_cat, k.category_source into c
    from public.transactions t join public.ingest_candidates k on k.id = t.candidate_id
   where t.id = tx;
  if c.t_cat is distinct from rest or c.k_cat is distinct from rest
     or c.category_source is distinct from 'user' then
    raise exception 'recategorise left ledger=% candidate=% source=%', c.t_cat, c.k_cat, c.category_source;
  end if;
  if (select category_id from public.merchant_rules where match_merchant = 'LAVA GRILL') is distinct from coffee then
    raise exception 'recategorise with p_learn=false changed the rule';
  end if;

  -- The row a rule auto-approved. A person has now decided its category, so
  -- its candidate stops claiming the rule did — the CHECKs in 0001 forbid a
  -- user category with an auto-approval stamp — and the rule learns.
  select id into tx from public.transactions where dedupe_hash = repeat('2',64);
  perform public.recategorise_transaction(tx, rest, true);
  select k.category_source, k.auto_approved_at into c
    from public.transactions t join public.ingest_candidates k on k.id = t.candidate_id
   where t.id = tx;
  if c.category_source is distinct from 'user' or c.auto_approved_at is not null then
    raise exception 'an auto-approved row kept source=% stamp=%', c.category_source, c.auto_approved_at;
  end if;
  if (select category_id from public.merchant_rules where match_merchant = 'LAVA GRILL') is distinct from rest then
    raise exception 'recategorise with p_learn=true did not update the rule';
  end if;

  -- A ledger row with no candidate (written before 0004) still moves.
  select id into tx from public.transactions where dedupe_hash = repeat('f',64);
  perform public.recategorise_transaction(tx, rest, false);

  -- Another user cannot move it, even into a category of their own.
  perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
  begin
    perform public.recategorise_transaction(tx, theirs, false);
    raise exception 'OWNERSHIP: another user recategorised a transaction they do not own';
  exception when insufficient_privilege then null;
  end;

  -- Nor can the owner move their row into another user's category.
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
  begin
    perform public.recategorise_transaction(tx, theirs, false);
    raise exception 'OWNERSHIP: a transaction was moved into another user''s category';
  exception when insufficient_privilege then null;
  end;
  if (select category_id from public.transactions where id = tx) is distinct from rest then
    raise exception 'a refused recategorise still changed the row';
  end if;

  raise notice 'a posted row moves with its candidate, learns only when asked, and only within one user';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 0007: an import records the statement period it covers
-- ---------------------------------------------------------------------------
set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  acc   uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  r     record;
  b     record;
  rows_in jsonb := jsonb_build_array(
    jsonb_build_object('posted_on','2026-08-09','amount_cents',-2200,
      'merchant','HARBOUR BAKERY','merchant_raw','HARBOUR BAKERY #3',
      'dedupe_hash', repeat('4',64), 'dedupe_hash_v', 1),
    jsonb_build_object('posted_on','2026-08-20','amount_cents',-1500,
      'merchant','NORTH STAR BOOKS','merchant_raw','NORTH STAR BOOKS',
      'dedupe_hash', repeat('5',64), 'dedupe_hash_v', 1));
  unreadable jsonb := jsonb_build_array(
    jsonb_build_object('source_line', 4, 'reason', 'unparseable_amount'));
begin
  -- The period comes from the statement and is kept on the batch.
  select * into r from public.save_import(acc, 'card_pdf', 3, rows_in, unreadable,
    '2026-08-08'::date, '2026-09-07'::date);
  select * into b from public.ingest_batches where id = r.batch_id;
  if b.period_start is distinct from '2026-08-08'::date
     or b.period_end is distinct from '2026-09-07'::date then
    raise exception 'the statement period was recorded as % to %', b.period_start, b.period_end;
  end if;

  -- Otherwise it is the same import: observed counts, and they balance.
  if r.parsed <> 3 or r.inserted <> 2 or r.deduped <> 0 or r.rejected <> 1
     or (b.parsed, b.deduped, b.inserted, b.rejected) <> (r.parsed, r.deduped, r.inserted, r.rejected)
     or b.parsed <> b.deduped + b.inserted + b.rejected then
    raise exception 'period import reported parsed=% deduped=% inserted=% rejected=%',
      r.parsed, r.deduped, r.inserted, r.rejected;
  end if;

  -- The same statement again dedupes exactly as the 5-argument one does.
  select * into r from public.save_import(acc, 'card_pdf', 3, rows_in, unreadable,
    '2026-08-08'::date, '2026-09-07'::date);
  if r.inserted <> 0 or r.deduped <> 2 or r.parsed <> r.deduped + r.inserted + r.rejected then
    raise exception 'period re-import reported deduped=% inserted=%', r.deduped, r.inserted;
  end if;

  -- A period that ends before it starts is refused, and takes the whole
  -- import with it: no batch, no candidate.
  begin
    perform public.save_import(acc, 'card_pdf', 1,
      jsonb_build_array(jsonb_build_object('posted_on','2026-08-09','amount_cents',-100,
        'merchant','X','merchant_raw','X','dedupe_hash', repeat('6',64), 'dedupe_hash_v', 1)),
      '[]'::jsonb, '2026-09-07'::date, '2026-08-08'::date);
    raise exception 'NOT REFUSED: a statement period ending before it starts';
  exception when check_violation then null;
  end;
  if exists (select 1 from public.ingest_candidates where dedupe_hash = repeat('6',64)) then
    raise exception 'a refused period left its candidate behind';
  end if;

  -- The 5-argument save_import still works, and records no period.
  select * into r from public.save_import(acc, 'card_csv', 1,
    jsonb_build_array(jsonb_build_object('posted_on','2026-08-10','amount_cents',-300,
      'merchant','Y','merchant_raw','Y','dedupe_hash', repeat('7',64), 'dedupe_hash_v', 1)),
    '[]'::jsonb);
  if r.inserted <> 1 or exists (select 1 from public.ingest_batches
       where id = r.batch_id and (period_start is not null or period_end is not null)) then
    raise exception 'the 5-argument save_import changed behaviour';
  end if;

  raise notice 'an import records its statement period, and its counts still balance';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 0008: budgets and goals typed on a month
-- ---------------------------------------------------------------------------
set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  u       uuid := '11111111-1111-4111-8111-111111111111';
  coffee  uuid := 'cccccccc-0000-4000-8000-000000000001';
  theirs  uuid := 'cccccccc-0000-4000-8000-000000000201';
  gone    uuid;
  n       int;
begin
  -- The browser writes budgets itself, as plain upserts under RLS. Typing over
  -- a month's "from this month on" replaces it; "just this month" sits beside
  -- it; a typed "no budget" is kept, as null.
  insert into public.category_budgets (user_id, category_id, month, applies, budget_cents)
    values (u, coffee, '2026-01-01', 'onward', 80000);
  insert into public.category_budgets (user_id, category_id, month, applies, budget_cents)
    values (u, coffee, '2026-01-01', 'onward', 75000)
    on conflict (user_id, category_id, month, applies) do update set budget_cents = excluded.budget_cents;
  insert into public.category_budgets (user_id, category_id, month, applies, budget_cents)
    values (u, coffee, '2026-01-01', 'only', 0), (u, coffee, '2026-02-01', 'onward', null);
  select count(*) into n from public.category_budgets where category_id = coffee;
  if n <> 3 or (select budget_cents from public.category_budgets
                 where category_id = coffee and month = '2026-01-01' and applies = 'onward') <> 75000 then
    raise exception 'budget upserts left % rows, or did not replace the typed value', n;
  end if;

  -- A month is named by its first day only.
  begin
    insert into public.category_budgets (user_id, category_id, month, applies, budget_cents)
      values (u, coffee, '2026-03-15', 'onward', 100);
    raise exception 'NOT REFUSED: a budget month that is not the first of a month';
  exception when check_violation then null;
  end;

  -- A budget is never negative.
  begin
    insert into public.category_budgets (user_id, category_id, month, applies, budget_cents)
      values (u, coffee, '2026-03-01', 'onward', -1);
    raise exception 'NOT REFUSED: a negative budget';
  exception when check_violation then null;
  end;

  -- One value per meaning per month, so a month can never hold two answers.
  begin
    insert into public.category_budgets (user_id, category_id, month, applies, budget_cents)
      values (u, coffee, '2026-01-01', 'only', 500);
    raise exception 'NOT REFUSED: two "just this month" budgets for one month';
  exception when unique_violation then null;
  end;

  -- It applies from this month on, or to this month only; nothing else.
  begin
    insert into public.category_budgets (user_id, category_id, month, applies, budget_cents)
      values (u, coffee, '2026-03-01', 'sometimes', 100);
    raise exception 'NOT REFUSED: a budget that applies neither onward nor only';
  exception when invalid_text_representation then null;
  end;

  -- The composite key: a budget under the owner's id cannot name another
  -- user's category, even though RLS would let the row itself be written.
  begin
    insert into public.category_budgets (user_id, category_id, month, applies, budget_cents)
      values (u, theirs, '2026-01-01', 'onward', 100);
    raise exception 'NOT REFUSED: a budget on another user''s category';
  exception when foreign_key_violation then null;
  end;

  -- Nor can the owner write a row under someone else's id.
  begin
    insert into public.category_budgets (user_id, category_id, month, applies, budget_cents)
      values ('22222222-2222-4222-8222-222222222222', theirs, '2026-01-01', 'onward', 100);
    raise exception 'RLS: a budget was written under another user''s id';
  exception when insufficient_privilege then null;
  end;

  -- A removed category takes its budgets with it.
  insert into public.categories (user_id, name, kind) values (u, 'Gone Soon', 'variable')
    returning id into gone;
  insert into public.category_budgets (user_id, category_id, month, applies, budget_cents)
    values (u, gone, '2026-01-01', 'onward', 100);
  delete from public.categories where id = gone;
  if exists (select 1 from public.category_budgets where category_id = gone) then
    raise exception 'a removed category left its budget behind';
  end if;

  -- Another user sees none of them.
  perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
  select count(*) into n from public.category_budgets;
  if n <> 0 then raise exception 'RLS LEAK: another user saw % budgets', n; end if;
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

  raise notice 'a budget is typed per month and meaning, never negative, and only on the owner''s own category';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 0009: a bill's monthly amount and the day it is paid
-- ---------------------------------------------------------------------------
-- The trigger on categories reads today's month, so these plans start in 2020
-- (always in effect by now) or in 2999 (always still to come), and the result
-- is the same whatever day the gate runs.
insert into public.categories (id, user_id, name, kind) values
  ('cccccccc-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Rent', 'bill'),
  ('cccccccc-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Gym Membership', 'bill'),
  ('cccccccc-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'Old Phone', 'bill');

set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  u       uuid := '11111111-1111-4111-8111-111111111111';
  coffee  uuid := 'cccccccc-0000-4000-8000-000000000001';
  theirs  uuid := 'cccccccc-0000-4000-8000-000000000201';
  rent    uuid := 'cccccccc-0000-4000-8000-000000000003';
  gym     uuid := 'cccccccc-0000-4000-8000-000000000004';
  phone   uuid := 'cccccccc-0000-4000-8000-000000000005';
  gone    uuid;
  n       int;
begin
  -- The browser sets and retypes an amount as plain upserts under RLS.
  insert into public.category_plans (user_id, category_id, effective_month, planned_cents, due_day)
    values (u, rent, '2020-01-01', 160000, 1);
  insert into public.category_plans (user_id, category_id, effective_month, planned_cents, due_day)
    values (u, rent, '2020-01-01', 165000, 1)
    on conflict (user_id, category_id, effective_month)
    do update set planned_cents = excluded.planned_cents, due_day = excluded.due_day;
  if (select planned_cents from public.category_plans
       where category_id = rent and effective_month = '2020-01-01') <> 165000 then
    raise exception 'retyping a monthly amount did not replace it';
  end if;

  -- A blank day paid is allowed, and so is a stop (no amount from a month).
  insert into public.category_plans (user_id, category_id, effective_month, planned_cents, due_day)
    values (u, phone, '2020-01-01', 5000, null), (u, phone, '2020-06-01', null, null),
           (u, gym, '2020-01-01', null, 15), (u, gym, '2999-01-01', 4000, 15);

  begin
    insert into public.category_plans (user_id, category_id, effective_month, planned_cents)
      values (u, rent, '2020-02-02', 100);
    raise exception 'NOT REFUSED: a plan month that is not the first of a month';
  exception when check_violation then null;
  end;

  begin
    insert into public.category_plans (user_id, category_id, effective_month, planned_cents)
      values (u, rent, '2020-02-01', -1);
    raise exception 'NOT REFUSED: a negative monthly amount';
  exception when check_violation then null;
  end;

  begin
    insert into public.category_plans (user_id, category_id, effective_month, planned_cents, due_day)
      values (u, rent, '2020-02-01', 100, 0);
    raise exception 'NOT REFUSED: day paid 0';
  exception when check_violation then null;
  end;

  begin
    insert into public.category_plans (user_id, category_id, effective_month, planned_cents, due_day)
      values (u, rent, '2020-02-01', 100, 32);
    raise exception 'NOT REFUSED: day paid 32';
  exception when check_violation then null;
  end;

  begin
    insert into public.category_plans (user_id, category_id, effective_month, planned_cents)
      values (u, rent, '2020-01-01', 100);
    raise exception 'NOT REFUSED: two plans for one category from one month';
  exception when unique_violation then null;
  end;

  -- Only a bill, a debt or a subscription has a monthly amount, whether the
  -- row is written new or changed to point at another category.
  begin
    insert into public.category_plans (user_id, category_id, effective_month, planned_cents)
      values (u, coffee, '2020-01-01', 100);
    raise exception 'NOT REFUSED: a monthly amount on a Variable expenses category';
  exception when check_violation then null;
  end;
  begin
    update public.category_plans set category_id = coffee where category_id = rent;
    raise exception 'NOT REFUSED: a plan moved onto a Variable expenses category';
  exception when check_violation then null;
  end;

  -- Another user's category is refused by the composite key, not reported as
  -- the wrong list: the trigger cannot see it, and says nothing about it.
  begin
    insert into public.category_plans (user_id, category_id, effective_month, planned_cents)
      values (u, theirs, '2020-01-01', 100);
    raise exception 'NOT REFUSED: a plan on another user''s category';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.category_plans (user_id, category_id, effective_month, planned_cents)
      values ('22222222-2222-4222-8222-222222222222', theirs, '2020-01-01', 100);
    raise exception 'RLS: a plan was written under another user''s id';
  exception when insufficient_privilege then null;
  end;

  -- A category with an amount in effect keeps its list, to any other list.
  begin
    update public.categories set kind = 'variable' where id = rent;
    raise exception 'NOT REFUSED: a bill with a monthly amount moved to Variable expenses';
  exception when check_violation then null;
  end;
  begin
    update public.categories set kind = 'subscription' where id = rent;
    raise exception 'NOT REFUSED: a bill with a monthly amount moved to Subscriptions';
  exception when check_violation then null;
  end;
  -- So does one with an amount set for a later month.
  begin
    update public.categories set kind = 'variable' where id = gym;
    raise exception 'NOT REFUSED: a bill with an amount starting later moved list';
  exception when check_violation then null;
  end;

  -- Renaming, reordering and writing the list it is already on are not moves,
  -- and a plan stopped in the past no longer holds its category.
  update public.categories set name = 'Rent and Parking', sort_order = 3 where id = rent;
  update public.categories set kind = 'bill' where id = rent;
  update public.categories set kind = 'variable' where id = phone;
  if (select kind from public.categories where id = phone) <> 'variable' then
    raise exception 'a bill whose amount was stopped could not move list';
  end if;

  -- A removed category takes its plans with it.
  insert into public.categories (user_id, name, kind) values (u, 'Gone Bill', 'bill')
    returning id into gone;
  insert into public.category_plans (user_id, category_id, effective_month, planned_cents)
    values (u, gone, '2020-01-01', 100);
  delete from public.categories where id = gone;
  if exists (select 1 from public.category_plans where category_id = gone) then
    raise exception 'a removed category left its plan behind';
  end if;

  perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
  select count(*) into n from public.category_plans;
  if n <> 0 then raise exception 'RLS LEAK: another user saw % plans', n; end if;
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

  raise notice 'a monthly amount is dated, lives on a bill, debt or subscription, and holds that list';
end $$;

reset role;

-- The two triggers each read the other's table, so on two devices a plan and
-- a move could each pass their own check before either commits. Writing a
-- plan holds its category FOR SHARE; a second connection (dblink, in a schema
-- of its own so public stays as the migrations left it) then tries to move
-- that category. It must wait for the plan, and is told to wait 200ms at most.
-- Nothing here is timed: this session holds the lock until the block ends,
-- so the move either waits and times out, or it never waited at all.
create schema test_tools;
create extension dblink schema test_tools;
insert into public.categories (id, user_id, name, kind) values
  ('cccccccc-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'Water Bill', 'bill');

do $$
declare
  water uuid := 'cccccccc-0000-4000-8000-000000000006';
begin
  perform test_tools.dblink_connect('other', format('host=%s port=%s dbname=%s user=postgres',
    split_part(current_setting('unix_socket_directories'), ',', 1),
    current_setting('port'), current_database()));
  perform test_tools.dblink_exec('other', 'set lock_timeout = ''200ms''');

  insert into public.category_plans (user_id, category_id, effective_month, planned_cents)
    values ('11111111-1111-4111-8111-111111111111', water, '2020-01-01', 4500);
  begin
    perform test_tools.dblink_exec('other',
      format('update public.categories set kind = ''variable'' where id = %L', water));
    raise exception 'RACE: a category moved list while a plan on it was still being written';
  exception when lock_not_available then null;
  end;

  perform test_tools.dblink_disconnect('other');
  raise notice 'a plan being written holds its category''s list until it commits';
end $$;

-- ---------------------------------------------------------------------------
-- 0010: the bank balance a month started with
-- ---------------------------------------------------------------------------
set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  u  uuid := '11111111-1111-4111-8111-111111111111';
  n  int;
begin
  -- Typed and retyped as a plain upsert under RLS. An overdrawn start is a
  -- real balance, kept with its sign.
  insert into public.month_balances (user_id, month, starting_balance_cents)
    values (u, '2026-01-01', 100000), (u, '2026-02-01', -2500);
  insert into public.month_balances (user_id, month, starting_balance_cents)
    values (u, '2026-01-01', 120000)
    on conflict (user_id, month) do update set starting_balance_cents = excluded.starting_balance_cents;
  if (select starting_balance_cents from public.month_balances where month = '2026-01-01') <> 120000
     or (select starting_balance_cents from public.month_balances where month = '2026-02-01') <> -2500 then
    raise exception 'a typed starting balance was not kept as typed';
  end if;

  begin
    insert into public.month_balances (user_id, month, starting_balance_cents)
      values (u, '2026-03-31', 100);
    raise exception 'NOT REFUSED: a balance month that is not the first of a month';
  exception when check_violation then null;
  end;

  begin
    insert into public.month_balances (user_id, month, starting_balance_cents)
      values (u, '2026-02-01', 100);
    raise exception 'NOT REFUSED: two starting balances for one month';
  exception when unique_violation then null;
  end;

  -- A blank balance is no row, never a stored nothing that could read as $0.
  begin
    insert into public.month_balances (user_id, month, starting_balance_cents)
      values (u, '2026-04-01', null);
    raise exception 'NOT REFUSED: a month balance with no amount';
  exception when not_null_violation then null;
  end;

  begin
    insert into public.month_balances (user_id, month, starting_balance_cents)
      values ('22222222-2222-4222-8222-222222222222', '2026-01-01', 100);
    raise exception 'RLS: a balance was written under another user''s id';
  exception when insufficient_privilege then null;
  end;

  -- Clearing a month's balance is deleting its row, which the browser may do.
  delete from public.month_balances where month = '2026-02-01';

  perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
  select count(*) into n from public.month_balances;
  if n <> 0 then raise exception 'RLS LEAK: another user saw % balances', n; end if;
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

  if (select count(*) from public.month_balances) <> 1 then
    raise exception 'clearing a month''s balance did not remove it';
  end if;
  raise notice 'a month''s starting balance is typed once, signed, and never blank';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 0011: when each income source pays
-- ---------------------------------------------------------------------------
insert into public.categories (id, user_id, name, kind) values
  ('cccccccc-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', 'Income 1', 'income');

set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  u       uuid := '11111111-1111-4111-8111-111111111111';
  pay     uuid := 'cccccccc-0000-4000-8000-000000000007';
  rent    uuid := 'cccccccc-0000-4000-8000-000000000003';
  theirs  uuid := 'cccccccc-0000-4000-8000-000000000201';
  gone    uuid;
  n       int;
begin
  -- Set and changed as a plain upsert under RLS.
  insert into public.pay_schedules (user_id, category_id, first_pay_date, frequency)
    values (u, pay, '2026-01-09', 'biweekly');
  insert into public.pay_schedules (user_id, category_id, first_pay_date, frequency)
    values (u, pay, '2026-01-02', 'weekly')
    on conflict (user_id, category_id)
    do update set first_pay_date = excluded.first_pay_date, frequency = excluded.frequency;
  if (select frequency from public.pay_schedules where category_id = pay) <> 'weekly' then
    raise exception 'changing a pay schedule did not replace it';
  end if;

  begin
    insert into public.pay_schedules (user_id, category_id, first_pay_date, frequency)
      values (u, pay, '2026-01-16', 'monthly');
    raise exception 'NOT REFUSED: two pay schedules for one income source';
  exception when unique_violation then null;
  end;

  -- Weekly, bi-weekly or monthly, as the workbook's dropdown offers; nothing else.
  begin
    update public.pay_schedules set frequency = 'daily' where category_id = pay;
    raise exception 'NOT REFUSED: a pay frequency the workbook does not offer';
  exception when invalid_text_representation then null;
  end;

  begin
    update public.pay_schedules set first_pay_date = null where category_id = pay;
    raise exception 'NOT REFUSED: a pay schedule with no pay date';
  exception when not_null_violation then null;
  end;

  -- Only an income source has paydays, written new or moved onto another row.
  begin
    insert into public.pay_schedules (user_id, category_id, first_pay_date, frequency)
      values (u, rent, '2026-01-01', 'monthly');
    raise exception 'NOT REFUSED: a pay schedule on a bill';
  exception when check_violation then null;
  end;
  begin
    update public.pay_schedules set category_id = rent where category_id = pay;
    raise exception 'NOT REFUSED: a pay schedule moved onto a bill';
  exception when check_violation then null;
  end;

  -- Another user's category is the composite key's to refuse, not the list check's.
  begin
    insert into public.pay_schedules (user_id, category_id, first_pay_date, frequency)
      values (u, theirs, '2026-01-01', 'monthly');
    raise exception 'NOT REFUSED: a pay schedule on another user''s category';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.pay_schedules (user_id, category_id, first_pay_date, frequency)
      values ('22222222-2222-4222-8222-222222222222', theirs, '2026-01-01', 'monthly');
    raise exception 'RLS: a pay schedule was written under another user''s id';
  exception when insufficient_privilege then null;
  end;

  -- A removed income source takes its schedule with it.
  insert into public.categories (user_id, name, kind) values (u, 'Gone Pay', 'income')
    returning id into gone;
  insert into public.pay_schedules (user_id, category_id, first_pay_date, frequency)
    values (u, gone, '2026-01-01', 'monthly');
  delete from public.categories where id = gone;
  if exists (select 1 from public.pay_schedules where category_id = gone) then
    raise exception 'a removed income source left its pay schedule behind';
  end if;

  perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
  select count(*) into n from public.pay_schedules;
  if n <> 0 then raise exception 'RLS LEAK: another user saw % pay schedules', n; end if;
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

  raise notice 'a pay schedule is one per income source, weekly, bi-weekly or monthly';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 0012: an unreadable line can be dismissed
-- ---------------------------------------------------------------------------
-- A line already dismissed at a known time, so that dismissing it again can be
-- seen to keep that time: within one test block now() never moves, and a
-- second stamp would be indistinguishable from the first.
insert into public.ingest_unreadable_lines (user_id, batch_id, source_line, reason, dismissed_at)
values ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-0000-4000-8000-000000000001',
        12, 'missing_amount', '2026-01-01 00:00:00+00');

set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  bat      uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  line     uuid;
  earlier  uuid;
begin
  select id into line from public.ingest_unreadable_lines where batch_id = bat and source_line = 11;
  select id into earlier from public.ingest_unreadable_lines where batch_id = bat and source_line = 12;

  -- The browser still cannot change a line itself (0004); only the function
  -- can, and only its stamp.
  begin
    update public.ingest_unreadable_lines set dismissed_at = now() where id = line;
    raise exception 'ONE PATH BROKEN: the browser stamped an unreadable line directly';
  exception when insufficient_privilege then null;
  end;

  -- Another user cannot dismiss it, and is told only that it is not there.
  perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
  begin
    perform public.dismiss_unreadable_line(line);
    raise exception 'OWNERSHIP: another user dismissed a line they do not own';
  exception when insufficient_privilege then null;
  end;

  -- Nor can a caller who is not signed in.
  perform set_config('request.jwt.claim.sub','',false);
  begin
    perform public.dismiss_unreadable_line(line);
    raise exception 'NOT REFUSED: a line was dismissed with nobody signed in';
  exception when invalid_authorization_specification then null;
  end;

  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
  if (select dismissed_at from public.ingest_unreadable_lines where id = line) is not null then
    raise exception 'a refused dismissal still stamped the line';
  end if;

  -- An id that is nobody's line is refused the same way.
  begin
    perform public.dismiss_unreadable_line('eeeeeeee-0000-4000-8000-000000000001');
    raise exception 'NOT REFUSED: dismissing a line that does not exist';
  exception when insufficient_privilege then null;
  end;

  -- The owner dismisses it. The line stays, stamped; no other line changes;
  -- and dismissing one already dismissed keeps the time it was first done.
  perform public.dismiss_unreadable_line(line);
  perform public.dismiss_unreadable_line(earlier);
  if (select dismissed_at from public.ingest_unreadable_lines where id = line) is null then
    raise exception 'dismissing did not stamp the line';
  end if;
  if (select dismissed_at from public.ingest_unreadable_lines where id = earlier)
     is distinct from '2026-01-01 00:00:00+00'::timestamptz then
    raise exception 'dismissing a line twice moved the time it was first dismissed';
  end if;
  if (select count(*) from public.ingest_unreadable_lines where dismissed_at is not null) <> 2 then
    raise exception 'dismissing one line stamped another';
  end if;

  raise notice 'an unreadable line is dismissed by its owner only, once, and kept';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 0013: a savings goal becomes a savings fund
-- ---------------------------------------------------------------------------
insert into public.categories (id, user_id, name, kind) values
  ('cccccccc-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', 'Emergency Fund', 'savings'),
  ('cccccccc-0000-4000-8000-000000000009', '11111111-1111-4111-8111-111111111111', 'Travel Fund', 'savings');

-- The goal before/0013_savings_funds.sql wrote the way the Settings card
-- saves one: it survives with every new column empty, and saves as before.
set role app_user;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';

do $$
declare
  legacy record;
begin
  select category_id, start_date, balance_as_of, saved_cents into legacy
    from public.savings_goals where id = 'dddddddd-0000-4000-8000-000000000300';
  if legacy is null or legacy.saved_cents <> 13300 or legacy.category_id is not null
     or legacy.start_date is not null or legacy.balance_as_of is not null then
    raise exception 'BACKFILL: a goal from before 0013 came out as %', legacy;
  end if;
  update public.savings_goals set saved_cents = 20000, target_date = '2026-12-01'
   where id = 'dddddddd-0000-4000-8000-000000000300';
  if (select saved_cents from public.savings_goals
       where id = 'dddddddd-0000-4000-8000-000000000300') <> 20000 then
    raise exception 'a goal with no fund could not be saved as the Settings card saves it';
  end if;
end $$;

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  u       uuid := '11111111-1111-4111-8111-111111111111';
  fund    uuid := 'cccccccc-0000-4000-8000-000000000008';
  travel  uuid := 'cccccccc-0000-4000-8000-000000000009';
  rent    uuid := 'cccccccc-0000-4000-8000-000000000003';
  theirs  uuid := 'cccccccc-0000-4000-8000-000000000201';
  goal    uuid;
begin
  -- A fund: its category, when saving began, and when the typed amount was true.
  insert into public.savings_goals
    (user_id, name, target_cents, saved_cents, target_date, category_id, start_date, balance_as_of)
    values (u, 'Emergency', 200000, 13300, '2026-10-08', fund, '2026-01-08', '2026-09-23')
    returning id into goal;

  -- Linked with no as-of date, which transfers are already in the typed
  -- amount would be a guess.
  begin
    insert into public.savings_goals (user_id, name, target_cents, category_id)
      values (u, 'Travel', 100000, travel);
    raise exception 'NOT REFUSED: a fund linked to a category with no as-of date';
  exception when check_violation then null;
  end;
  begin
    update public.savings_goals set balance_as_of = null where id = goal;
    raise exception 'NOT REFUSED: a linked fund''s as-of date was cleared';
  exception when check_violation then null;
  end;

  -- One fund per category, or each would count the same transfers.
  begin
    insert into public.savings_goals (user_id, name, target_cents, category_id, balance_as_of)
      values (u, 'Emergency Again', 100000, fund, '2026-09-23');
    raise exception 'NOT REFUSED: two funds filled by one category';
  exception when unique_violation then null;
  end;

  -- Only a Savings-list category, written new or moved onto another row.
  begin
    insert into public.savings_goals (user_id, name, target_cents, category_id, balance_as_of)
      values (u, 'Rent Fund', 100000, rent, '2026-09-23');
    raise exception 'NOT REFUSED: a fund filled by a bill';
  exception when check_violation then null;
  end;
  begin
    update public.savings_goals set category_id = rent where id = goal;
    raise exception 'NOT REFUSED: a fund moved onto a bill';
  exception when check_violation then null;
  end;

  -- Another user's category is the composite key's to refuse, not the list check's.
  begin
    insert into public.savings_goals (user_id, name, target_cents, category_id, balance_as_of)
      values (u, 'Theirs', 100000, theirs, '2026-09-23');
    raise exception 'NOT REFUSED: a fund on another user''s category';
  exception when foreign_key_violation then null;
  end;

  -- Removing the category would lose the goal and its typed balance, so it is
  -- refused while the fund names it.
  begin
    delete from public.categories where id = fund;
    raise exception 'NOT REFUSED: a fund''s category was removed from under it';
  exception when foreign_key_violation then null;
  end;

  -- Unlinked, the fund is a typed balance again and the category can go.
  update public.savings_goals set category_id = null where id = goal;
  delete from public.categories where id = fund;
  if not exists (select 1 from public.savings_goals where id = goal) then
    raise exception 'removing an unlinked category took the goal with it';
  end if;

  raise notice 'a savings fund is one per Savings-list category, with its as-of date';
end $$;

reset role;

-- Removing a user still removes their funds and categories together: RESTRICT
-- refuses removing a category on its own, not the cascade from auth.users.
insert into auth.users (id) values ('44444444-4444-4444-8444-444444444444');
insert into public.categories (id, user_id, name, kind) values
  ('cccccccc-0000-4000-8000-000000000400', '44444444-4444-4444-8444-444444444444', 'Fund', 'savings');
insert into public.savings_goals (user_id, name, target_cents, category_id, balance_as_of) values
  ('44444444-4444-4444-8444-444444444444', 'Fund', 100000,
   'cccccccc-0000-4000-8000-000000000400', '2026-09-23');
delete from auth.users where id = '44444444-4444-4444-8444-444444444444';
do $$
begin
  if exists (select 1 from public.savings_goals
              where user_id = '44444444-4444-4444-8444-444444444444') then
    raise exception 'a removed user left a savings fund behind';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0014: the Debt Calculator's debts and extra payments
-- ---------------------------------------------------------------------------
set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  u      uuid := '11111111-1111-4111-8111-111111111111';
  them   uuid := '22222222-2222-4222-8222-222222222222';
  loan   uuid;
  gone   uuid;
  n      int;
begin
  -- A debt as the workbook's calculator takes it: balance, minimum, APR, start month.
  insert into public.debts
    (user_id, name, starting_balance_cents, minimum_payment_cents, apr_basis_points, start_date, sort_order)
    values (u, 'Car Loan', 500000, 45000, 1200, '2026-03-01', 0)
    returning id into loan;
  -- A paid-off debt and a 0% one are real values, not blanks.
  insert into public.debts
    (user_id, name, starting_balance_cents, minimum_payment_cents, apr_basis_points, start_date)
    values (u, 'Paid Off', 0, 0, 0, '2026-03-01');

  begin
    insert into public.debts (user_id, name, starting_balance_cents, minimum_payment_cents, apr_basis_points, start_date)
      values (u, 'Car Loan', 100, 10, 0, '2026-03-01');
    raise exception 'NOT REFUSED: two debts with one name';
  exception when unique_violation then null;
  end;
  begin
    update public.debts set starting_balance_cents = -1 where id = loan;
    raise exception 'NOT REFUSED: a negative starting balance';
  exception when check_violation then null;
  end;
  begin
    update public.debts set minimum_payment_cents = -1 where id = loan;
    raise exception 'NOT REFUSED: a negative minimum payment';
  exception when check_violation then null;
  end;
  begin
    update public.debts set apr_basis_points = -1 where id = loan;
    raise exception 'NOT REFUSED: a negative APR';
  exception when check_violation then null;
  end;
  begin
    update public.debts set start_date = '2026-03-15' where id = loan;
    raise exception 'NOT REFUSED: a start date that is not a month''s first day';
  exception when check_violation then null;
  end;
  begin
    update public.debts set start_date = null where id = loan;
    raise exception 'NOT REFUSED: a debt with no start month';
  exception when not_null_violation then null;
  end;

  -- Extra payments: in the start month or later, one per month, set and
  -- changed as a plain upsert.
  insert into public.debt_extra_payments (user_id, debt_id, month, amount_cents)
    values (u, loan, '2026-03-01', 5000), (u, loan, '2026-05-01', 5000);
  insert into public.debt_extra_payments (user_id, debt_id, month, amount_cents)
    values (u, loan, '2026-05-01', 7500)
    on conflict (user_id, debt_id, month) do update set amount_cents = excluded.amount_cents;
  if (select amount_cents from public.debt_extra_payments
       where debt_id = loan and month = '2026-05-01') <> 7500 then
    raise exception 'changing an extra payment did not replace it';
  end if;

  begin
    insert into public.debt_extra_payments (user_id, debt_id, month, amount_cents)
      values (u, loan, '2026-05-01', 100);
    raise exception 'NOT REFUSED: two extra payments on one debt in one month';
  exception when unique_violation then null;
  end;
  begin
    insert into public.debt_extra_payments (user_id, debt_id, month, amount_cents)
      values (u, loan, '2026-06-01', 0);
    raise exception 'NOT REFUSED: an extra payment of nothing';
  exception when check_violation then null;
  end;
  begin
    insert into public.debt_extra_payments (user_id, debt_id, month, amount_cents)
      values (u, loan, '2026-06-15', 100);
    raise exception 'NOT REFUSED: an extra payment on a day that is not a month''s first';
  exception when check_violation then null;
  end;

  -- Before the start month there is no month of the schedule to put it in,
  -- written new, moved there, or left there by moving the start month.
  begin
    insert into public.debt_extra_payments (user_id, debt_id, month, amount_cents)
      values (u, loan, '2026-02-01', 100);
    raise exception 'NOT REFUSED: an extra payment before its debt''s start month';
  exception when check_violation then null;
  end;
  begin
    update public.debt_extra_payments set month = '2026-02-01'
     where debt_id = loan and month = '2026-03-01';
    raise exception 'NOT REFUSED: an extra payment moved before its debt''s start month';
  exception when check_violation then null;
  end;
  begin
    update public.debts set start_date = '2026-04-01' where id = loan;
    raise exception 'NOT REFUSED: a start month moved past an extra payment';
  exception when check_violation then null;
  end;
  -- Moving it earlier leaves every extra inside the schedule.
  update public.debts set start_date = '2026-01-01' where id = loan;
  -- Moving it later, up to the month of the earliest extra itself, is fine:
  -- that extra is then paid in month 1.
  update public.debts set start_date = '2026-03-01' where id = loan;
  update public.debts set start_date = '2026-01-01' where id = loan;

  -- Another user's debt is the composite key's to refuse.
  insert into public.debts (id, user_id, name, starting_balance_cents, minimum_payment_cents, apr_basis_points, start_date)
    values ('eeeeeeee-0000-4000-8000-000000000014', u, 'Student Loan', 100000, 5000, 500, '2026-01-01');
  perform set_config('request.jwt.claim.sub', them::text, false);
  begin
    insert into public.debt_extra_payments (user_id, debt_id, month, amount_cents)
      values (them, 'eeeeeeee-0000-4000-8000-000000000014', '2026-06-01', 100);
    raise exception 'NOT REFUSED: an extra payment on another user''s debt';
  exception when foreign_key_violation then null;
  end;
  select count(*) into n from public.debts;
  if n <> 0 then raise exception 'RLS LEAK: another user saw % debts', n; end if;
  select count(*) into n from public.debt_extra_payments;
  if n <> 0 then raise exception 'RLS LEAK: another user saw % extra payments', n; end if;
  perform set_config('request.jwt.claim.sub', u::text, false);

  begin
    insert into public.debts (user_id, name, starting_balance_cents, minimum_payment_cents, apr_basis_points, start_date)
      values (them, 'Theirs', 100, 10, 0, '2026-01-01');
    raise exception 'RLS: a debt was written under another user''s id';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.debt_extra_payments (user_id, debt_id, month, amount_cents)
      values (them, loan, '2026-06-01', 100);
    raise exception 'RLS: an extra payment was written under another user''s id';
  exception when insufficient_privilege then null;
  end;

  -- A removed debt takes its extra payments with it.
  insert into public.debts (user_id, name, starting_balance_cents, minimum_payment_cents, apr_basis_points, start_date)
    values (u, 'Gone', 100000, 5000, 0, '2026-01-01') returning id into gone;
  insert into public.debt_extra_payments (user_id, debt_id, month, amount_cents)
    values (u, gone, '2026-02-01', 100);
  delete from public.debts where id = gone;
  if exists (select 1 from public.debt_extra_payments where debt_id = gone) then
    raise exception 'a removed debt left its extra payments behind';
  end if;

  raise notice 'a debt is typed as the workbook''s calculator takes it, with extras in or after its start month';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 0015: a goal's place, and whether it is active, paused or reached
-- ---------------------------------------------------------------------------
set role app_user;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';

-- A goal already stored comes out active at position 0, as every goal
-- already there does, so the order is when each was made and the main goal
-- is the one the app showed before.
do $$
declare
  legacy record;
begin
  select sort_order, status, reached_on into legacy
    from public.savings_goals where id = 'dddddddd-0000-4000-8000-000000000300';
  if legacy is null or legacy.sort_order <> 0 or legacy.status <> 'active' or legacy.reached_on is not null then
    raise exception 'BACKFILL: a goal from before 0015 came out as %', legacy;
  end if;
end $$;

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  u    uuid := '11111111-1111-4111-8111-111111111111';
  them uuid := '22222222-2222-4222-8222-222222222222';
  goal uuid;
  n    int;
begin
  insert into public.savings_goals (user_id, name, target_cents)
    values (u, 'House', 4000000) returning id into goal;

  -- Reached says when; nothing else carries a reached day.
  begin
    update public.savings_goals set status = 'reached' where id = goal;
    raise exception 'NOT REFUSED: a goal marked reached on no day';
  exception when check_violation then null;
  end;
  begin
    update public.savings_goals set reached_on = '2026-09-24' where id = goal;
    raise exception 'NOT REFUSED: an active goal with a reached day';
  exception when check_violation then null;
  end;
  begin
    update public.savings_goals set status = 'paused', reached_on = '2026-09-24' where id = goal;
    raise exception 'NOT REFUSED: a paused goal with a reached day';
  exception when check_violation then null;
  end;

  -- Only the three states the app knows, and always a place.
  begin
    update public.savings_goals set status = 'finished' where id = goal;
    raise exception 'NOT REFUSED: a status that is not active, paused or reached';
  exception when invalid_text_representation then null;
  end;
  begin
    update public.savings_goals set sort_order = null where id = goal;
    raise exception 'NOT REFUSED: a goal with no place';
  exception when not_null_violation then null;
  end;

  -- What the app writes: reached with its day, resumed at the end with the
  -- day cleared, then paused.
  update public.savings_goals set status = 'reached', reached_on = '2026-09-24' where id = goal;
  update public.savings_goals set status = 'active', reached_on = null, sort_order = 2 where id = goal;
  update public.savings_goals set status = 'paused' where id = goal;

  -- 0004's policy covers the new columns: another user moves nothing.
  perform set_config('request.jwt.claim.sub', them::text, false);
  update public.savings_goals set status = 'active', sort_order = 0 where id = goal;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS LEAK: another user changed % goals', n; end if;
  perform set_config('request.jwt.claim.sub', u::text, false);
  if (select status from public.savings_goals where id = goal) <> 'paused' then
    raise exception 'RLS LEAK: another user''s write reached a goal';
  end if;

  delete from public.savings_goals where id = goal;
  raise notice 'a goal has a place, and is active, paused, or reached on a day';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 0016: the AI helper's tables, and the only doors to them
-- ---------------------------------------------------------------------------
-- A saved key each, today's use and a rest for the other user, written as
-- the superuser: the browser can write none of them, which is asserted below.
insert into public.ai_provider_keys (user_id, provider, ciphertext, iv, kek_id, key_hint) values
  ('11111111-1111-4111-8111-111111111111', 'gemini', repeat('Q', 48), repeat('A', 16), '0123456789abcdef', 'abcd'),
  ('22222222-2222-4222-8222-222222222222', 'gemini', repeat('R', 48), repeat('B', 16), '0123456789abcdef', 'wxyz');
insert into public.ai_usage (user_id, day, provider, model, task, attempts) values
  ('22222222-2222-4222-8222-222222222222', public.ai_today(), 'gemini', 'gemini-3.5-flash-lite', 'test', 1);
insert into public.ai_provider_state (user_id, provider, model, cooldown_until, last_code) values
  ('22222222-2222-4222-8222-222222222222', 'gemini', 'gemini-3.5-flash-lite', now() + interval '1 minute', 'rate_limited');

set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  u    uuid := '11111111-1111-4111-8111-111111111111';
  them uuid := '22222222-2222-4222-8222-222222222222';
  s    public.ai_settings;
  n    int;
begin
  -- A first save takes every default: on, the free services first, 40 a
  -- day, paid services off, Cheerleader, shop names shared.
  insert into public.ai_settings (user_id) values (u) returning * into s;
  if not (s.enabled and s.provider_order = '{gemini,groq,openrouter,openai,anthropic}' and s.models = '{}'
          and s.daily_cap = 40 and not s.allow_paid and s.tone = 'cheerleader' and s.share_shop_names) then
    raise exception 'ai_settings came out as %', s;
  end if;

  begin
    update public.ai_settings set daily_cap = 9 where user_id = u;
    raise exception 'NOT REFUSED: a daily limit under 10';
  exception when check_violation then null;
  end;
  begin
    update public.ai_settings set daily_cap = 151 where user_id = u;
    raise exception 'NOT REFUSED: a daily limit over 150';
  exception when check_violation then null;
  end;
  begin
    update public.ai_settings set tone = 'drill_sergeant' where user_id = u;
    raise exception 'NOT REFUSED: a tone that is not Cheerleader or Straight talker';
  exception when check_violation then null;
  end;
  begin
    update public.ai_settings set provider_order = '{gemini,groq,gemini}' where user_id = u;
    raise exception 'NOT REFUSED: a service in the order twice';
  exception when check_violation then null;
  end;
  begin
    update public.ai_settings set provider_order = array['gemini', null]::public.ai_provider[] where user_id = u;
    raise exception 'NOT REFUSED: a blank in the order';
  exception when check_violation then null;
  end;
  begin
    update public.ai_settings set models = '{"evil": "x"}' where user_id = u;
    raise exception 'NOT REFUSED: a model for a service there is not';
  exception when check_violation then null;
  end;
  begin
    update public.ai_settings set models = '{"gemini": 5}' where user_id = u;
    raise exception 'NOT REFUSED: a model that is not a name';
  exception when check_violation then null;
  end;
  begin
    update public.ai_settings set models = '{"gemini": "https://evil.example/x"}' where user_id = u;
    raise exception 'NOT REFUSED: an address where a model goes';
  exception when check_violation then null;
  end;
  begin
    update public.ai_settings set models = '["gemini-3.5-flash-lite"]' where user_id = u;
    raise exception 'NOT REFUSED: models that are not one per service';
  exception when check_violation then null;
  end;
  -- What the app will write.
  update public.ai_settings
     set provider_order = '{groq,gemini}', models = '{"gemini": "gemini-3.5-flash-lite", "groq": "openai/gpt-oss-20b"}',
         daily_cap = 150, allow_paid = true, tone = 'straight', share_shop_names = false
   where user_id = u;

  begin
    insert into public.ai_settings (user_id) values (them);
    raise exception 'RLS: AI settings were written under another user''s id';
  exception when insufficient_privilege then null;
  end;

  -- Keys: not a row, not even the caller's own.
  begin
    perform 1 from public.ai_provider_keys;
    raise exception 'NOT REFUSED: the browser read ai_provider_keys';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.ai_provider_keys (user_id, provider, ciphertext, iv, kek_id, key_hint)
      values (u, 'groq', repeat('Q', 48), repeat('A', 16), '0123456789abcdef', 'abcd');
    raise exception 'NOT REFUSED: the browser wrote a key';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.ai_provider_keys set status = 'ok';
    raise exception 'NOT REFUSED: the browser changed a key';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.ai_provider_keys;
    raise exception 'NOT REFUSED: the browser deleted keys directly';
  exception when insufficient_privilege then null;
  end;

  -- Today's use and the rests: the caller's own read, none written. A
  -- count the browser could lower would not be a limit.
  select count(*) into n from public.ai_usage;
  if n <> 0 then raise exception 'RLS LEAK: another user''s AI use was seen (% rows)', n; end if;
  select count(*) into n from public.ai_provider_state;
  if n <> 0 then raise exception 'RLS LEAK: another user''s resting services were seen (% rows)', n; end if;
  begin
    insert into public.ai_usage (user_id, day, provider, model, task) values (u, public.ai_today(), 'gemini', 'm', 'test');
    raise exception 'NOT REFUSED: the browser wrote ai_usage';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.ai_usage set attempts = 0;
    raise exception 'NOT REFUSED: the browser changed ai_usage';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.ai_usage;
    raise exception 'NOT REFUSED: the browser deleted ai_usage';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.ai_provider_state (user_id, provider, model, last_code) values (u, 'gemini', 'm', 'ok');
    raise exception 'NOT REFUSED: the browser wrote ai_provider_state';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.ai_provider_state set cooldown_until = null;
    raise exception 'NOT REFUSED: the browser woke a resting service';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.ai_provider_state;
    raise exception 'NOT REFUSED: the browser deleted ai_provider_state';
  exception when insufficient_privilege then null;
  end;

  -- The helper's own functions are not the browser's to call.
  begin
    perform public.ai_context_for(them);
    raise exception 'NOT REFUSED: the browser read another user''s AI context';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ai_key_put(u, 'groq', repeat('Q', 48), repeat('A', 16), '0123456789abcdef', 1::smallint, 'abcd', 'ok', null);
    raise exception 'NOT REFUSED: the browser saved a key through the helper''s function';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ai_key_mark(u, 'gemini', 'ok');
    raise exception 'NOT REFUSED: the browser marked a key';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ai_usage_claim(u, 'gemini', 'm', 'test', 0, 10, null, null);
    raise exception 'NOT REFUSED: the browser claimed a call';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ai_note_outcome(u, 'gemini', 'm', 'test', 'ok', null);
    raise exception 'NOT REFUSED: the browser noted an outcome';
  exception when insufficient_privilege then null;
  end;

  -- The status of the caller's own keys, and only theirs.
  select count(*) into n from public.ai_key_status();
  if n <> 1 or (select key_hint from public.ai_key_status()) <> 'abcd' then
    raise exception 'ai_key_status showed % rows, or another user''s key', n;
  end if;

  -- Another user's settings and Remove key reach only their own.
  perform set_config('request.jwt.claim.sub', them::text, false);
  select count(*) into n from public.ai_settings;
  if n <> 0 then raise exception 'RLS LEAK: another user saw % AI settings', n; end if;
  update public.ai_settings set daily_cap = 10;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS LEAK: another user changed % AI settings', n; end if;
  if not public.ai_key_forget('gemini') then raise exception 'Remove key did not find the caller''s own key'; end if;
  perform set_config('request.jwt.claim.sub', u::text, false);
  if (select count(*) from public.ai_key_status()) <> 1 then
    raise exception 'OWNERSHIP: another user''s Remove key took this user''s key';
  end if;
  if public.ai_key_forget('groq') then raise exception 'Remove key found a key that was never saved'; end if;
  -- Two statements: within one, the count would read the key from before
  -- the removal.
  if not public.ai_key_forget('gemini') then raise exception 'Remove key did not find the caller''s own key'; end if;
  if (select count(*) from public.ai_key_status()) <> 0 then raise exception 'Remove key left the caller''s own key'; end if;

  raise notice 'AI settings are the owner''s own; keys, use and rests are out of the browser''s reach';
end $$;

reset role;

-- What ai_key_status can ever return: never the ciphertext, the IV or
-- which root locked the key.
do $$
begin
  if pg_get_function_result('public.ai_key_status()'::regprocedure) ~ '\m(ciphertext|iv|kek_id)\M' then
    raise exception 'ai_key_status returns key material: %', pg_get_function_result('public.ai_key_status()'::regprocedure);
  end if;
end $$;

-- The helper's side of 0016, as the helper reaches it: service_role, which
-- bypasses row-level security as in Supabase, calling the functions granted
-- to it. A user of its own, so each count below starts from nothing.
insert into auth.users (id) values ('55555555-5555-4555-8555-555555555555');

set role service_role;

do $$
declare
  u    uuid := '55555555-5555-4555-8555-555555555555';
  ctx  jsonb;
  i    int;
  -- Each claim is its own statement, in order: in one expression SQL does
  -- not promise which runs first.
  got  text[];
begin
  -- Another user's key, beside the use and rest the other user already has:
  -- none of it is this user's context.
  perform public.ai_key_put('11111111-1111-4111-8111-111111111111', 'groq', repeat('T', 48), repeat('D', 16),
                            '0123456789abcdef', 1::smallint, 'lmno', 'ok', null);

  -- An owner who has saved no choice gets the column defaults, and nothing else.
  ctx := public.ai_context_for(u);
  if ctx->'settings' is distinct from jsonb_build_object(
       'enabled', true, 'provider_order', '["gemini","groq","openrouter","openai","anthropic"]'::jsonb,
       'models', '{}'::jsonb, 'daily_cap', 40, 'allow_paid', false, 'tone', 'cheerleader', 'share_shop_names', true)
     or ctx->'keys' is distinct from '[]' or ctx->'usage' is distinct from '[]'
     or ctx->'resting' is distinct from '[]' or (ctx->>'day')::date is distinct from public.ai_today() then
    raise exception 'a new owner''s AI context came out as %', ctx;
  end if;

  -- A key saved, saved again over itself, marked twice, and read back.
  perform public.ai_key_put(u, 'gemini', repeat('S', 48), repeat('C', 16), '0123456789abcdef', 1::smallint, 'abcd', 'ok', null);
  perform public.ai_key_put(u, 'gemini', repeat('U', 48), repeat('E', 16), 'fedcba9876543210', 2::smallint, 'wxyz', 'busy', null);
  ctx := public.ai_context_for(u);
  if ctx->'keys' is distinct from jsonb_build_array(jsonb_build_object(
       'provider', 'gemini', 'ciphertext', repeat('U', 48), 'iv', repeat('E', 16), 'kek_id', 'fedcba9876543210',
       'key_v', 2, 'key_hint', 'wxyz', 'status', 'busy', 'model', null, 'tested_at', ctx->'keys'->0->'tested_at')) then
    raise exception 'a key saved over itself read back as %', ctx->'keys';
  end if;
  if not public.ai_key_mark(u, 'gemini', 'ok', 'gemini-3.5-flash-lite') then raise exception 'ai_key_mark missed a saved key'; end if;
  if not public.ai_key_mark(u, 'gemini', 'ok') then raise exception 'ai_key_mark missed a saved key'; end if;
  if public.ai_key_mark(u, 'groq', 'ok') then raise exception 'ai_key_mark marked a key never saved'; end if;
  ctx := public.ai_context_for(u);
  if ctx->'keys'->0->>'status' is distinct from 'ok' or ctx->'keys'->0->>'model' is distinct from 'gemini-3.5-flash-lite' then
    raise exception 'a marked key read back as %, or a mark with no model cleared it', ctx->'keys';
  end if;

  -- A key row keeps its shape whoever writes it.
  begin
    perform public.ai_key_put(u, 'groq', repeat('S', 48), repeat('C', 16), 'fedcba9876543210', 1::smallint, 'vwxyz', 'ok', null);
    raise exception 'NOT REFUSED: a hint of more than four characters';
  exception when check_violation then null;
  end;
  begin
    perform public.ai_key_put(u, 'groq', repeat('S', 48), repeat('C', 12), 'fedcba9876543210', 1::smallint, 'wxyz', 'ok', null);
    raise exception 'NOT REFUSED: an IV that is not twelve bytes';
  exception when check_violation then null;
  end;
  begin
    perform public.ai_key_put(u, 'groq', 'sk-' || repeat('a', 60), repeat('C', 16), 'fedcba9876543210', 1::smallint, 'wxyz', 'ok', null);
    raise exception 'NOT REFUSED: a key that is not ciphertext';
  exception when check_violation then null;
  end;
  begin
    perform public.ai_key_put(u, 'groq', repeat('S', 40), repeat('C', 16), 'fedcba9876543210', 1::smallint, 'wxyz', 'ok', null);
    raise exception 'NOT REFUSED: ciphertext too short to hold a key and its tag';
  exception when check_violation then null;
  end;
  begin
    perform public.ai_key_mark(u, 'gemini', 'fine');
    raise exception 'NOT REFUSED: a key status that is not ok, busy, rejected or locked';
  exception when check_violation then null;
  end;

  -- The owner's daily limit, over every task and service: 10 go, the 11th waits.
  insert into public.ai_settings (user_id, daily_cap, tone) values (u, 10, 'straight');
  ctx := public.ai_context_for(u);
  if (ctx->'settings'->>'daily_cap')::int is distinct from 10 or ctx->'settings'->>'tone' is distinct from 'straight' then
    raise exception 'saved AI settings read back as %', ctx->'settings';
  end if;
  for i in 1..10 loop
    if public.ai_usage_claim(u, 'openai', 'gpt-5-nano', 'ask', 100, 99, null, null) is distinct from 'ok' then
      raise exception 'claim % of 10 was refused', i;
    end if;
  end loop;
  if public.ai_usage_claim(u, 'gemini', 'gemini-3.5-flash-lite', 'test', 0, 99, 200, null) is distinct from 'daily_cap' then
    raise exception 'NOT REFUSED: an 11th call with a daily limit of 10';
  end if;
  ctx := public.ai_context_for(u);
  if ctx->'usage' is distinct from '[{"provider": "openai", "model": "gpt-5-nano", "task": "ask", "attempts": 10, "tokens_est": 1000, "ok": 0}]' then
    raise exception 'today''s use read back as %', ctx->'usage';
  end if;

  -- A task's own limit, and a free service's soft limits in calls and in tokens.
  update public.ai_settings set daily_cap = 150 where user_id = u;
  got := array[]::text[];
  got := got || public.ai_usage_claim(u, 'gemini', 'gemini-3.5-flash-lite', 'ask', 0, 11, null, null);
  got := got || public.ai_usage_claim(u, 'gemini', 'gemini-3.5-flash-lite', 'ask', 0, 11, null, null);
  if got is distinct from array['ok', 'task_cap'] then
    raise exception 'NOT REFUSED: a task past its own limit (%)', got;
  end if;
  got := array[]::text[];
  got := got || public.ai_usage_claim(u, 'gemini', 'gemini-3.5-flash', 'test', 0, 99, 1, null);
  got := got || public.ai_usage_claim(u, 'gemini', 'gemini-3.5-flash', 'test', 0, 99, 1, null);
  if got is distinct from array['ok', 'service_cap'] then
    raise exception 'NOT REFUSED: a free model past its calls a day (%)', got;
  end if;
  got := array[]::text[];
  got := got || public.ai_usage_claim(u, 'groq', 'openai/gpt-oss-20b', 'test', 600, 99, 300, 1000);
  got := got || public.ai_usage_claim(u, 'groq', 'openai/gpt-oss-20b', 'test', 401, 99, 300, 1000);
  got := got || public.ai_usage_claim(u, 'groq', 'openai/gpt-oss-20b', 'test', 400, 99, 300, 1000);
  if got is distinct from array['ok', 'service_cap', 'ok'] then
    raise exception 'NOT REFUSED: a free service past its tokens a day, or refused within them (%)', got;
  end if;
  begin
    perform public.ai_usage_claim(u, 'gemini', 'gemini-3.5-flash-lite', 'test', -1, 99, null, null);
    raise exception 'NOT REFUSED: a claim of fewer than no tokens';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.ai_usage_claim(u, 'gemini', 'gemini-3.5-flash-lite', 'chat', 0, 99, null, null);
    raise exception 'NOT REFUSED: a task that is not one of the helper''s';
  exception when check_violation then null;
  end;

  -- Outcomes: a rest, no rest, a rest that could not end, and an answer counted.
  perform public.ai_note_outcome(u, 'groq', 'openai/gpt-oss-20b', 'test', 'rate_limited', now() + interval '60 seconds');
  perform public.ai_note_outcome(u, 'gemini', 'gemini-3.5-flash', 'test', 'rate_limited', now() + interval '400 days');
  perform public.ai_note_outcome(u, 'gemini', 'gemini-3.5-flash-lite', 'ask', 'ok', null);
  ctx := public.ai_context_for(u);
  if jsonb_array_length(ctx->'resting') is distinct from 2 or ctx->'resting'->0->>'model' is distinct from 'gemini-3.5-flash'
     or not (ctx->'resting'->0->>'until')::timestamptz <= now() + interval '25 hours' then
    raise exception 'resting services read back as %', ctx->'resting';
  end if;
  if (select cooldown_until from public.ai_provider_state
       where user_id = u and model = 'gemini-3.5-flash-lite') is not null then
    raise exception 'an outcome with no rest left the service resting';
  end if;
  if (select ok from public.ai_usage where user_id = u and model = 'gemini-3.5-flash-lite' and task = 'ask') is distinct from 1 then
    raise exception 'an answer that worked was not counted';
  end if;
  begin
    perform public.ai_note_outcome(u, 'gemini', 'gemini-3.5-flash-lite', 'ask', 'fine', null);
    raise exception 'NOT REFUSED: an outcome code the helper does not have';
  exception when check_violation then null;
  end;

  raise notice 'the helper reads a context, saves keys, claims calls within every limit and rests services';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 0017: the Coach's memory. Words with blanks and never a figure; dismissals
-- and answers that are the owner's own, about the owner's own charges.
-- ---------------------------------------------------------------------------
-- The other user's account, charge and note, and a charge of the first
-- user's to answer about, written as the superuser: the browser cannot
-- write the ledger (0004).
insert into public.accounts (id, user_id, name)
  values ('aaaaaaaa-0000-4000-8000-000000000017', '22222222-2222-4222-8222-222222222222', 'Their Card');
insert into public.transactions
  (id,user_id,account_id,posted_on,amount_cents,merchant,merchant_raw,category_id,dedupe_hash,dedupe_hash_v,source)
values
  ('dddddddd-0000-4000-8000-000000000171','11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000001',
   '2026-09-18',-8420,'SUSHI','SUSHI','cccccccc-0000-4000-8000-000000000001',repeat('7',64),1,'card_csv'),
  ('dddddddd-0000-4000-8000-000000000172','22222222-2222-4222-8222-222222222222','aaaaaaaa-0000-4000-8000-000000000017',
   '2026-09-18',-5000,'THEIRS','THEIRS','cccccccc-0000-4000-8000-000000000201',repeat('8',64),1,'card_csv');
insert into public.ai_notes (user_id, surface, scope, facts_sig, prompt_v, body, provider, model)
  values ('22222222-2222-4222-8222-222222222222', 'daily', 'day:2026-09-24', repeat('b', 64), 1,
          '{"summary": "Their words"}', 'gemini', 'gemini-3.5-flash-lite');

set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  u    uuid := '11111111-1111-4111-8111-111111111111';
  them uuid := '22222222-2222-4222-8222-222222222222';
  mine uuid := 'dddddddd-0000-4000-8000-000000000171';
  theirs_charge uuid := 'dddddddd-0000-4000-8000-000000000172';
  bad  text;
  n    int;
begin
  -- Words with a blank are kept; the blank holds no digit by construction.
  insert into public.ai_notes (user_id, surface, scope, facts_sig, prompt_v, body, card_sigs, fact_keys, provider, model)
    values (u, 'daily', 'day:2026-09-24', repeat('a', 64), 1,
            '{"summary": "You’ve spent {{A.change}} than by this day last month."}',
            jsonb_build_object('B', repeat('c', 64)), '{"A": "summary:month"}', 'gemini', 'gemini-3.5-flash-lite');

  -- Any figure in the words is refused: ASCII, fullwidth, Arabic-Indic,
  -- Extended Arabic-Indic and Devanagari digits, and every sign listed.
  foreach bad in array array['$412 on dining', 'in $', 'since 2026', 'up ２ weeks', 'up ٣ weeks', 'up ۴ weeks', 'up ५ weeks',
                             '＄ more', 'ten %', 'ten ％', 'in €', 'in £', 'in ¥', 'a ¢', 'in ₹'] loop
    begin
      insert into public.ai_notes (user_id, surface, scope, facts_sig, prompt_v, body, provider, model)
        values (u, 'daily', 'day:2026-09-25', repeat('d', 64), 1, jsonb_build_object('summary', bad), 'gemini', 'gemini-3.5-flash-lite');
      raise exception 'NOT REFUSED: AI words holding "%"', bad;
    exception when check_violation then null;
    end;
  end loop;
  begin
    insert into public.ai_notes (user_id, surface, scope, facts_sig, prompt_v, body, provider, model)
      values (u, 'daily', 'day:2026-09-25', repeat('d', 64), 1, '{"cards": [{"n": 5}]}', 'gemini', 'gemini-3.5-flash-lite');
    raise exception 'NOT REFUSED: a JSON number in the words';
  exception when check_violation then null;
  end;
  begin
    insert into public.ai_notes (user_id, surface, scope, facts_sig, prompt_v, body, provider, model)
      values (u, 'daily', 'day:2026-09-25', repeat('d', 64), 1, jsonb_build_object('summary', repeat('a', 8200)), 'gemini', 'gemini-3.5-flash-lite');
    raise exception 'NOT REFUSED: words over 8 KB';
  exception when check_violation then null;
  end;
  begin
    insert into public.ai_notes (user_id, surface, scope, facts_sig, prompt_v, body, provider, model)
      values (u, 'daily', 'day:2026-09-25', 'not-a-signature', 1, '{}', 'gemini', 'gemini-3.5-flash-lite');
    raise exception 'NOT REFUSED: a signature that is not SHA-256 hex';
  exception when check_violation then null;
  end;
  begin
    insert into public.ai_notes (user_id, surface, scope, facts_sig, prompt_v, body, provider, model)
      values (u, 'weekly', 'day:2026-09-25', repeat('d', 64), 1, '{}', 'gemini', 'gemini-3.5-flash-lite');
    raise exception 'NOT REFUSED: a surface that is not daily, checkin or report';
  exception when check_violation then null;
  end;
  begin
    insert into public.ai_notes (user_id, surface, scope, facts_sig, prompt_v, body, card_sigs, provider, model)
      values (u, 'daily', 'day:2026-09-25', repeat('d', 64), 1, '{}', '{"A": "short"}', 'gemini', 'gemini-3.5-flash-lite');
    raise exception 'NOT REFUSED: a card signature that is not SHA-256 hex';
  exception when check_violation then null;
  end;
  begin
    insert into public.ai_notes (user_id, surface, scope, facts_sig, prompt_v, body, provider, model)
      values (u, 'daily', 'day:2026-09-24', repeat('a', 64), 1, '{}', 'gemini', 'gemini-3.5-flash-lite');
    raise exception 'NOT REFUSED: the same words kept twice for one signature';
  exception when unique_violation then null;
  end;
  begin
    insert into public.ai_notes (user_id, surface, scope, facts_sig, prompt_v, body, provider, model)
      values (them, 'daily', 'day:2026-09-25', repeat('d', 64), 1, '{}', 'gemini', 'gemini-3.5-flash-lite');
    raise exception 'NOT REFUSED: a note written for another user';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.ai_notes;
  if n <> 1 then raise exception 'another user''s notes are visible: % rows', n; end if;

  -- Thirty-one more daily notes and one report: the newest 30 daily stay,
  -- the report stays, and the oldest daily note (the first above) is gone.
  for i in 1..31 loop
    insert into public.ai_notes (user_id, surface, scope, facts_sig, prompt_v, body, provider, model, created_at)
      values (u, 'daily', 'day:2026-09-25', encode(sha256(convert_to('note ' || i, 'UTF8')), 'hex'), 1, '{}',
              'gemini', 'gemini-3.5-flash-lite', now() + make_interval(secs => i));
  end loop;
  insert into public.ai_notes (user_id, surface, scope, facts_sig, prompt_v, body, provider, model)
    values (u, 'report', 'month:2026-08', repeat('e', 64), 1, '{}', 'gemini', 'gemini-3.5-flash-lite');
  select count(*) into n from public.ai_notes where surface = 'daily';
  if n <> 30 then raise exception 'kept % daily notes, not the newest 30', n; end if;
  if exists (select 1 from public.ai_notes where facts_sig = repeat('a', 64)) then
    raise exception 'the oldest daily note was kept over a newer one';
  end if;
  if not exists (select 1 from public.ai_notes where surface = 'report') then
    raise exception 'keeping 30 daily notes removed a report';
  end if;

  -- A dismissal names a cause once, and only for its owner.
  insert into public.insight_dismissals (user_id, insight_key) values (u, 'category_change:dining:2026-09-01:up');
  begin
    insert into public.insight_dismissals (user_id, insight_key) values (u, 'category_change:dining:2026-09-01:up');
    raise exception 'NOT REFUSED: one cause dismissed twice';
  exception when unique_violation then null;
  end;
  begin
    insert into public.insight_dismissals (user_id, insight_key) values (u, E'Bad Cause\n');
    raise exception 'NOT REFUSED: a dismissal key that is not a cause';
  exception when check_violation then null;
  end;
  begin
    insert into public.insight_dismissals (user_id, insight_key) values (them, 'stale_data:2026-09-07');
    raise exception 'NOT REFUSED: a dismissal written for another user';
  exception when insufficient_privilege then null;
  end;

  -- An answer about the owner's own charge is kept; about another's, never.
  insert into public.coach_answers (user_id, transaction_id, answer, asked_week) values (u, mine, 'impulse', '2026-09-21');
  begin
    insert into public.coach_answers (user_id, transaction_id, answer, asked_week) values (u, theirs_charge, 'planned', '2026-09-21');
    raise exception 'NOT REFUSED: an answer about another user''s charge';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.coach_answers (user_id, transaction_id, answer, asked_week) values (them, theirs_charge, 'planned', '2026-09-21');
    raise exception 'NOT REFUSED: an answer written for another user';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.coach_answers set answer = 'maybe' where transaction_id = mine;
    raise exception 'NOT REFUSED: an answer that is not planned, impulse or needed';
  exception when check_violation then null;
  end;
  begin
    update public.coach_answers set asked_week = '2026-09-22' where transaction_id = mine;
    raise exception 'NOT REFUSED: a week that does not start on a Monday';
  exception when check_violation then null;
  end;

  raise notice 'the Coach keeps words with no figure, 30 a surface, and answers only about the owner''s own charges';
end $$;

reset role;

-- An answer goes with its charge.
do $$
begin
  delete from public.transactions where id = 'dddddddd-0000-4000-8000-000000000171';
  if exists (select 1 from public.coach_answers where transaction_id = 'dddddddd-0000-4000-8000-000000000171') then
    raise exception 'an answer outlived its charge';
  end if;
  raise notice 'an answer is removed with its charge';
end $$;

-- ---------------------------------------------------------------------------
-- 0018: Review's suggested categories. A proposal lands only on the caller's
-- own pending row that nobody filled, only in the caller's own spending
-- category, and never approves anything.
-- ---------------------------------------------------------------------------
-- Rows in every state a proposal must respect, written as the superuser:
-- the browser cannot write candidates (0004).
insert into public.categories (id, user_id, name, kind) values
  ('cccccccc-0000-4000-8000-000000000181', '11111111-1111-4111-8111-111111111111', 'Card payments', 'transfer'),
  ('cccccccc-0000-4000-8000-000000000182', '11111111-1111-4111-8111-111111111111', 'Old list', 'variable'),
  ('cccccccc-0000-4000-8000-000000000183', '11111111-1111-4111-8111-111111111111', 'Kept', 'variable');
insert into public.ingest_batches (id, user_id, account_id, source, parsed, deduped, inserted, rejected)
  values ('bbbbbbbb-0000-4000-8000-000000000018', '22222222-2222-4222-8222-222222222222',
          'aaaaaaaa-0000-4000-8000-000000000017', 'card_csv', 0, 0, 0, 0);
insert into public.ingest_candidates
  (id, user_id, batch_id, account_id, posted_on, amount_cents, merchant, merchant_raw,
   category_id, category_source, status, dedupe_hash, dedupe_hash_v, source)
select v.id::uuid, w.u::uuid, w.b::uuid, w.a::uuid, '2026-09-20', -1234, v.m, v.m,
       v.cat::uuid, v.src::public.category_source, v.st::public.candidate_status,
       encode(sha256(convert_to(v.id, 'UTF8')), 'hex'), 1, 'card_csv'
  from (values
    ('eeeeeeee-0000-4000-8000-000000000181', 'OPEN SHOP', null, null, 'pending'),
    ('eeeeeeee-0000-4000-8000-000000000182', 'OWNER FILLED', 'cccccccc-0000-4000-8000-000000000183', 'user', 'pending'),
    ('eeeeeeee-0000-4000-8000-000000000183', 'RULE FILLED', 'cccccccc-0000-4000-8000-000000000001', 'merchant_rule', 'pending'),
    ('eeeeeeee-0000-4000-8000-000000000184', 'APPROVED SHOP', 'cccccccc-0000-4000-8000-000000000001', 'user', 'approved'),
    ('eeeeeeee-0000-4000-8000-000000000185', 'GUESSED SHOP', 'cccccccc-0000-4000-8000-000000000182', 'model', 'pending')
  ) as v(id, m, cat, src, st)
  cross join (values ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-0000-4000-8000-000000000001',
                      'aaaaaaaa-0000-4000-8000-000000000001')) as w(u, b, a);
insert into public.ingest_candidates
  (id, user_id, batch_id, account_id, posted_on, amount_cents, merchant, merchant_raw,
   status, dedupe_hash, dedupe_hash_v, source)
values ('eeeeeeee-0000-4000-8000-000000000186', '22222222-2222-4222-8222-222222222222',
        'bbbbbbbb-0000-4000-8000-000000000018', 'aaaaaaaa-0000-4000-8000-000000000017', '2026-09-20', -1234,
        'THEIR SHOP', 'THEIR SHOP', 'pending', repeat('9', 64), 1, 'card_csv');
insert into public.ingest_candidates
  (id, user_id, batch_id, account_id, posted_on, amount_cents, merchant, merchant_raw,
   status, rejection_reason, dedupe_hash, dedupe_hash_v, source)
values ('eeeeeeee-0000-4000-8000-000000000187', '11111111-1111-4111-8111-111111111111',
        'bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '2026-09-20', -1234,
        'REMOVED SHOP', 'REMOVED SHOP', 'rejected', 'user_rejected', repeat('6', 64), 1, 'card_csv');

set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  coffee  uuid := 'cccccccc-0000-4000-8000-000000000001';
  moving  uuid := 'cccccccc-0000-4000-8000-000000000181';
  theirs  uuid := 'cccccccc-0000-4000-8000-000000000201';
  open_   uuid := 'eeeeeeee-0000-4000-8000-000000000181';
  guessed uuid := 'eeeeeeee-0000-4000-8000-000000000185';
  n int;
  s text;
begin
  -- Every row a proposal must leave alone, and the two it may set.
  select public.suggest_candidate_categories(jsonb_build_array(
    jsonb_build_object('candidate', open_, 'category', coffee),
    jsonb_build_object('candidate', 'eeeeeeee-0000-4000-8000-000000000182', 'category', moving),
    jsonb_build_object('candidate', 'eeeeeeee-0000-4000-8000-000000000182', 'category', coffee),
    jsonb_build_object('candidate', 'eeeeeeee-0000-4000-8000-000000000183', 'category', coffee),
    jsonb_build_object('candidate', 'eeeeeeee-0000-4000-8000-000000000184', 'category', coffee),
    jsonb_build_object('candidate', 'eeeeeeee-0000-4000-8000-000000000186', 'category', coffee),
    jsonb_build_object('candidate', 'eeeeeeee-0000-4000-8000-000000000187', 'category', coffee),
    jsonb_build_object('candidate', guessed, 'category', coffee)
  )) into n;
  if n <> 2 then raise exception 'suggested % rows, not the open one and the one a model filled', n; end if;
  select category_source::text into s from public.ingest_candidates where id = open_ and category_id = coffee;
  if s is distinct from 'model' then raise exception 'a suggestion was recorded as %, not model', s; end if;
  if exists (select 1 from public.ingest_candidates where id = 'eeeeeeee-0000-4000-8000-000000000182' and category_source <> 'user') then
    raise exception 'a suggestion overwrote a row the owner filled';
  end if;
  if exists (select 1 from public.ingest_candidates where id = 'eeeeeeee-0000-4000-8000-000000000183' and category_source <> 'merchant_rule') then
    raise exception 'a suggestion overwrote a row a learned rule filled';
  end if;
  if exists (select 1 from public.ingest_candidates where id = 'eeeeeeee-0000-4000-8000-000000000184' and category_source <> 'user') then
    raise exception 'a suggestion changed an approved row';
  end if;
  if exists (select 1 from public.ingest_candidates where id = 'eeeeeeee-0000-4000-8000-000000000187' and category_id is not null) then
    raise exception 'a suggestion landed on a row the owner removed';
  end if;

  -- Not into Not spending, nor into another user's category.
  perform public.clear_candidate_suggestion(open_);
  if public.suggest_candidate_categories(jsonb_build_array(jsonb_build_object('candidate', open_, 'category', moving))) <> 0 then
    raise exception 'NOT REFUSED: a suggestion onto Not spending';
  end if;
  if public.suggest_candidate_categories(jsonb_build_array(jsonb_build_object('candidate', open_, 'category', theirs))) <> 0 then
    raise exception 'NOT REFUSED: a suggestion into another user''s category';
  end if;

  -- At most 200 at once.
  begin
    perform public.suggest_candidate_categories(
      (select jsonb_agg(jsonb_build_object('candidate', open_, 'category', coffee)) from generate_series(1, 201)));
    raise exception 'NOT REFUSED: 201 suggestions at once';
  exception when invalid_parameter_value then null;
  end;

  -- A proposal is never an approval: approving it as the model's is still refused.
  perform public.suggest_candidate_categories(jsonb_build_array(jsonb_build_object('candidate', open_, 'category', coffee)));
  if public.approve_candidate(open_, coffee) <> 'approved' then raise exception 'a suggested row could not be approved'; end if;
  if not exists (select 1 from public.ingest_candidates where id = open_ and status = 'approved' and category_source = 'user') then
    raise exception 'approving a suggestion did not record the owner''s choice';
  end if;

  -- Clearing: only the caller's own pending proposal.
  if public.clear_candidate_suggestion('eeeeeeee-0000-4000-8000-000000000182') then
    raise exception 'NOT REFUSED: clearing a category the owner chose';
  end if;
  if not public.clear_candidate_suggestion(guessed) then raise exception 'a proposal could not be cleared'; end if;
  if exists (select 1 from public.ingest_candidates where id = guessed and category_id is not null) then
    raise exception 'clearing left the proposal in place';
  end if;
  raise notice 'a suggestion lands only on the owner''s open rows, in their own spending categories';
end $$;

-- Another user can neither suggest onto nor clear the first user's rows.
reset role;
update public.ingest_candidates set category_id = 'cccccccc-0000-4000-8000-000000000182', category_source = 'model'
 where id = 'eeeeeeee-0000-4000-8000-000000000185';
set role app_user;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$
begin
  if public.suggest_candidate_categories(jsonb_build_array(jsonb_build_object(
       'candidate', 'eeeeeeee-0000-4000-8000-000000000185', 'category', 'cccccccc-0000-4000-8000-000000000201'))) <> 0 then
    raise exception 'NOT REFUSED: a suggestion onto another user''s candidate';
  end if;
  if public.clear_candidate_suggestion('eeeeeeee-0000-4000-8000-000000000185') then
    raise exception 'NOT REFUSED: clearing another user''s suggestion';
  end if;
  raise notice 'suggestions are each user''s own';
end $$;

reset role;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

-- A category named only by a proposal can be removed, and the proposal goes;
-- one the owner filled a row with still cannot.
do $$
begin
  delete from public.categories where id = 'cccccccc-0000-4000-8000-000000000182';
  if exists (select 1 from public.ingest_candidates where id = 'eeeeeeee-0000-4000-8000-000000000185' and category_id is not null) then
    raise exception 'a removed category''s proposal was kept';
  end if;
  begin
    delete from public.categories where id = 'cccccccc-0000-4000-8000-000000000183';
    raise exception 'NOT REFUSED: removing a category an owner-filled row names';
  exception when foreign_key_violation then null;
  end;
  raise notice 'a proposal never stops a category being removed';
end $$;

-- The anonymous role — anyone holding the published key — cannot call any of
-- these at all. Every SECURITY DEFINER function the browser calls is listed:
-- one left off can lose its revoke with this check still green, as 0004's
-- reject_candidate and add_typed_transaction could until N12.
do $$
begin
  if has_function_privilege('anon', 'public.approve_candidate(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.reject_candidate(uuid)', 'execute')
     or has_function_privilege('anon', 'public.add_typed_transaction(uuid, date, bigint, text, text, uuid)', 'execute')
     or has_function_privilege('anon', 'public.save_import(uuid, public.ingest_source, integer, jsonb, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.recategorise_transaction(uuid, uuid, boolean)', 'execute')
     or has_function_privilege('anon', 'public.save_import(uuid, public.ingest_source, integer, jsonb, jsonb, date, date)', 'execute')
     or has_function_privilege('anon', 'public.dismiss_unreadable_line(uuid)', 'execute')
     or has_function_privilege('anon', 'public.ai_key_status()', 'execute')
     or has_function_privilege('anon', 'public.ai_key_forget(public.ai_provider)', 'execute')
     or has_function_privilege('anon', 'public.suggest_candidate_categories(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.clear_candidate_suggestion(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._clear_suggestions_of_category()', 'execute')
     or has_function_privilege('authenticated', 'public._post_candidate(uuid)', 'execute') then
    raise exception 'a SECURITY DEFINER function is callable by a role that must not call it';
  end if;
  raise notice 'no SECURITY DEFINER function is callable anonymously, and the poster is private';
end $$;

-- The AI helper's own functions (0016): the helper's role may call each,
-- and neither the anonymous role nor a signed-in browser may call any. The
-- explicit grant to service_role is belt and braces, since Supabase's
-- default grants give it every function too; revoking it is what this
-- catches.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.ai_context_for(uuid)',
    'public.ai_key_put(uuid, public.ai_provider, text, text, text, smallint, text, text, text)',
    'public.ai_key_mark(uuid, public.ai_provider, text, text)',
    'public.ai_usage_claim(uuid, public.ai_provider, text, text, integer, integer, integer, integer)',
    'public.ai_note_outcome(uuid, public.ai_provider, text, text, text, timestamptz)'
  ] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception 'the browser can call the helper''s function %', f;
    end if;
    if not has_function_privilege('service_role', f, 'execute') then
      raise exception 'the helper cannot call its function %', f;
    end if;
  end loop;
  raise notice 'only the helper can call the helper''s functions';
end $$;
