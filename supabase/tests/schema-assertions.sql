-- Assertions that the schema refuses what it claims to refuse.
--
-- Each block performs a write that MUST be rejected and raises if it succeeds,
-- so a constraint that silently stops biting fails this file rather than
-- passing it. CONSTRAINTS.md: a gate whose failure has not been observed is an
-- assumption, not a check.
--
-- Run by scripts/verify-migrations.sh against a throwaway database.

\set ON_ERROR_STOP on

create role app_user nologin;
grant usage on schema public, storage to app_user;
grant all on all tables in schema public to app_user;
grant all on all tables in schema storage to app_user;

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

insert into public.accounts (id, user_id, name)
  values ('aaaaaaaa-0000-4000-8000-000000000001',
          '11111111-1111-4111-8111-111111111111', 'Main Card');
insert into public.categories (id, user_id, name)
  values ('cccccccc-0000-4000-8000-000000000001',
          '11111111-1111-4111-8111-111111111111', 'Coffee');
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
    insert into public.categories (user_id,name) values (u, E'BAD\x1bNAME');
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

-- Row-level security, exercised as a non-superuser: superusers bypass it, so
-- asserting RLS while superuser would assert nothing.
set role app_user;

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
insert into public.transactions
  (user_id,account_id,posted_on,amount_cents,merchant,merchant_raw,category_id,
   dedupe_hash,dedupe_hash_v,source)
values ('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000001',
        '2025-03-04',-450,'COFFEE','COFFEE','cccccccc-0000-4000-8000-000000000001',
        repeat('f',64),1,'card_csv');

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

  -- And cannot write a row owned by someone else.
  begin
    insert into public.transactions
      (user_id,account_id,posted_on,amount_cents,merchant,merchant_raw,category_id,
       dedupe_hash,dedupe_hash_v,source)
    values ('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000001',
            '2025-03-05',-999,'STOLEN','STOLEN','cccccccc-0000-4000-8000-000000000001',
            repeat('9',64),1,'card_csv');
    raise exception 'RLS LEAK: another user wrote a row owned by someone else';
  exception when insufficient_privilege then null;
  end;

  -- A re-import of a charge already in the ledger adds nothing.
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
  insert into public.transactions
    (user_id,account_id,posted_on,amount_cents,merchant,merchant_raw,category_id,
     dedupe_hash,dedupe_hash_v,source)
  values ('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000001',
          '2025-03-04',-450,'COFFEE','COFFEE','cccccccc-0000-4000-8000-000000000001',
          repeat('f',64),1,'card_csv')
  on conflict (user_id, dedupe_hash) do nothing;
  select count(*) into seen from public.transactions;
  if seen <> 1 then raise exception 'a re-imported charge duplicated: % rows', seen; end if;

  raise notice 'RLS isolates, and a re-import is a no-op';
end $$;

reset role;

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
