-- 0007_statement_periods.sql
--
-- An import records the statement period it covers.
--
-- The Month screen will say "Statement imported up to Sep 7". That date has to
-- come from the statement itself. Taken from the latest row in the ledger
-- instead, a coffee typed by hand today would move it forward and claim a
-- statement had been read that never was (docs/workbook-plan.md §4).
--
-- Forward-only: 0001–0006 are applied and are not edited.

begin;

-- Nullable: a CSV export, a receipt photo and a typed entry carry no period,
-- and every batch written before this has none either. A period that is
-- given must run forwards.
alter table public.ingest_batches
  add column period_start date,
  add column period_end   date,
  add constraint ingest_batches_period_in_order
    check (period_start is null or period_end is null or period_start <= period_end);

-- save_import, also recording the period.
--
-- A second signature rather than a replacement: the 5-argument function stays,
-- because this migration may be applied before the app that calls this one is
-- deployed, and the app running until then must go on importing.
--
-- It calls the 5-argument function rather than repeating its body, so there is
-- one definition of how an import is saved, deduplicated, counted and
-- auto-approved, and this adds only the period. Both run in the caller's one
-- transaction: a period the CHECK refuses aborts the whole import, leaving no
-- batch and no candidate behind, just as a count that fails to balance does.
--
-- SECURITY DEFINER because the browser cannot UPDATE ingest_batches (0004);
-- search_path pinned, and the batch updated only where it is the caller's.
create or replace function public.save_import(
  p_account_id    uuid,
  p_source        public.ingest_source,
  p_parsed        integer,
  p_rows          jsonb,
  p_unreadable    jsonb,
  p_period_start  date,
  p_period_end    date
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
  v_saved record;
begin
  -- Checks the caller is signed in and owns the account, as it always has.
  select * into v_saved
    from public.save_import(p_account_id, p_source, p_parsed, p_rows, p_unreadable);

  update public.ingest_batches b
     set period_start = p_period_start,
         period_end   = p_period_end
   where b.id = v_saved.batch_id and b.user_id = auth.uid();

  if not found then
    raise exception 'statement period could not be recorded' using errcode = '23514';
  end if;

  return query
    select v_saved.batch_id, v_saved.parsed, v_saved.deduped, v_saved.inserted,
           v_saved.rejected, v_saved.auto_approved;
end;
$$;

-- Callable by a signed-in user, and by nobody else.
revoke all on function public.save_import(uuid, public.ingest_source, integer, jsonb, jsonb, date, date) from public, anon;
grant execute on function public.save_import(uuid, public.ingest_source, integer, jsonb, jsonb, date, date) to authenticated;

commit;
