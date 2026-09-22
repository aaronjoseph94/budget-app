-- 0004_one_path_into_the_ledger.sql
--
-- Approval, rules that learn, budgets and the savings goal — and the change
-- that makes CONSTRAINTS.md's "there is exactly one path into transactions"
-- true of the database instead of true of one TypeScript file.
--
-- Before this, the browser held INSERT and UPDATE on every ingest table and on
-- the ledger itself. Row-level security stopped one user writing another's
-- rows; it did nothing to stop the signed-in user's own browser writing a row
-- straight into `transactions`, or flipping a model-categorised candidate to
-- approved. The approval invariant was a habit of ledger.ts.
--
-- Now every write that moves money into the ledger goes through a function
-- defined here, the direct grants are revoked, and a ledger row carries the id
-- of the candidate it was approved from.
--
-- Forward-only: 0001–0003 are applied and are not edited.

-- ADD VALUE runs outside the transaction below: Postgres will not let a value
-- added inside a transaction be used before that transaction commits, and
-- keeping it separate means a re-run of this file is harmless.
alter type public.ingest_source add value if not exists 'card_pdf';

begin;

-- ---------------------------------------------------------------------------
-- The approval hole
-- ---------------------------------------------------------------------------
-- The three CHECKs in 0001 all turn on `auto_approved_at`, a stamp the writer
-- chooses whether to set. A candidate with category_source='model',
-- status='approved' and no stamp passed every one of them. This closes it: a
-- model's category is never the category of an approved row. Approving a model
-- suggestion means the user adopted it, which records category_source='user'.
alter table public.ingest_candidates
  add constraint candidates_model_category_never_approved
  check (not (status = 'approved' and category_source = 'model'));

-- ---------------------------------------------------------------------------
-- Provenance
-- ---------------------------------------------------------------------------
-- Which candidate a ledger row was approved from. Unique, so one decision
-- cannot post twice. Nullable only for rows written before this migration;
-- every function below sets it.
alter table public.transactions
  add column candidate_id uuid unique
    references public.ingest_candidates (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Budgets and the goal — user input, never derived
-- ---------------------------------------------------------------------------
-- A weekly limit is a number the user chose. What was spent against it is
-- computed by packages/core on every read and stored nowhere (CLAUDE.md).
alter table public.categories
  add column weekly_budget_cents bigint check (weekly_budget_cents >= 0);

-- saved_cents is what the user says is in the account today — an input, like
-- a budget, not a figure this app computed.
create table public.savings_goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  name             public.ingested_text not null,
  target_cents     bigint not null check (target_cents > 0),
  saved_cents      bigint not null default 0 check (saved_cents >= 0),
  target_date      date,
  unit_cost_cents  bigint check (unit_cost_cents > 0),
  unit_label       public.ingested_text,
  created_at       timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.savings_goals enable row level security;

create policy savings_goals_own_rows on public.savings_goals
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Revoke the direct paths
-- ---------------------------------------------------------------------------
-- The browser keeps SELECT everywhere (RLS still scopes it to the owner) and
-- keeps DELETE on the ledger, so a mistaken row can be removed. It loses every
-- way of CREATING or CHANGING a ledger row, a candidate, a batch or an
-- unreadable-line record other than the functions below.
revoke insert, update on public.transactions from anon, authenticated;
revoke insert, update, delete on public.ingest_candidates from anon, authenticated;
revoke insert, update, delete on public.ingest_batches from anon, authenticated;
revoke insert, update, delete on public.ingest_unreadable_lines from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The functions — SECURITY DEFINER, and therefore careful
-- ---------------------------------------------------------------------------
-- DEFINER is what lets these write where the caller no longer can. It also
-- means row-level security does not apply inside them, so every one checks
-- ownership itself: the caller is auth.uid(), and every id the browser passes
-- is verified to belong to that caller before it is used. search_path is
-- pinned so a caller cannot shadow a table name with one of their own.

-- Post one approved candidate to the ledger. Internal: not granted to anyone.
create or replace function public._post_candidate(p_candidate uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  with posted as (
    insert into public.transactions (
      user_id, account_id, posted_on, amount_cents, merchant, merchant_raw,
      category_id, dedupe_hash, dedupe_hash_v, source, candidate_id
    )
    select c.user_id, c.account_id, c.posted_on, c.amount_cents, c.merchant, c.merchant_raw,
           c.category_id, c.dedupe_hash, c.dedupe_hash_v, c.source, c.id
      from public.ingest_candidates c
     where c.id = p_candidate and c.status = 'approved'
    on conflict (user_id, dedupe_hash) do nothing
    returning 1
  )
  select exists (select 1 from posted);
$$;

revoke all on function public._post_candidate(uuid) from public, anon, authenticated;

-- Dropped first: it gains an auto_approved column, and Postgres will not let
-- CREATE OR REPLACE change a function's return type.
drop function if exists public.save_import(uuid, public.ingest_source, integer, jsonb, jsonb);

-- save_import, now also applying the rules the user has taught.
--
-- An exact match on the normalised merchant — equality, never similarity —
-- is the ONLY thing that approves without a human (CLAUDE.md invariant 3).
-- Everything else waits in the queue.
create or replace function public.save_import(
  p_account_id  uuid,
  p_source      public.ingest_source,
  p_parsed      integer,
  p_rows        jsonb,
  p_unreadable  jsonb
)
returns table (
  batch_id uuid, parsed integer, deduped integer, inserted integer,
  rejected integer, auto_approved integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user      uuid := auth.uid();
  v_batch     uuid;
  v_offered   integer;
  v_inserted  integer;
  v_rejected  integer;
  v_auto      integer := 0;
  v_cand      uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.accounts a where a.id = p_account_id and a.user_id = v_user) then
    raise exception 'account not found' using errcode = '42501';
  end if;

  v_offered := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));

  insert into public.ingest_batches (user_id, account_id, source, parsed, deduped, inserted, rejected)
  values (v_user, p_account_id, p_source, 0, 0, 0, 0)
  returning id into v_batch;

  with offered as (
    select
      (r->>'posted_on')::date                        as posted_on,
      (r->>'amount_cents')::bigint                   as amount_cents,
      (r->>'merchant')::public.ingested_text         as merchant,
      (r->>'merchant_raw')::public.ingested_text     as merchant_raw,
      (r->>'dedupe_hash')::public.dedupe_digest      as dedupe_hash,
      (r->>'dedupe_hash_v')::integer                 as dedupe_hash_v
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r
  ),
  written as (
    insert into public.ingest_candidates (
      user_id, batch_id, account_id, posted_on, amount_cents,
      merchant, merchant_raw, dedupe_hash, dedupe_hash_v, source, status
    )
    select
      v_user, v_batch, p_account_id, o.posted_on, o.amount_cents,
      o.merchant, o.merchant_raw, o.dedupe_hash, o.dedupe_hash_v, p_source, 'pending'
    from offered o
    where not exists (
      select 1 from public.transactions t
      where t.user_id = v_user and t.dedupe_hash = o.dedupe_hash
    )
    on conflict (user_id, dedupe_hash) where status = 'pending' do nothing
    returning 1
  )
  select count(*)::integer into v_inserted from written;

  with lines as (
    select
      (u->>'source_line')::integer                  as source_line,
      (u->>'reason')::public.rejection_reason       as reason
    from jsonb_array_elements(coalesce(p_unreadable, '[]'::jsonb)) as u
  ),
  written as (
    insert into public.ingest_unreadable_lines (user_id, batch_id, source_line, reason)
    select v_user, v_batch, l.source_line, l.reason from lines l
    returning 1
  )
  select count(*)::integer into v_rejected from written;

  update public.ingest_batches
     set parsed   = p_parsed,
         deduped  = v_offered - v_inserted,
         inserted = v_inserted,
         rejected = v_rejected
   where id = v_batch;

  if not found then
    raise exception 'import counts could not be recorded' using errcode = '23514';
  end if;

  -- The rules. Only candidates from THIS batch, only an exact match.
  for v_cand in
    update public.ingest_candidates c
       set status = 'approved',
           category_id = r.category_id,
           category_source = 'merchant_rule',
           auto_approved_at = now()
      from public.merchant_rules r
     where c.batch_id = v_batch
       and c.status = 'pending'
       and r.user_id = v_user
       and r.match_merchant = c.merchant
    returning c.id
  loop
    if public._post_candidate(v_cand) then
      v_auto := v_auto + 1;
    end if;
  end loop;

  update public.merchant_rules r
     set last_matched_at = now()
   where r.user_id = v_user
     and exists (select 1 from public.ingest_candidates c
                  where c.batch_id = v_batch and c.category_source = 'merchant_rule'
                    and c.merchant = r.match_merchant);

  return query
    select v_batch, p_parsed, v_offered - v_inserted, v_inserted, v_rejected, v_auto;
end;
$$;

-- Approve one candidate into a category, and learn from it.
--
-- The conditional UPDATE and the ON CONFLICT insert CLAUDE.md prescribes,
-- inside one transaction. Previously they were two browser round trips, and a
-- failure between them left a candidate marked approved with no ledger row —
-- gone from the queue, absent from the ledger, unrecoverable from the app.
--
-- Returns 'approved', 'already_in_ledger' or 'already_handled'.
create or replace function public.approve_candidate(p_candidate uuid, p_category uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_merchant text;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.categories k where k.id = p_category and k.user_id = v_user) then
    raise exception 'category not found' using errcode = '42501';
  end if;

  update public.ingest_candidates c
     set status = 'approved', category_id = p_category, category_source = 'user'
   where c.id = p_candidate and c.user_id = v_user and c.status = 'pending'
  returning c.merchant into v_merchant;

  if v_merchant is null then
    return 'already_handled';
  end if;

  -- Learn. The latest human decision for a merchant is the rule for it.
  insert into public.merchant_rules (user_id, match_merchant, category_id)
  values (v_user, v_merchant, p_category)
  on conflict (user_id, match_merchant) do update set category_id = excluded.category_id;

  if public._post_candidate(p_candidate) then
    return 'approved';
  end if;
  return 'already_in_ledger';
end;
$$;

create or replace function public.reject_candidate(p_candidate uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  update public.ingest_candidates c
     set status = 'rejected', rejection_reason = 'user_rejected'
   where c.id = p_candidate and c.user_id = v_user and c.status = 'pending';
  return case when found then 'rejected' else 'already_handled' end;
end;
$$;

-- A purchase typed by hand — for cash, mostly. The person typing it is the
-- reviewer, so it is approved as it is written, through the same candidate row
-- and the same posting function as everything else.
--
-- Its dedupe hash is random, on purpose: two coffees typed on one day are two
-- coffees. The cost is that a card purchase typed here AND later imported from
-- a statement appears twice; the screen says to use this for cash.
create or replace function public.add_typed_transaction(
  p_account_id   uuid,
  p_posted_on    date,
  p_amount_cents bigint,
  p_merchant     text,
  p_merchant_raw text,
  p_category     uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_batch uuid;
  v_cand  uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.accounts a where a.id = p_account_id and a.user_id = v_user) then
    raise exception 'account not found' using errcode = '42501';
  end if;
  if not exists (select 1 from public.categories k where k.id = p_category and k.user_id = v_user) then
    raise exception 'category not found' using errcode = '42501';
  end if;

  insert into public.ingest_batches (user_id, account_id, source, parsed, deduped, inserted, rejected)
  values (v_user, p_account_id, 'typed', 1, 0, 1, 0)
  returning id into v_batch;

  insert into public.ingest_candidates (
    user_id, batch_id, account_id, posted_on, amount_cents, merchant, merchant_raw,
    category_id, category_source, status, dedupe_hash, dedupe_hash_v, source
  )
  values (
    v_user, v_batch, p_account_id, p_posted_on, p_amount_cents,
    p_merchant::public.ingested_text, p_merchant_raw::public.ingested_text,
    p_category, 'user', 'approved',
    encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), 1, 'typed'
  )
  returning id into v_cand;

  perform public._post_candidate(v_cand);
  return v_cand;
end;
$$;

-- Callable by a signed-in user, and by nobody else.
revoke all on function public.save_import(uuid, public.ingest_source, integer, jsonb, jsonb) from public, anon;
revoke all on function public.approve_candidate(uuid, uuid) from public, anon;
revoke all on function public.reject_candidate(uuid) from public, anon;
revoke all on function public.add_typed_transaction(uuid, date, bigint, text, text, uuid) from public, anon;
grant execute on function public.save_import(uuid, public.ingest_source, integer, jsonb, jsonb) to authenticated;
grant execute on function public.approve_candidate(uuid, uuid) to authenticated;
grant execute on function public.reject_candidate(uuid) to authenticated;
grant execute on function public.add_typed_transaction(uuid, date, bigint, text, text, uuid) to authenticated;

commit;
