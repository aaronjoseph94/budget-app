-- 0026_goal_check_on_link.sql
--
-- A goal is checked against the Savings list only when it is linked
-- (backend-a-08).
--
-- 0013's trigger refuses a goal whose category is not on the Savings list.
-- It ran before every update of a goal, whatever changed, and nothing stops
-- a fund's category moving to another list (N52). After such a move every
-- change to that goal was refused: reordering (which can then stop part
-- way), pausing, marking it reached, retyping what is saved. The check
-- exists to stop linking a goal to a category off the Savings list, so it
-- now runs when a goal is made and when its category_id is set, and on
-- nothing else. The function itself is unchanged.
--
-- Forward-only: 0001–0025 are not edited.

-- paste-order-check start
do $$
begin
  -- Pasted again after it is in: refused before anything changes, so
  -- schema_level() never goes back (re-paste guard).
  if to_regprocedure('public.schema_level()') is not null then
    if public.schema_level() >= 26 then
      raise exception '0026 is already in; nothing to do';
    end if;
  end if;
  if to_regprocedure('public.schema_level()') is null or public.schema_level() < 25 then
    raise exception 'Paste 0025 first: 0026 needs 0025_ingested_text_format_characters.sql, which is not in yet';
  end if;
end $$;
-- paste-order-check end

begin;

drop trigger savings_goals_only_on_savings on public.savings_goals;

create trigger savings_goals_only_on_savings
  before insert or update of category_id on public.savings_goals
  for each row execute function public.savings_goals_only_on_savings();

create or replace function public.schema_level()
returns integer
language sql
immutable
as $$ select 26 $$;

commit;
