-- 0002_unreadable_lines.sql
--
-- Where a line that never became a candidate goes.
--
-- CLAUDE.md requires every ingestion failure to become a visible review-queue
-- row with a readable reason. `ingest_candidates` cannot hold one: it requires
-- a date, an amount and a description, and a line rejected *because* its date
-- could not be read has none of them. Forcing it in would mean making those
-- columns nullable, which would in turn let an approved candidate reach the
-- ledger without a date.
--
-- So the two failures are kept apart, because they are different things:
--
--   ingest_candidates, status='rejected'  — a row that parsed and was then
--                                           refused (a duplicate, or by you)
--   ingest_unreadable_lines               — a line that never parsed at all
--
-- Forward-only: 0001 has been applied to the hosted project and is not edited.

begin;

create table public.ingest_unreadable_lines (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  batch_id     uuid not null references public.ingest_batches (id) on delete cascade,
  -- 1-based line in the source file, so the queue entry is actionable. The
  -- line number is all that is kept: the content could not be read, and
  -- storing the raw text would put an unparsed amount somewhere a log can
  -- reach it.
  source_line  integer not null check (source_line > 0),
  reason       public.rejection_reason not null,
  created_at   timestamptz not null default now(),
  unique (batch_id, source_line)
);

create index ingest_unreadable_lines_batch
  on public.ingest_unreadable_lines (batch_id);

alter table public.ingest_unreadable_lines enable row level security;

create policy ingest_unreadable_lines_own_rows on public.ingest_unreadable_lines
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

commit;
