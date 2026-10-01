-- Applied by scripts/verify-migrations.sh immediately BEFORE 0037 runs.
--
-- 0037 cleans up what AI apps could leave before 0031 and 0032: rows
-- hashed as a statement line would be (occurrence:<n>), and learned shops
-- an AI row taught. These are such rows, for a user of their own, made as
-- 0020's add and 0019's approve made them, so schema-assertions.sql can
-- check what 0037 did to each.
insert into auth.users (id) values ('37373737-3737-4737-8737-373737373737');
insert into public.accounts (id, user_id, name)
  values ('aaaaaaaa-0000-4000-8000-000000000037', '37373737-3737-4737-8737-373737373737', 'Old Card');
insert into public.categories (id, user_id, name, kind) values
  ('cccccccc-0000-4000-8000-000000003701', '37373737-3737-4737-8737-373737373737', 'Streaming', 'variable'),
  ('cccccccc-0000-4000-8000-000000003702', '37373737-3737-4737-8737-373737373737', 'Groceries', 'variable');
insert into public.ingest_batches (id, user_id, account_id, source, parsed, deduped, inserted, rejected)
  values ('bbbbbbbb-0000-4000-8000-000000000037', '37373737-3737-4737-8737-373737373737',
          'aaaaaaaa-0000-4000-8000-000000000037', 'ai_app', 0, 0, 0, 0);

-- 0020's hash, as it was: the statement's bytes, occurrence:<n>.
create function verify.old_hash(p_words text, p_amount bigint, p_occurrence int) returns text language sql as $$
  select encode(sha256(
    convert_to('v1', 'UTF8') || '\x00'::bytea || convert_to('aaaaaaaa-0000-4000-8000-000000000037', 'UTF8') || '\x00'::bytea ||
    convert_to('2026-09-15', 'UTF8') || '\x00'::bytea || convert_to(p_amount::text, 'UTF8') || '\x00'::bytea ||
    convert_to(p_words, 'UTF8') || '\x00'::bytea || convert_to('occurrence:' || p_occurrence, 'UTF8')), 'hex')
$$;

insert into public.ingest_candidates
  (id, user_id, batch_id, account_id, posted_on, amount_cents, merchant, merchant_raw,
   category_id, category_source, status, dedupe_hash, dedupe_hash_v, source)
values
  -- Waiting, in next month's subscription line's place.
  ('dddddddd-0000-4000-8000-000000003701', '37373737-3737-4737-8737-373737373737', 'bbbbbbbb-0000-4000-8000-000000000037',
   'aaaaaaaa-0000-4000-8000-000000000037', '2026-09-15', -1549, 'NETFLIX.COM', 'NETFLIX.COM',
   null, null, 'pending', verify.old_hash('NETFLIX.COM', -1549, 2), 1, 'ai_app'),
  -- Approved into Groceries: taught the rule NETFLIX.COM -> Groceries.
  ('dddddddd-0000-4000-8000-000000003702', '37373737-3737-4737-8737-373737373737', 'bbbbbbbb-0000-4000-8000-000000000037',
   'aaaaaaaa-0000-4000-8000-000000000037', '2026-09-15', -1549, 'NETFLIX.COM', 'NETFLIX.COM',
   'cccccccc-0000-4000-8000-000000003702', 'user', 'approved', verify.old_hash('NETFLIX.COM', -1549, 1), 1, 'ai_app'),
  -- Approved: taught a rule for a shop no statement ever had.
  ('dddddddd-0000-4000-8000-000000003703', '37373737-3737-4737-8737-373737373737', 'bbbbbbbb-0000-4000-8000-000000000037',
   'aaaaaaaa-0000-4000-8000-000000000037', '2026-09-15', -300, 'MADE UP SHOP', 'MADE UP SHOP',
   'cccccccc-0000-4000-8000-000000003702', 'user', 'approved', verify.old_hash('MADE UP SHOP', -300, 1), 1, 'ai_app'),
  -- Waiting with words not hashed by 0020's rule at all: left as it is.
  ('dddddddd-0000-4000-8000-000000003704', '37373737-3737-4737-8737-373737373737', 'bbbbbbbb-0000-4000-8000-000000000037',
   'aaaaaaaa-0000-4000-8000-000000000037', '2026-09-15', -999, 'OTHER', 'OTHER',
   null, null, 'pending', repeat('7', 64), 1, 'ai_app');

insert into public.transactions
  (user_id, account_id, posted_on, amount_cents, merchant, merchant_raw, category_id, dedupe_hash, dedupe_hash_v, source, candidate_id)
values
  ('37373737-3737-4737-8737-373737373737', 'aaaaaaaa-0000-4000-8000-000000000037', '2026-09-15', -1549, 'NETFLIX.COM', 'NETFLIX.COM',
   'cccccccc-0000-4000-8000-000000003702', verify.old_hash('NETFLIX.COM', -1549, 1), 1, 'ai_app', 'dddddddd-0000-4000-8000-000000003702'),
  ('37373737-3737-4737-8737-373737373737', 'aaaaaaaa-0000-4000-8000-000000000037', '2026-09-15', -300, 'MADE UP SHOP', 'MADE UP SHOP',
   'cccccccc-0000-4000-8000-000000003702', verify.old_hash('MADE UP SHOP', -300, 1), 1, 'ai_app', 'dddddddd-0000-4000-8000-000000003703'),
  -- Last month's real statement line: the owner filed NETFLIX.COM as Streaming.
  ('37373737-3737-4737-8737-373737373737', 'aaaaaaaa-0000-4000-8000-000000000037', '2026-08-15', -1549, 'NETFLIX.COM', 'NETFLIX.COM 8665797172 CA',
   'cccccccc-0000-4000-8000-000000003701', repeat('8', 64), 1, 'card_csv', null),
  -- A statement shop whose rule nothing from an AI app touched.
  ('37373737-3737-4737-8737-373737373737', 'aaaaaaaa-0000-4000-8000-000000000037', '2026-08-20', -2000, 'SAFEWAY', 'SAFEWAY 0042',
   'cccccccc-0000-4000-8000-000000003702', repeat('9', 64), 1, 'card_csv', null);

insert into public.merchant_rules (user_id, match_merchant, category_id) values
  ('37373737-3737-4737-8737-373737373737', 'NETFLIX.COM', 'cccccccc-0000-4000-8000-000000003702'),
  ('37373737-3737-4737-8737-373737373737', 'MADE UP SHOP', 'cccccccc-0000-4000-8000-000000003702'),
  ('37373737-3737-4737-8737-373737373737', 'SAFEWAY', 'cccccccc-0000-4000-8000-000000003702');
