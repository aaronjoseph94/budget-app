-- 0018_category_suggestions.sql
--
-- Review suggests categories (plan slice A21, §3.9 and §10.1; ADR 0008).
--
-- The AI may propose a category for a row waiting in Review. The proposal is
-- kept on the candidate as category_source = 'model', so it shows on every
-- device and is not asked for twice, and it can never go further on its own:
-- 0004's CHECK already refuses an approved candidate whose category came from
-- a model, and approve_candidate records 'user' when the owner taps Approve.
--
-- - suggest_candidate_categories(p) writes at most 200 proposals, each
--   {candidate, category}. It sets one only on the caller's own candidate
--   that is still pending and has no category or a model's, and only to the
--   caller's own category that is not on Not spending. It never touches a
--   row the owner or a learned rule filled. It returns how many it set.
-- - clear_candidate_suggestion(p_candidate) puts a proposal back to none,
--   only on the caller's own pending candidate whose category is a model's.
--   Any other row is left alone, and it returns false.
-- - Removing a category takes the proposals that name it with it: 0001's
--   foreign key is ON DELETE RESTRICT, and a guess nobody accepted must not
--   stop the owner removing a category.
--
-- Both functions are SECURITY DEFINER because 0004 took UPDATE on candidates
-- away from the browser, so each checks ownership itself, with search_path
-- pinned. Both are callable by a signed-in user and nobody else.
--
-- Nothing derived is stored: a category id and where it came from.
-- Forward-only: 0001–0017 are not edited.

begin;

create or replace function public.suggest_candidate_categories(p jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_set  integer;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if jsonb_typeof(p) is distinct from 'array' then
    raise exception 'suggestions must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p) > 200 then
    raise exception 'at most 200 suggestions at once' using errcode = '22023';
  end if;

  -- One proposal per candidate: UPDATE ... FROM with two would pick either.
  with offered as (
    select distinct on ((e->>'candidate')::uuid)
           (e->>'candidate')::uuid as candidate,
           (e->>'category')::uuid  as category
      from jsonb_array_elements(p) as e
  )
  update public.ingest_candidates c
     set category_id = o.category, category_source = 'model'
    from offered o
    join public.categories k on k.id = o.category
   where c.id = o.candidate
     and c.user_id = v_user
     and c.status = 'pending'
     and (c.category_id is null or c.category_source = 'model')
     and k.user_id = v_user
     and k.kind <> 'transfer';

  get diagnostics v_set = row_count;
  return v_set;
end;
$$;

create or replace function public.clear_candidate_suggestion(p_candidate uuid)
returns boolean
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
     set category_id = null, category_source = null
   where c.id = p_candidate
     and c.user_id = v_user
     and c.status = 'pending'
     and c.category_source = 'model';
  return found;
end;
$$;

-- Before the row goes, so the foreign key finds nothing left to restrict.
-- Only proposals: a row the owner or a rule filled still stops the delete.
create or replace function public._clear_suggestions_of_category()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.ingest_candidates c
     set category_id = null, category_source = null
   where c.category_id = old.id
     and c.user_id = old.user_id
     and c.status = 'pending'
     and c.category_source = 'model';
  return old;
end;
$$;

revoke all on function public._clear_suggestions_of_category() from public, anon, authenticated;

create trigger categories_clear_suggestions
  before delete on public.categories
  for each row execute function public._clear_suggestions_of_category();

revoke all on function public.suggest_candidate_categories(jsonb) from public, anon;
revoke all on function public.clear_candidate_suggestion(uuid) from public, anon;
grant execute on function public.suggest_candidate_categories(jsonb) to authenticated;
grant execute on function public.clear_candidate_suggestion(uuid) to authenticated;

commit;
