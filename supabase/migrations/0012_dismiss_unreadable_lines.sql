-- 0012_dismiss_unreadable_lines.sql
--
-- A line an import could not read can be dealt with, and then leaves Review.
--
-- Review lists every line an import could not read, because CLAUDE.md says
-- no ingestion failure may end unseen. Nothing recorded that the owner had
-- found the line on the statement and typed it in, or decided it was not a
-- charge, so each one stayed until the screen aged it out after six weeks
-- (NOTICED N13). This records that it was dealt with, and when.
--
-- Forward-only: 0001–0011 are applied, or queued to be, and are not edited.

begin;

-- Null while the line waits. The line itself is kept: it is the record of
-- what the import could not read, and dismissing it is a decision, not a
-- deletion.
alter table public.ingest_unreadable_lines
  add column dismissed_at timestamptz;

-- What Review reads: the lines still waiting, newest import first.
create index ingest_unreadable_lines_waiting
  on public.ingest_unreadable_lines (user_id, created_at desc)
  where dismissed_at is null;

-- The browser has no UPDATE on this table (0004), which is right: the line's
-- position and reason are what the import found, and are not the browser's
-- to change. This changes one thing, the stamp, on one line, and only the
-- caller's.
--
-- SECURITY DEFINER, so as in 0004 and 0006: RLS does not apply inside it,
-- ownership is checked against auth.uid() in the UPDATE itself, and
-- search_path is pinned. Dismissing twice keeps the first time, so a double
-- tap on a slow connection changes nothing. A line that is not the caller's
-- is reported exactly as one that does not exist.
--
-- Plain CREATE, not CREATE OR REPLACE: pasting this file twice is refused.
create function public.dismiss_unreadable_line(p_line uuid)
returns void
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

  update public.ingest_unreadable_lines l
     set dismissed_at = coalesce(l.dismissed_at, now())
   where l.id = p_line and l.user_id = v_user;

  if not found then
    raise exception 'line not found' using errcode = '42501';
  end if;
end;
$$;

-- Callable by a signed-in user, and by nobody else.
revoke all on function public.dismiss_unreadable_line(uuid) from public, anon;
grant execute on function public.dismiss_unreadable_line(uuid) to authenticated;

commit;
