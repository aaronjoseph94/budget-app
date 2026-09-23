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
-- 0005: every category belongs to one of Workbook's lists
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

-- The anonymous role — anyone holding the published key — cannot call any of
-- these at all.
do $$
begin
  if has_function_privilege('anon', 'public.approve_candidate(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.save_import(uuid, public.ingest_source, integer, jsonb, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.recategorise_transaction(uuid, uuid, boolean)', 'execute')
     or has_function_privilege('anon', 'public.save_import(uuid, public.ingest_source, integer, jsonb, jsonb, date, date)', 'execute')
     or has_function_privilege('authenticated', 'public._post_candidate(uuid)', 'execute') then
    raise exception 'a ledger-writing function is callable by a role that must not call it';
  end if;
  raise notice 'no ledger-writing function is callable anonymously, and the poster is private';
end $$;
