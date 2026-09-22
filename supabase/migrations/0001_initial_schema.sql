-- 0001_initial_schema.sql
--
-- The ledger, the review queue, and the rules that learn.
--
-- Forward-only: once this has run against the hosted project it is never
-- edited. A correction is a new migration (CLAUDE.md).
--
-- Every table here enables row-level security and carries its own
-- `user_id = auth.uid()` policy in this same file, because a table that exists
-- for even one migration without RLS is a table any authenticated user can
-- read. There is one user today; that is not a reason to leave the door open.
--
-- The CHECK constraints below duplicate rules already enforced by the zod
-- schemas in packages/schema. That duplication is deliberate. A schema in the
-- client protects nothing against a write that never passed through it — a
-- direct SQL console, a future Edge Function, a bug. The database is where a
-- rule is true; zod is where it is convenient.

begin;

-- ---------------------------------------------------------------------------
-- Vocabularies
-- ---------------------------------------------------------------------------
-- Enums rather than text, so a typo is rejected at write time and the set
-- stays countable. These mirror packages/schema/src/enums.ts exactly; adding a
-- member there means adding it here, in a migration.

create type public.ingest_source as enum (
  'card_csv', 'card_xlsx', 'receipt_photo', 'typed'
);

create type public.candidate_status as enum (
  'pending', 'approved', 'rejected'
);

-- The field the approval invariant turns on. 'merchant_rule' is a
-- deterministic lookup and may auto-approve; 'model' is a judgment and may
-- never; 'user' is a decision a human already made.
create type public.category_source as enum (
  'merchant_rule', 'model', 'user'
);

create type public.rejection_reason as enum (
  'row_shape_mismatch',
  'missing_amount',
  'missing_date',
  'unparseable_amount',
  'unparseable_date',
  'missing_merchant',
  'invalid_merchant',
  'duplicate_within_batch',
  'already_in_ledger',
  'model_output_invalid',
  'user_rejected'
);

-- ---------------------------------------------------------------------------
-- Shared constraints
-- ---------------------------------------------------------------------------
-- A lowercase hex SHA-256, stored beside the version that produced it so the
-- hash's inputs can change later without guesswork about which rows are stale.
create domain public.dedupe_digest as text
  check (value ~ '^[0-9a-f]{64}$');

-- Text that arrived from a statement, a receipt, or a model. Bounded and free
-- of C0 control characters, mirroring IngestedTextSchema. Postgres text cannot
-- hold a NUL byte at all, which closes that case for free.
create domain public.ingested_text as text
  check (length(value) between 1 and 512 and value !~ '[\x01-\x1F\x7F]');

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
create table public.accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        public.ingested_text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.accounts enable row level security;

create policy accounts_own_rows on public.accounts
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        public.ingested_text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.categories enable row level security;

create policy categories_own_rows on public.categories
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- transactions — the ledger
-- ---------------------------------------------------------------------------
-- Money is bigint minor units. Never numeric, never float: a balance that
-- cannot be reconciled against a bank is not a balance.
--
-- amount_cents is SIGNED — outflows negative, inflows positive. The workbook
-- carried direction by which sheet a row sat on, which one table cannot do.
-- See docs/divergences.md D3.
--
-- category_id is NOT NULL. An uncategorised row is a decision nobody has made,
-- and the review queue is where those wait; in the ledger it would silently
-- join a total.
create table public.transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  account_id     uuid not null references public.accounts (id) on delete restrict,
  posted_on      date not null,
  amount_cents   bigint not null,
  merchant       public.ingested_text not null,
  merchant_raw   public.ingested_text not null,
  category_id    uuid not null references public.categories (id) on delete restrict,
  dedupe_hash    public.dedupe_digest not null,
  dedupe_hash_v  integer not null check (dedupe_hash_v > 0),
  source         public.ingest_source not null,
  created_at     timestamptz not null default now()
);

-- The index that makes a second import a no-op. Approval inserts with
-- ON CONFLICT (user_id, dedupe_hash) DO NOTHING, so a charge already in the
-- ledger is silently not re-added — and because the conflict target is this
-- index, "already there" is decided by the database, not by a prior SELECT
-- that could race with itself.
create unique index transactions_user_dedupe_key
  on public.transactions (user_id, dedupe_hash);

create index transactions_user_posted_on
  on public.transactions (user_id, posted_on desc);

alter table public.transactions enable row level security;

create policy transactions_own_rows on public.transactions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- ingest_batches — one import, and its arithmetic
-- ---------------------------------------------------------------------------
-- The counts must balance: parsed = deduped + inserted + rejected. Enforced
-- here rather than checked afterwards, so a batch that lost a row cannot be
-- written at all. A row that quietly disappeared between the file and the
-- queue is the failure this rule exists to make impossible.
create table public.ingest_batches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  account_id  uuid not null references public.accounts (id) on delete restrict,
  source      public.ingest_source not null,
  parsed      integer not null default 0 check (parsed >= 0),
  deduped     integer not null default 0 check (deduped >= 0),
  inserted    integer not null default 0 check (inserted >= 0),
  rejected    integer not null default 0 check (rejected >= 0),
  created_at  timestamptz not null default now(),
  constraint ingest_batches_counts_balance
    check (parsed = deduped + inserted + rejected)
);

alter table public.ingest_batches enable row level security;

create policy ingest_batches_own_rows on public.ingest_batches
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- ingest_candidates — the review queue, and the one path into the ledger
-- ---------------------------------------------------------------------------
-- Every ingested row lands here first, whatever it came from. The constraints
-- below are the approval invariant stated in CONSTRAINTS.md, made a property
-- of the database rather than a habit of the code.
create table public.ingest_candidates (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  batch_id          uuid not null references public.ingest_batches (id) on delete cascade,
  account_id        uuid not null references public.accounts (id) on delete restrict,
  posted_on         date not null,
  amount_cents      bigint not null,
  merchant          public.ingested_text not null,
  merchant_raw      public.ingested_text not null,
  category_id       uuid references public.categories (id) on delete restrict,
  category_source   public.category_source,
  status            public.candidate_status not null default 'pending',
  rejection_reason  public.rejection_reason,
  dedupe_hash       public.dedupe_digest not null,
  dedupe_hash_v     integer not null check (dedupe_hash_v > 0),
  source            public.ingest_source not null,
  auto_approved_at  timestamptz,
  created_at        timestamptz not null default now(),

  -- THE rule. A model may propose a category; it may never post one.
  constraint candidates_model_never_auto_approves
    check (not (category_source = 'model' and auto_approved_at is not null)),

  -- The backstop, which also implies the rule above. Kept separately so the
  -- constraint that fails names the reason a reader expects to see.
  constraint candidates_only_rule_match_auto_approves
    check (auto_approved_at is null or category_source = 'merchant_rule'),

  constraint candidates_auto_approved_is_approved
    check (auto_approved_at is null or status = 'approved'),

  -- A category and its provenance travel together; neither means anything
  -- alone, and a category with no source cannot be audited.
  constraint candidates_category_and_source_together
    check ((category_id is null) = (category_source is null)),

  constraint candidates_approved_has_category
    check (status <> 'approved' or category_id is not null),

  -- No ingestion failure ends in a log line alone: a rejected row says why,
  -- and a row that is not rejected carries no reason to confuse a reader.
  constraint candidates_rejected_has_reason
    check ((status = 'rejected') = (rejection_reason is not null))
);

-- The queue view: what is waiting, oldest first.
create index ingest_candidates_pending
  on public.ingest_candidates (user_id, created_at)
  where status = 'pending';

create index ingest_candidates_batch
  on public.ingest_candidates (batch_id);

alter table public.ingest_candidates enable row level security;

create policy ingest_candidates_own_rows on public.ingest_candidates
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- merchant_rules — the only thing allowed to categorise without a human
-- ---------------------------------------------------------------------------
-- The match is equality on an already normalised string: never a pattern,
-- never a prefix, never a similarity score. The unique constraint is what
-- makes "an exact match" meaningful — two rules for one merchant would make
-- auto-approval a choice, and a choice is a judgment.
create table public.merchant_rules (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  match_merchant   public.ingested_text not null,
  category_id      uuid not null references public.categories (id) on delete restrict,
  created_at       timestamptz not null default now(),
  last_matched_at  timestamptz,
  unique (user_id, match_merchant)
);

alter table public.merchant_rules enable row level security;

create policy merchant_rules_own_rows on public.merchant_rules
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Receipt storage — private, always
-- ---------------------------------------------------------------------------
-- A public bucket would put every receipt behind a guessable URL with no
-- authentication at all. Files live under a folder named for the owner's user
-- id and are read through signed URLs expiring in 60 seconds or less, which is
-- the application's job; this is the half the database can enforce.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy receipts_own_folder_read on storage.objects
  for select
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy receipts_own_folder_insert on storage.objects
  for insert
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy receipts_own_folder_update on storage.objects
  for update
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy receipts_own_folder_delete on storage.objects
  for delete
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;
