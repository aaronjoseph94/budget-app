-- 0020_ai_apps.sql
--
-- What an AI app the owner connects may do (ADR 0012; docs/design/mcp/PLAN.md
-- §2.5, §2.7 and §2.12). 0019 stopped an AI app's token writing anything;
-- this is the little it may do, and only while the owner allows it:
--
-- - ai_app_access: the owner's switch (off until turned on), whether AI apps
--   may add to Review, the time zone "today" is taken in, and until when a
--   new connection may be allowed (the consent page reads it).
-- - ai_app_usage and ai_app_last_use: today's count of look-ups and
--   additions, across all AI apps together, and when each app last asked.
-- - _ai_app_gate(kind): called first by every ai_app_* function. It refuses
--   (a code, never an exception) when the caller is not an AI app, AI apps
--   are off, adding is off, or today's count is used up; otherwise it
--   claims one call in one statement and sets a flag for this transaction
--   only, budget.ai_app_read.
-- - "Reads only through the gate": a restrictive select policy on every
--   table lets a token with client_id read a row only while that flag is
--   on. So an AI app reads nothing directly, only inside a counted call.
-- - ai_app_read, ai_app_search and ai_app_review: the reads, each one call
--   returning jsonb, SECURITY INVOKER so row-level security applies as the
--   owner. Rows as stored: every figure is the engine's, in the server.
-- - ai_app_add_candidate: the one write. It adds one row to Review, always
--   pending, never approved (not even on a learned rule), and checks the
--   dedupe hash it is sent against its own arguments instead of trusting
--   it. The words are stored as both merchant and merchant_raw, so a rule
--   the owner teaches by approving it keys on exactly the words they saw.
--
-- Every ai_app_* function is VOLATILE (the default): PostgREST runs a
-- STABLE one in a read-only transaction, where the gate could not count.
-- Counting calls is bookkeeping, not money (ADR 0004's precedent). No date
-- arithmetic is done on a read's window: the server works it out.
--
-- The owner's own session, without client_id, reads and writes exactly as
-- before, and gets not_an_ai_app from every ai_app_* function.
--
-- Forward-only: 0001–0019 are not edited.

-- Paste 0019 first: this uses its 'ai_app' source and its guard, and names
-- its restrictive policies' rule.
-- paste-order-check start
do $$
begin
  if to_regprocedure('public._not_an_ai_app()') is null then
    raise exception 'Paste 0019 first: 0020 needs 0019_ai_apps_cannot_write.sql, which is not in yet';
  end if;
end $$;
-- paste-order-check end

begin;

-- ---------------------------------------------------------------------------
-- The switch, the counts and the last use
-- ---------------------------------------------------------------------------
create table public.ai_app_access (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  enabled        boolean not null default false,
  allow_add      boolean not null default true,
  time_zone      text not null check (time_zone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$'),
  connect_until  timestamptz,
  updated_at     timestamptz not null default now()
);

alter table public.ai_app_access enable row level security;

create policy ai_app_access_own_rows on public.ai_app_access
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A zone Postgres does not know is refused when it is written, so the gate
-- never meets one it cannot use.
create function public.ai_app_access_known_zone()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.time_zone) then
    raise exception 'unknown time zone' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger ai_app_access_known_zone
  before insert or update on public.ai_app_access
  for each row execute function public.ai_app_access_known_zone();

create table public.ai_app_usage (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null,
  kind     text not null check (kind in ('read', 'add')),
  calls    integer not null check (calls >= 0),
  primary key (user_id, day, kind)
);

alter table public.ai_app_usage enable row level security;

create policy ai_app_usage_own_rows on public.ai_app_usage
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table public.ai_app_last_use (
  user_id       uuid not null references auth.users (id) on delete cascade,
  client_id     uuid not null,
  last_used_at  timestamptz not null,
  primary key (user_id, client_id)
);

alter table public.ai_app_last_use enable row level security;

create policy ai_app_last_use_own_rows on public.ai_app_last_use
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- The browser reads its counts and last uses; only the gate writes them.
revoke all on public.ai_app_usage, public.ai_app_last_use from anon, authenticated;
grant select on public.ai_app_usage, public.ai_app_last_use to authenticated;

-- 0019's rule for these three too, which did not exist when it ran: an AI
-- app cannot switch itself on, open its own connect window or reset a count.
do $$
declare
  t    text;
  mine constant text := '((select auth.jwt() ->> ''client_id'') is null)';
begin
  foreach t in array array['ai_app_access', 'ai_app_usage', 'ai_app_last_use'] loop
    execute format('create policy ai_apps_cannot_insert on public.%I as restrictive for insert to authenticated with check %s', t, mine);
    execute format('create policy ai_apps_cannot_update on public.%I as restrictive for update to authenticated using %s with check %s', t, mine, mine);
    execute format('create policy ai_apps_cannot_delete on public.%I as restrictive for delete to authenticated using %s', t, mine);
  end loop;
end $$;

-- Which AI app added a batch: from the token, never from an argument.
alter table public.ingest_batches
  add column ai_client_id uuid,
  add constraint ingest_batches_ai_client_only_for_ai_apps
    check (ai_client_id is null or source = 'ai_app');

-- ---------------------------------------------------------------------------
-- The gate
-- ---------------------------------------------------------------------------
-- Null to go on, or the refusal's code. One statement claims the call, so
-- two at once cannot both take the last one.
create function public._ai_app_gate(p_kind text)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_client text := auth.jwt() ->> 'client_id';
  v_access public.ai_app_access;
  v_calls  integer;
begin
  if v_user is null then
    return 'not_signed_in';
  end if;
  if v_client is null or v_client !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return 'not_an_ai_app';
  end if;
  if p_kind is null or p_kind not in ('read', 'add') then
    raise exception 'unknown kind' using errcode = '22023';
  end if;
  select * into v_access from public.ai_app_access a where a.user_id = v_user;
  if not found or not v_access.enabled then
    return 'ai_apps_off';
  end if;
  if p_kind = 'add' and not v_access.allow_add then
    return 'adding_off';
  end if;

  insert into public.ai_app_usage as u (user_id, day, kind, calls)
  values (v_user, (now() at time zone v_access.time_zone)::date, p_kind, 1)
  on conflict (user_id, day, kind) do update set calls = u.calls + 1
    where u.calls < case p_kind when 'read' then 300 else 30 end
  returning u.calls into v_calls;
  if v_calls is null then
    return 'limit_reached';
  end if;

  insert into public.ai_app_last_use (user_id, client_id, last_used_at)
  values (v_user, v_client::uuid, now())
  on conflict (user_id, client_id) do update set last_used_at = excluded.last_used_at;

  -- Transaction-local: it ends with the one request that called the gate.
  perform set_config('budget.ai_app_read', 'on', true);
  return null;
end;
$$;

revoke all on function public._ai_app_gate(text) from public, anon;
grant execute on function public._ai_app_gate(text) to authenticated;

-- The owner's today, in the zone saved with the switch. Invoker: an AI app
-- reads its row only after the gate, and it is the owner's own date.
create function public._ai_app_today()
returns date
language sql
volatile
set search_path = public, pg_temp
as $$
  select (now() at time zone a.time_zone)::date from public.ai_app_access a where a.user_id = auth.uid()
$$;

revoke all on function public._ai_app_today() from public, anon;
grant execute on function public._ai_app_today() to authenticated;

-- ---------------------------------------------------------------------------
-- Reads only through the gate
-- ---------------------------------------------------------------------------
-- On every table: a token with client_id reads a row only inside a call the
-- gate allowed and counted. PostgREST sets only its own request.* settings,
-- and set_config is in no exposed schema, so no client can set the flag.
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format(
      'create policy ai_apps_read_through_the_gate on public.%I as restrictive for select to authenticated '
      'using ((select auth.jwt() ->> ''client_id'') is null or (select current_setting(''budget.ai_app_read'', true)) = ''on'')', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- The reads
-- ---------------------------------------------------------------------------
-- The parts asked for, over [p_from, p_to] where a part is dated, each with
-- the columns the app's own reads select. Budgets and plans run from the
-- start, since which one is in effect is the engine's to say; a savings
-- fund's transfers run from the day its balance was typed.
create function public.ai_app_read(p_parts text[], p_from date, p_to date)
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
  if p_parts is null or p_from is null or p_to is null or p_from > p_to then
    raise exception 'a read needs its parts and a window' using errcode = '22023';
  end if;
  v := jsonb_build_object('today', public._ai_app_today());

  if 'account' = any(p_parts) then
    v := v || jsonb_build_object('account', (
      select a.id from public.accounts a where a.user_id = v_user and a.name = 'Main Card'));
  end if;
  if 'categories' = any(p_parts) then
    v := v || jsonb_build_object('categories', (
      select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'kind', k.kind,
               'sort_order', k.sort_order, 'weekly_budget_cents', k.weekly_budget_cents)
             order by k.sort_order, k.name, k.id), '[]')
        from public.categories k where k.user_id = v_user));
  end if;
  if 'budgets' = any(p_parts) then
    v := v || jsonb_build_object('budgets', (
      select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'category_id', b.category_id, 'month', b.month,
               'applies', b.applies, 'budget_cents', b.budget_cents) order by b.month, b.id), '[]')
        from public.category_budgets b where b.user_id = v_user and b.month <= p_to));
  end if;
  if 'plans' = any(p_parts) then
    v := v || jsonb_build_object('plans', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'category_id', p.category_id,
               'effective_month', p.effective_month, 'planned_cents', p.planned_cents, 'due_day', p.due_day)
             order by p.effective_month, p.id), '[]')
        from public.category_plans p where p.user_id = v_user and p.effective_month <= p_to));
  end if;
  if 'txns' = any(p_parts) then
    v := v || jsonb_build_object('txns', (
      select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'posted_on', t.posted_on, 'amount_cents', t.amount_cents,
               'merchant_raw', t.merchant_raw, 'category_id', t.category_id, 'source', t.source)
             order by t.posted_on desc, t.id), '[]')
        from public.transactions t where t.user_id = v_user and t.posted_on between p_from and p_to));
  end if;
  if 'fund_txns' = any(p_parts) then
    v := v || jsonb_build_object('fund_txns', (
      select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'posted_on', t.posted_on, 'amount_cents', t.amount_cents,
               'merchant_raw', t.merchant_raw, 'category_id', t.category_id, 'source', t.source)
             order by t.posted_on, t.id), '[]')
        from public.transactions t
        join public.savings_goals g on g.user_id = v_user and g.category_id = t.category_id
       where t.user_id = v_user and t.posted_on >= g.balance_as_of and t.posted_on <= p_to));
  end if;
  if 'balances' = any(p_parts) then
    v := v || jsonb_build_object('balances', (
      select coalesce(jsonb_agg(jsonb_build_object('month', m.month, 'starting_balance_cents', m.starting_balance_cents)
             order by m.month), '[]')
        from public.month_balances m where m.user_id = v_user and m.month between p_from and p_to));
  end if;
  if 'schedules' = any(p_parts) then
    v := v || jsonb_build_object('schedules', (
      select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'category_id', s.category_id,
               'first_pay_date', s.first_pay_date, 'frequency', s.frequency) order by s.id), '[]')
        from public.pay_schedules s where s.user_id = v_user));
  end if;
  if 'records' = any(p_parts) then
    v := v || jsonb_build_object('records', jsonb_build_object(
      'statement_start', (select min(b.period_start) from public.ingest_batches b where b.user_id = v_user),
      'statement_end', (select max(b.period_end) from public.ingest_batches b where b.user_id = v_user),
      'first_entry', (select min(t.posted_on) from public.transactions t where t.user_id = v_user)));
  end if;
  -- Dates only, so the server counts those in the exact period it shows.
  if 'pending' = any(p_parts) then
    v := v || jsonb_build_object('pending', (
      select coalesce(jsonb_agg(c.posted_on order by c.posted_on), '[]')
        from public.ingest_candidates c
       where c.user_id = v_user and c.status = 'pending' and c.posted_on between p_from and p_to));
  end if;
  if 'goals' = any(p_parts) then
    v := v || jsonb_build_object('goals', (
      select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'target_cents', g.target_cents,
               'saved_cents', g.saved_cents, 'target_date', g.target_date, 'unit_cost_cents', g.unit_cost_cents,
               'unit_label', g.unit_label, 'created_at', g.created_at, 'sort_order', g.sort_order, 'status', g.status,
               'reached_on', g.reached_on, 'category_id', g.category_id, 'start_date', g.start_date,
               'balance_as_of', g.balance_as_of) order by g.created_at, g.id), '[]')
        from public.savings_goals g where g.user_id = v_user));
  end if;
  if 'debts' = any(p_parts) then
    v := v || jsonb_build_object(
      'debts', (
        select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name,
                 'starting_balance_cents', d.starting_balance_cents, 'minimum_payment_cents', d.minimum_payment_cents,
                 'apr_basis_points', d.apr_basis_points, 'start_date', d.start_date, 'sort_order', d.sort_order)
               order by d.sort_order, d.name, d.id), '[]')
          from public.debts d where d.user_id = v_user),
      'debt_extras', (
        select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'debt_id', e.debt_id, 'month', e.month,
                 'amount_cents', e.amount_cents) order by e.month, e.id), '[]')
          from public.debt_extra_payments e where e.user_id = v_user));
  end if;
  if 'not_subscriptions' = any(p_parts) then
    v := v || jsonb_build_object('not_subscriptions', (
      select coalesce(jsonb_agg(i.insight_key order by i.insight_key), '[]')
        from public.insight_dismissals i where i.user_id = v_user));
  end if;
  return v;
end;
$$;

-- Approved charges matching a search, newest first. `all` carries every
-- match's amount and list for the engine's totals, or null past 5,000.
-- The words are matched as words: %, _ and \ in them are escaped here, and
-- no filter string is ever built from them.
create function public.ai_app_search(
  p_text        text,
  p_from        date,
  p_to          date,
  p_min         bigint,
  p_max         bigint,
  p_categories  text[],
  p_list        text,
  p_flow        text,
  p_limit       integer
)
returns jsonb
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_refused text := public._ai_app_gate('read');
  v_like    text;
  v         jsonb;
begin
  if v_refused is not null then
    return jsonb_build_object('refused', v_refused);
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 1100
     or p_limit is null or p_limit not between 1 and 50
     or coalesce(p_flow, 'any') not in ('spent', 'received', 'any')
     or coalesce(p_min, 0) < 0 or coalesce(p_max, 0) < 0
     or coalesce(cardinality(p_categories), 0) > 10 or length(coalesce(p_text, '')) > 60 then
    raise exception 'a search needs a window of at most three years and bounds it can use' using errcode = '22023';
  end if;
  v_like := case when p_text is null then null
                 else '%' || replace(replace(replace(p_text, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;

  with m as (
    select t.id, t.posted_on, t.amount_cents, t.merchant_raw, k.name as category, k.kind::text as kind, t.source::text as source
      from public.transactions t
      join public.categories k on k.id = t.category_id and k.user_id = v_user
     where t.user_id = v_user
       and t.posted_on between p_from and p_to
       and (v_like is null or t.merchant_raw ilike v_like escape '\' or t.merchant ilike v_like escape '\')
       and (p_categories is null or k.name = any(p_categories))
       and (p_list is null or k.kind::text = p_list)
       and (coalesce(p_flow, 'any') = 'any' or (p_flow = 'spent' and t.amount_cents < 0)
            or (p_flow = 'received' and t.amount_cents > 0))
       and (p_min is null or abs(t.amount_cents) >= p_min)
       and (p_max is null or abs(t.amount_cents) <= p_max)
  )
  select jsonb_build_object(
    'today', public._ai_app_today(),
    'total', (select count(*) from m),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('posted_on', r.posted_on, 'amount_cents', r.amount_cents,
                      'merchant_raw', r.merchant_raw, 'category', r.category, 'kind', r.kind, 'source', r.source)
                    order by r.posted_on desc, r.id), '[]')
               from (select * from m order by m.posted_on desc, m.id limit p_limit) r),
    'all', case when (select count(*) from m) > 5000 then null else
             (select coalesce(jsonb_agg(jsonb_build_object('amount_cents', m.amount_cents, 'kind', m.kind)
                     order by m.posted_on desc, m.id), '[]') from m) end)
    into v;
  return v;
end;
$$;

-- What waits in Review, oldest first as Review shows it, with the counts.
-- Deliberately no sum: the app never shows a total of unreviewed amounts.
create function public.ai_app_review(p_limit integer)
returns jsonb
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_refused text := public._ai_app_gate('read');
begin
  if v_refused is not null then
    return jsonb_build_object('refused', v_refused);
  end if;
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception 'at most 50 rows' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'today', public._ai_app_today(),
    'waiting', (select count(*) from public.ingest_candidates c where c.user_id = v_user and c.status = 'pending'),
    'unreadable_lines', (select count(*) from public.ingest_unreadable_lines l
                          where l.user_id = v_user and l.dismissed_at is null),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('posted_on', r.posted_on, 'amount_cents', r.amount_cents,
                      'merchant_raw', r.merchant_raw, 'category', r.category, 'category_source', r.category_source,
                      'source', r.source, 'ai_client_id', r.ai_client_id) order by r.posted_on, r.id), '[]')
               from (select c.id, c.posted_on, c.amount_cents, c.merchant_raw, k.name as category,
                            c.category_source, c.source, b.ai_client_id
                       from public.ingest_candidates c
                       join public.ingest_batches b on b.id = c.batch_id
                       left join public.categories k on k.id = c.category_id
                      where c.user_id = v_user and c.status = 'pending'
                      order by c.posted_on, c.id limit p_limit) r));
end;
$$;

-- ---------------------------------------------------------------------------
-- The one write
-- ---------------------------------------------------------------------------
-- Version 1 of packages/statement-parsers/src/dedupe.ts's canonical bytes,
-- rebuilt from the add's own arguments: v1, the account, the date, the
-- signed cents, the words and occurrence:<n>, joined by a zero byte. The
-- server computes the hash with computeDedupeHash, the one definition; this
-- only checks it. Internal: granted to nobody.
create function public._ai_app_dedupe_hash(p_account uuid, p_posted_on date, p_amount_cents bigint, p_words text, p_occurrence integer)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select encode(sha256(
    convert_to('v1', 'UTF8') || '\x00'::bytea ||
    convert_to(p_account::text, 'UTF8') || '\x00'::bytea ||
    convert_to(to_char(p_posted_on, 'YYYY-MM-DD'), 'UTF8') || '\x00'::bytea ||
    convert_to(p_amount_cents::text, 'UTF8') || '\x00'::bytea ||
    convert_to(p_words, 'UTF8') || '\x00'::bytea ||
    convert_to('occurrence:' || p_occurrence::text, 'UTF8')), 'hex')
$$;

revoke all on function public._ai_app_dedupe_hash(uuid, date, bigint, text, integer) from public, anon, authenticated;

-- Written for a caller that is not the server: the token works against
-- PostgREST directly, so every argument is hostile. Expected refusals are
-- answers: { refused: code }. SECURITY DEFINER, since 0004 took direct
-- writes to the queue from the browser; so it checks ownership itself.
create function public.ai_app_add_candidate(
  p_account        uuid,
  p_posted_on      date,
  p_amount_cents   bigint,
  p_words          text,
  p_occurrence     integer,
  p_dedupe_hash    text,
  p_dedupe_hash_v  integer,
  p_category_name  text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_refused  text := public._ai_app_gate('add');
  v_today    date;
  v_category uuid;
  v_batch    uuid;
  v_inserted integer;
  v_status   text;
begin
  if v_refused is not null then
    return jsonb_build_object('refused', v_refused);
  end if;
  v_today := public._ai_app_today();

  if p_amount_cents is null or p_amount_cents = 0 or abs(p_amount_cents) > 10000000 then
    return jsonb_build_object('refused', 'bad_amount');
  end if;
  if p_posted_on is null or p_posted_on > v_today or p_posted_on < v_today - 366 then
    return jsonb_build_object('refused', 'bad_date');
  end if;
  if p_words is null or length(p_words) not between 1 and 120 or p_words <> btrim(p_words)
     or p_words ~ '[\x01-\x1F\x7F]' then
    return jsonb_build_object('refused', 'bad_words');
  end if;
  if p_occurrence is null or p_occurrence not between 1 and 9 then
    return jsonb_build_object('refused', 'bad_occurrence');
  end if;
  if p_account is null or not exists (select 1 from public.accounts a where a.id = p_account and a.user_id = v_user) then
    return jsonb_build_object('refused', 'no_account');
  end if;
  if p_category_name is not null then
    select k.id into v_category from public.categories k
     where k.user_id = v_user and k.name = p_category_name and k.kind <> 'transfer';
    if v_category is null then
      return jsonb_build_object('refused', 'unknown_category');
    end if;
  end if;
  if p_dedupe_hash_v is distinct from 1
     or p_dedupe_hash is distinct from public._ai_app_dedupe_hash(p_account, p_posted_on, p_amount_cents, p_words, p_occurrence) then
    return jsonb_build_object('refused', 'needs_update');
  end if;

  -- Counts afterwards, as save_import sets them: the CHECK is immediate.
  insert into public.ingest_batches (user_id, account_id, source, parsed, deduped, inserted, rejected, ai_client_id)
  values (v_user, p_account, 'ai_app', 0, 0, 0, 0, (auth.jwt() ->> 'client_id')::uuid)
  returning id into v_batch;

  -- Pending, always; 'model' when it names a category. One statement,
  -- never select-then-insert. There is no approve path here at all.
  with written as (
    insert into public.ingest_candidates (
      user_id, batch_id, account_id, posted_on, amount_cents, merchant, merchant_raw,
      category_id, category_source, status, dedupe_hash, dedupe_hash_v, source
    )
    select v_user, v_batch, p_account, p_posted_on, p_amount_cents,
           p_words::public.ingested_text, p_words::public.ingested_text,
           v_category, case when v_category is null then null else 'model'::public.category_source end,
           'pending', p_dedupe_hash::public.dedupe_digest, 1, 'ai_app'
     where not exists (select 1 from public.transactions t where t.user_id = v_user and t.dedupe_hash = p_dedupe_hash)
    on conflict (user_id, dedupe_hash) where status = 'pending' do nothing
    returning 1
  )
  select count(*)::integer into v_inserted from written;

  update public.ingest_batches
     set parsed = 1, deduped = 1 - v_inserted, inserted = v_inserted, rejected = 0
   where id = v_batch;

  v_status := case
    when v_inserted = 1 then 'added'
    when exists (select 1 from public.transactions t where t.user_id = v_user and t.dedupe_hash = p_dedupe_hash) then 'already_recorded'
    else 'already_waiting' end;
  return jsonb_build_object('status', v_status,
    'waiting', (select count(*) from public.ingest_candidates c where c.user_id = v_user and c.status = 'pending'));
end;
$$;

-- Callable by a signed-in token, and by nobody else. The owner's own
-- session gets not_an_ai_app from each.
revoke all on function public.ai_app_read(text[], date, date) from public, anon;
revoke all on function public.ai_app_search(text, date, date, bigint, bigint, text[], text, text, integer) from public, anon;
revoke all on function public.ai_app_review(integer) from public, anon;
revoke all on function public.ai_app_add_candidate(uuid, date, bigint, text, integer, text, integer, text) from public, anon;
grant execute on function public.ai_app_read(text[], date, date) to authenticated;
grant execute on function public.ai_app_search(text, date, date, bigint, bigint, text[], text, text, integer) to authenticated;
grant execute on function public.ai_app_review(integer) to authenticated;
grant execute on function public.ai_app_add_candidate(uuid, date, bigint, text, integer, text, integer, text) to authenticated;

commit;
