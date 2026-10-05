-- 0039_ai_apps_suggest_changes.sql
--
-- An AI app may suggest changes; only the owner applies them (ADR 0013;
-- docs/design/mcp/PROPOSALS.md §4).
--
-- 0019 and 0020 let an AI app's token read figures through a counted gate
-- and add a pending row to Review, nothing more. This lets it also leave
-- suggestions, and nothing it sends changes a budget, category, rule or
-- ledger row:
--
-- - ai_app_proposals: one row per suggested change, always written
--   'pending' by an AI app, with its target, the value it suggests, the
--   value it read as now, the AI app's reason (as ingested text), and the
--   day it expires (14 days on). Row-level security with the owner policy,
--   0019's three restrictive write policies and 0020's read-through-the-
--   gate policy, in this file. The browser may only read it.
-- - ai_app_propose(items): the AI app's one way to write it, SECURITY
--   DEFINER with search_path pinned. It calls the gate first (a new kind,
--   'propose', 60 calls a day, refused as suggesting_off when the owner's
--   new switch allow_propose is off), treats every argument as hostile,
--   checks every id is the caller's, reads every stored "before" itself,
--   takes client_id from the token, sets expires_at itself, and only ever
--   inserts pending rows. It may retire an earlier waiting suggestion for
--   the same target ('replaced') or one past its day ('expired'):
--   bookkeeping on suggestions, never on the budget. At most 100 wait.
-- - ai_app_suggestions(status, limit): the AI app reads back what it
--   suggested, through the gate, as the owner (SECURITY INVOKER).
-- - ai_app_suggest_categories(items): category suggestions on rows waiting
--   in Review, exactly as 0018's: only on the caller's own pending rows
--   whose category is empty or a model's, to the caller's own categories
--   not on Not spending, as category_source 'model'. The owner still
--   approves each row; 0018's own function stays closed to AI apps (0019).
-- - decide_suggestion(id, outcome): the owner's Apply or Dismiss mark.
--   Its first statement is 0019's guard, so an AI app's token can never
--   apply anything; the owner's change itself is made by the screen's own
--   write path, in the browser, before this mark (ADR 0013).
-- - ai_app_review and ai_app_search: each row now carries its id, so a
--   suggestion can name it. Edited in place, every earlier mark kept.
-- - ai_app_updates_in(): re-created with an explicit mark for each AI-app
--   update, 0030 to 0037 as 0035 reads them, 0038 left out (it is not one
--   and leaves no mark), and 0039's two: ai_app_propose carries "(0039)"
--   and the gate 'suggesting_off'. ai_app_update_level() answers 39.
--   schema_level() is not moved.
--
-- Pasted again with everything in, it is refused before anything changes;
-- pasted before 0037 it says to paste 0037 first. 0030 pasted again puts
-- back the gate without 'propose', and 0035 pasted again its own
-- ai_app_updates_in(), which reads 0038 as missing: either way
-- ai_app_updates_in() answers 37, One-time updates offers 0039 again, and
-- pasting it puts back only what was taken away. Every step here is safe
-- to run twice. A function body not as 0037 left it stops this update, and
-- nothing changes.
--
-- Numbering: the next number after 0038 (ADR 0012, "Numbering after the
-- merge"). Destroys nothing: it adds a table, a column and functions,
-- widens one CHECK, and re-creates functions in place.
--
-- Forward-only: 0001–0038 are not edited.

-- paste-order-check start
do $$
begin
  -- Two checks, not one with 'or': plpgsql plans an expression whole,
  -- so naming ai_app_updates_in() before it exists fails as "does not exist".
  if to_regprocedure('public.ai_app_updates_in()') is null then
    raise exception 'Paste 0037 first: 0039 needs 0030 to 0037, which are not all in yet';
  end if;
  if public.ai_app_updates_in() < 37 then
    raise exception 'Paste 0037 first: 0039 needs 0030 to 0037, which are not all in yet';
  end if;
  -- Read from 0039's own marks, so an earlier update pasted again over it
  -- lets it run again and put back what that one took away.
  if public.ai_app_updates_in() >= 39 then
    raise exception '0039 is already in; nothing to do';
  end if;
end $$;
-- paste-order-check end

begin;

-- ---------------------------------------------------------------------------
-- The switch and the count
-- ---------------------------------------------------------------------------
-- On whenever AI apps are on, until the owner turns it off. Pasted again,
-- the owner's choice stays.
alter table public.ai_app_access add column if not exists allow_propose boolean not null default true;

alter table public.ai_app_usage
  drop constraint if exists ai_app_usage_kind_check,
  add constraint ai_app_usage_kind_check check (kind in ('read', 'add', 'propose'));

-- ---------------------------------------------------------------------------
-- The suggestions
-- ---------------------------------------------------------------------------
-- Every before and after is a value as typed or stored, kept only to see
-- whether it changed and to tell the AI app what it suggested; no figure is
-- ever read from it.
create table if not exists public.ai_app_proposals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Which AI app: from the token, never from an argument.
  client_id   uuid not null,
  kind        text not null check (kind in ('set_budget', 'set_weekly_limit', 'set_bill', 'set_goal',
                'rename_category', 'add_category', 'move_category', 'recategorise', 'learn_shop')),
  target      jsonb not null check (jsonb_typeof(target) = 'object'),
  after       jsonb not null check (jsonb_typeof(after) = 'object'),
  before      jsonb not null check (jsonb_typeof(before) = 'object'),
  reason      public.ingested_text not null check (length(reason) between 1 and 300),
  target_key  text not null check (length(target_key) between 1 and 200),
  status      text not null default 'pending'
                check (status in ('pending', 'applied', 'dismissed', 'replaced', 'expired')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  decided_at  timestamptz,
  constraint ai_app_proposals_decided_once_not_pending check ((status = 'pending') = (decided_at is null))
);

-- One waiting suggestion per target.
create unique index if not exists ai_app_proposals_one_waiting on public.ai_app_proposals (user_id, target_key) where status = 'pending';
create index if not exists ai_app_proposals_by_owner on public.ai_app_proposals (user_id, status, created_at);

alter table public.ai_app_proposals enable row level security;

-- Each policy made once: pasted again, the ones there stay as they are.
do $$
declare
  missing constant text[] := array(
    select n from unnest(array['ai_app_proposals_own_rows', 'ai_apps_cannot_insert', 'ai_apps_cannot_update',
                               'ai_apps_cannot_delete', 'ai_apps_read_through_the_gate']) n
     where not exists (select 1 from pg_policies p
                        where p.schemaname = 'public' and p.tablename = 'ai_app_proposals' and p.policyname = n));
begin
  if 'ai_app_proposals_own_rows' = any (missing) then
    create policy ai_app_proposals_own_rows on public.ai_app_proposals
      for all
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
  -- 0019's rule, and 0020's read only through the gate, for this table too.
  if 'ai_apps_cannot_insert' = any (missing) then
    create policy ai_apps_cannot_insert on public.ai_app_proposals as restrictive for insert to authenticated
      with check ((select auth.jwt() ->> 'client_id') is null);
  end if;
  if 'ai_apps_cannot_update' = any (missing) then
    create policy ai_apps_cannot_update on public.ai_app_proposals as restrictive for update to authenticated
      using ((select auth.jwt() ->> 'client_id') is null) with check ((select auth.jwt() ->> 'client_id') is null);
  end if;
  if 'ai_apps_cannot_delete' = any (missing) then
    create policy ai_apps_cannot_delete on public.ai_app_proposals as restrictive for delete to authenticated
      using ((select auth.jwt() ->> 'client_id') is null);
  end if;
  if 'ai_apps_read_through_the_gate' = any (missing) then
    create policy ai_apps_read_through_the_gate on public.ai_app_proposals as restrictive for select to authenticated
      using ((select auth.jwt() ->> 'client_id') is null or (select current_setting('budget.ai_app_read', true)) = 'on');
  end if;
end $$;

-- The browser reads them; only the functions below write them.
revoke all on public.ai_app_proposals from anon, authenticated;
grant select on public.ai_app_proposals to authenticated;

-- ---------------------------------------------------------------------------
-- The gate, edited in place: the new kind, its switch and its count
-- ---------------------------------------------------------------------------
do $$
declare
  f     constant regprocedure := 'public._ai_app_gate(text)';
  edits constant text[][] := array[
    array[E'  if p_kind is null or p_kind not in (''read'', ''add'') then\n',
          E'  if p_kind is null or p_kind not in (''read'', ''add'', ''propose'') then\n'],
    array[E'  if p_kind = ''add'' and not v_access.allow_add then\n    return ''adding_off'';\n  end if;\n',
          E'  if p_kind = ''add'' and not v_access.allow_add then\n    return ''adding_off'';\n  end if;\n' ||
          E'  -- Suggesting changes has its own switch (0039).\n' ||
          E'  if p_kind = ''propose'' and not v_access.allow_propose then\n    return ''suggesting_off'';\n  end if;\n'],
    array[E'    where u.calls < case p_kind when ''read'' then 300 else 30 end\n',
          E'    where u.calls < case p_kind when ''read'' then 300 when ''propose'' then 60 else 30 end\n']];
  src text;
  new text;
  def text;
  i   int;
begin
  select p.prosrc into src from pg_proc p where p.oid = f;
  -- Pasted again with the gate as 0039 left it: nothing to change.
  if strpos(src, '''suggesting_off''') > 0 then
    return;
  end if;
  new := src;
  for i in 1 .. array_length(edits, 1) loop
    -- Each expected line is there exactly once, or nothing changes.
    if (length(new) - length(replace(new, edits[i][1], ''))) / length(edits[i][1]) <> 1 then
      raise exception 'could not change _ai_app_gate: it is not as 0030 left it';
    end if;
    new := replace(new, edits[i][1], edits[i][2]);
  end loop;
  def := pg_get_functiondef(f);
  if strpos(def, '$function$' || src || '$function$') = 0 then
    raise exception 'could not change _ai_app_gate';
  end if;
  execute replace(def, '$function$' || src || '$function$', '$function$' || new || '$function$');
end $$;

-- ---------------------------------------------------------------------------
-- Checking one change
-- ---------------------------------------------------------------------------
-- Words an AI app writes: as 0020 and 0034 hold what it adds, every
-- character visible, trimmed, within a length. Reads nothing.
create or replace function public._ai_app_words_shown(p_text text, p_most integer)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_text is not null and length(p_text) between 1 and p_most and p_text = btrim(p_text)
     and p_text !~ '[\x01-\x1F\x7F-\x9F\u2028-\u202E\u2066-\u2069]'
     and p_text !~ '[\u00AD\u061C\u180E\u200B-\u200F\u2060-\u2065\uFEFF]'
$$;

-- A JSON number that is whole and within [p_low, p_high]. Reads nothing.
-- A case, not an 'and': only a number is ever read as one.
create or replace function public._ai_app_whole(p jsonb, p_low bigint, p_high bigint)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when jsonb_typeof(p) = 'number'
              then (p #>> '{}')::numeric = trunc((p #>> '{}')::numeric) and (p #>> '{}')::numeric between p_low and p_high
              else false end
$$;

-- A JSON string that is an id, as an id; null for anything else. Reads nothing.
create or replace function public._ai_app_id(p jsonb)
returns uuid
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when jsonb_typeof(p) = 'string'
                   and (p #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (p #>> '{}')::uuid end
$$;

-- One change, as an AI app sent it, checked as hostile: {refused: code},
-- or what ai_app_propose stores ({target, after, before, key}). Each id
-- must be the caller's; every stored before is read here, and only the
-- two the engine works out (a budget and a monthly amount in effect) come
-- from the caller, checked for shape: Review never trusts a before, and a
-- wrong one can only make a card stale. Internal: granted to nobody.
create or replace function public._ai_app_proposal(p_user uuid, p_today date, p jsonb)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_kind   text;
  v_need   text[];
  v_may    text[] := '{}';
  v_first  date := date_trunc('month', p_today)::date;
  v_month  date;
  v_date   date;
  v_cat    public.categories;
  v_goal   public.savings_goals;
  v_txn    public.transactions;
  v_rule   uuid;
  v_target jsonb;
  v_after  jsonb;
  v_before jsonb;
  v_key    text;
begin
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p -> 'kind') is distinct from 'string' then
    return '{"refused": "bad_change"}';
  end if;
  v_kind := p ->> 'kind';
  -- Exactly the keys each kind takes.
  v_need := case v_kind
    when 'set_budget' then '{kind,category,month,applies,amount,before,reason}'::text[]
    when 'set_weekly_limit' then '{kind,category,amount,reason}'::text[]
    when 'set_bill' then '{kind,category,month,amount,due_day,before,reason}'::text[]
    when 'set_goal' then '{kind,goal,reason}'::text[]
    when 'rename_category' then '{kind,category,new_name,reason}'::text[]
    when 'add_category' then '{kind,name,list,reason}'::text[]
    when 'move_category' then '{kind,category,to_list,reason}'::text[]
    when 'recategorise' then '{kind,transaction,category,reason}'::text[]
    when 'learn_shop' then '{kind,transaction,category,reason}'::text[]
  end;
  if v_kind = 'set_goal' then v_may := '{target,target_date}'; end if;
  if v_need is null
     or exists (select 1 from unnest(v_need) k where not p ? k)
     or exists (select 1 from jsonb_object_keys(p) k where k <> all (v_need || v_may))
     or (v_kind = 'set_goal' and not (p ? 'target' or p ? 'target_date')) then
    return '{"refused": "bad_change"}';
  end if;
  if jsonb_typeof(p -> 'reason') is distinct from 'string' or not public._ai_app_words_shown(p ->> 'reason', 300) then
    return '{"refused": "bad_words"}';
  end if;

  -- The rows named, each only if it is the caller's.
  if p ? 'category' then
    select * into v_cat from public.categories k where k.id = public._ai_app_id(p -> 'category') and k.user_id = p_user;
    if not found then return '{"refused": "unknown_category"}'; end if;
  end if;
  if p ? 'transaction' then
    select * into v_txn from public.transactions t where t.id = public._ai_app_id(p -> 'transaction') and t.user_id = p_user;
    if not found then return '{"refused": "unknown_transaction"}'; end if;
  end if;
  if p ? 'goal' then
    select * into v_goal from public.savings_goals g where g.id = public._ai_app_id(p -> 'goal') and g.user_id = p_user;
    if not found then return '{"refused": "unknown_goal"}'; end if;
  end if;
  -- A month: its first day, from this month to twelve months ahead.
  if p ? 'month' then
    if jsonb_typeof(p -> 'month') is distinct from 'string' or (p ->> 'month') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-01$' then
      return '{"refused": "bad_month"}';
    end if;
    v_month := (p ->> 'month')::date;
    if v_month < v_first or v_month > (v_first + interval '12 months')::date then
      return '{"refused": "bad_month"}';
    end if;
  end if;

  case v_kind
  when 'set_budget' then
    if v_cat.kind = 'transfer' then return '{"refused": "wrong_list"}'; end if;
    if jsonb_typeof(p -> 'applies') is distinct from 'string' or (p ->> 'applies') not in ('onward', 'only') then
      return '{"refused": "bad_change"}';
    end if;
    if jsonb_typeof(p -> 'amount') <> 'null' and not public._ai_app_whole(p -> 'amount', 0, 10000000) then
      return '{"refused": "bad_amount"}';
    end if;
    if jsonb_typeof(p -> 'before') is distinct from 'object' or (select count(*) from jsonb_object_keys(p -> 'before')) <> 1
       or not (p -> 'before' ? 'cents')
       or (jsonb_typeof(p #> '{before,cents}') <> 'null' and not public._ai_app_whole(p #> '{before,cents}', 0, 9007199254740991)) then
      return '{"refused": "bad_change"}';
    end if;
    v_target := jsonb_build_object('category_id', v_cat.id, 'month', v_month, 'applies', p ->> 'applies');
    v_after := jsonb_build_object('cents', p -> 'amount');
    v_before := jsonb_build_object('cents', p #> '{before,cents}');
    v_key := 'budget:' || v_cat.id || ':' || v_month;
  when 'set_weekly_limit' then
    if v_cat.kind = 'transfer' then return '{"refused": "wrong_list"}'; end if;
    if jsonb_typeof(p -> 'amount') <> 'null' and not public._ai_app_whole(p -> 'amount', 0, 10000000) then
      return '{"refused": "bad_amount"}';
    end if;
    v_target := jsonb_build_object('category_id', v_cat.id);
    v_after := jsonb_build_object('cents', p -> 'amount');
    v_before := jsonb_build_object('cents', v_cat.weekly_budget_cents);
    v_key := 'weekly:' || v_cat.id;
  when 'set_bill' then
    if v_cat.kind not in ('bill', 'debt', 'subscription') then return '{"refused": "wrong_list"}'; end if;
    if jsonb_typeof(p -> 'amount') <> 'null' and not public._ai_app_whole(p -> 'amount', 0, 10000000) then
      return '{"refused": "bad_amount"}';
    end if;
    if jsonb_typeof(p -> 'due_day') <> 'null' and not public._ai_app_whole(p -> 'due_day', 1, 31) then
      return '{"refused": "bad_change"}';
    end if;
    if jsonb_typeof(p -> 'before') is distinct from 'object' or (select count(*) from jsonb_object_keys(p -> 'before')) <> 2
       or not (p -> 'before' ?& '{cents,due_day}')
       or (jsonb_typeof(p #> '{before,cents}') <> 'null' and not public._ai_app_whole(p #> '{before,cents}', 0, 9007199254740991))
       or (jsonb_typeof(p #> '{before,due_day}') <> 'null' and not public._ai_app_whole(p #> '{before,due_day}', 1, 31)) then
      return '{"refused": "bad_change"}';
    end if;
    v_target := jsonb_build_object('category_id', v_cat.id, 'month', v_month);
    v_after := jsonb_build_object('cents', p -> 'amount', 'due_day', p -> 'due_day');
    v_before := p -> 'before';
    v_key := 'bill:' || v_cat.id || ':' || v_month;
  when 'set_goal' then
    if p ? 'target' and not public._ai_app_whole(p -> 'target', 1, 99999999) then
      return '{"refused": "bad_amount"}';
    end if;
    if p ? 'target_date' and jsonb_typeof(p -> 'target_date') <> 'null' then
      if jsonb_typeof(p -> 'target_date') <> 'string' or (p ->> 'target_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        return '{"refused": "bad_date"}';
      end if;
      begin
        v_date := (p ->> 'target_date')::date;
      exception when invalid_datetime_format or datetime_field_overflow then
        return '{"refused": "bad_date"}';
      end;
      if v_date <= p_today or v_date >= date '2100-01-01' then return '{"refused": "bad_date"}'; end if;
    end if;
    -- The part not suggested stays as stored.
    v_target := jsonb_build_object('goal_id', v_goal.id);
    v_after := jsonb_build_object(
      'target_cents', case when p ? 'target' then p -> 'target' else to_jsonb(v_goal.target_cents) end,
      'target_date', case when p ? 'target_date' then to_jsonb(v_date) else to_jsonb(v_goal.target_date) end);
    v_before := jsonb_build_object('target_cents', v_goal.target_cents, 'target_date', v_goal.target_date);
    v_key := 'goal:' || v_goal.id;
  when 'rename_category' then
    if jsonb_typeof(p -> 'new_name') is distinct from 'string' or not public._ai_app_words_shown(p ->> 'new_name', 60) then
      return '{"refused": "bad_words"}';
    end if;
    if (p ->> 'new_name') = v_cat.name then return '{"refused": "same_as_now"}'; end if;
    if exists (select 1 from public.categories k where k.user_id = p_user and k.name = p ->> 'new_name') then
      return '{"refused": "name_taken"}';
    end if;
    v_target := jsonb_build_object('category_id', v_cat.id);
    v_after := jsonb_build_object('name', p ->> 'new_name');
    v_before := jsonb_build_object('name', v_cat.name);
    v_key := 'name:' || v_cat.id;
  when 'add_category' then
    if jsonb_typeof(p -> 'name') is distinct from 'string' or not public._ai_app_words_shown(p ->> 'name', 60) then
      return '{"refused": "bad_words"}';
    end if;
    if jsonb_typeof(p -> 'list') is distinct from 'string'
       or (p ->> 'list') not in ('variable', 'bill', 'debt', 'subscription', 'income', 'savings', 'transfer') then
      return '{"refused": "bad_change"}';
    end if;
    if exists (select 1 from public.categories k where k.user_id = p_user and k.name = p ->> 'name') then
      return '{"refused": "name_taken"}';
    end if;
    v_target := jsonb_build_object('name', p ->> 'name', 'list', p ->> 'list');
    v_after := v_target;
    v_before := '{"exists": false}';
    v_key := 'add:' || (p ->> 'name');
  when 'move_category' then
    if jsonb_typeof(p -> 'to_list') is distinct from 'string'
       or (p ->> 'to_list') not in ('variable', 'bill', 'debt', 'subscription', 'income', 'savings', 'transfer') then
      return '{"refused": "bad_change"}';
    end if;
    v_target := jsonb_build_object('category_id', v_cat.id);
    v_after := jsonb_build_object('list', p ->> 'to_list');
    v_before := jsonb_build_object('list', v_cat.kind);
    v_key := 'list:' || v_cat.id;
  when 'recategorise' then
    v_target := jsonb_build_object('transaction_id', v_txn.id);
    v_after := jsonb_build_object('category_id', v_cat.id);
    v_before := jsonb_build_object('category_id', v_txn.category_id);
    v_key := 'txn:' || v_txn.id;
  when 'learn_shop' then
    -- An AI app's row learns nothing (0032), so this could only move it.
    if v_txn.source = 'ai_app' then return '{"refused": "ai_row_not_learned"}'; end if;
    select r.category_id into v_rule from public.merchant_rules r where r.user_id = p_user and r.match_merchant = v_txn.merchant;
    v_target := jsonb_build_object('transaction_id', v_txn.id);
    v_after := jsonb_build_object('category_id', v_cat.id);
    v_before := jsonb_build_object('category_id', v_txn.category_id, 'rule_category_id', v_rule);
    v_key := 'txn:' || v_txn.id;
  end case;

  if v_kind = 'learn_shop' then
    if v_txn.category_id = v_cat.id and v_rule is not distinct from v_cat.id then return '{"refused": "same_as_now"}'; end if;
  elsif v_kind <> 'add_category' and v_after = v_before then
    return '{"refused": "same_as_now"}';
  end if;
  return jsonb_build_object('target', v_target, 'after', v_after, 'before', v_before, 'key', v_key);
end;
$$;

revoke all on function public._ai_app_words_shown(text, integer) from public, anon, authenticated;
revoke all on function public._ai_app_whole(jsonb, bigint, bigint) from public, anon, authenticated;
revoke all on function public._ai_app_id(jsonb) from public, anon, authenticated;
revoke all on function public._ai_app_proposal(uuid, date, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The AI app's suggestions
-- ---------------------------------------------------------------------------
-- Written for a caller that is not the server: every argument is hostile.
-- Expected refusals are answers. Each change stands alone: one refused
-- leaves the others. Returns {results: [{index, status, id?, refused?,
-- before?, after?}], waiting}.
create or replace function public.ai_app_propose(p_items jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
-- (0039) Suggested changes: pending rows only, which the owner applies or dismisses.
declare
  v_user    uuid := auth.uid();
  v_refused text := public._ai_app_gate('propose');
  v_today   date;
  v_item    jsonb;
  v_index   integer := 0;
  v_check   jsonb;
  v_seen    text[] := '{}';
  v_old     public.ai_app_proposals;
  v_had     boolean;
  v_id      uuid;
  v_results jsonb := '[]';
begin
  if v_refused is not null then
    return jsonb_build_object('refused', v_refused);
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 20 then
    return jsonb_build_object('refused', 'bad_change');
  end if;
  v_today := public._ai_app_today();
  -- A waiting suggestion past its day is expired.
  update public.ai_app_proposals s set status = 'expired', decided_at = now()
   where s.user_id = v_user and s.status = 'pending' and s.expires_at <= now();

  for v_item in select e from jsonb_array_elements(p_items) as e loop
    v_check := public._ai_app_proposal(v_user, v_today, v_item);
    if not v_check ? 'refused' then
      if (v_check ->> 'key') = any (v_seen) then
        v_check := '{"refused": "duplicate_in_call"}';
      elsif exists (select 1 from public.ai_app_proposals s
                     where s.user_id = v_user and s.target_key = v_check ->> 'key' and s.status = 'dismissed'
                       and s.after = v_check -> 'after' and s.decided_at > now() - interval '14 days') then
        -- The owner said no to exactly this lately: not asked again every chat.
        v_seen := v_seen || (v_check ->> 'key');
        v_check := '{"refused": "dismissed_recently"}';
      else
        v_seen := v_seen || (v_check ->> 'key');
        select * into v_old from public.ai_app_proposals s
         where s.user_id = v_user and s.target_key = v_check ->> 'key' and s.status = 'pending';
        v_had := found;
        if v_had and v_old.after = v_check -> 'after' then
          v_check := jsonb_build_object('status', 'already_suggested', 'id', v_old.id, 'before', v_old.before, 'after', v_old.after);
        elsif not v_had and (select count(*) from public.ai_app_proposals s where s.user_id = v_user and s.status = 'pending') >= 100 then
          v_check := '{"refused": "too_many_waiting"}';
        else
          if v_had then
            update public.ai_app_proposals s set status = 'replaced', decided_at = now() where s.id = v_old.id;
          end if;
          insert into public.ai_app_proposals (user_id, client_id, kind, target, after, before, reason, target_key, expires_at)
          values (v_user, (auth.jwt() ->> 'client_id')::uuid, v_item ->> 'kind', v_check -> 'target', v_check -> 'after',
                  v_check -> 'before', (v_item ->> 'reason')::public.ingested_text, v_check ->> 'key', now() + interval '14 days')
          on conflict (user_id, target_key) where status = 'pending' do nothing
          returning id into v_id;
          if v_id is null then
            -- Another call put one there first: that one waits.
            select s.id into v_id from public.ai_app_proposals s
             where s.user_id = v_user and s.target_key = v_check ->> 'key' and s.status = 'pending';
            v_check := jsonb_build_object('status', 'already_suggested', 'id', v_id, 'before', v_check -> 'before', 'after', v_check -> 'after');
          else
            v_check := jsonb_build_object('status', 'suggested', 'id', v_id, 'before', v_check -> 'before', 'after', v_check -> 'after');
          end if;
          v_id := null;
        end if;
      end if;
    end if;
    if v_check ? 'refused' then
      v_check := jsonb_build_object('status', 'refused') || v_check;
    end if;
    v_results := v_results || jsonb_build_array(jsonb_build_object('index', v_index) || v_check);
    v_index := v_index + 1;
  end loop;

  return jsonb_build_object('results', v_results,
    'waiting', (select count(*) from public.ai_app_proposals s where s.user_id = v_user and s.status = 'pending'));
end;
$$;

-- What the AI app suggested, newest first, with the names they need. A
-- waiting row past its day reads as expired. SECURITY INVOKER: an AI app
-- reads these rows only after the gate, as the owner.
create or replace function public.ai_app_suggestions(p_status text, p_limit integer)
returns jsonb
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_refused text := public._ai_app_gate('read');
  v         jsonb;
begin
  if v_refused is not null then
    return jsonb_build_object('refused', v_refused);
  end if;
  if p_limit is null or p_limit not between 1 and 50
     or p_status is null or p_status not in ('pending', 'applied', 'dismissed', 'replaced', 'expired', 'any') then
    raise exception 'a status and at most 50 rows' using errcode = '22023';
  end if;
  with s as (
    select p.*, case when p.status = 'pending' and p.expires_at <= now() then 'expired' else p.status end as shown
      from public.ai_app_proposals p where p.user_id = v_user
  ), picked as (
    select * from s where p_status = 'any' or s.shown = p_status order by s.created_at desc, s.id limit p_limit
  ), named as (
    select x.id from picked r,
      lateral (values (r.target ->> 'category_id'), (r.after ->> 'category_id'), (r.before ->> 'category_id'),
                      (r.before ->> 'rule_category_id'), (r.target ->> 'goal_id'), (r.target ->> 'transaction_id')) as x(id)
     where x.id is not null
  )
  select jsonb_build_object(
    'today', public._ai_app_today(),
    'waiting', (select count(*) from s where s.shown = 'pending'),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'status', r.shown, 'client_id', r.client_id,
                      'target', r.target, 'after', r.after, 'before', r.before, 'reason', r.reason,
                      'created_at', r.created_at, 'decided_at', r.decided_at, 'expires_at', r.expires_at)
                    order by r.created_at desc, r.id), '[]') from picked r),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'kind', k.kind) order by k.id), '[]')
                     from public.categories k where k.user_id = v_user and k.id::text in (select n.id from named n)),
    'goals', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.id), '[]')
                from public.savings_goals g where g.user_id = v_user and g.id::text in (select n.id from named n)),
    'transactions', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'posted_on', t.posted_on,
                       'amount_cents', t.amount_cents, 'merchant_raw', t.merchant_raw) order by t.id), '[]')
                       from public.transactions t where t.user_id = v_user and t.id::text in (select n.id from named n)))
    into v;
  return v;
end;
$$;

-- Category suggestions on rows waiting in Review, by an AI app: 0018's
-- update, with 0018's conditions word for word, at most 50 at once. An
-- element that does not name two ids is skipped, never read as one.
create or replace function public.ai_app_suggest_categories(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_refused text := public._ai_app_gate('propose');
  v_set     integer;
begin
  if v_refused is not null then
    return jsonb_build_object('refused', v_refused);
  end if;
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) not between 1 and 50 then
    return jsonb_build_object('refused', 'bad_change');
  end if;

  with given as materialized (
    select e ->> 'candidate' as candidate, e ->> 'category' as category
      from jsonb_array_elements(p) as e
     where jsonb_typeof(e) = 'object'
       and (e ->> 'candidate') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and (e ->> 'category') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ), offered as (
    -- One proposal per candidate: UPDATE ... FROM with two would pick either.
    select distinct on (g.candidate::uuid) g.candidate::uuid as candidate, g.category::uuid as category from given g
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
  return jsonb_build_object('suggested', v_set, 'skipped', jsonb_array_length(p) - v_set);
end;
$$;

-- ---------------------------------------------------------------------------
-- The owner's decision
-- ---------------------------------------------------------------------------
-- Apply's mark, after the screen's own write path made the change, or
-- Dismiss. The approval pattern: one conditional update, true when it
-- changed the row. Never an AI app: 0019's guard first.
create or replace function public.decide_suggestion(p_id uuid, p_outcome text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  perform public._not_an_ai_app();
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_outcome is null or p_outcome not in ('applied', 'dismissed') then
    raise exception 'an outcome is applied or dismissed' using errcode = '22023';
  end if;
  update public.ai_app_proposals s
     set status = p_outcome, decided_at = now()
   where s.id = p_id and s.user_id = v_user and s.status = 'pending' and s.expires_at > now()
  returning s.id into v_id;
  return v_id is not null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Review's and a search's rows carry their ids, edited in place
-- ---------------------------------------------------------------------------
do $$
declare
  was constant text := $x$    'rows', (select coalesce(jsonb_agg(jsonb_build_object('posted_on', r.posted_on, 'amount_cents', r.amount_cents,$x$;
  with_id constant text := $x$    'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'posted_on', r.posted_on, 'amount_cents', r.amount_cents,$x$;
  f   regprocedure;
  src text;
  def text;
begin
  foreach f in array array['public.ai_app_review(integer)',
    'public.ai_app_search(text, date, date, bigint, bigint, text[], text, text, integer)']::regprocedure[] loop
    select p.prosrc into src from pg_proc p where p.oid = f;
    -- Pasted again with the rows already carrying their ids: nothing to change.
    continue when strpos(src, with_id) > 0;
    -- The line is there exactly once, or nothing changes.
    if (length(src) - length(replace(src, was, ''))) / length(was) <> 1 then
      raise exception 'could not change %: it is not as 0037 left it', f;
    end if;
    def := pg_get_functiondef(f);
    if strpos(def, '$function$' || src || '$function$') = 0 then
      raise exception 'could not change %', f;
    end if;
    execute replace(def, '$function$' || src || '$function$', '$function$' || replace(src, was, with_id) || '$function$');
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Which AI-app updates are in
-- ---------------------------------------------------------------------------
create or replace function public.ai_app_updates_in()
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  -- (0035) The last AI-app update in, in an unbroken run, each read from
  -- what it left. 0039 lists every mark, its own too; 0038 is not one.
  with mark(n, fn, word) as (values
    (30, 'public._ai_app_gate(text)', '''disconnected'''),
    (31, 'public._ai_app_dedupe_hash(uuid, date, bigint, text, integer)', '''ai_app:'''),
    (32, 'public.approve_candidate(uuid, uuid)', '(0032)'),
    (32, 'public.recategorise_transaction(uuid, uuid, boolean)', '(0032)'),
    (33, 'public.ai_app_search(text, date, date, bigint, bigint, text[], text, text, integer)', '(0033)'),
    (34, 'public.ai_app_add_candidate(uuid, date, bigint, text, integer, text, integer, text)', '(0034)'),
    (35, 'public.ai_app_updates_in()', '(0035)'),
    (36, 'public._ai_app_shown_shop(text)', '(0036)'),
    (37, 'public._ai_app_clean_old_rows()', '(0037)'),
    (39, 'public.ai_app_propose(jsonb)', '(0039)'),
    -- 0030 pasted again puts back a gate without 0039's kind: 0039 is not in.
    (39, 'public._ai_app_gate(text)', '''suggesting_off''')
  ), missing(n) as (
    select m.n from mark m
     where coalesce(strpos((select p.prosrc from pg_catalog.pg_proc p where p.oid = to_regprocedure(m.fn)), m.word), 0) = 0
  )
  select coalesce((select max(m.n) from mark m where m.n < coalesce((select min(x.n) from missing x), 1000)), 29)
$$;

create or replace function public.ai_app_update_level()
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$ select 39 $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Callable by a signed-in token, and by nobody else. The owner's own
-- session gets not_an_ai_app from the AI app's three; an AI app's token
-- gets "AI apps cannot do this" from the owner's one.
revoke all on function public.ai_app_propose(jsonb) from public, anon;
revoke all on function public.ai_app_suggestions(text, integer) from public, anon;
revoke all on function public.ai_app_suggest_categories(jsonb) from public, anon;
revoke all on function public.decide_suggestion(uuid, text) from public, anon;
grant execute on function public.ai_app_propose(jsonb) to authenticated;
grant execute on function public.ai_app_suggestions(text, integer) to authenticated;
grant execute on function public.ai_app_suggest_categories(jsonb) to authenticated;
grant execute on function public.decide_suggestion(uuid, text) to authenticated;

commit;
