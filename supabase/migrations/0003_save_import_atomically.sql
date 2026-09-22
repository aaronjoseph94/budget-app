-- 0003_save_import_atomically.sql
--
-- Saving an import becomes one statement instead of four round trips.
--
-- The client was doing this: insert a batch with zero counts, ask which hashes
-- already exist, insert the candidates, insert the unreadable lines, then go
-- back and update the counts. Five requests, no transaction around them, and
-- every failure in between leaves the database holding part of an import that
-- nothing will ever finish or clean up.
--
-- It also asked "which of these hashes do you already have?" by putting every
-- hash in a URL query string. Sixty-four hex characters times a few hundred
-- rows is past what a gateway will accept, so a large first import failed with
-- a transport error before a single row was written. That question is answered
-- here now, where it costs nothing to ask about ten thousand rows.
--
-- Forward-only: 0001 and 0002 are applied and are not edited.

begin;

-- ---------------------------------------------------------------------------
-- The queue may not hold the same charge twice
-- ---------------------------------------------------------------------------
-- transactions has had this since 0001, which kept the LEDGER honest. The
-- queue had nothing, so importing a file twice before approving anything put a
-- complete second copy of every row in front of the user — and the import
-- reported zero duplicates while doing it, because the only duplicate check
-- consulted transactions.
--
-- Partial, on pending only. A candidate the user REJECTED is a decision about
-- one import, not a permanent refusal of that charge: a full index would make
-- a rejected row unimportable forever, which is a worse failure than the one
-- being fixed. An approved candidate is already covered by the ledger's own
-- unique index, reached through ON CONFLICT at approval time.
create unique index ingest_candidates_pending_dedupe_key
  on public.ingest_candidates (user_id, dedupe_hash)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- save_import — one import, one transaction
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER (the default, stated because it matters): every statement
-- inside runs as the calling user, so the row-level security policies in 0001
-- apply exactly as they would to the client's own inserts. A SECURITY DEFINER
-- function here would quietly become a way around every one of them.
--
-- user_id is taken from auth.uid() rather than from a parameter. A parameter
-- would be a value the browser supplies, and although the RLS WITH CHECK would
-- reject a wrong one, it is better not to offer the question.
--
-- Counts are OBSERVED, not derived. The previous code computed
-- `deduped = parsed - inserted - rejected` and then relied on the CHECK
-- constraint `parsed = deduped + inserted + rejected` to catch a lost row.
-- Substitute one into the other and it reads `parsed = parsed`: an algebraic
-- identity that holds no matter how many rows went missing. Here `inserted` is
-- what the insert actually reported and `deduped` is what was actually skipped,
-- so the CHECK is once again capable of failing — which is the only reason to
-- have it.
create or replace function public.save_import(
  p_account_id  uuid,
  p_source      public.ingest_source,
  p_parsed      integer,
  p_rows        jsonb,
  p_unreadable  jsonb
)
returns table (batch_id uuid, parsed integer, deduped integer, inserted integer, rejected integer)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user      uuid := auth.uid();
  v_batch     uuid;
  v_offered   integer;
  v_inserted  integer;
  v_rejected  integer;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  -- jsonb_array_length rejects a non-array outright, which is the point: a
  -- malformed payload must fail here rather than import as zero rows.
  v_offered := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));

  insert into public.ingest_batches (user_id, account_id, source, parsed, deduped, inserted, rejected)
  values (v_user, p_account_id, p_source, 0, 0, 0, 0)
  returning id into v_batch;

  -- One insert for every accepted row. Two things remove a row from it, and
  -- both are the database's judgement rather than an earlier SELECT that could
  -- race with itself:
  --
  --   NOT EXISTS against transactions — already in the ledger, so it is not a
  --   decision waiting to be made.
  --   ON CONFLICT DO NOTHING on the pending index — already in the queue,
  --   including twice within this same payload.
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
    -- No ON CONFLICT here, deliberately. A reader that reported the same line
    -- twice is a reader with a bug, and the unique key on
    -- (batch_id, source_line) should say so. Swallowing it would not save the
    -- import anyway: the counts would then fail to balance a few lines below,
    -- and a constraint violation naming the real problem is worth more than a
    -- balance error naming a symptom.
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

  -- The CHECK on ingest_batches has already refused the update if these do not
  -- balance, which aborts this whole function and leaves no batch behind. This
  -- says so out loud for the case where the row was not matched at all.
  if not found then
    raise exception 'import counts could not be recorded' using errcode = '23514';
  end if;

  return query
    select v_batch, p_parsed, v_offered - v_inserted, v_inserted, v_rejected;
end;
$$;

comment on function public.save_import is
  'Insert one import — batch, candidates and unreadable lines — in a single transaction, returning the counts actually written.';

commit;
