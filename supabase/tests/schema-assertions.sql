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

-- The AI app's sign-in, live: every AI-app claim below names it (0030).
insert into auth.sessions (id, user_id) values
  ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111');

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

-- An owner policy alone does not isolate: permissive policies are OR'd, so a
-- second `using (true)` beside it opens the table to every account and the
-- check above still passes. So the owner policy must be the ONLY permissive
-- policy on a public table. Restrictive policies (0019, 0020) only narrow it,
-- and are left alone (backend-a-04).
do $$
declare loose text;
begin
  select string_agg(format('%s.%s', tablename, policyname), ', ' order by tablename, policyname) into loose
    from pg_policies
   where schemaname = 'public' and permissive = 'PERMISSIVE'
     and not (cmd = 'ALL' and qual = '(user_id = auth.uid())' and with_check = '(user_id = auth.uid())');
  if loose is not null then
    raise exception 'permissive policies other than the owner''s: %', loose;
  end if;
  raise notice 'the owner policy is the only permissive policy on every public table';
end $$;

-- And no SECURITY DEFINER function in public is callable by the anonymous
-- role, found from the catalog rather than kept as a list by hand (N12).
do $$
declare open_ text;
begin
  select string_agg(oid::regprocedure::text, ', ') into open_
    from pg_proc
   where pronamespace = 'public'::regnamespace and prosecdef
     and has_function_privilege('anon', oid, 'execute');
  if open_ is not null then
    raise exception 'SECURITY DEFINER functions the anonymous role can call: %', open_;
  end if;
  raise notice 'the anonymous role can call no SECURITY DEFINER function';
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

-- ---------------------------------------------------------------------------
-- 0019: AI apps cannot write. A token carrying client_id, which only an AI
-- app's sign-in through Supabase's OAuth server has, changes no row, touches
-- no receipt and runs no function the browser may call. Every assertion
-- above ran after 0019 too, without client_id: the owner's own session
-- still does all of it.
-- ---------------------------------------------------------------------------
-- Each guarded function is exactly as it stood before 0019, plus its guard as
-- the first statement, with the same settings and grants. Read as they stood
-- before 0022, which changes save_import again and is checked on its own.
do $$
declare
  r     record;
  p     record;
  guard text;
  at    int;
  n     int := 0;
begin
  for r in select * from verify.guarded_before loop
    select prosrc, prosecdef, provolatile, proconfig, acl into p
      from verify.before_0022 where fn = r.fn;
    if not found then raise exception '% is not among the functions the browser could call before 0022', r.fn; end if;
    guard := case r.lang when 'sql' then E'\n  select public._not_an_ai_app();' else E'\n  perform public._not_an_ai_app();' end;
    at := case r.lang when 'sql' then 1 else strpos(r.prosrc, E'\nbegin\n') + 6 end;
    if strpos(p.prosrc, guard) <> at or replace(p.prosrc, guard, '') <> r.prosrc then
      raise exception '% is not its old body plus the guard as its first statement', r.fn;
    end if;
    if (p.prosecdef, p.provolatile, p.proconfig, p.acl) is distinct from (r.prosecdef, r.provolatile, r.proconfig, r.acl) then
      raise exception '% changed its settings or grants', r.fn;
    end if;
    n := n + 1;
  end loop;
  if n <> 11 then raise exception '% functions were guarded, not the 11 the browser could call', n; end if;
  -- And any such function added later must carry the guard too.
  select count(*) into n from pg_proc
   where pronamespace = 'public'::regnamespace and prosecdef
     -- 0020's and 0039's AI-app functions, gated instead.
     and proname not in ('_not_an_ai_app', '_ai_app_gate', 'ai_app_add_candidate', 'ai_app_propose', 'ai_app_suggest_categories')
     and has_function_privilege('authenticated', oid, 'execute')
     and strpos(prosrc, 'public._not_an_ai_app();') = 0;
  if n <> 0 then raise exception '% SECURITY DEFINER functions the browser may call have no guard', n; end if;
  if has_function_privilege('anon', 'public._not_an_ai_app()', 'execute') then
    raise exception 'the anonymous role can call _not_an_ai_app';
  end if;
  raise notice 'every function the browser may call refuses an AI app first, and is otherwise unchanged';
end $$;

-- A receipt of the first user's, written as the superuser.
insert into storage.objects (bucket_id, name, owner)
  values ('receipts', '11111111-1111-4111-8111-111111111111/r.jpg', '11111111-1111-4111-8111-111111111111');

-- As a signed-in browser: every guarded function refuses an AI app before
-- it reads a single argument, and no receipt is read or written.
grant usage on schema verify to app_user;
grant select on verify.guarded_before to app_user;
set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare
  owner_ text := '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}';
  ai_app text := '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999", "session_id": "55555555-5555-4555-8555-555555555555"}';
  r record;
  n int;
begin
  perform set_config('request.jwt.claims', owner_, true);
  perform public._not_an_ai_app();
  select count(*) into n from storage.objects where bucket_id = 'receipts';
  if n <> 1 then raise exception 'the owner sees % receipts, not 1', n; end if;

  perform set_config('request.jwt.claims', ai_app, true);
  for r in
    select g.fn, format('select %s(%s)', p.oid::regproc,
             (select string_agg('null::' || format_type(t, null), ', ') from unnest(p.proargtypes) t)) as call
      from verify.guarded_before g join pg_proc p on p.oid = g.fn::regprocedure
  loop
    begin
      execute r.call;
      raise exception 'NOT REFUSED: an AI app called %', r.fn;
    exception when insufficient_privilege then
      if sqlerrm <> 'AI apps cannot do this' then raise exception '% refused an AI app for another reason: %', r.fn, sqlerrm; end if;
    end;
  end loop;
  select count(*) into n from storage.objects;
  if n <> 0 then raise exception 'NOT REFUSED: an AI app read % receipts', n; end if;
  begin
    insert into storage.objects (bucket_id, name) values ('receipts', '11111111-1111-4111-8111-111111111111/x.jpg');
    raise exception 'NOT REFUSED: an AI app stored a receipt';
  exception when insufficient_privilege then null;
  end;
  raise notice 'an AI app can run none of the browser''s functions, and never sees a receipt';
end $$;
reset role;

-- Every table, as a role holding every grant, so that row-level security
-- alone decides: an AI app inserts, updates and deletes nothing, and the
-- owner's own session, on the same rows, is not stopped by it. The first
-- user's AI use, rest and check-in answer, written as the superuser: the
-- three tables with none of theirs left by now.
insert into public.ai_usage (user_id, day, provider, model, task, attempts) values
  ('11111111-1111-4111-8111-111111111111', '2026-09-30', 'gemini', 'm', 'test', 1);
insert into public.ai_provider_state (user_id, provider, model, last_code) values
  ('11111111-1111-4111-8111-111111111111', 'gemini', 'm', 'ok');
insert into public.coach_answers (user_id, transaction_id, answer, asked_week)
  select user_id, id, 'planned', '2026-09-28' from public.transactions
   where user_id = '11111111-1111-4111-8111-111111111111' limit 1;
-- And 0020's three: the switch, a count and a last use.
insert into public.ai_app_access (user_id, time_zone) values ('11111111-1111-4111-8111-111111111111', 'UTC');
insert into public.ai_app_usage (user_id, day, kind, calls) values ('11111111-1111-4111-8111-111111111111', '2026-01-01', 'read', 1);
insert into public.ai_app_last_use (user_id, client_id, last_used_at)
  values ('11111111-1111-4111-8111-111111111111', '99999999-9999-4999-8999-999999999999', now());
-- And 0039's: a suggestion waiting for the owner.
insert into public.ai_app_proposals (user_id, client_id, kind, target, after, before, reason, target_key, expires_at)
  values ('11111111-1111-4111-8111-111111111111', '99999999-9999-4999-8999-999999999999', 'move_category',
          '{"category_id": "cccccccc-0000-4000-8000-000000000001"}', '{"list": "bill"}', '{"list": "variable"}',
          'Seeded for the write checks', 'list:cccccccc-0000-4000-8000-000000000001', now() + interval '14 days');
create role wide_user nologin;
grant authenticated to wide_user;
grant all on all tables in schema public to wide_user;
set role wide_user;
do $$
declare
  owner_ text := '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}';
  ai_app text := '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999", "session_id": "55555555-5555-4555-8555-555555555555"}';
  writes text[] := array[
    'insert into public.%1$I select * from public.%1$I where user_id = auth.uid() limit 1',
    'update public.%1$I set user_id = user_id where user_id = auth.uid()',
    'delete from public.%1$I where user_id = auth.uid()'];
  t text;
  w text;
  n int;
begin
  for t in select tablename from pg_tables where schemaname = 'public' order by tablename loop
    -- With 0020's read flag on, so the rows it may not change are in sight.
    perform set_config('request.jwt.claims', ai_app, true);
    perform set_config('budget.ai_app_read', 'on', true);
    execute format('select count(*) from public.%I where user_id = auth.uid()', t) into n;
    if n = 0 then raise exception 'the first user has no % row to try writing', t; end if;
    begin
      execute format(writes[1], t);
      raise exception 'NOT REFUSED: an AI app inserted into %', t;
    exception when insufficient_privilege then
      if sqlerrm not like 'new row violates row-level security policy%' then raise; end if;
    end;
    foreach w in array writes[2:3] loop
      execute format(w, t);
      get diagnostics n = row_count;
      if n <> 0 then raise exception 'NOT REFUSED: an AI app changed % rows of %: %', n, t, w; end if;
    end loop;

    -- The owner, each write undone: a duplicate, a trigger or a foreign key
    -- may stop it, but never row-level security.
    perform set_config('request.jwt.claims', owner_, true);
    foreach w in array writes loop
      begin
        execute format(w, t);
        get diagnostics n = row_count;
        if n = 0 then raise exception 'the owner changed no row of %: %', t, w using errcode = 'UN001'; end if;
        raise exception 'undo' using errcode = 'UN000';
      exception
        when sqlstate 'UN000' then null;
        when sqlstate 'UN001' then raise;
        when insufficient_privilege then raise exception 'row-level security stopped the owner on %: %', t, sqlerrm;
        when others then null;
      end;
    end loop;
  end loop;
  raise notice 'an AI app writes no row of any table, and the owner still can';
end $$;
reset role;

-- 0019 refuses to run before 0018, whose functions it re-creates: pasted
-- first, a later 0018 would silently take the guards away. Its own check,
-- taken from the file, run with 0018's function gone, then put back.
\set paste_check `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0019_ai_apps_cannot_write.sql`
begin;
drop function public.clear_candidate_suggestion(uuid);
set local verify.paste_check = :'paste_check';
do $$
begin
  if strpos(current_setting('verify.paste_check'), 'Paste 0018 first') = 0 then
    raise exception 'the paste-order check was not found in 0019';
  end if;
  begin
    execute current_setting('verify.paste_check');
    raise exception 'NOT REFUSED: 0019 ran without 0018';
  exception when raise_exception then
    if sqlerrm not like 'Paste 0018 first%' then raise; end if;
  end;
  raise notice '0019 says to paste 0018 first when it is missing';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 0020: what an AI app may do. Only through the ai_app_* functions, each
-- gated and counted; the one write leaves a pending row and checks its hash.
-- ---------------------------------------------------------------------------
-- The hash SQL rebuilds is dedupe.ts's: literals made by computeDedupeHash.
insert into public.ai_app_access (user_id, enabled, time_zone) values ('22222222-2222-4222-8222-222222222222', true, 'UTC');
insert into public.accounts (id, user_id, name) values ('aaaaaaaa-0000-4000-8000-000000000301', '22222222-2222-4222-8222-222222222222', 'Theirs for AI');
insert into public.categories (id, user_id, name, kind) values
  ('cccccccc-0000-4000-8000-000000000301', '22222222-2222-4222-8222-222222222222', 'Their lunch', 'variable'),
  ('cccccccc-0000-4000-8000-000000000302', '11111111-1111-4111-8111-111111111111', 'Moved for AI', 'transfer'),
  ('cccccccc-0000-4000-8000-000000000303', '11111111-1111-4111-8111-111111111111', 'Lunch for AI', 'variable');
create table verify.ai_hash as select
  public._ai_app_dedupe_hash('aaaaaaaa-0000-4000-8000-000000000001', (now() at time zone 'UTC')::date - 1, -1250, 'Lunch at Subway', 1) as lunch,
  public._ai_app_dedupe_hash('aaaaaaaa-0000-4000-8000-000000000001', (now() at time zone 'UTC')::date - 1, -999, 'Ledger coffee', 1) as ledger,
  public._ai_app_dedupe_hash('aaaaaaaa-0000-4000-8000-000000000001', (now() at time zone 'UTC')::date - 1, -1250, 'Lunch at Subwai', 1) as other_words,
  public._ai_app_dedupe_hash('aaaaaaaa-0000-4000-8000-000000000001', (now() at time zone 'UTC')::date - 1, -1251, 'Lunch at Subway', 1) as other_amount;
grant select on verify.ai_hash to app_user;
insert into public.transactions (user_id, account_id, posted_on, amount_cents, merchant, merchant_raw, category_id, dedupe_hash, dedupe_hash_v, source)
  select '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', (now() at time zone 'UTC')::date - 1,
         -999, 'Ledger coffee', 'Ledger coffee', 'cccccccc-0000-4000-8000-000000000303', ledger, 1, 'typed' from verify.ai_hash;
do $$
declare
  f text;
begin
  -- As 0020 left it, before 0031 gave AI apps' rows a kind of their own.
  if (select one from verify.hash_before_0031) <> '2ad325760b37229a52c8c13682fee3d31f11a2301ad7ff83eb99ef6b4a2746cf'
     or (select two from verify.hash_before_0031) <> 'a37ba14cf3c5b8d4ceeaf5f62d492008fa9a84a93306aa6de42603a2caf2c652' then
    raise exception 'the add checks a hash other than dedupe.ts''s version 1';
  end if;
  foreach f in array array['_ai_app_gate(text)', 'ai_app_read(text[],date,date)', 'ai_app_review(integer)',
    'ai_app_search(text,date,date,bigint,bigint,text[],text,text,integer)',
    'ai_app_add_candidate(uuid,date,bigint,text,integer,text,integer,text)'] loop
    if (select provolatile from pg_proc where oid = ('public.' || f)::regprocedure) <> 'v' then
      raise exception '% is not VOLATILE, so PostgREST would run it read-only and the gate could not count', f;
    end if;
    if has_function_privilege('anon', 'public.' || f, 'execute') then raise exception 'the anonymous role can call %', f; end if;
  end loop;
  if has_function_privilege('authenticated', 'public._ai_app_dedupe_hash(uuid,date,bigint,text,integer)', 'execute') then
    raise exception 'the browser can call the internal hash';
  end if;
  select string_agg(tablename, ', ') into f from pg_tables t where schemaname = 'public' and not exists (
    select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename
       and p.policyname = 'ai_apps_read_through_the_gate' and p.permissive = 'RESTRICTIVE' and p.cmd = 'SELECT');
  if f is not null then raise exception 'tables an AI app could read outside the gate: %', f; end if;
  raise notice 'the add checks dedupe.ts''s hash; every ai_app_* function is volatile; every table reads only through the gate';
end $$;

set role app_user;
do $$
declare
  owner_ text := '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}';
  ai_app text := '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999", "session_id": "55555555-5555-4555-8555-555555555555"}';
  t text;
  n int;
  pass int;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claims', owner_, true);
  -- The owner's own session is not an AI app, whatever it calls.
  if public.ai_app_read('{categories}', '2026-01-01', '2026-01-31') <> '{"refused": "not_an_ai_app"}'
     or public.ai_app_review(1) <> '{"refused": "not_an_ai_app"}'
     or public.ai_app_search(null, '2026-01-01', '2026-01-31', null, null, null, null, null, 1) <> '{"refused": "not_an_ai_app"}'
     or public.ai_app_add_candidate(null, null, null, null, null, null, null, null) <> '{"refused": "not_an_ai_app"}' then
    raise exception 'an ai_app_* function served the owner''s own session';
  end if;
  -- The browser reads its counts but never writes them.
  begin
    insert into public.ai_app_usage (user_id, day, kind, calls) values (auth.uid(), '2026-01-02', 'read', 0);
    raise exception 'NOT REFUSED: the browser wrote a count';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.ai_app_last_use set last_used_at = now();
    raise exception 'NOT REFUSED: the browser wrote a last use';
  exception when insufficient_privilege then null;
  end;
  -- Its own switch only, in a zone Postgres knows.
  select count(*) into n from public.ai_app_access;
  if n <> 1 then raise exception 'RLS LEAK: the owner sees % switches', n; end if;
  update public.ai_app_access set time_zone = 'America/Toronto';
  update public.ai_app_access set time_zone = 'UTC';
  begin
    update public.ai_app_access set time_zone = 'Mars/Base';
    raise exception 'NOT REFUSED: an unknown time zone was saved';
  exception when check_violation then null;
  end;

  -- An AI app's token reads no table directly, with the switch off or on.
  for pass in 1..2 loop
    perform set_config('request.jwt.claims', owner_, true);
    update public.ai_app_access set enabled = (pass = 2);
    perform set_config('request.jwt.claims', ai_app, true);
    for t in select tablename from pg_tables where schemaname = 'public'
               and has_table_privilege('authenticated', format('%I.%I', schemaname, tablename), 'select') loop
      execute format('select count(*) from public.%I', t) into n;
      if n <> 0 then raise exception 'NOT REFUSED: an AI app read % rows of % directly', n, t; end if;
    end loop;
  end loop;
  if public.ai_app_read('{categories}', '2026-01-01', '2026-01-31') is not null then null; end if;
  -- Once the gate has let a read through, still no write to its own switch.
  begin
    insert into public.ai_app_access (user_id, time_zone) values (auth.uid(), 'UTC');
    raise exception 'NOT REFUSED: an AI app wrote a switch';
  exception when insufficient_privilege then null;
  end;
  update public.ai_app_access set enabled = true, connect_until = now() + interval '1 day';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'NOT REFUSED: an AI app moved its own switch or window'; end if;
  raise notice 'an AI app reads nothing directly, and the owner''s session gets not_an_ai_app';
end $$;

-- Reads through the gate: counted, and refused off, adds off and at the cap.
do $$
declare
  ai_app text := '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999", "session_id": "55555555-5555-4555-8555-555555555555"}';
  owner_ text := '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}';
  r jsonb;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claims', ai_app, true);
  r := public.ai_app_read('{account,categories}', '2026-01-01', '2026-01-31');
  if r ->> 'account' <> 'aaaaaaaa-0000-4000-8000-000000000001' or r ->> 'today' <> ((now() at time zone 'UTC')::date)::text
     or not (r -> 'categories') @> '[{"name": "Coffee"}]' or r ? 'txns' then
    raise exception 'ai_app_read did not return the parts asked for: %', r;
  end if;
  r := public.ai_app_search('%', '2026-01-01', '2026-12-31', null, null, null, null, 'any', 5);
  if (r ->> 'total')::int <> 0 then raise exception 'a %% in the words matched as a wildcard'; end if;
  perform set_config('request.jwt.claims', owner_, true);
  update public.ai_app_access set allow_add = false;
  perform set_config('request.jwt.claims', ai_app, true);
  if public.ai_app_add_candidate(null, null, null, null, null, null, null, null) <> '{"refused": "adding_off"}' then
    raise exception 'NOT REFUSED: an add with adding off';
  end if;
  perform set_config('request.jwt.claims', owner_, true);
  update public.ai_app_access set enabled = false;
  perform set_config('request.jwt.claims', ai_app, true);
  if public.ai_app_review(1) <> '{"refused": "ai_apps_off"}' then raise exception 'NOT REFUSED: a read with AI apps off'; end if;
  perform set_config('request.jwt.claims', owner_, true);
  update public.ai_app_access set enabled = true, allow_add = true;
  raise notice 'reads through the gate return what was asked; off and adds off refuse';
end $$;
reset role;
do $$
begin
  if (select calls from public.ai_app_usage where user_id = '11111111-1111-4111-8111-111111111111'
        and day = (now() at time zone 'UTC')::date and kind = 'read') <> 3 then
    raise exception 'the gate did not count each allowed read once';
  end if;
  update public.ai_app_usage set calls = 299 where user_id = '11111111-1111-4111-8111-111111111111' and kind = 'read';
end $$;
set role app_user;
do $$
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999", "session_id": "55555555-5555-4555-8555-555555555555"}', true);
  if public.ai_app_review(1) ? 'refused' then raise exception 'the 300th read was refused'; end if;
  if public.ai_app_review(1) <> '{"refused": "limit_reached"}' then raise exception 'NOT REFUSED: a 301st read'; end if;
  raise notice 'the 300th read goes through and the 301st is refused';
end $$;
reset role;
update public.ai_app_usage set calls = 0 where user_id = '11111111-1111-4111-8111-111111111111';

-- A PostgREST GET runs a read-only transaction: the gate cannot count, so it fails.
begin transaction read only;
set local role app_user;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set local request.jwt.claims = '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999", "session_id": "55555555-5555-4555-8555-555555555555"}';
do $$
begin
  perform public.ai_app_read('{categories}', '2026-01-01', '2026-01-31');
  raise exception 'NOT REFUSED: an AI app read uncounted in a read-only transaction';
exception when read_only_sql_transaction then raise notice 'a read-only call fails rather than reading uncounted';
end $$;
rollback;

-- The one write: every hostile argument refused, and what it accepts only ever waits.
set role app_user;
do $$
declare
  acc   uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  day   date := (now() at time zone 'UTC')::date - 1;
  h     verify.ai_hash;
  r     jsonb;
  c     record;
  cases jsonb;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999", "session_id": "55555555-5555-4555-8555-555555555555"}', true);
  select * into h from verify.ai_hash;
  for c in select * from (values
      ('bad_amount', acc, day, 0::bigint, 'Lunch at Subway', 1, h.lunch, 1, null::text),
      ('bad_amount', acc, day, -10000001, 'Lunch at Subway', 1, h.lunch, 1, null),
      ('bad_date', acc, day + 2, -1250, 'Lunch at Subway', 1, h.lunch, 1, null),
      ('bad_date', acc, day - 366, -1250, 'Lunch at Subway', 1, h.lunch, 1, null),
      ('bad_words', acc, day, -1250, E'Lunch\tat Subway', 1, h.lunch, 1, null),
      ('bad_words', acc, day, -1250, E'Lunch \u202Eyawbus', 1, h.lunch, 1, null),
      ('bad_words', acc, day, -1250, E'Lunch\u0085at Subway', 1, h.lunch, 1, null),
      ('bad_words', acc, day, -1250, E'Lunch\u2066at Subway', 1, h.lunch, 1, null),
      ('bad_occurrence', acc, day, -1250, 'Lunch at Subway', 0, h.lunch, 1, null),
      ('bad_occurrence', acc, day, -1250, 'Lunch at Subway', 10, h.lunch, 1, null),
      ('no_account', 'aaaaaaaa-0000-4000-8000-000000000301'::uuid, day, -1250, 'Lunch at Subway', 1, h.lunch, 1, null),
      ('unknown_category', acc, day, -1250, 'Lunch at Subway', 1, h.lunch, 1, 'Their lunch'),
      ('unknown_category', acc, day, -1250, 'Lunch at Subway', 1, h.lunch, 1, 'Moved for AI'),
      ('needs_update', acc, day, -1250, 'Lunch at Subway', 1, repeat('0', 64), 1, null),
      ('needs_update', acc, day, -1250, 'Lunch at Subway', 1, h.other_words, 1, null),
      ('needs_update', acc, day, -1250, 'Lunch at Subway', 1, h.other_amount, 1, null),
      ('needs_update', acc, day, -1250, 'Lunch at Subway', 1, h.lunch, 2, null)
    ) as v(code, account, posted, cents, words, occ, hash, hash_v, category) loop
    r := public.ai_app_add_candidate(c.account, c.posted, c.cents, c.words, c.occ, c.hash, c.hash_v, c.category);
    if r ->> 'refused' is distinct from c.code then raise exception 'NOT REFUSED as %: %', c.code, r; end if;
  end loop;
  r := public.ai_app_add_candidate(acc, day, -1250, 'Lunch at Subway', 1, h.lunch, 1, 'Lunch for AI');
  if r ->> 'status' <> 'added' then raise exception 'the right hash was not added: %', r; end if;
  r := public.ai_app_add_candidate(acc, day, -1250, 'Lunch at Subway', 1, h.lunch, 1, 'Lunch for AI');
  if r ->> 'status' <> 'already_waiting' then raise exception 'a repeat was not already waiting: %', r; end if;
  r := public.ai_app_add_candidate(acc, day, -999, 'Ledger coffee', 1, h.ledger, 1, null);
  if r ->> 'status' <> 'already_recorded' then raise exception 'a ledger hash was not already recorded: %', r; end if;
  r := public.ai_app_review(50);
  if not (r -> 'rows') @> '[{"merchant_raw": "Lunch at Subway", "category_source": "model", "source": "ai_app", "ai_client_id": "99999999-9999-4999-8999-999999999999"}]' then
    raise exception 'Review does not show the added row: %', r;
  end if;
  raise notice 'the add refuses every hostile argument, and adds once';
end $$;
reset role;
do $$
begin
  -- The test user's rows (before/0037 seeds another user's, from before 0031).
  if exists (select 1 from public.ingest_candidates where source = 'ai_app' and user_id = '11111111-1111-4111-8111-111111111111'
              and (status <> 'pending' or merchant <> merchant_raw or merchant_raw <> 'Lunch at Subway'
                   or category_source is distinct from 'model')) then
    raise exception 'an AI app''s candidate is not pending, or not stored as the words it showed';
  end if;
  if (select count(*) from public.ingest_candidates where source = 'ai_app' and user_id = '11111111-1111-4111-8111-111111111111') <> 1 then raise exception 'the add did not add exactly once'; end if;
  if exists (select 1 from public.ingest_batches where source = 'ai_app' and user_id = '11111111-1111-4111-8111-111111111111'
              and (ai_client_id is distinct from '99999999-9999-4999-8999-999999999999' or parsed <> 1)) then
    raise exception 'an AI app''s batch is not the token''s, or its counts do not say one';
  end if;
  if (select array_agg(inserted::text || deduped::text order by created_at, inserted desc) from public.ingest_batches where source = 'ai_app' and user_id = '11111111-1111-4111-8111-111111111111')
       <> '{10,01,01}' then
    raise exception 'the add''s batches do not balance as added, waiting, recorded';
  end if;
  raise notice 'an AI app''s row waits as the words it showed, in a batch of its own that balances';
  -- For the next block: no last use yet, and one add left today.
  delete from public.ai_app_last_use where user_id = '11111111-1111-4111-8111-111111111111';
  insert into public.ai_app_usage (user_id, day, kind, calls)
  values ('11111111-1111-4111-8111-111111111111', (now() at time zone 'UTC')::date, 'add', 29)
  on conflict (user_id, day, kind) do update set calls = 29;
end $$;

-- The 30th add goes through and the 31st is refused; the gate notes which
-- app asked; and _ and \ in a search's words match only themselves.
set role app_user;
do $$
declare
  day date := (now() at time zone 'UTC')::date;
  r   jsonb;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999", "session_id": "55555555-5555-4555-8555-555555555555"}', true);
  if public.ai_app_add_candidate(null, null, null, null, null, null, null, null) <> '{"refused": "bad_amount"}' then
    raise exception 'the 30th add was refused by the gate';
  end if;
  if public.ai_app_add_candidate(null, null, null, null, null, null, null, null) <> '{"refused": "limit_reached"}' then
    raise exception 'NOT REFUSED: a 31st add';
  end if;
  r := public.ai_app_search('Ledger_coffee', day - 30, day, null, null, null, null, 'any', 5);
  if (r ->> 'total')::int <> 0 then raise exception 'a _ in the words matched any character'; end if;
  r := public.ai_app_search('Ledg\er', day - 30, day, null, null, null, null, 'any', 5);
  if (r ->> 'total')::int <> 0 then raise exception 'a \ in the words was read as an escape'; end if;
  r := public.ai_app_search('ledger COFFEE', day - 30, day, null, null, null, null, 'any', 5);
  if (r ->> 'total')::int <> 1 then raise exception 'the words did not find the charge they name: %', r; end if;
  raise notice 'the 31st add is refused, and a search''s words are only words';
end $$;
reset role;
do $$
begin
  if not exists (select 1 from public.ai_app_last_use where user_id = '11111111-1111-4111-8111-111111111111'
                  and client_id = '99999999-9999-4999-8999-999999999999' and last_used_at > now() - interval '1 hour') then
    raise exception 'the gate did not note when the AI app last asked';
  end if;
  raise notice 'the gate notes when each AI app last asked';
end $$;

-- 0020 refuses to run before 0019. Its own check, taken from the file, run
-- with 0019's guard gone, then put back.
\set paste_check_20 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0020_ai_apps.sql`
begin;
drop function public._not_an_ai_app();
set local verify.paste_check = :'paste_check_20';
do $$
begin
  begin
    execute current_setting('verify.paste_check');
    raise exception 'NOT REFUSED: 0020 ran without 0019';
  exception when raise_exception then
    if sqlerrm not like 'Paste 0019 first%' then raise; end if;
  end;
  raise notice '0020 says to paste 0019 first when it is missing';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 0021: a category is held only by what still files money into it. A guess
-- on a row the owner rejected, or an approval whose ledger row the owner
-- removed, no longer stops the category being removed (backend-a-01, a-02).
-- A category a ledger row still names is still refused.
-- ---------------------------------------------------------------------------
reset role;
insert into public.categories (id, user_id, name, kind) values
  ('cccccccc-0000-4000-8000-000000002101', '11111111-1111-4111-8111-111111111111', 'Guessed then rejected', 'variable'),
  ('cccccccc-0000-4000-8000-000000002102', '11111111-1111-4111-8111-111111111111', 'Typed then removed', 'variable'),
  ('cccccccc-0000-4000-8000-000000002103', '11111111-1111-4111-8111-111111111111', 'Still in the ledger', 'variable');
set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare
  acc     uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  guessed uuid := 'cccccccc-0000-4000-8000-000000002101';
  typed   uuid := 'cccccccc-0000-4000-8000-000000002102';
  kept    uuid := 'cccccccc-0000-4000-8000-000000002103';
  r       record;
  cand    uuid;
  c       record;
begin
  -- a-01: suggested, then rejected, then the category goes.
  select * into r from public.save_import(acc, 'card_csv', 1, jsonb_build_array(jsonb_build_object(
    'posted_on','2025-08-01','amount_cents',-910,'merchant','HELD 2101','merchant_raw','HELD 2101',
    'dedupe_hash', repeat('2',63) || '1', 'dedupe_hash_v', 1)), '[]'::jsonb);
  select id into cand from public.ingest_candidates where batch_id = r.batch_id;
  if public.suggest_candidate_categories(jsonb_build_array(jsonb_build_object('candidate', cand, 'category', guessed))) <> 1 then
    raise exception 'the guess was not set';
  end if;
  perform public.reject_candidate(cand);
  delete from public.categories where id = guessed;
  select status::text, category_id, rejection_reason::text into c from public.ingest_candidates where id = cand;
  if c.status <> 'rejected' or c.category_id is not null or c.rejection_reason <> 'user_rejected' then
    raise exception 'a rejected row kept its guess, or lost its decision: %', c;
  end if;

  -- a-02: typed, its ledger row removed, then the category goes.
  cand := public.add_typed_transaction(acc, '2025-08-02', -920, 'HELD 2102', 'Held 2102', typed);
  delete from public.transactions where candidate_id = cand;
  delete from public.categories where id = typed;
  select status::text, category_id, rejection_reason::text into c from public.ingest_candidates where id = cand;
  if c.status <> 'rejected' or c.category_id is not null or c.rejection_reason <> 'user_rejected' then
    raise exception 'an approval with no ledger row still reads %', c;
  end if;

  -- A charge still in the ledger still holds its category.
  cand := public.add_typed_transaction(acc, '2025-08-03', -930, 'HELD 2103', 'Held 2103', kept);
  begin
    delete from public.categories where id = kept;
    raise exception 'NOT REFUSED: a category a ledger row names was removed';
  exception when foreign_key_violation then null;
  end;
  if not exists (select 1 from public.ingest_candidates where id = cand and status = 'approved' and category_id = kept) then
    raise exception 'a refused delete still changed the approval behind a ledger row';
  end if;
  raise notice 'a guess on a rejected row, or an approval with no ledger row left, no longer holds its category';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 0022: a charge the owner already decided on is never filed by a learned
-- shop on its own. Removed from All transactions and brought in again, it
-- waits in Review (backend-c2-02).
-- ---------------------------------------------------------------------------
reset role;
insert into public.categories (id, user_id, name, kind) values
  ('cccccccc-0000-4000-8000-000000002201', '11111111-1111-4111-8111-111111111111', 'Cafes 2201', 'variable');
set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare
  acc   uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  cafes uuid := 'cccccccc-0000-4000-8000-000000002201';
  row_  jsonb := jsonb_build_object('posted_on','2025-09-01','amount_cents',-500,'merchant','CAFE 2201',
                   'merchant_raw','CAFE 2201','dedupe_hash', repeat('2',62) || '01', 'dedupe_hash_v', 1);
  other jsonb := jsonb_build_object('posted_on','2025-09-02','amount_cents',-600,'merchant','CAFE 2201',
                   'merchant_raw','CAFE 2201','dedupe_hash', repeat('2',62) || '02', 'dedupe_hash_v', 1);
  kept  jsonb := jsonb_build_object('posted_on','2025-09-03','amount_cents',-700,'merchant','CAFE 2201',
                   'merchant_raw','CAFE 2201','dedupe_hash', repeat('2',62) || '03', 'dedupe_hash_v', 1);
  r     record;
  cand  uuid;
begin
  -- Approved by hand, which teaches the rule, then removed from the ledger.
  select * into r from public.save_import(acc, 'card_csv', 1, jsonb_build_array(row_), '[]'::jsonb);
  select id into cand from public.ingest_candidates where batch_id = r.batch_id;
  perform public.approve_candidate(cand, cafes);
  delete from public.transactions where candidate_id = cand;

  -- And a charge the rule filed that stays in the ledger.
  select * into r from public.save_import(acc, 'card_csv', 1, jsonb_build_array(kept), '[]'::jsonb);
  if r.auto_approved <> 1 then raise exception 'the learned shop did not file a new charge: %', r; end if;

  -- The same statement again, with a new charge from the same shop.
  select * into r from public.save_import(acc, 'card_csv', 3, jsonb_build_array(row_, other, kept), '[]'::jsonb);
  if r.inserted <> 2 or r.deduped <> 1 or r.auto_approved <> 1 then
    raise exception 'the import again read inserted=% deduped=% auto_approved=%, not 2, 1, 1', r.inserted, r.deduped, r.auto_approved;
  end if;
  if exists (select 1 from public.transactions where dedupe_hash = row_->>'dedupe_hash') then
    raise exception 'a charge removed from the ledger came back without review';
  end if;
  if not exists (select 1 from public.ingest_candidates where batch_id = r.batch_id
                  and dedupe_hash = row_->>'dedupe_hash' and status = 'pending' and category_id is null) then
    raise exception 'the removed charge is not waiting in Review';
  end if;
  if not exists (select 1 from public.transactions where dedupe_hash = other->>'dedupe_hash') then
    raise exception 'a new charge from the same shop was not filed by its rule';
  end if;
  raise notice 'a charge removed from the ledger waits in Review when brought in again; new ones are still filed';
end $$;
reset role;

-- 0022 changed save_import by that one condition and nothing else: the body
-- as it stood before 0022, plus the condition, with the same settings and
-- grants; every other function the browser may call is as it stood. Read
-- as they stood before 0027, which changes save_import again and is
-- checked on its own.
do $$
declare
  r    record;
  p    record;
  cond constant text := E'\n       and not exists (select 1 from public.ingest_candidates d\n                        where d.user_id = v_user and d.dedupe_hash = c.dedupe_hash and d.id <> c.id)';
  at   constant text := E'\n       and r.match_merchant = c.merchant';
begin
  for r in select * from verify.before_0022 loop
    select prosrc, prosecdef, provolatile, proconfig, acl into p
      from verify.before_0027 where fn = r.fn;
    if not found then raise exception '% is gone after 0022', r.fn; end if;
    if r.fn = 'save_import(uuid,ingest_source,integer,jsonb,jsonb)' then
      if p.prosrc <> replace(r.prosrc, at, at || cond) or strpos(r.prosrc, at) = 0 then
        raise exception 'save_import is not its old body plus the one condition';
      end if;
    elsif p.prosrc <> r.prosrc then
      raise exception '% changed in 0022', r.fn;
    end if;
    if (p.prosecdef, p.provolatile, p.proconfig, p.acl) is distinct from (r.prosecdef, r.provolatile, r.proconfig, r.acl) then
      raise exception '% changed its settings or grants in 0022', r.fn;
    end if;
  end loop;
  if not exists (select 1 from verify.before_0022 where fn = 'save_import(uuid,ingest_source,integer,jsonb,jsonb)') then
    raise exception 'save_import was not among the functions checked';
  end if;
  raise notice '0022 changed save_import by one condition, and nothing else';
end $$;

-- ---------------------------------------------------------------------------
-- 0027: a second photo of a receipt already brought in waits in Review,
-- even for a learned shop. Another day or total from that shop, or a
-- statement row, is still filed by its rule (review-r-03).
-- ---------------------------------------------------------------------------
reset role;
insert into public.categories (id, user_id, name, kind) values
  ('cccccccc-0000-4000-8000-000000002701', '11111111-1111-4111-8111-111111111111', 'Bakery 2701', 'variable');
set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare
  acc    uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  bakery uuid := 'cccccccc-0000-4000-8000-000000002701';
  first_ jsonb := jsonb_build_object('posted_on','2025-10-01','amount_cents',-1250,'merchant','BAKERY 2701',
                    'merchant_raw','BAKERY 2701','dedupe_hash', repeat('7',62) || '01', 'dedupe_hash_v', 1);
  again  jsonb := jsonb_build_object('posted_on','2025-10-01','amount_cents',-1250,'merchant','BAKERY 2701',
                    'merchant_raw','BAKERY 2701','dedupe_hash', repeat('7',62) || '02', 'dedupe_hash_v', 1);
  later  jsonb := jsonb_build_object('posted_on','2025-10-08','amount_cents',-1250,'merchant','BAKERY 2701',
                    'merchant_raw','BAKERY 2701','dedupe_hash', repeat('7',62) || '03', 'dedupe_hash_v', 1);
  card   jsonb := jsonb_build_object('posted_on','2025-10-01','amount_cents',-1250,'merchant','BAKERY 2701',
                    'merchant_raw','BAKERY 2701','dedupe_hash', repeat('7',62) || '04', 'dedupe_hash_v', 1);
  r      record;
  cand   uuid;
  before_ bigint;
begin
  -- The first photo, approved by hand, which teaches the rule.
  select * into r from public.save_import(acc, 'receipt_photo', 1, jsonb_build_array(first_), '[]'::jsonb);
  select id into cand from public.ingest_candidates where batch_id = r.batch_id;
  perform public.approve_candidate(cand, bakery);
  select count(*) into before_ from public.transactions;

  -- A second photo of the same receipt: another photo, so another hash.
  select * into r from public.save_import(acc, 'receipt_photo', 1, jsonb_build_array(again), '[]'::jsonb);
  if (r.inserted, r.deduped, r.auto_approved) is distinct from (1, 0, 0) then
    raise exception 'the second photo read inserted=% deduped=% auto_approved=%, not 1, 0, 0', r.inserted, r.deduped, r.auto_approved;
  end if;
  if not exists (select 1 from public.ingest_candidates where batch_id = r.batch_id
                  and dedupe_hash = again->>'dedupe_hash' and status = 'pending' and category_id is null) then
    raise exception 'a second photo of a receipt already brought in is not waiting in Review';
  end if;
  if (select count(*) from public.transactions) <> before_ then
    raise exception 'a second photo of a receipt already brought in went into the ledger without review';
  end if;

  -- Another day from the same shop is still filed by its rule.
  select * into r from public.save_import(acc, 'receipt_photo', 1, jsonb_build_array(later), '[]'::jsonb);
  if r.auto_approved <> 1 or not exists (select 1 from public.transactions where dedupe_hash = later->>'dedupe_hash') then
    raise exception 'a receipt from a learned shop on another day was not filed by its rule: %', r;
  end if;

  -- A statement row alike is not a receipt photo, so 0027 lets it through;
  -- but it is the receipt's own charge, in the ledger already, so 0029
  -- holds it in Review (architecture-c2-02).
  select * into r from public.save_import(acc, 'card_csv', 1, jsonb_build_array(card), '[]'::jsonb);
  if r.auto_approved <> 0 or not exists (select 1 from public.ingest_candidates where batch_id = r.batch_id
                                         and status = 'pending' and category_id is null) then
    raise exception 'a statement row for a receipt already in the ledger was filed without review: %', r;
  end if;
  raise notice 'a second photo of a receipt waits in Review; other receipts are still filed';
end $$;
reset role;

-- 0027 changed save_import by that one condition, right after 0022's, and
-- nothing else: the body as it stood before 0027, plus the condition, with
-- the same settings and grants; every other function the browser may call
-- is as it stood.
do $$
declare
  r    record;
  p    record;
  at   constant text := E'\n       and r.match_merchant = c.merchant'
                     || E'\n       and not exists (select 1 from public.ingest_candidates d'
                     || E'\n                        where d.user_id = v_user and d.dedupe_hash = c.dedupe_hash and d.id <> c.id)';
  cond constant text := E'\n       and not (c.source = ''receipt_photo'' and exists (select 1 from public.ingest_candidates e'
                     || E'\n                        where e.user_id = v_user and e.id <> c.id and e.source = ''receipt_photo'''
                     || E'\n                          and e.posted_on = c.posted_on and e.amount_cents = c.amount_cents'
                     || E'\n                          and e.merchant = c.merchant))';
begin
  for r in select * from verify.before_0027 loop
    select prosrc, prosecdef, provolatile, proconfig, acl into p
      from verify.before_0029 where fn = r.fn;
    if not found then raise exception '% is gone after 0027', r.fn; end if;
    if r.fn = 'save_import(uuid,ingest_source,integer,jsonb,jsonb)' then
      if p.prosrc <> replace(r.prosrc, at, at || cond) or strpos(r.prosrc, at) = 0 then
        raise exception 'save_import is not its old body plus the one condition';
      end if;
    elsif p.prosrc <> r.prosrc then
      raise exception '% changed in 0027', r.fn;
    end if;
    if (p.prosecdef, p.provolatile, p.proconfig, p.acl) is distinct from (r.prosecdef, r.provolatile, r.proconfig, r.acl) then
      raise exception '% changed its settings or grants in 0027', r.fn;
    end if;
  end loop;
  if not exists (select 1 from verify.before_0027 where fn = 'save_import(uuid,ingest_source,integer,jsonb,jsonb)') then
    raise exception 'save_import was not among the functions checked';
  end if;
  raise notice '0027 changed save_import by one condition, and nothing else';
end $$;

-- ---------------------------------------------------------------------------
-- 0029: a charge that looks like one already in the ledger (same account,
-- amount and normalised shop, within three days) waits in Review, even for
-- a learned shop: the same charge read from a PDF and from a CSV has two
-- hashes, and was counted twice (architecture-c2-02).
-- ---------------------------------------------------------------------------
reset role;
insert into public.categories (id, user_id, name, kind) values
  ('cccccccc-0000-4000-8000-000000002901', '11111111-1111-4111-8111-111111111111', 'Garden 2901', 'variable');
set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare
  acc    uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  garden uuid := 'cccccccc-0000-4000-8000-000000002901';
  -- The PDF prints the transaction date and its own spelling of the shop;
  -- the CSV the posting date, three days on, and another spelling. Both
  -- normalise to the same shop, so the hashes differ and the rule matches.
  pdf    jsonb := jsonb_build_object('posted_on','2025-11-03','amount_cents',-4210,'merchant','GARDEN 2901',
                    'merchant_raw','SQ *GARDEN 2901','dedupe_hash', repeat('9',62) || '01', 'dedupe_hash_v', 1);
  csv    jsonb := jsonb_build_object('posted_on','2025-11-06','amount_cents',-4210,'merchant','GARDEN 2901',
                    'merchant_raw','GARDEN 2901','dedupe_hash', repeat('9',62) || '02', 'dedupe_hash_v', 1);
  week   jsonb := jsonb_build_object('posted_on','2025-11-07','amount_cents',-4210,'merchant','GARDEN 2901',
                    'merchant_raw','GARDEN 2901','dedupe_hash', repeat('9',62) || '03', 'dedupe_hash_v', 1);
  other  jsonb := jsonb_build_object('posted_on','2025-11-04','amount_cents',-1999,'merchant','GARDEN 2901',
                    'merchant_raw','GARDEN 2901','dedupe_hash', repeat('9',62) || '04', 'dedupe_hash_v', 1);
  r      record;
  cand   uuid;
  before_ bigint;
begin
  -- From the PDF, approved by hand, which teaches the rule.
  select * into r from public.save_import(acc, 'card_pdf', 1, jsonb_build_array(pdf), '[]'::jsonb);
  select id into cand from public.ingest_candidates where batch_id = r.batch_id;
  perform public.approve_candidate(cand, garden);
  select count(*) into before_ from public.transactions;

  -- The CSV of the same card: the same charge three days on waits; another
  -- amount from the same shop is filed by its rule.
  select * into r from public.save_import(acc, 'card_csv', 2, jsonb_build_array(csv, other), '[]'::jsonb);
  if (r.inserted, r.deduped, r.auto_approved) is distinct from (2, 0, 1) then
    raise exception 'the CSV read inserted=% deduped=% auto_approved=%, not 2, 0, 1', r.inserted, r.deduped, r.auto_approved;
  end if;
  if not exists (select 1 from public.ingest_candidates where batch_id = r.batch_id
                  and dedupe_hash = csv->>'dedupe_hash' and status = 'pending' and category_id is null) then
    raise exception 'a charge already in the ledger from the PDF is not waiting in Review';
  end if;
  if (select count(*) from public.transactions) <> before_ + 1
     or not exists (select 1 from public.transactions where dedupe_hash = other->>'dedupe_hash') then
    raise exception 'the PDF''s charge was filed twice, or another charge was not filed';
  end if;

  -- Four days on is outside the window, and is filed by its rule.
  select * into r from public.save_import(acc, 'card_csv', 1, jsonb_build_array(week), '[]'::jsonb);
  if r.auto_approved <> 1 then
    raise exception 'a charge four days from its lookalike was not filed by its rule: %', r;
  end if;
  raise notice 'a charge already in the ledger under another hash waits in Review; others are still filed';
end $$;
reset role;

-- 0029 changed save_import by that one condition, after 0027's, and nothing
-- else: the body as it stood before 0029, plus the condition, with the same
-- settings and grants; every other function the browser may call is as it
-- stood. Read as they stood before 0030, since 0032 to 0036 change four of
-- them again and are checked on their own.
do $$
declare
  r    record;
  p    record;
  at   constant text := E'\n                          and e.merchant = c.merchant))';
  cond constant text := E'\n       and not exists (select 1 from public.transactions t'
                     || E'\n                        where t.user_id = v_user and t.account_id = c.account_id'
                     || E'\n                          and t.amount_cents = c.amount_cents and t.merchant = c.merchant'
                     || E'\n                          and t.posted_on between c.posted_on - 3 and c.posted_on + 3)';
begin
  for r in select * from verify.before_0029 loop
    select prosrc, prosecdef, provolatile, proconfig, acl into p
      from verify.before_0030 where fn = r.fn;
    if not found then raise exception '% is gone after 0029', r.fn; end if;
    if r.fn = 'save_import(uuid,ingest_source,integer,jsonb,jsonb)' then
      if p.prosrc <> replace(r.prosrc, at, at || cond) or strpos(r.prosrc, at) = 0 then
        raise exception 'save_import is not its old body plus the one condition';
      end if;
    elsif p.prosrc <> r.prosrc then
      raise exception '% changed in 0029', r.fn;
    end if;
    if (p.prosecdef, p.provolatile, p.proconfig, p.acl) is distinct from (r.prosecdef, r.provolatile, r.proconfig, r.acl) then
      raise exception '% changed its settings or grants in 0029', r.fn;
    end if;
  end loop;
  if not exists (select 1 from verify.before_0029 where fn = 'save_import(uuid,ingest_source,integer,jsonb,jsonb)') then
    raise exception 'save_import was not among the functions checked';
  end if;
  raise notice '0029 changed save_import by one condition, and nothing else';
end $$;

-- ---------------------------------------------------------------------------
-- 0023: a typed entry sent again, after an answer that never arrived, is
-- the same entry: one ledger row, and its own batch says it was a repeat.
-- Two entries typed alike are still two (backend-a-07, backend-b-03).
-- ---------------------------------------------------------------------------
reset role;
insert into public.categories (id, user_id, name, kind) values
  ('cccccccc-0000-4000-8000-000000002301', '11111111-1111-4111-8111-111111111111', 'Cash 2301', 'variable');
set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare
  acc    uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  cash   uuid := 'cccccccc-0000-4000-8000-000000002301';
  entry  uuid := '23232323-0000-4000-8000-000000000001';
  first_ uuid;
  again  uuid;
  other  uuid;
  b      record;
begin
  first_ := public.add_typed_transaction(acc, '2025-10-01', -450, 'COFFEE 2301', 'Coffee 2301', cash, entry);
  again  := public.add_typed_transaction(acc, '2025-10-01', -450, 'COFFEE 2301', 'Coffee 2301', cash, entry);
  if again <> first_ then raise exception 'the same entry sent again made a second candidate'; end if;
  if (select count(*) from public.transactions where merchant = 'COFFEE 2301') <> 1 then
    raise exception 'the same entry sent again reached the ledger twice';
  end if;
  select parsed, deduped, inserted, rejected into b from public.ingest_batches
   where source = 'typed' and id <> (select batch_id from public.ingest_candidates where id = first_)
     and account_id = acc order by created_at desc limit 1;
  if (b.parsed, b.deduped, b.inserted, b.rejected) is distinct from (1, 1, 0, 0) then
    raise exception 'the repeat''s batch reads %, not parsed 1 = deduped 1', b;
  end if;

  -- A second coffee, typed alike, is a second coffee.
  other := public.add_typed_transaction(acc, '2025-10-01', -450, 'COFFEE 2301', 'Coffee 2301', cash, '23232323-0000-4000-8000-000000000002');
  if other = first_ or (select count(*) from public.transactions where merchant = 'COFFEE 2301') <> 2 then
    raise exception 'two entries typed alike were taken as one';
  end if;
  -- And the older call, with no entry, still posts every time.
  perform public.add_typed_transaction(acc, '2025-10-01', -450, 'COFFEE 2301', 'Coffee 2301', cash);
  if (select count(*) from public.transactions where merchant = 'COFFEE 2301') <> 3 then
    raise exception 'the call without an entry stopped posting';
  end if;
  raise notice 'a typed entry sent again is one entry, and two typed alike are two';
end $$;
reset role;
do $$
begin
  if has_function_privilege('anon', 'public.add_typed_transaction(uuid, date, bigint, text, text, uuid, uuid)', 'execute') then
    raise exception 'the anonymous role can add a typed entry';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0024: a learned shop is written only by approving or moving a charge, and
-- names only its owner's category (backend-a-05).
-- ---------------------------------------------------------------------------
reset role;
insert into public.categories (id, user_id, name, kind) values
  ('cccccccc-0000-4000-8000-000000002401', '11111111-1111-4111-8111-111111111111', 'Shops 2401', 'variable'),
  ('cccccccc-0000-4000-8000-000000002402', '22222222-2222-4222-8222-222222222222', 'Theirs 2402', 'variable');
insert into public.merchant_rules (id, user_id, match_merchant, category_id) values
  ('dddddddd-0000-4000-8000-000000002401', '11111111-1111-4111-8111-111111111111', 'SHOP 2401', 'cccccccc-0000-4000-8000-000000002401');
do $$
begin
  begin
    insert into public.merchant_rules (user_id, match_merchant, category_id)
    values ('11111111-1111-4111-8111-111111111111', 'SHOP 2402', 'cccccccc-0000-4000-8000-000000002402');
    raise exception 'NOT REFUSED: a learned shop naming another account''s category';
  exception when foreign_key_violation then null;
  end;
end $$;
set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
begin
  begin
    insert into public.merchant_rules (user_id, match_merchant, category_id)
    values ('11111111-1111-4111-8111-111111111111', 'SHOP 2403', 'cccccccc-0000-4000-8000-000000002401');
    raise exception 'NOT REFUSED: the browser wrote a learned shop itself';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.merchant_rules set category_id = 'cccccccc-0000-4000-8000-000000002401' where id = 'dddddddd-0000-4000-8000-000000002401';
    raise exception 'NOT REFUSED: the browser changed a learned shop itself';
  exception when insufficient_privilege then null;
  end;
  -- Forget, in Settings, still works.
  delete from public.merchant_rules where id = 'dddddddd-0000-4000-8000-000000002401';
  if exists (select 1 from public.merchant_rules where id = 'dddddddd-0000-4000-8000-000000002401') then
    raise exception 'the browser could not forget a learned shop';
  end if;
  raise notice 'learned shops are written only by approving, name only their owner''s categories, and can be forgotten';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 0025: stored text refuses what IngestedTextSchema refuses: C1 controls,
-- line and paragraph separators, and the bidi embeddings, overrides and
-- isolates, which make a reviewer read one thing and approve another
-- (backend-a-06). Ordinary accented, CJK and symbol text is still stored.
-- ---------------------------------------------------------------------------
do $$
declare
  bad text;
  n   int := 0;
begin
  foreach bad in array array[
    'BAD' || chr(8238) || 'NAME', 'LINE' || chr(8232) || 'BREAK', 'PARA' || chr(8233) || 'BREAK',
    'C1' || chr(133) || 'NEL', 'C1' || chr(128) || 'LOW', 'C1' || chr(159) || 'HIGH',
    'EMBED' || chr(8234) || 'LRE', 'ISOLATE' || chr(8294) || 'LRI', 'ISOLATE' || chr(8297) || 'PDI'
  ] loop
    begin
      insert into public.categories (user_id, name, kind) values ('11111111-1111-4111-8111-111111111111', bad, 'variable');
      raise exception 'NOT REFUSED: stored text with format character %', n;
    exception when check_violation then n := n + 1;
    end;
  end loop;
  insert into public.categories (user_id, name, kind) values
    ('11111111-1111-4111-8111-111111111111', 'Café Zürich 2501', 'variable'),
    ('11111111-1111-4111-8111-111111111111', '咖啡 2501', 'variable'),
    ('11111111-1111-4111-8111-111111111111', 'Fun € ☕ 2501', 'variable');
  raise notice 'stored text refuses % kinds of format character, and keeps accented, CJK and symbol text', n;
end $$;

-- ---------------------------------------------------------------------------
-- 0026: a goal whose fund moved off the Savings list can still be
-- reordered, paused, reached or retyped; only linking it to a category
-- that is not on Savings is refused (backend-a-08).
-- ---------------------------------------------------------------------------
reset role;
insert into public.categories (id, user_id, name, kind) values
  ('cccccccc-0000-4000-8000-000000002601', '11111111-1111-4111-8111-111111111111', 'Fund 2601', 'savings'),
  ('cccccccc-0000-4000-8000-000000002602', '11111111-1111-4111-8111-111111111111', 'Spend 2602', 'variable');
set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare
  fund  uuid := 'cccccccc-0000-4000-8000-000000002601';
  spend uuid := 'cccccccc-0000-4000-8000-000000002602';
  goal  uuid;
begin
  insert into public.savings_goals (user_id, name, target_cents, saved_cents, category_id, balance_as_of)
    values ('11111111-1111-4111-8111-111111111111', 'Fund 2601', 100000, 5000, fund, '2026-09-01')
    returning id into goal;
  -- Nothing stops the fund's category moving list (N52).
  update public.categories set kind = 'variable' where id = fund;

  update public.savings_goals set sort_order = 3 where id = goal;
  update public.savings_goals set status = 'paused' where id = goal;
  update public.savings_goals set saved_cents = 6000, balance_as_of = '2026-09-30' where id = goal;
  update public.savings_goals set status = 'reached', reached_on = '2026-09-30' where id = goal;

  begin
    update public.savings_goals set category_id = spend where id = goal;
    raise exception 'NOT REFUSED: a goal linked to a category off the Savings list';
  exception when check_violation then null;
  end;
  begin
    insert into public.savings_goals (user_id, name, target_cents, category_id, balance_as_of)
      values ('11111111-1111-4111-8111-111111111111', 'Spend 2602', 100000, spend, '2026-09-01');
    raise exception 'NOT REFUSED: a new goal on a category off the Savings list';
  exception when check_violation then null;
  end;
  raise notice 'a goal whose fund moved list can still be changed; linking off Savings is still refused';
end $$;
reset role;

-- 0028: the AI's kept words refuse the invisible characters the app's rule
-- refuses (security-b-01): a bidi override around a blank draws a figure
-- reversed, and a zero-width space or soft hyphen hides a number word.
set role app_user;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare
  u   uuid := '11111111-1111-4111-8111-111111111111';
  bad text;
begin
  foreach bad in array array[E'spent \u202E{{A.now}}\u202C', E'spent \u2066{{A.now}}\u2069', E't\u200Bwenty', E'fif\u00ADty',
                             E'cryp\u200Dto', E'a\uFEFFb', E'a\u061Cb', E'a\u2060b', E'a\uE000b'] loop
    begin
      insert into public.ai_notes (user_id, surface, scope, facts_sig, prompt_v, body, provider, model)
        values (u, 'daily', 'day:2026-10-01', repeat('e', 64), 1, jsonb_build_object('summary', bad), 'gemini', 'gemini-3.5-flash-lite');
      raise exception 'NOT REFUSED: AI words holding U+%', upper(to_hex(ascii(regexp_replace(bad, '^[^\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\uE000]*', ''))));
    exception when check_violation then null;
    end;
  end loop;
  -- Accents, other scripts and plain punctuation are still words.
  insert into public.ai_notes (user_id, surface, scope, facts_sig, prompt_v, body, provider, model)
    values (u, 'daily', 'day:2026-10-01', repeat('e', 64), 1, '{"summary": "Café, 東京 and naïve — still words."}', 'gemini', 'gemini-3.5-flash-lite');
  delete from public.ai_notes where facts_sig = repeat('e', 64);
  raise notice 'the AI''s kept words refuse invisible characters';
end $$;
reset role;
-- ---------------------------------------------------------------------------
-- 0030: a disconnected AI app is refused at once. The gate lets a token
-- through only while the sign-in it came from is still live: Disconnect
-- deletes that session, and the token, used directly against PostgREST, is
-- refused for the hour it would otherwise still have (mcp-1-01).
-- ---------------------------------------------------------------------------
insert into auth.sessions (id, user_id, not_after) values
  ('66666666-6666-4666-8666-666666666666', '22222222-2222-4222-8222-222222222222', null),
  ('77777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111', now() - interval '1 minute');
set role app_user;
do $$
declare
  claims text := '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999"%s}';
  c      record;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  for c in select * from (values
      ('no session claim', ''),
      ('a session that is not an id', ', "session_id": "not-a-uuid"'),
      ('a session that was deleted', ', "session_id": "88888888-8888-4888-8888-888888888888"'),
      ('another user''s session', ', "session_id": "66666666-6666-4666-8666-666666666666"'),
      ('a session past its end', ', "session_id": "77777777-7777-4777-8777-777777777777"')
    ) as v(what, extra) loop
    perform set_config('request.jwt.claims', format(claims, c.extra), true);
    if public.ai_app_read('{categories}', '2026-01-01', '2026-01-31') <> '{"refused": "disconnected"}'
       or public.ai_app_review(1) <> '{"refused": "disconnected"}'
       or public.ai_app_search(null, '2026-01-01', '2026-01-31', null, null, null, null, null, 1) <> '{"refused": "disconnected"}'
       or public.ai_app_add_candidate(null, null, null, null, null, null, null, null) <> '{"refused": "disconnected"}' then
      raise exception 'NOT REFUSED: an AI app with %', c.what;
    end if;
    -- And nothing is read directly either: the gate never set the flag.
    if exists (select 1 from public.categories) then raise exception 'NOT REFUSED: % read a table', c.what; end if;
  end loop;
  perform set_config('request.jwt.claims', format(claims, ', "session_id": "55555555-5555-4555-8555-555555555555"'), true);
  if public.ai_app_review(1) ? 'refused' then raise exception 'a live session was refused'; end if;
  if public.ai_app_update_level() < 30 then raise exception 'the update level does not say 0030 is in'; end if;
  raise notice 'a token whose sign-in has ended is refused by every ai_app_* function';
end $$;
reset role;
do $$
begin
  if has_function_privilege('anon', 'public.ai_app_update_level()', 'execute') then
    raise exception 'the anonymous role can call ai_app_update_level';
  end if;
  if (select provolatile from pg_proc where oid = 'public._ai_app_gate(text)'::regprocedure) <> 'v'
     or not (select prosecdef from pg_proc where oid = 'public._ai_app_gate(text)'::regprocedure) then
    raise exception '0030 changed the gate''s settings';
  end if;
end $$;

-- 0030 refuses to run before 0020: its own check, run with the gate gone.
\set paste_check_30 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0030_ai_app_gate_live_session.sql`
begin;
drop function public.ai_app_read(text[], date, date);
drop function public.ai_app_search(text, date, date, bigint, bigint, text[], text, text, integer);
drop function public.ai_app_review(integer);
drop function public.ai_app_add_candidate(uuid, date, bigint, text, integer, text, integer, text);
drop function public._ai_app_gate(text);
set local verify.paste_check = :'paste_check_30';
do $$
begin
  begin
    execute current_setting('verify.paste_check');
    raise exception 'NOT REFUSED: 0030 ran without 0020';
  exception when raise_exception then
    if sqlerrm not like 'Paste 0020 first%' then raise; end if;
  end;
  raise notice '0030 says to paste 0020 first when it is missing';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 0031: an AI app's row has a hash kind of its own, ai_app:<n>, so it can
-- never take a statement line's hash and make the real charge be skipped
-- on import as already waiting (mcp-2-01). Literals from computeDedupeHash
-- with dedupe.ts's 'ai_app' kind.
-- ---------------------------------------------------------------------------
update public.ai_app_usage set calls = 0 where user_id = '11111111-1111-4111-8111-111111111111';
create table verify.ai_hash_31 as select
  (now() at time zone 'UTC')::date - 2 as day,
  public._ai_app_dedupe_hash('aaaaaaaa-0000-4000-8000-000000000001', (now() at time zone 'UTC')::date - 2, -1549, 'NETFLIX.COM 8665797172 CA', 1) as ai_app,
  null::text as statement;
-- The hash a statement row with the same fields carries (dedupe.ts, occurrence:1).

update verify.ai_hash_31 set statement = encode(sha256(
  convert_to('v1', 'UTF8') || '\x00'::bytea || convert_to('aaaaaaaa-0000-4000-8000-000000000001', 'UTF8') || '\x00'::bytea ||
  convert_to(to_char(day, 'YYYY-MM-DD'), 'UTF8') || '\x00'::bytea || convert_to('-1549', 'UTF8') || '\x00'::bytea ||
  convert_to('NETFLIX.COM 8665797172 CA', 'UTF8') || '\x00'::bytea || convert_to('occurrence:1', 'UTF8')), 'hex');
grant select on verify.ai_hash_31 to app_user;
do $$
begin
  if public._ai_app_dedupe_hash('aaaaaaaa-0000-4000-8000-000000000001', '2026-09-29', -1250, 'Lunch at Subway', 1)
       <> '206b7b1e064cf1e59e31da82c407a14a697eb0448ad0ea59ba078cbd7de4795d'
     or public._ai_app_dedupe_hash('aaaaaaaa-0000-4000-8000-000000000001', '2026-09-29', -1250, 'Lunch at Subway', 2)
       <> '750ae64d42c96e628f602a05afe0d85ec04e2b2e93a42efc5e49c401e7332e76' then
    raise exception 'the add checks a hash other than dedupe.ts''s ai_app kind';
  end if;
  if public.ai_app_update_level() < 31 then raise exception 'the update level does not say 0031 is in'; end if;
end $$;
set role app_user;
do $$
declare
  ai_app text := '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999", "session_id": "55555555-5555-4555-8555-555555555555"}';
  owner_ text := '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}';
  h      verify.ai_hash_31;
  r      jsonb;
  i      record;
begin
  select * into h from verify.ai_hash_31;
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claims', ai_app, true);
  -- The statement line's own hash, sent by a caller that chose every field: refused.
  r := public.ai_app_add_candidate('aaaaaaaa-0000-4000-8000-000000000001', h.day, -1549, 'NETFLIX.COM 8665797172 CA', 1, h.statement, 1, null);
  if r ->> 'refused' is distinct from 'needs_update' then raise exception 'NOT REFUSED: an add carrying a statement row''s hash: %', r; end if;
  -- The same fields under its own kind: added, and waiting.
  r := public.ai_app_add_candidate('aaaaaaaa-0000-4000-8000-000000000001', h.day, -1549, 'NETFLIX.COM 8665797172 CA', 1, h.ai_app, 1, null);
  if r ->> 'status' <> 'added' then raise exception 'the ai_app hash was not added: %', r; end if;

  -- Then the statement arrives: the real charge is inserted, not skipped.
  perform set_config('request.jwt.claims', owner_, true);
  select * into i from public.save_import('aaaaaaaa-0000-4000-8000-000000000001', 'card_csv', 1,
    jsonb_build_array(jsonb_build_object('posted_on', h.day, 'amount_cents', -1549,
      'merchant', 'NETFLIX.COM', 'merchant_raw', 'NETFLIX.COM 8665797172 CA', 'dedupe_hash', h.statement, 'dedupe_hash_v', 1)),
    '[]'::jsonb);
  if i.inserted <> 1 or i.deduped <> 0 then
    raise exception 'an AI app''s row swallowed a statement line: inserted % deduped %', i.inserted, i.deduped;
  end if;
  raise notice 'an AI app''s row never takes a statement line''s hash; the real charge still arrives';
end $$;
reset role;

\set paste_check_31 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0031_ai_app_hash_own_kind.sql`
begin;
drop function public.ai_app_update_level();
set local verify.paste_check = :'paste_check_31';
do $$
begin
  begin
    execute current_setting('verify.paste_check');
    raise exception 'NOT REFUSED: 0031 ran without 0030';
  exception when raise_exception then
    if sqlerrm not like 'Paste 0030 first%' then raise; end if;
  end;
  raise notice '0031 says to paste 0030 first when it is missing';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 0032: a row an AI app added never teaches a learned shop, approved or
-- moved; every other row still does (mcp-2-02).
-- ---------------------------------------------------------------------------
-- The owner's rule for the AI's words, as the superuser: an AI row approved
-- into another category must not move it.
insert into public.merchant_rules (user_id, match_merchant, category_id)
  values ('11111111-1111-4111-8111-111111111111', 'NETFLIX.COM 8665797172 CA', 'cccccccc-0000-4000-8000-000000000001');
set role app_user;
do $$
declare
  lunch uuid := 'cccccccc-0000-4000-8000-000000000303';
  ai    uuid;
  stmt  uuid;
  txn   uuid;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
  select id into ai from public.ingest_candidates
   where source = 'ai_app' and merchant = 'NETFLIX.COM 8665797172 CA' and status = 'pending';
  select id into stmt from public.ingest_candidates
   where source = 'card_csv' and merchant = 'NETFLIX.COM' and status = 'pending';
  if ai is null or stmt is null then raise exception 'the rows 0031''s block left are not waiting'; end if;

  if public.approve_candidate(ai, lunch) <> 'approved' then raise exception 'the AI app''s row was not approved'; end if;
  if (select category_id from public.merchant_rules where match_merchant = 'NETFLIX.COM 8665797172 CA') <> 'cccccccc-0000-4000-8000-000000000001' then
    raise exception 'NOT REFUSED: approving an AI app''s row moved a learned shop';
  end if;
  select id into txn from public.transactions where candidate_id = ai;
  if txn is null or (select category_id from public.transactions where id = txn) <> lunch then
    raise exception 'the AI app''s row was not posted as approved';
  end if;
  -- Moved, asked to learn: the row moves, the rule does not.
  perform public.recategorise_transaction(txn, 'cccccccc-0000-4000-8000-000000000001', true);
  perform public.recategorise_transaction(txn, lunch, true);
  if (select category_id from public.transactions where id = txn) <> lunch then raise exception 'the AI app''s row did not move'; end if;
  if (select category_id from public.merchant_rules where match_merchant = 'NETFLIX.COM 8665797172 CA') <> 'cccccccc-0000-4000-8000-000000000001' then
    raise exception 'NOT REFUSED: moving an AI app''s row moved a learned shop';
  end if;

  -- A statement's row still teaches, approved and moved.
  if public.approve_candidate(stmt, lunch) <> 'approved' then raise exception 'the statement row was not approved'; end if;
  if (select category_id from public.merchant_rules where match_merchant = 'NETFLIX.COM') is distinct from lunch then
    raise exception 'approving a statement row no longer teaches its shop';
  end if;
  select id into txn from public.transactions where candidate_id = stmt;
  perform public.recategorise_transaction(txn, 'cccccccc-0000-4000-8000-000000000001', true);
  if (select category_id from public.merchant_rules where match_merchant = 'NETFLIX.COM') <> 'cccccccc-0000-4000-8000-000000000001' then
    raise exception 'moving a statement row no longer teaches its shop';
  end if;
  raise notice 'an AI app''s row teaches no learned shop; a statement''s still does';
end $$;
reset role;

-- 0032 changed approve_candidate and recategorise_transaction by those few
-- lines and nothing else, 0019's guard included; every other function the
-- browser may call is as it stood, with the same settings and grants. Read
-- as they stood before 0034, which changes the AI app's add and is checked
-- on its own.
do $$
declare
  r record;
  p record;
  n int := 0;
begin
  for r in select * from verify.before_0032 loop
    select prosrc, prosecdef, provolatile, proconfig, acl into p from verify.before_0034 where fn = r.fn;
    if not found then raise exception '% is gone after 0032', r.fn; end if;
    if r.fn = 'approve_candidate(uuid,uuid)' then
      if p.prosrc <> replace(replace(replace(r.prosrc,
           E'  v_merchant text;\nbegin\n', E'  v_merchant text;\n  v_source   text;\nbegin\n'),
           E'  returning c.merchant into v_merchant;\n', E'  returning c.merchant, c.source::text into v_merchant, v_source;\n'),
           E'  insert into public.merchant_rules (user_id, match_merchant, category_id)\n  values (v_user, v_merchant, p_category)\n  on conflict (user_id, match_merchant) do update set category_id = excluded.category_id;\n',
           E'  -- Never from an AI app''s row: its words are the AI''s, and a rule\n  -- files later statement lines with no review (0032).\n  if v_source is distinct from ''ai_app'' then\n' ||
           E'    insert into public.merchant_rules (user_id, match_merchant, category_id)\n    values (v_user, v_merchant, p_category)\n    on conflict (user_id, match_merchant) do update set category_id = excluded.category_id;\n  end if;\n') then
        raise exception 'approve_candidate is not its old body with 0032''s lines';
      end if;
      n := n + 1;
    elsif r.fn = 'recategorise_transaction(uuid,uuid,boolean)' then
      if p.prosrc <> replace(replace(replace(r.prosrc,
           E'  v_merchant  text;\nbegin\n', E'  v_merchant  text;\n  v_source    text;\nbegin\n'),
           E'  returning t.candidate_id, t.merchant into v_cand, v_merchant;\n', E'  returning t.candidate_id, t.merchant, t.source::text into v_cand, v_merchant, v_source;\n'),
           E'  if p_learn then\n', E'  -- Never from an AI app''s row (0032).\n  if p_learn and v_source is distinct from ''ai_app'' then\n') then
        raise exception 'recategorise_transaction is not its old body with 0032''s lines';
      end if;
      n := n + 1;
    elsif p.prosrc <> r.prosrc then
      raise exception '% changed in 0032', r.fn;
    end if;
    if strpos(p.prosrc, E'begin\n  perform public._not_an_ai_app();\n') = 0 and r.fn in ('approve_candidate(uuid,uuid)', 'recategorise_transaction(uuid,uuid,boolean)') then
      raise exception '% lost 0019''s guard as its first statement', r.fn;
    end if;
    if (p.prosecdef, p.provolatile, p.proconfig, p.acl) is distinct from (r.prosecdef, r.provolatile, r.proconfig, r.acl) then
      raise exception '% changed its settings or grants in 0032', r.fn;
    end if;
  end loop;
  if n <> 2 then raise exception '0032''s two functions were not both checked'; end if;
  if public.ai_app_update_level() < 32 then raise exception 'the update level does not say 0032 is in'; end if;
  raise notice '0032 changed only those lines of approve_candidate and recategorise_transaction';
end $$;

\set paste_check_32 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0032_ai_rows_teach_no_rule.sql`
begin;
create or replace function public.ai_app_update_level() returns integer language sql immutable as $$ select 30 $$;
set local verify.paste_check = :'paste_check_32';
do $$
begin
  begin
    execute current_setting('verify.paste_check');
    raise exception 'NOT REFUSED: 0032 ran without 0031';
  exception when raise_exception then
    if sqlerrm not like 'Paste 0031 first%' then raise; end if;
  end;
  raise notice '0032 says to paste 0031 first when it is missing';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 0033: a search matches the shop names as an AI app is shown them, long
-- numbers masked, so it cannot read a masked number back one digit at a
-- time from how many rows match (mcp-2-04).
-- ---------------------------------------------------------------------------
set role app_user;
do $$
declare
  day date := (now() at time zone 'UTC')::date;
  r   jsonb;
  t   text;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999", "session_id": "55555555-5555-4555-8555-555555555555"}', true);
  -- 0031's and 0032's two NETFLIX rows, words 'NETFLIX.COM 8665797172 CA'.
  r := public.ai_app_search('NETFLIX.COM', day - 30, day, null, null, null, null, 'any', 5);
  if (r ->> 'total')::int <> 2 then raise exception 'the words did not find the two charges: %', r; end if;
  foreach t in array array['NETFLIX.COM 8', 'NETFLIX.COM 86', 'NETFLIX.COM 86657', '97172 CA', '72 CA'] loop
    r := public.ai_app_search(t, day - 30, day, null, null, null, null, 'any', 5);
    if (r ->> 'total')::int <> 0 then raise exception 'NOT REFUSED: a search for % matched a masked number', t; end if;
  end loop;
  -- What the AI app was shown finds them again.
  r := public.ai_app_search('NETFLIX.COM ********** CA', day - 30, day, null, null, null, null, 'any', 5);
  if (r ->> 'total')::int <> 2 then raise exception 'the shop as shown did not find the charges: %', r; end if;
  begin
    perform public.ai_app_search('8665797172', day - 30, day, null, null, null, null, 'any', 5);
    raise exception 'NOT REFUSED: a search for a long number';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'a search sees shop names as the AI app is shown them, numbers masked';
end $$;
reset role;
do $$
begin
  if public.ai_app_update_level() < 33 then raise exception 'the update level does not say 0033 is in'; end if;
  if (select provolatile from pg_proc where oid = 'public.ai_app_search(text,date,date,bigint,bigint,text[],text,text,integer)'::regprocedure) <> 'v'
     or (select prosecdef from pg_proc where oid = 'public.ai_app_search(text,date,date,bigint,bigint,text[],text,text,integer)'::regprocedure) then
    raise exception '0033 changed the search''s settings';
  end if;
end $$;

\set paste_check_33 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0033_ai_search_masked.sql`
begin;
create or replace function public.ai_app_update_level() returns integer language sql immutable as $$ select 31 $$;
set local verify.paste_check = :'paste_check_33';
do $$
begin
  begin
    execute current_setting('verify.paste_check');
    raise exception 'NOT REFUSED: 0033 ran without 0032';
  exception when raise_exception then
    if sqlerrm not like 'Paste 0032 first%' then raise; end if;
  end;
  raise notice '0033 says to paste 0032 first when it is missing';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 0034: what an AI app adds has every character visible, as the server's
-- WordsSchema requires: a caller without the server cannot add two rows
-- that look the same in Review while hashing apart (mcp-2-05).
-- ---------------------------------------------------------------------------
set role app_user;
do $$
declare
  c int;
  r jsonb;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999", "session_id": "55555555-5555-4555-8555-555555555555"}', true);
  foreach c in array array[x'00AD', x'061C', x'180E', x'200B', x'200C', x'200D', x'200E', x'200F', x'2060', x'2061', x'2062', x'2063', x'2064', x'2065', x'FEFF']::int[] loop
    r := public.ai_app_add_candidate('aaaaaaaa-0000-4000-8000-000000000001', (now() at time zone 'UTC')::date - 1, -450,
           'Cof' || chr(c) || 'fee', 1, repeat('0', 64), 1, null);
    if r ->> 'refused' is distinct from 'bad_words' then
      raise exception 'NOT REFUSED: U+% in what an AI app added: %', lpad(to_hex(c), 4, '0'), r;
    end if;
  end loop;
  raise notice 'what an AI app adds has every character visible';
end $$;
reset role;
do $$
begin
  if public.ai_app_update_level() < 34 then raise exception 'the update level does not say 0034 is in'; end if;
  if not (select prosecdef from pg_proc where oid = 'public.ai_app_add_candidate(uuid,date,bigint,text,integer,text,integer,text)'::regprocedure) then
    raise exception '0034 changed the add''s settings';
  end if;
end $$;

\set paste_check_34 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0034_ai_words_visible.sql`
begin;
create or replace function public.ai_app_update_level() returns integer language sql immutable as $$ select 32 $$;
set local verify.paste_check = :'paste_check_34';
do $$
begin
  begin
    execute current_setting('verify.paste_check');
    raise exception 'NOT REFUSED: 0034 ran without 0033';
  exception when raise_exception then
    if sqlerrm not like 'Paste 0033 first%' then raise; end if;
  end;
  raise notice '0034 says to paste 0033 first when it is missing';
end $$;
rollback;

-- 0034 added that one condition to ai_app_add_candidate and nothing else;
-- every other function the browser may call is as it stood. Read as they
-- stood before 0039, which edits the gate and is checked on its own.
do $$
declare
  r   record;
  p   record;
  at  constant text := E'  if p_words is null or length(p_words) not between 1 and 120 or p_words <> btrim(p_words)\n';
  add constant text := E'     or p_words ~ ''[\\u00AD\\u061C\\u180E\\u200B-\\u200F\\u2060-\\u2065\\uFEFF]'' -- drawn as nothing (0034)\n';
begin
  for r in select * from verify.before_0034 loop
    select prosrc, prosecdef, provolatile, proconfig, acl into p from verify.before_0039 where fn = r.fn;
    if not found then raise exception '% is gone before 0039', r.fn; end if;
    if r.fn = 'ai_app_add_candidate(uuid,date,bigint,text,integer,text,integer,text)' then
      if strpos(r.prosrc, at) = 0 or p.prosrc <> replace(r.prosrc, at, at || add) then
        raise exception 'ai_app_add_candidate is not its old body plus the one condition';
      end if;
    elsif p.prosrc <> r.prosrc then
      raise exception '% changed in 0034', r.fn;
    end if;
    if (p.prosecdef, p.provolatile, p.proconfig, p.acl) is distinct from (r.prosecdef, r.provolatile, r.proconfig, r.acl) then
      raise exception '% changed its settings or grants in 0034', r.fn;
    end if;
  end loop;
  raise notice '0034 added one condition to the AI app''s add, and nothing else';
end $$;

-- ---------------------------------------------------------------------------
-- 0035: which AI-app security updates are in, read from what each one left
-- in its functions, so pasting an earlier one again cannot make One-time
-- updates offer a later one that can then never be pasted (re-paste of
-- 0030 after 0034 set ai_app_update_level() back to 30, then 0032 failed
-- for good: its lines were already in).
-- ---------------------------------------------------------------------------
do $$
begin
  if public.ai_app_updates_in() < 35 then
    raise exception 'ai_app_updates_in() says %, not 35 or more, with 0030 to 0035 in', public.ai_app_updates_in();
  end if;
  if has_function_privilege('anon', 'public.ai_app_updates_in()', 'execute') then
    raise exception 'the anonymous role can call ai_app_updates_in';
  end if;
  if not has_function_privilege('authenticated', 'public.ai_app_updates_in()', 'execute') then
    raise exception 'a signed-in browser cannot call ai_app_updates_in';
  end if;
end $$;

-- An update's mark taken away (0033's here) is read as that update and
-- every later one not in.
begin;
do $$
declare
  was int;
begin
  -- 0033's mark gone from the search: 33 and on are not in.
  execute replace(pg_get_functiondef('public.ai_app_search(text,date,date,bigint,bigint,text[],text,text,integer)'::regprocedure),
                  '(0033)', '(----)');
  was := public.ai_app_updates_in();
  if was <> 32 then raise exception 'with 0033''s lines gone, ai_app_updates_in() says %, not 32', was; end if;
end $$;
rollback;

-- Pasting 0030 and 0031 again after everything is in: the level they set
-- goes back, what One-time updates reads does not, and 0032 pasted again
-- is refused with nothing changed.
\set repaste_30 `sed '/^begin;$/d;/^commit;$/d' supabase/migrations/0030_ai_app_gate_live_session.sql`
\set repaste_31 `sed '/^begin;$/d;/^commit;$/d' supabase/migrations/0031_ai_app_hash_own_kind.sql`
\set repaste_32 `sed '/^begin;$/d;/^commit;$/d' supabase/migrations/0032_ai_rows_teach_no_rule.sql`
select public.ai_app_updates_in() as all_in \gset
begin;
:repaste_30
:repaste_31
set local verify.repaste = :'repaste_32';
set local verify.all_in = :'all_in';
do $$
declare
  approve text := (select prosrc from pg_proc where oid = 'public.approve_candidate(uuid,uuid)'::regprocedure);
begin
  if public.ai_app_update_level() <> 31 then raise exception 'the re-paste did not run'; end if;
  if public.ai_app_updates_in() <> current_setting('verify.all_in')::int then
    raise exception 'NOT REFUSED: pasting 0030 and 0031 again moved what One-time updates reads to %', public.ai_app_updates_in();
  end if;
  begin
    execute current_setting('verify.repaste');
    raise exception 'NOT REFUSED: 0032 pasted twice changed its functions again';
  exception when raise_exception then
    if sqlerrm like 'NOT REFUSED%' then raise; end if;
  end;
  if (select prosrc from pg_proc where oid = 'public.approve_candidate(uuid,uuid)'::regprocedure) <> approve
     or public.ai_app_updates_in() <> current_setting('verify.all_in')::int then
    raise exception '0032 pasted twice changed something';
  end if;
  raise notice 'pasting an AI-app update again never makes One-time updates offer one already in';
end $$;
rollback;

-- 0035 refuses to run before 0020: its own check, run with the gate gone.
\set paste_check_35 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0035_ai_app_updates_in.sql`
begin;
drop function public.ai_app_read(text[], date, date);
drop function public.ai_app_search(text, date, date, bigint, bigint, text[], text, text, integer);
drop function public.ai_app_review(integer);
drop function public.ai_app_add_candidate(uuid, date, bigint, text, integer, text, integer, text);
drop function public._ai_app_gate(text);
set local verify.paste_check = :'paste_check_35';
do $$
begin
  begin
    execute current_setting('verify.paste_check');
    raise exception 'NOT REFUSED: 0035 ran without 0020';
  exception when raise_exception then
    if sqlerrm not like 'Paste 0020 first%' then raise; end if;
  end;
  raise notice '0035 says to paste 0020 first when it is missing';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 0036: a search matches exactly the shop name the AI app is shown, as
-- cleanShop makes it: hidden characters out first, so a number split by
-- one is masked whole, and cut to 80 characters, so text past them, never
-- shown, is never found.
-- ---------------------------------------------------------------------------
insert into public.transactions
  (user_id,account_id,posted_on,amount_cents,merchant,merchant_raw,category_id,dedupe_hash,dedupe_hash_v,source)
values
  ('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000001',(now() at time zone 'UTC')::date - 3,-700,
   'SPLITPAY', 'SPLITPAY 12345' || chr(x'200B'::int) || '67890', 'cccccccc-0000-4000-8000-000000000001', repeat('5',64),1,'card_csv'),
  ('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000001',(now() at time zone 'UTC')::date - 3,-800,
   'LONGNAME', 'LONGNAME ' || repeat('x', 75) || 'TAILSECRET', 'cccccccc-0000-4000-8000-000000000001', repeat('6',64),1,'card_csv');
do $$
begin
  -- The server's own cleanShop, character for character (money.ts).
  if public._ai_app_shown_shop('A' || chr(x'200B'::int) || 'B 12345' || chr(x'2060'::int) || '67890 C 12345 D' || chr(31) || 'E')
       <> 'AB ********** C 12345 DE'
     or public._ai_app_shown_shop(repeat('y', 78) || '1234567890') <> repeat('y', 78) || '**'
     or public._ai_app_shown_shop(repeat('z', 90)) <> repeat('z', 80) then
    raise exception 'the search does not see shop names as cleanShop shows them';
  end if;
end $$;
set role app_user;
do $$
declare
  day date := (now() at time zone 'UTC')::date;
  t   text;
  r   jsonb;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999", "session_id": "55555555-5555-4555-8555-555555555555"}', true);
  foreach t in array array['12345', '67890', 'PAY 1', 'TAILSECRET', 'xT'] loop
    r := public.ai_app_search(t, day - 30, day, null, null, null, null, 'any', 5);
    if (r ->> 'total')::int <> 0 then raise exception 'NOT REFUSED: a search for % found text the AI app is never shown', t; end if;
  end loop;
  -- As shown, they are found.
  foreach t in array array['SPLITPAY **********', 'LONGNAME xxx'] loop
    r := public.ai_app_search(t, day - 30, day, null, null, null, null, 'any', 5);
    if (r ->> 'total')::int <> 1 then raise exception 'the shop as shown (%) did not find its charge: %', t, r; end if;
  end loop;
  raise notice 'a search finds only what the AI app is shown of a shop name';
end $$;
reset role;
do $$
begin
  if public.ai_app_updates_in() < 36 then raise exception 'ai_app_updates_in() does not say 0036 is in'; end if;
  if has_function_privilege('anon', 'public._ai_app_shown_shop(text)', 'execute') then
    raise exception 'the anonymous role can call _ai_app_shown_shop';
  end if;
  if (select provolatile from pg_proc where oid = 'public.ai_app_search(text,date,date,bigint,bigint,text[],text,text,integer)'::regprocedure) <> 'v'
     or (select prosecdef from pg_proc where oid = 'public.ai_app_search(text,date,date,bigint,bigint,text[],text,text,integer)'::regprocedure) then
    raise exception '0036 changed the search''s settings';
  end if;
end $$;

\set paste_check_36 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0036_ai_search_as_shown.sql`
begin;
drop function public.ai_app_updates_in();
set local verify.paste_check = :'paste_check_36';
do $$
begin
  begin
    execute current_setting('verify.paste_check');
    raise exception 'NOT REFUSED: 0036 ran without 0035';
  exception when raise_exception then
    if sqlerrm not like 'Paste 0035 first%' then raise; end if;
  end;
  raise notice '0036 says to paste 0035 first when it is missing';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 0037: what AI apps could leave before 0031 and 0032 is cleaned up. An AI
-- row hashed as a statement line (occurrence:<n>) is hashed with its own
-- kind, ai_app:<n>, so it can no longer stand in for the real line; a
-- learned shop an AI row taught goes back to the owner's last filing of
-- that shop from anything else, or goes. Rows seeded by before/0037.
-- ---------------------------------------------------------------------------
do $$
declare
  u   uuid := '37373737-3737-4737-8737-373737373737';
  acc uuid := 'aaaaaaaa-0000-4000-8000-000000000037';
begin
  if (select dedupe_hash from public.ingest_candidates where id = 'dddddddd-0000-4000-8000-000000003701')
       is distinct from public._ai_app_dedupe_hash(acc, '2026-09-15', -1549, 'NETFLIX.COM', 2) then
    raise exception 'NOT REFUSED: a waiting AI row kept a statement line''s hash';
  end if;
  if (select dedupe_hash from public.ingest_candidates where id = 'dddddddd-0000-4000-8000-000000003702')
       is distinct from public._ai_app_dedupe_hash(acc, '2026-09-15', -1549, 'NETFLIX.COM', 1)
     or (select dedupe_hash from public.transactions where candidate_id = 'dddddddd-0000-4000-8000-000000003702')
       is distinct from public._ai_app_dedupe_hash(acc, '2026-09-15', -1549, 'NETFLIX.COM', 1) then
    raise exception 'NOT REFUSED: an approved AI row kept a statement line''s hash';
  end if;
  if (select dedupe_hash from public.ingest_candidates where id = 'dddddddd-0000-4000-8000-000000003704') is distinct from repeat('7', 64) then
    raise exception '0037 changed a hash 0020''s rule did not make';
  end if;
  if exists (select 1 from public.ingest_candidates where user_id = u and dedupe_hash_v <> 1)
     or exists (select 1 from public.transactions where user_id = u and dedupe_hash_v <> 1) then
    raise exception '0037 changed a hash version';
  end if;
  if (select category_id from public.merchant_rules where user_id = u and match_merchant = 'NETFLIX.COM') is distinct from 'cccccccc-0000-4000-8000-000000003701' then
    raise exception 'NOT REFUSED: a learned shop an AI row taught still files there';
  end if;
  if exists (select 1 from public.merchant_rules where user_id = u and match_merchant = 'MADE UP SHOP') then
    raise exception 'NOT REFUSED: a learned shop only an AI row ever had is still learned';
  end if;
  if (select category_id from public.merchant_rules where user_id = u and match_merchant = 'SAFEWAY') is distinct from 'cccccccc-0000-4000-8000-000000003702' then
    raise exception '0037 changed a learned shop no AI row taught';
  end if;
  raise notice 'AI rows from before 0031 have their own hash kind; shops they taught are unlearned';
end $$;

-- The real statement line now arrives beside the AI row, never swallowed.
set role app_user;
do $$
declare
  i record;
begin
  perform set_config('request.jwt.claim.sub', '37373737-3737-4737-8737-373737373737', true);
  perform set_config('request.jwt.claims', '{"sub": "37373737-3737-4737-8737-373737373737", "role": "authenticated"}', true);
  select * into i from public.save_import('aaaaaaaa-0000-4000-8000-000000000037', 'card_csv', 1,
    jsonb_build_array(jsonb_build_object('posted_on', '2026-09-15', 'amount_cents', -1549,
      'merchant', 'NETFLIX.COM', 'merchant_raw', 'NETFLIX.COM', 'dedupe_hash', verify.old_hash('NETFLIX.COM', -1549, 2), 'dedupe_hash_v', 1)),
    '[]'::jsonb);
  if i.inserted <> 1 or i.deduped <> 0 then
    raise exception 'an AI row from before 0031 swallowed a statement line: inserted % deduped %', i.inserted, i.deduped;
  end if;
end $$;
reset role;

do $$
begin
  if public.ai_app_updates_in() < 37 then raise exception 'ai_app_updates_in() does not say 0037 is in'; end if;
  if has_function_privilege('authenticated', 'public._ai_app_clean_old_rows()', 'execute') then
    raise exception 'a signed-in browser can run 0037''s clean-up';
  end if;
end $$;

\set paste_check_37 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0037_ai_rows_before_the_fixes.sql`
begin;
drop function public._ai_app_shown_shop(text);
set local verify.paste_check = :'paste_check_37';
do $$
begin
  begin
    execute current_setting('verify.paste_check');
    raise exception 'NOT REFUSED: 0037 ran without 0036';
  exception when raise_exception then
    if sqlerrm not like 'Paste 0036 first%' then raise; end if;
  end;
  raise notice '0037 says to paste 0036 first when it is missing';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 0038 (written as 0030 before the merge): shop names stored while 'IN*'
-- was not a processor prefix are tidied as the app now tidies them; a
-- learned shop follows, and where two would share a name the more recent
-- is kept (architecture-a-10). Rows seeded by
-- supabase/tests/before/0038_intuit_prefix_merchants.sql.
-- ---------------------------------------------------------------------------
reset role;
do $$
declare
  u3 constant uuid := '33333333-3333-4333-8333-333333333333';
begin
  if (select array_agg(merchant::text order by id) from public.ingest_candidates where user_id = u3 and batch_id = 'bbbbbbbb-0000-4000-8000-000000003001')
     is distinct from array['ACME PLUMBING', 'ACME PLUMBING', 'IN*KEEP'] then
    raise exception 'the review rows were not tidied as the app now tidies them: %',
      (select array_agg(merchant::text order by id) from public.ingest_candidates where user_id = u3 and batch_id = 'bbbbbbbb-0000-4000-8000-000000003001');
  end if;
  if (select merchant from public.transactions where candidate_id = 'eeeeeeee-0000-4000-8000-000000003001') <> 'ACME PLUMBING'
     or (select merchant_raw from public.transactions where candidate_id = 'eeeeeeee-0000-4000-8000-000000003001') <> 'IN*ACME PLUMBING 4155551234' then
    raise exception 'the ledger row was not tidied, or its statement text changed';
  end if;
  if (select array_agg(match_merchant::text || '=' || category_id order by match_merchant) from public.merchant_rules where user_id = u3)
     is distinct from array['ACME PLUMBING=cccccccc-0000-4000-8000-000000003001', 'IN*KEEP=cccccccc-0000-4000-8000-000000003002',
                            'ZED SHOP=cccccccc-0000-4000-8000-000000003002'] then
    raise exception 'the learned shops are not as expected: %',
      (select array_agg(match_merchant::text || '=' || category_id order by match_merchant) from public.merchant_rules where user_id = u3);
  end if;
  -- Two old names that both tidy to 'ZED SHOP': both review rows follow,
  -- and only the learned shop used most recently is left.
  if (select array_agg(merchant::text order by id) from public.ingest_candidates where user_id = u3 and batch_id = 'bbbbbbbb-0000-4000-8000-000000003002')
     is distinct from array['ZED SHOP', 'ZED SHOP'] then
    raise exception 'two old names for one shop were not both tidied: %',
      (select array_agg(merchant::text order by id) from public.ingest_candidates where user_id = u3 and batch_id = 'bbbbbbbb-0000-4000-8000-000000003002');
  end if;
  raise notice 'shop names stored before IN* was a prefix are tidied, and their learned shops follow';
end $$;

-- 0038 is pasted last: its own check, taken from the file, refuses it with
-- 0029 missing and with 0037 missing, each gone in turn, then put back.
\set paste_check_38 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0038_intuit_prefix_merchants.sql`
begin;
create or replace function public.schema_level() returns integer language sql immutable as $$ select 28 $$;
set local verify.paste_check = :'paste_check_38';
do $$
begin
  begin
    execute current_setting('verify.paste_check');
    raise exception 'NOT REFUSED: 0038 ran without 0029';
  exception when raise_exception then
    if sqlerrm not like 'Paste 0029 first%' then raise; end if;
  end;
  raise notice '0038 says to paste 0029 first when it is missing';
end $$;
rollback;
begin;
drop function public._ai_app_clean_old_rows();
create or replace function public.schema_level() returns integer language sql immutable as $$ select 29 $$;
set local verify.paste_check = :'paste_check_38';
do $$
begin
  begin
    execute current_setting('verify.paste_check');
    raise exception 'NOT REFUSED: 0038 ran without 0037';
  exception when raise_exception then
    if sqlerrm not like 'Paste 0037 first%' then raise; end if;
  end;
  raise notice '0038 says to paste 0037 first when it is missing';
end $$;
rollback;

-- Each of 0021 to 0029, 0034, 0038 and 0039, pasted again with everything in,
-- is refused before it changes anything: schema_level() stays at the last
-- update, and save_import and ai_app_add_candidate keep one copy of each
-- condition. Without this,
-- re-pasting 0021 or 0022 set the level back and left 0023 refused for good
-- (review of 2026-10-02). Each whole file is run, begin and commit taken out.
\set repaste_21 `sed '/^begin;$/d;/^commit;$/d' supabase/migrations/0021_category_holds.sql`
\set repaste_22 `sed '/^begin;$/d;/^commit;$/d' supabase/migrations/0022_removed_charge_waits.sql`
\set repaste_23 `sed '/^begin;$/d;/^commit;$/d' supabase/migrations/0023_typed_entry_once.sql`
\set repaste_24 `sed '/^begin;$/d;/^commit;$/d' supabase/migrations/0024_learned_shops_own_category.sql`
\set repaste_25 `sed '/^begin;$/d;/^commit;$/d' supabase/migrations/0025_ingested_text_format_characters.sql`
\set repaste_26 `sed '/^begin;$/d;/^commit;$/d' supabase/migrations/0026_goal_check_on_link.sql`
\set repaste_27 `sed '/^begin;$/d;/^commit;$/d' supabase/migrations/0027_receipt_photo_twice_waits.sql`
\set repaste_28 `sed '/^begin;$/d;/^commit;$/d' supabase/migrations/0028_ai_words_no_invisible_characters.sql`
\set repaste_29 `sed '/^begin;$/d;/^commit;$/d' supabase/migrations/0029_lookalike_charge_waits.sql`
\set repaste_34 `sed '/^begin;$/d;/^commit;$/d' supabase/migrations/0034_ai_words_visible.sql`
\set repaste_38 `sed '/^begin;$/d;/^commit;$/d' supabase/migrations/0038_intuit_prefix_merchants.sql`
\set repaste_39 `sed '/^begin;$/d;/^commit;$/d' supabase/migrations/0039_ai_apps_suggest_changes.sql`
begin;
set local verify.r21 = :'repaste_21';
set local verify.r22 = :'repaste_22';
set local verify.r23 = :'repaste_23';
set local verify.r24 = :'repaste_24';
set local verify.r25 = :'repaste_25';
set local verify.r26 = :'repaste_26';
set local verify.r27 = :'repaste_27';
set local verify.r28 = :'repaste_28';
set local verify.r29 = :'repaste_29';
set local verify.r34 = :'repaste_34';
set local verify.r38 = :'repaste_38';
set local verify.r39 = :'repaste_39';
do $$
declare
  level  constant integer := public.schema_level();
  saving constant text := (select prosrc from pg_proc
                            where oid = 'public.save_import(uuid, public.ingest_source, integer, jsonb, jsonb)'::regprocedure);
  adding constant text := (select prosrc from pg_proc
                            where oid = 'public.ai_app_add_candidate(uuid, date, bigint, text, integer, text, integer, text)'::regprocedure);
  n integer;
begin
  if level <> 38 then raise exception 'schema_level() is %, not 38, before the re-pastes', level; end if;
  foreach n in array array[21, 22, 23, 24, 25, 26, 27, 28, 29, 34, 38, 39] loop
    begin
      execute current_setting('verify.r' || n);
      raise exception 'NOT REFUSED: 00% pasted again ran', n;
    exception when raise_exception then
      if sqlerrm <> format('00%s is already in; nothing to do', n) then raise; end if;
    end;
    if public.schema_level() <> level then
      raise exception '00% pasted again moved schema_level() to %', n, public.schema_level();
    end if;
    if (select prosrc from pg_proc
         where oid = 'public.save_import(uuid, public.ingest_source, integer, jsonb, jsonb)'::regprocedure) <> saving then
      raise exception '00% pasted again changed save_import', n;
    end if;
    if (select prosrc from pg_proc
         where oid = 'public.ai_app_add_candidate(uuid, date, bigint, text, integer, text, integer, text)'::regprocedure) <> adding then
      raise exception '00% pasted again changed ai_app_add_candidate', n;
    end if;
  end loop;
  raise notice 'pasting 0021 to 0029, 0034, 0038 or 0039 again is refused and changes nothing';
end $$;
rollback;

-- With the level function itself missing (0021 not in, or 0030 not in),
-- each check says which file to paste first, not "function does not
-- exist": an 'or' would have named the function before it existed.
\set first_check_23 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0023_typed_entry_once.sql`
\set first_check_24 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0024_learned_shops_own_category.sql`
\set first_check_25 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0025_ingested_text_format_characters.sql`
\set first_check_26 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0026_goal_check_on_link.sql`
\set first_check_27 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0027_receipt_photo_twice_waits.sql`
\set first_check_28 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0028_ai_words_no_invisible_characters.sql`
\set first_check_29 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0029_lookalike_charge_waits.sql`
\set first_check_38 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0038_intuit_prefix_merchants.sql`
\set first_check_32 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0032_ai_rows_teach_no_rule.sql`
\set first_check_33 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0033_ai_search_masked.sql`
\set first_check_34 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0034_ai_words_visible.sql`
begin;
drop function public.schema_level();
set local verify.f23 = :'first_check_23';
set local verify.f24 = :'first_check_24';
set local verify.f25 = :'first_check_25';
set local verify.f26 = :'first_check_26';
set local verify.f27 = :'first_check_27';
set local verify.f28 = :'first_check_28';
set local verify.f29 = :'first_check_29';
set local verify.f38 = :'first_check_38';
do $$
declare
  n integer;
begin
  foreach n in array array[23, 24, 25, 26, 27, 28, 29, 38] loop
    begin
      execute current_setting('verify.f' || n);
      raise exception 'NOT REFUSED: 00% ran without schema_level()', n;
    exception when raise_exception then
      if sqlerrm not like 'Paste 00%' then raise; end if;
    end;
  end loop;
  raise notice 'with schema_level() missing, each check names the file to paste first';
end $$;
rollback;
begin;
drop function public.ai_app_update_level();
set local verify.f32 = :'first_check_32';
set local verify.f33 = :'first_check_33';
set local verify.f34 = :'first_check_34';
do $$
declare
  n integer;
begin
  foreach n in array array[32, 33, 34] loop
    begin
      execute current_setting('verify.f' || n);
      raise exception 'NOT REFUSED: 00% ran without ai_app_update_level()', n;
    exception when raise_exception then
      if sqlerrm not like 'Paste 00%' then raise; end if;
    end;
  end loop;
  raise notice 'with ai_app_update_level() missing, each check names the file to paste first';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 0039: an AI app may suggest changes, which wait for the owner (ADR 0013).
-- Its token writes only pending suggestions, through ai_app_propose, gated
-- as 'propose' (60 a day, its own switch): every id is the caller's, every
-- stored before is read by the database, and only the owner's session
-- marks one applied or dismissed.
-- ---------------------------------------------------------------------------
reset role;
update public.ai_app_usage set calls = 0 where user_id = '11111111-1111-4111-8111-111111111111';
update public.ai_app_access set enabled = true, allow_propose = true where user_id = '11111111-1111-4111-8111-111111111111';
insert into public.categories (id, user_id, name, kind, weekly_budget_cents) values
  ('cccccccc-0000-4000-8000-000000003901', '11111111-1111-4111-8111-111111111111', 'Groceries 39', 'variable', 10000),
  ('cccccccc-0000-4000-8000-000000003902', '11111111-1111-4111-8111-111111111111', 'Rent 39', 'bill', null),
  ('cccccccc-0000-4000-8000-000000003903', '11111111-1111-4111-8111-111111111111', 'Card payment 39', 'transfer', null),
  ('cccccccc-0000-4000-8000-000000003904', '22222222-2222-4222-8222-222222222222', 'Theirs 39', 'variable', null);
insert into public.savings_goals (id, user_id, name, target_cents, target_date) values
  ('dddddddd-0000-4000-8000-000000003901', '11111111-1111-4111-8111-111111111111', 'Trip 39', 200000, '2099-03-01'),
  ('dddddddd-0000-4000-8000-000000003902', '22222222-2222-4222-8222-222222222222', 'Their trip 39', 100000, null);
insert into public.transactions (id, user_id, account_id, posted_on, amount_cents, merchant, merchant_raw, category_id, dedupe_hash, dedupe_hash_v, source) values
  ('eeeeeeee-0000-4000-8000-000000003901', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001',
   (now() at time zone 'UTC')::date - 5, -5420, 'COSTCO 39', 'COSTCO 39 #123', 'cccccccc-0000-4000-8000-000000003901',
   encode(sha256(convert_to('0039 costco', 'UTF8')), 'hex'), 1, 'card_csv'),
  ('eeeeeeee-0000-4000-8000-000000003902', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001',
   (now() at time zone 'UTC')::date - 5, -999, 'Lunch words 39', 'Lunch words 39', 'cccccccc-0000-4000-8000-000000003901',
   encode(sha256(convert_to('0039 ai row', 'UTF8')), 'hex'), 1, 'ai_app');
do $$
declare
  f text;
begin
  if has_table_privilege('authenticated', 'public.ai_app_proposals', 'insert')
     or has_table_privilege('authenticated', 'public.ai_app_proposals', 'update')
     or has_table_privilege('authenticated', 'public.ai_app_proposals', 'delete')
     or not has_table_privilege('authenticated', 'public.ai_app_proposals', 'select') then
    raise exception 'the browser may do more than read the suggestions, or cannot read them';
  end if;
  foreach f in array array['ai_app_propose(jsonb)', 'ai_app_suggestions(text,integer)', 'ai_app_suggest_categories(jsonb)',
    'decide_suggestion(uuid,text)'] loop
    if (select provolatile from pg_proc where oid = ('public.' || f)::regprocedure) <> 'v' then raise exception '% is not VOLATILE', f; end if;
    if (select proconfig from pg_proc where oid = ('public.' || f)::regprocedure) is null then raise exception '% has no pinned search_path', f; end if;
    if has_function_privilege('anon', 'public.' || f, 'execute') then raise exception 'the anonymous role can call %', f; end if;
    if not has_function_privilege('authenticated', 'public.' || f, 'execute') then raise exception 'a signed-in token cannot call %', f; end if;
  end loop;
  if (select prosecdef from pg_proc where oid = 'public.ai_app_suggestions(text,integer)'::regprocedure) then
    raise exception 'ai_app_suggestions is SECURITY DEFINER: it must read as the owner, under row-level security';
  end if;
  foreach f in array array['_ai_app_proposal(uuid,date,jsonb)', '_ai_app_words_shown(text,integer)', '_ai_app_whole(jsonb,bigint,bigint)', '_ai_app_id(jsonb)'] loop
    if has_function_privilege('authenticated', 'public.' || f, 'execute') then raise exception 'the browser can call the internal %', f; end if;
  end loop;
  raise notice 'the suggestions are only read by the browser; their four functions are volatile, pinned and signed-in only';
end $$;

set role app_user;
do $$
declare
  owner_ text := '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}';
  ai_app text := '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999", "session_id": "55555555-5555-4555-8555-555555555555"}';
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claims', owner_, true);
  if public.ai_app_propose('[]') <> '{"refused": "not_an_ai_app"}'
     or public.ai_app_suggestions('any', 1) <> '{"refused": "not_an_ai_app"}'
     or public.ai_app_suggest_categories('[]') <> '{"refused": "not_an_ai_app"}' then
    raise exception 'an AI app''s suggestion function served the owner''s own session';
  end if;
  begin
    insert into public.ai_app_proposals (user_id, client_id, kind, target, after, before, reason, target_key, expires_at)
    values (auth.uid(), gen_random_uuid(), 'set_weekly_limit', '{}', '{}', '{}', 'x', 'k', now());
    raise exception 'NOT REFUSED: the browser wrote a suggestion directly';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', ai_app, true);
  begin
    perform public.decide_suggestion(gen_random_uuid(), 'applied');
    raise exception 'NOT REFUSED: an AI app applied a suggestion';
  exception when insufficient_privilege then
    if sqlerrm <> 'AI apps cannot do this' then raise; end if;
  end;
  raise notice 'the owner cannot suggest as an AI app, nor write one directly; an AI app cannot apply';
end $$;

-- Every hostile change refused with its own code, each standing alone.
do $$
declare
  today date := (now() at time zone 'UTC')::date;
  first text := to_char(date_trunc('month', (now() at time zone 'UTC')::date), 'YYYY-MM-DD');
  mine  text := 'cccccccc-0000-4000-8000-000000003901';
  r     jsonb;
  c     record;
  items jsonb;
  codes text[];
  pass  int;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999", "session_id": "55555555-5555-4555-8555-555555555555"}', true);
  if public.ai_app_propose('{}') <> '{"refused": "bad_change"}' or public.ai_app_propose('[]') <> '{"refused": "bad_change"}'
     or public.ai_app_propose((select jsonb_agg(n) from generate_series(1, 21) n)) <> '{"refused": "bad_change"}' then
    raise exception 'NOT REFUSED: a call with no changes, or more than 20';
  end if;
  for pass in 1..2 loop
    items := '[]';
    codes := '{}';
    for c in select * from (values
        (1, 'bad_change', jsonb_build_object('kind', 'delete_category', 'category', mine, 'reason', 'r')),
        (1, 'bad_change', jsonb_build_object('kind', 'set_weekly_limit', 'category', mine, 'amount', 1, 'reason', 'r', 'before', '{"cents": 5}'::jsonb)),
        (1, 'bad_change', jsonb_build_object('kind', 'set_weekly_limit', 'category', mine, 'reason', 'r')),
        (1, 'bad_change', '"set_weekly_limit"'::jsonb),
        (1, 'unknown_category', jsonb_build_object('kind', 'set_weekly_limit', 'category', 'cccccccc-0000-4000-8000-000000003904', 'amount', 1, 'reason', 'r')),
        (1, 'unknown_category', jsonb_build_object('kind', 'set_weekly_limit', 'category', 'not an id', 'amount', 1, 'reason', 'r')),
        (1, 'wrong_list', jsonb_build_object('kind', 'set_weekly_limit', 'category', 'cccccccc-0000-4000-8000-000000003903', 'amount', 1, 'reason', 'r')),
        (1, 'bad_amount', jsonb_build_object('kind', 'set_weekly_limit', 'category', mine, 'amount', -1, 'reason', 'r')),
        (1, 'bad_amount', jsonb_build_object('kind', 'set_weekly_limit', 'category', mine, 'amount', 10000001, 'reason', 'r')),
        (1, 'bad_amount', jsonb_build_object('kind', 'set_weekly_limit', 'category', mine, 'amount', 12.5, 'reason', 'r')),
        (1, 'bad_amount', jsonb_build_object('kind', 'set_weekly_limit', 'category', mine, 'amount', '1200', 'reason', 'r')),
        (1, 'same_as_now', jsonb_build_object('kind', 'set_weekly_limit', 'category', mine, 'amount', 10000, 'reason', 'r')),
        (1, 'bad_words', jsonb_build_object('kind', 'set_weekly_limit', 'category', mine, 'amount', 1, 'reason', E'Two\nlines')),
        (1, 'bad_words', jsonb_build_object('kind', 'set_weekly_limit', 'category', mine, 'amount', 1, 'reason', 'Cof' || chr(x'200B'::int) || 'fee')),
        (1, 'bad_words', jsonb_build_object('kind', 'set_weekly_limit', 'category', mine, 'amount', 1, 'reason', repeat('x', 301))),
        (1, 'bad_words', jsonb_build_object('kind', 'set_weekly_limit', 'category', mine, 'amount', 1, 'reason', ' padded')),
        (1, 'bad_words', jsonb_build_object('kind', 'set_weekly_limit', 'category', mine, 'amount', 1, 'reason', chr(x'202E'::int) || 'reversed')),
        (2, 'bad_month', jsonb_build_object('kind', 'set_budget', 'category', mine, 'month', to_char(today - 40, 'YYYY-MM-01'), 'applies', 'onward', 'amount', 1, 'before', '{"cents": null}'::jsonb, 'reason', 'r')),
        (2, 'bad_month', jsonb_build_object('kind', 'set_budget', 'category', mine, 'month', to_char((first::date + interval '13 months')::date, 'YYYY-MM-DD'), 'applies', 'onward', 'amount', 1, 'before', '{"cents": null}'::jsonb, 'reason', 'r')),
        (2, 'bad_month', jsonb_build_object('kind', 'set_budget', 'category', mine, 'month', to_char(first::date + 1, 'YYYY-MM-DD'), 'applies', 'onward', 'amount', 1, 'before', '{"cents": null}'::jsonb, 'reason', 'r')),
        (2, 'bad_change', jsonb_build_object('kind', 'set_budget', 'category', mine, 'month', first, 'applies', 'always', 'amount', 1, 'before', '{"cents": null}'::jsonb, 'reason', 'r')),
        (2, 'bad_change', jsonb_build_object('kind', 'set_budget', 'category', mine, 'month', first, 'applies', 'onward', 'amount', 1, 'before', '{"cents": -5}'::jsonb, 'reason', 'r')),
        (2, 'wrong_list', jsonb_build_object('kind', 'set_budget', 'category', 'cccccccc-0000-4000-8000-000000003903', 'month', first, 'applies', 'onward', 'amount', 1, 'before', '{"cents": null}'::jsonb, 'reason', 'r')),
        (2, 'wrong_list', jsonb_build_object('kind', 'set_bill', 'category', mine, 'month', first, 'amount', 1, 'due_day', 1, 'before', '{"cents": null, "due_day": null}'::jsonb, 'reason', 'r')),
        (2, 'bad_change', jsonb_build_object('kind', 'set_bill', 'category', 'cccccccc-0000-4000-8000-000000003902', 'month', first, 'amount', 1, 'due_day', 32, 'before', '{"cents": null, "due_day": null}'::jsonb, 'reason', 'r')),
        (2, 'unknown_goal', jsonb_build_object('kind', 'set_goal', 'goal', 'dddddddd-0000-4000-8000-000000003902', 'target', 5, 'reason', 'r')),
        (2, 'bad_amount', jsonb_build_object('kind', 'set_goal', 'goal', 'dddddddd-0000-4000-8000-000000003901', 'target', 0, 'reason', 'r')),
        (2, 'bad_date', jsonb_build_object('kind', 'set_goal', 'goal', 'dddddddd-0000-4000-8000-000000003901', 'target_date', to_char(today, 'YYYY-MM-DD'), 'reason', 'r')),
        (2, 'bad_date', jsonb_build_object('kind', 'set_goal', 'goal', 'dddddddd-0000-4000-8000-000000003901', 'target_date', '2027-02-30', 'reason', 'r')),
        (2, 'bad_change', jsonb_build_object('kind', 'set_goal', 'goal', 'dddddddd-0000-4000-8000-000000003901', 'reason', 'r')),
        (2, 'name_taken', jsonb_build_object('kind', 'rename_category', 'category', mine, 'new_name', 'Coffee', 'reason', 'r')),
        (2, 'same_as_now', jsonb_build_object('kind', 'rename_category', 'category', mine, 'new_name', 'Groceries 39', 'reason', 'r')),
        (2, 'name_taken', jsonb_build_object('kind', 'add_category', 'name', 'Moved for AI', 'list', 'variable', 'reason', 'r')),
        (2, 'bad_words', jsonb_build_object('kind', 'add_category', 'name', repeat('n', 61), 'list', 'variable', 'reason', 'r')),
        (2, 'same_as_now', jsonb_build_object('kind', 'move_category', 'category', mine, 'to_list', 'variable', 'reason', 'r')),
        (2, 'unknown_transaction', jsonb_build_object('kind', 'recategorise', 'transaction', gen_random_uuid(), 'category', mine, 'reason', 'r')),
        (2, 'same_as_now', jsonb_build_object('kind', 'recategorise', 'transaction', 'eeeeeeee-0000-4000-8000-000000003901', 'category', mine, 'reason', 'r')),
        (1, 'ai_row_not_learned', jsonb_build_object('kind', 'learn_shop', 'transaction', 'eeeeeeee-0000-4000-8000-000000003902', 'category', 'cccccccc-0000-4000-8000-000000000001', 'reason', 'r'))
      ) as v(call, code, item) where v.call = pass loop
      items := items || jsonb_build_array(c.item);
      codes := codes || c.code;
    end loop;
    r := public.ai_app_propose(items);
    for i in 1 .. cardinality(codes) loop
      if r -> 'results' -> (i - 1) ->> 'refused' is distinct from codes[i] or r -> 'results' -> (i - 1) ->> 'status' <> 'refused' then
        raise exception 'NOT REFUSED as % (call %, change %): %', codes[i], pass, i, r -> 'results' -> (i - 1);
      end if;
    end loop;
  end loop;
  if exists (select 1 from public.ai_app_proposals where user_id = auth.uid() and target_key <> 'list:cccccccc-0000-4000-8000-000000000001') then
    raise exception 'a refused change was stored';
  end if;
  raise notice 'every hostile change is refused with its own code, and none is stored';
end $$;

-- What it accepts only ever waits: the token's app, the database's before,
-- fourteen days. One waiting per target: the same again is already
-- suggested, another value replaces it, and two in one call are one.
do $$
declare
  first text := to_char(date_trunc('month', (now() at time zone 'UTC')::date), 'YYYY-MM-DD');
  mine  text := 'cccccccc-0000-4000-8000-000000003901';
  r     jsonb;
  s     public.ai_app_proposals;
  first_id uuid;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999", "session_id": "55555555-5555-4555-8555-555555555555"}', true);
  r := public.ai_app_propose(jsonb_build_array(
    jsonb_build_object('kind', 'set_weekly_limit', 'category', mine, 'amount', 12000, 'reason', 'You spent $118.40 a week lately.'),
    jsonb_build_object('kind', 'set_weekly_limit', 'category', mine, 'amount', 13000, 'reason', 'Or more.'),
    jsonb_build_object('kind', 'set_budget', 'category', mine, 'month', first, 'applies', 'onward', 'amount', 45000, 'before', '{"cents": 40000}'::jsonb, 'reason', 'Budget'),
    jsonb_build_object('kind', 'set_bill', 'category', 'cccccccc-0000-4000-8000-000000003902', 'month', first, 'amount', 155000, 'due_day', 3, 'before', '{"cents": 150000, "due_day": 1}'::jsonb, 'reason', 'Rent rose'),
    jsonb_build_object('kind', 'set_goal', 'goal', 'dddddddd-0000-4000-8000-000000003901', 'target', 250000, 'reason', 'Flights cost more'),
    jsonb_build_object('kind', 'learn_shop', 'transaction', 'eeeeeeee-0000-4000-8000-000000003901', 'category', 'cccccccc-0000-4000-8000-000000000001', 'reason', 'Always coffee'),
    jsonb_build_object('kind', 'add_category', 'name', 'Pet care 39', 'list', 'variable', 'reason', 'A new kind of spending'),
    jsonb_build_object('kind', 'rename_category', 'category', 'cccccccc-0000-4000-8000-000000003902', 'new_name', 'Housing 39', 'reason', 'Clearer')));
  if (select array_agg(e ->> 'status' order by (e ->> 'index')::int) from jsonb_array_elements(r -> 'results') e)
       <> '{suggested,refused,suggested,suggested,suggested,suggested,suggested,suggested}'
     or r #>> '{results,1,refused}' <> 'duplicate_in_call' or (r ->> 'waiting')::int <> 8 then
    raise exception 'a good call was not taken change by change: %', r;
  end if;
  first_id := (r #>> '{results,0,id}')::uuid;
  select * into s from public.ai_app_proposals where id = first_id;
  if s.status <> 'pending' or s.client_id <> '99999999-9999-4999-8999-999999999999' or s.kind <> 'set_weekly_limit'
     or s.target <> jsonb_build_object('category_id', mine) or s.after <> '{"cents": 12000}' or s.before <> '{"cents": 10000}'
     or s.reason <> 'You spent $118.40 a week lately.' or s.target_key <> 'weekly:' || mine or s.decided_at is not null
     or s.expires_at not between now() + interval '14 days' - interval '1 minute' and now() + interval '14 days' then
    raise exception 'a suggestion was not stored as sent, waiting 14 days, from the token''s app: %', to_jsonb(s);
  end if;
  if r #> '{results,0,before}' <> '{"cents": 10000}' or r #> '{results,0,after}' <> '{"cents": 12000}' then
    raise exception 'the answer does not say what was suggested: %', r -> 'results' -> 0;
  end if;
  -- The parts each kind reads itself.
  if (select after from public.ai_app_proposals where id = (r #>> '{results,4,id}')::uuid) <> '{"target_cents": 250000, "target_date": "2099-03-01"}'
     or (select before from public.ai_app_proposals where id = (r #>> '{results,4,id}')::uuid) <> '{"target_cents": 200000, "target_date": "2099-03-01"}'
     or (select before from public.ai_app_proposals where id = (r #>> '{results,5,id}')::uuid) <> '{"category_id": "cccccccc-0000-4000-8000-000000003901", "rule_category_id": null}'
     or (select before from public.ai_app_proposals where id = (r #>> '{results,7,id}')::uuid) <> '{"name": "Rent 39"}'
     or (select target_key from public.ai_app_proposals where id = (r #>> '{results,2,id}')::uuid) <> 'budget:' || mine || ':' || first
     or (select before from public.ai_app_proposals where id = (r #>> '{results,3,id}')::uuid) <> '{"cents": 150000, "due_day": 1}' then
    raise exception 'a stored before or after is not what the database read';
  end if;

  r := public.ai_app_propose(jsonb_build_array(jsonb_build_object('kind', 'set_weekly_limit', 'category', mine, 'amount', 12000, 'reason', 'Again')));
  if r #>> '{results,0,status}' <> 'already_suggested' or (r #>> '{results,0,id}')::uuid <> first_id then
    raise exception 'the same change again was not already suggested: %', r;
  end if;
  r := public.ai_app_propose(jsonb_build_array(jsonb_build_object('kind', 'set_weekly_limit', 'category', mine, 'amount', 12500, 'reason', 'A little more')));
  if r #>> '{results,0,status}' <> 'suggested' or (r #>> '{results,0,id}')::uuid = first_id
     or (select status from public.ai_app_proposals where id = first_id) <> 'replaced'
     or (select decided_at from public.ai_app_proposals where id = first_id) is null
     or (select count(*) from public.ai_app_proposals where user_id = auth.uid() and target_key = 'weekly:' || mine and status = 'pending') <> 1 then
    raise exception 'another value for a waiting target did not replace it: %', r;
  end if;
  raise notice 'a suggestion waits as sent, with the database''s before; one waits per target';
end $$;

-- Only the owner decides, once, on their own waiting suggestion; a change
-- dismissed lately is not suggested again; a suggestion past its day is
-- expired and cannot be applied.
reset role;
update public.ai_app_proposals set expires_at = now() - interval '1 minute'
 where user_id = '11111111-1111-4111-8111-111111111111' and kind = 'rename_category' and status = 'pending';
set role app_user;
do $$
declare
  owner_ text := '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}';
  ai_app text := '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999", "session_id": "55555555-5555-4555-8555-555555555555"}';
  mine   text := 'cccccccc-0000-4000-8000-000000003901';
  weekly uuid;
  goal   uuid;
  late   uuid;
  r      jsonb;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claims', owner_, true);
  select id into weekly from public.ai_app_proposals where target_key = 'weekly:' || mine and status = 'pending';
  select id into goal from public.ai_app_proposals where kind = 'set_goal' and status = 'pending';
  select id into late from public.ai_app_proposals where kind = 'rename_category' and status = 'pending';
  begin
    perform public.decide_suggestion(weekly, 'approved');
    raise exception 'NOT REFUSED: an outcome that is neither applied nor dismissed';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
  perform set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
  if public.decide_suggestion(weekly, 'dismissed') then raise exception 'NOT REFUSED: another user decided the owner''s suggestion'; end if;
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claims', owner_, true);
  if not public.decide_suggestion(weekly, 'dismissed') or not public.decide_suggestion(goal, 'applied') then
    raise exception 'the owner could not dismiss or apply a waiting suggestion';
  end if;
  if public.decide_suggestion(weekly, 'applied') then raise exception 'NOT REFUSED: a dismissed suggestion was applied after all'; end if;
  if public.decide_suggestion(late, 'applied') then raise exception 'NOT REFUSED: a suggestion past its day was applied'; end if;
  if (select status from public.ai_app_proposals where id = weekly) <> 'dismissed'
     or (select status from public.ai_app_proposals where id = goal) <> 'applied' then
    raise exception 'the owner''s decisions were not kept';
  end if;

  perform set_config('request.jwt.claims', ai_app, true);
  r := public.ai_app_propose(jsonb_build_array(
    jsonb_build_object('kind', 'set_weekly_limit', 'category', mine, 'amount', 12500, 'reason', 'Asking again'),
    jsonb_build_object('kind', 'set_weekly_limit', 'category', 'cccccccc-0000-4000-8000-000000000303', 'amount', 2000, 'reason', 'Lunch')));
  if r #>> '{results,0,refused}' is distinct from 'dismissed_recently' or r #>> '{results,1,status}' <> 'suggested' then
    raise exception 'NOT REFUSED: a change the owner dismissed lately was suggested again: %', r;
  end if;
  if (select status from public.ai_app_proposals where id = late) <> 'expired' then
    raise exception 'a suggestion past its day was not marked expired';
  end if;
  raise notice 'only the owner decides, once; a dismissal holds for 14 days; a suggestion past its day expires';
end $$;

-- The gate: suggesting has its own switch and its own 60 a day; reads go on.
reset role;
update public.ai_app_access set allow_propose = false where user_id = '11111111-1111-4111-8111-111111111111';
set role app_user;
do $$
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999", "session_id": "55555555-5555-4555-8555-555555555555"}', true);
  if public.ai_app_propose('[1]') <> '{"refused": "suggesting_off"}' or public.ai_app_suggest_categories('[1]') <> '{"refused": "suggesting_off"}' then
    raise exception 'NOT REFUSED: a suggestion with suggesting off';
  end if;
  if public.ai_app_review(1) ? 'refused' or public.ai_app_suggestions('any', 1) ? 'refused' then
    raise exception 'suggesting off stopped a read';
  end if;
  raise notice 'with suggesting off, nothing is suggested and reads go on';
end $$;
reset role;
update public.ai_app_access set allow_propose = true where user_id = '11111111-1111-4111-8111-111111111111';
update public.ai_app_usage set calls = 59 where user_id = '11111111-1111-4111-8111-111111111111' and kind = 'propose';
set role app_user;
do $$
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999", "session_id": "55555555-5555-4555-8555-555555555555"}', true);
  if public.ai_app_propose('[1]') #>> '{results,0,refused}' is distinct from 'bad_change' then
    raise exception 'the 60th suggestion call was refused by the gate';
  end if;
  if public.ai_app_propose('[1]') <> '{"refused": "limit_reached"}' then raise exception 'NOT REFUSED: a 61st suggestion call'; end if;
  if public.ai_app_review(1) ? 'refused' then raise exception 'the suggestion count stopped a read'; end if;
  raise notice 'the 60th suggestion call goes through, the 61st is refused, and reads are counted apart';
end $$;
reset role;
-- At most 100 wait: a new target is refused, a waiting one may still be replaced.
update public.ai_app_usage set calls = 0 where user_id = '11111111-1111-4111-8111-111111111111';
insert into public.ai_app_proposals (user_id, client_id, kind, target, after, before, reason, target_key, expires_at)
  select '11111111-1111-4111-8111-111111111111', '99999999-9999-4999-8999-999999999999', 'add_category', '{}', '{}', '{}',
         'Filler', 'add:filler ' || n, now() + interval '1 day'
    from generate_series(1, 100 - (select count(*)::int from public.ai_app_proposals
                                    where user_id = '11111111-1111-4111-8111-111111111111' and status = 'pending')) n;
set role app_user;
do $$
declare
  r jsonb;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999", "session_id": "55555555-5555-4555-8555-555555555555"}', true);
  r := public.ai_app_propose(jsonb_build_array(
    jsonb_build_object('kind', 'move_category', 'category', 'cccccccc-0000-4000-8000-000000003901', 'to_list', 'bill', 'reason', 'One too many'),
    jsonb_build_object('kind', 'set_weekly_limit', 'category', 'cccccccc-0000-4000-8000-000000000303', 'amount', 2500, 'reason', 'Replaces')));
  if r #>> '{results,0,refused}' is distinct from 'too_many_waiting' or r #>> '{results,1,status}' <> 'suggested' or (r ->> 'waiting')::int <> 100 then
    raise exception 'NOT REFUSED: a 101st waiting suggestion: %', r;
  end if;
  raise notice 'at most 100 suggestions wait';
end $$;
reset role;
delete from public.ai_app_proposals where user_id = '11111111-1111-4111-8111-111111111111' and target_key like 'add:filler %';
update public.ai_app_usage set calls = 0 where user_id = '11111111-1111-4111-8111-111111111111';

-- Category suggestions on rows waiting in Review: 0018's conditions, as the
-- AI app's. Only the caller's own pending rows that nobody filled, only its
-- own categories not on Not spending, and never an approval.
insert into public.ingest_candidates
  (id, user_id, batch_id, account_id, posted_on, amount_cents, merchant, merchant_raw,
   category_id, category_source, status, dedupe_hash, dedupe_hash_v, source)
select v.id::uuid, '11111111-1111-4111-8111-111111111111', 'bbbbbbbb-0000-4000-8000-000000000001',
       'aaaaaaaa-0000-4000-8000-000000000001', '2026-09-20', -1234, v.m, v.m,
       v.cat::uuid, v.src::public.category_source, v.st::public.candidate_status,
       encode(sha256(convert_to(v.id, 'UTF8')), 'hex'), 1, 'card_csv'
  from (values
    ('eeeeeeee-0000-4000-8000-000000003911', 'OPEN 39', null, null, 'pending'),
    ('eeeeeeee-0000-4000-8000-000000003912', 'OWNER FILLED 39', 'cccccccc-0000-4000-8000-000000000001', 'user', 'pending'),
    ('eeeeeeee-0000-4000-8000-000000003913', 'RULE FILLED 39', 'cccccccc-0000-4000-8000-000000000001', 'merchant_rule', 'pending'),
    ('eeeeeeee-0000-4000-8000-000000003914', 'APPROVED 39', 'cccccccc-0000-4000-8000-000000000001', 'user', 'approved'),
    ('eeeeeeee-0000-4000-8000-000000003915', 'GUESSED 39', 'cccccccc-0000-4000-8000-000000000001', 'model', 'pending'),
    ('eeeeeeee-0000-4000-8000-000000003916', 'OPEN TOO 39', null, null, 'pending')
  ) as v(id, m, cat, src, st);
set role app_user;
do $$
declare
  groceries text := 'cccccccc-0000-4000-8000-000000003901';
  r jsonb;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999", "session_id": "55555555-5555-4555-8555-555555555555"}', true);
  if public.ai_app_suggest_categories('{}') <> '{"refused": "bad_change"}'
     or public.ai_app_suggest_categories((select jsonb_agg(n) from generate_series(1, 51) n)) <> '{"refused": "bad_change"}' then
    raise exception 'NOT REFUSED: no suggestions, or more than 50';
  end if;
  r := public.ai_app_suggest_categories(jsonb_build_array(
    jsonb_build_object('candidate', 'eeeeeeee-0000-4000-8000-000000003911', 'category', groceries),
    jsonb_build_object('candidate', 'eeeeeeee-0000-4000-8000-000000003912', 'category', groceries),
    jsonb_build_object('candidate', 'eeeeeeee-0000-4000-8000-000000003913', 'category', groceries),
    jsonb_build_object('candidate', 'eeeeeeee-0000-4000-8000-000000003914', 'category', groceries),
    jsonb_build_object('candidate', 'eeeeeeee-0000-4000-8000-000000003915', 'category', groceries),
    jsonb_build_object('candidate', 'eeeeeeee-0000-4000-8000-000000000186', 'category', groceries),
    jsonb_build_object('candidate', 'eeeeeeee-0000-4000-8000-000000003916', 'category', 'cccccccc-0000-4000-8000-000000003903'),
    jsonb_build_object('candidate', 'eeeeeeee-0000-4000-8000-000000003916', 'category', 'cccccccc-0000-4000-8000-000000003904'),
    jsonb_build_object('candidate', 'not an id', 'category', groceries),
    '42'::jsonb));
  if r <> '{"suggested": 2, "skipped": 8}' then raise exception 'the AI app''s category suggestions were not 0018''s: %', r; end if;
  raise notice 'an AI app suggests categories only where 0018 would';
end $$;
reset role;
do $$
begin
  if (select array_agg(coalesce(category_id::text, '-') || ' ' || coalesce(category_source::text, '-') || ' ' || status order by id)
        from public.ingest_candidates where id::text like 'eeeeeeee-0000-4000-8000-00000000391_')
     <> array['cccccccc-0000-4000-8000-000000003901 model pending', 'cccccccc-0000-4000-8000-000000000001 user pending',
              'cccccccc-0000-4000-8000-000000000001 merchant_rule pending', 'cccccccc-0000-4000-8000-000000000001 user approved',
              'cccccccc-0000-4000-8000-000000003901 model pending', '- - pending'] then
    raise exception 'an AI app''s category suggestion touched a row 0018 would not';
  end if;
  if (select category_id from public.ingest_candidates where id = 'eeeeeeee-0000-4000-8000-000000000186') is not null then
    raise exception 'NOT REFUSED: an AI app suggested a category on another user''s row';
  end if;
end $$;

-- Review's and a search's rows carry their ids.
set role app_user;
do $$
declare
  r jsonb;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "client_id": "99999999-9999-4999-8999-999999999999", "session_id": "55555555-5555-4555-8555-555555555555"}', true);
  r := public.ai_app_review(50);
  if not (r -> 'rows') @> '[{"id": "eeeeeeee-0000-4000-8000-000000003911", "merchant_raw": "OPEN 39"}]' then
    raise exception 'Review''s rows do not carry their ids: %', r;
  end if;
  r := public.ai_app_search('COSTCO 39', (now() at time zone 'UTC')::date - 30, (now() at time zone 'UTC')::date, null, null, null, null, 'any', 5);
  if not (r -> 'rows') @> '[{"id": "eeeeeeee-0000-4000-8000-000000003901"}]' then
    raise exception 'a search''s rows do not carry their ids: %', r;
  end if;
  raise notice 'Review''s and a search''s rows carry their ids';
end $$;
reset role;

-- 0039 changed the gate, ai_app_review and ai_app_search by those lines
-- and nothing else, and re-created the two level functions; every other
-- function is as it stood, with the same settings and grants.
do $$
declare
  r   record;
  p   record;
  row constant text := $x$    'rows', (select coalesce(jsonb_agg(jsonb_build_object($x$;
  n   int := 0;
begin
  for r in select * from verify.before_0039 loop
    select prosrc, prosecdef, provolatile, proconfig, proacl::text as acl into p from pg_proc where oid = r.fn::regprocedure;
    if not found then raise exception '% is gone after 0039', r.fn; end if;
    if r.fn = '_ai_app_gate(text)' then
      if p.prosrc <> replace(replace(replace(r.prosrc,
           E'not in (''read'', ''add'') then\n', E'not in (''read'', ''add'', ''propose'') then\n'),
           E'    return ''adding_off'';\n  end if;\n',
           E'    return ''adding_off'';\n  end if;\n  -- Suggesting changes has its own switch (0039).\n' ||
           E'  if p_kind = ''propose'' and not v_access.allow_propose then\n    return ''suggesting_off'';\n  end if;\n'),
           E'when ''read'' then 300 else 30 end\n', E'when ''read'' then 300 when ''propose'' then 60 else 30 end\n') then
        raise exception 'the gate is not its old body with 0039''s lines';
      end if;
      n := n + 1;
    elsif r.fn in ('ai_app_review(integer)', 'ai_app_search(text,date,date,bigint,bigint,text[],text,text,integer)') then
      if p.prosrc <> replace(r.prosrc, row || '''posted_on''', row || '''id'', r.id, ''posted_on''') or strpos(r.prosrc, row || '''posted_on''') = 0 then
        raise exception '% is not its old body with each row''s id', r.fn;
      end if;
      n := n + 1;
    elsif r.fn not in ('ai_app_updates_in()', 'ai_app_update_level()') and p.prosrc <> r.prosrc then
      raise exception '% changed in 0039', r.fn;
    end if;
    if (p.prosecdef, p.provolatile, p.proconfig, p.acl) is distinct from (r.prosecdef, r.provolatile, r.proconfig, r.acl) then
      raise exception '% changed its settings or grants in 0039', r.fn;
    end if;
  end loop;
  if n <> 3 then raise exception '0039''s three edited functions were not all checked'; end if;
  if strpos((select prosrc from pg_proc where oid = 'public._ai_app_gate(text)'::regprocedure), '''disconnected''') = 0
     or strpos((select prosrc from pg_proc where oid = 'public.ai_app_search(text,date,date,bigint,bigint,text[],text,text,integer)'::regprocedure), '(0036)') = 0 then
    raise exception '0039 lost an earlier update''s mark';
  end if;
  raise notice '0039 changed only those lines of the gate, Review and the search';
end $$;

-- Each AI-app update is read from its own mark: one taken away is read as
-- that update and every later one not in. 0038 is not one, and is skipped.
begin;
do $$
begin
  execute replace(pg_get_functiondef('public.ai_app_propose(jsonb)'::regprocedure), '(0039)', '(----)');
  if public.ai_app_updates_in() <> 37 then raise exception 'with 0039''s mark gone, ai_app_updates_in() says %, not 37', public.ai_app_updates_in(); end if;
  execute replace(pg_get_functiondef('public._ai_app_shown_shop(text)'::regprocedure), '(0036)', '(----)');
  if public.ai_app_updates_in() <> 35 then raise exception 'with 0036''s mark gone, ai_app_updates_in() says %, not 35', public.ai_app_updates_in(); end if;
  execute replace(pg_get_functiondef('public._ai_app_gate(text)'::regprocedure), '''disconnected''', '''gone''');
  if public.ai_app_updates_in() <> 29 then raise exception 'with 0030''s mark gone, ai_app_updates_in() says %, not 29', public.ai_app_updates_in(); end if;
end $$;
rollback;

-- 0039 refuses to run before 0037, and when it is already in. Its own
-- check, taken from the file.
\set paste_check_39 `sed -n '/^-- paste-order-check start$/,/^-- paste-order-check end$/p' supabase/migrations/0039_ai_apps_suggest_changes.sql`
begin;
set local verify.paste_check = :'paste_check_39';
do $$
declare
  pass int;
begin
  for pass in 1..3 loop
    if pass = 2 then
      drop function public.ai_app_propose(jsonb);
      create or replace function public.ai_app_updates_in() returns integer language sql stable as $f$ select 36 $f$;
    elsif pass = 3 then
      drop function public.ai_app_updates_in();
    end if;
    begin
      execute current_setting('verify.paste_check');
      raise exception 'NOT REFUSED: 0039 ran (pass %)', pass;
    exception when raise_exception then
      if sqlerrm not like (case pass when 1 then '0039 is already in; nothing to do' else 'Paste 0037 first%' end) then raise; end if;
    end;
  end loop;
  raise notice '0039 says it is already in, or to paste 0037 first';
end $$;
rollback;

-- 0038 leaves no '(0038)' mark; 0039 re-created ai_app_updates_in() with
-- a mark for each AI-app update, its own too (docs/adr/0012-mcp-server.md,
-- ADR 0013), so it answers 39 with everything in. The next AI-app update
-- re-creates it again with its own mark; when it does, change 39 here.
do $$
begin
  if public.ai_app_updates_in() <> 39 then
    raise exception 'ai_app_updates_in() says %, not 39: if a new AI-app update is in, see ADR 0012 and update this check', public.ai_app_updates_in();
  end if;
  if public.ai_app_update_level() <> 39 then raise exception 'ai_app_update_level() says %, not 39', public.ai_app_update_level(); end if;
  raise notice 'ai_app_updates_in() names the last AI-app update, 0039';
end $$;

-- The two levels the app reads name the last update in this folder: the
-- review fixes' schema_level() (0021) and the AI-app updates'
-- ai_app_updates_in() (0035), one of them its number. So a new update that
-- forgets to raise its own fails here. 0039 is an AI-app update and leaves
-- schema_level() at 38 (ADR 0013), so 0038 is still offered by it alone.
\set last_migration `ls supabase/migrations | tail -1 | cut -c1-4`
set verify.last_migration = :'last_migration';
set role app_user;
do $$
begin
  if greatest(public.schema_level(), public.ai_app_updates_in()) <> current_setting('verify.last_migration')::int then
    raise exception 'schema_level() answers % and ai_app_updates_in() %, but the last update is %',
      public.schema_level(), public.ai_app_updates_in(), current_setting('verify.last_migration');
  end if;
  if public.schema_level() <> 38 then raise exception 'schema_level() answers %, not 38: 0039 must not move it', public.schema_level(); end if;
  raise notice 'schema_level() and ai_app_updates_in() name the last update';
end $$;
reset role;
do $$
begin
  if has_function_privilege('anon', 'public.schema_level()', 'execute') then
    raise exception 'the anonymous role can call schema_level';
  end if;
end $$;
