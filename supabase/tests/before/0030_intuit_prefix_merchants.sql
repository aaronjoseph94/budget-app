-- Applied by scripts/verify-migrations.sh immediately BEFORE 0030 runs.
--
-- Rows written the way the app wrote them while 'IN*' was not a processor
-- prefix, so schema-assertions.sql can check what 0030 made of them. User 3
-- from before/0005, so the assertions' own users are left as they expect.
insert into public.accounts (id, user_id, name)
  values ('aaaaaaaa-0000-4000-8000-000000003001', '33333333-3333-4333-8333-333333333333', 'Card 3001');
insert into public.categories (id, user_id, name, kind) values
  ('cccccccc-0000-4000-8000-000000003001', '33333333-3333-4333-8333-333333333333', 'Home 3001', 'variable'),
  ('cccccccc-0000-4000-8000-000000003002', '33333333-3333-4333-8333-333333333333', 'Repairs 3002', 'variable');
insert into public.ingest_batches (id, user_id, account_id, source, parsed, deduped, inserted, rejected)
  values ('bbbbbbbb-0000-4000-8000-000000003001', '33333333-3333-4333-8333-333333333333',
          'aaaaaaaa-0000-4000-8000-000000003001', 'card_csv', 3, 0, 3, 0);
insert into public.ingest_candidates
  (id, user_id, batch_id, account_id, posted_on, amount_cents, merchant, merchant_raw,
   category_id, category_source, status, dedupe_hash, dedupe_hash_v, source)
values
  -- Approved, so in the ledger too, under the old name.
  ('eeeeeeee-0000-4000-8000-000000003001', '33333333-3333-4333-8333-333333333333', 'bbbbbbbb-0000-4000-8000-000000003001',
   'aaaaaaaa-0000-4000-8000-000000003001', '2025-12-01', -12000, 'IN*ACME PLUMBING', 'IN*ACME PLUMBING 4155551234',
   'cccccccc-0000-4000-8000-000000003001', 'user', 'approved', repeat('3', 62) || '01', 1, 'card_csv'),
  -- Waiting in Review.
  ('eeeeeeee-0000-4000-8000-000000003002', '33333333-3333-4333-8333-333333333333', 'bbbbbbbb-0000-4000-8000-000000003001',
   'aaaaaaaa-0000-4000-8000-000000003001', '2025-12-02', -3000, 'IN*ACME PLUMBING', 'in*acme plumbing',
   null, null, 'pending', repeat('3', 62) || '02', 1, 'card_csv'),
  -- 'IN*' after another prefix: the app still keeps it.
  ('eeeeeeee-0000-4000-8000-000000003003', '33333333-3333-4333-8333-333333333333', 'bbbbbbbb-0000-4000-8000-000000003001',
   'aaaaaaaa-0000-4000-8000-000000003001', '2025-12-03', -500, 'IN*KEEP', 'SQ *IN*KEEP',
   null, null, 'pending', repeat('3', 62) || '03', 1, 'card_csv');
insert into public.transactions
  (user_id, account_id, posted_on, amount_cents, merchant, merchant_raw, category_id, dedupe_hash, dedupe_hash_v, source, candidate_id)
values ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-0000-4000-8000-000000003001', '2025-12-01', -12000,
        'IN*ACME PLUMBING', 'IN*ACME PLUMBING 4155551234', 'cccccccc-0000-4000-8000-000000003001',
        repeat('3', 62) || '01', 1, 'card_csv', 'eeeeeeee-0000-4000-8000-000000003001');
-- The rule the approval taught, and an older one already under the new name.
insert into public.merchant_rules (user_id, match_merchant, category_id, created_at) values
  ('33333333-3333-4333-8333-333333333333', 'IN*ACME PLUMBING', 'cccccccc-0000-4000-8000-000000003001', '2025-12-05T00:00:00Z'),
  ('33333333-3333-4333-8333-333333333333', 'ACME PLUMBING', 'cccccccc-0000-4000-8000-000000003002', '2025-06-01T00:00:00Z'),
  ('33333333-3333-4333-8333-333333333333', 'IN*KEEP', 'cccccccc-0000-4000-8000-000000003002', '2025-12-05T00:00:00Z');
