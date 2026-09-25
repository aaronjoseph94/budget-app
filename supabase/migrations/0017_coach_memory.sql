-- 0017_coach_memory.sql
--
-- What the Coach remembers (plan slice A12, §3.8 and §10.1; ADR 0005 §6):
-- the AI's checked words, the insights the owner dismissed, and the owner's
-- answers about their own charges.
--
-- - ai_notes keeps the AI's words with their blanks, never a figure: a
--   sentence reads "You've spent {{A.change}} than by this day last month",
--   and the app fills the blank from the engine every time it draws it. The
--   words are keyed by a signature of the claims the AI was told about
--   (kinds, directions, sizes, never amounts), so they are reused only while
--   those claims still hold. ai_text_is_clean refuses any digit and any
--   currency or percent sign in a note's body, so no figure can be kept here
--   even by a bug: the app's own rule (ModelProse) is wider and runs first.
--   A trigger keeps each owner's newest 30 notes per surface.
-- - insight_dismissals names what the owner dismissed by its cause, such as
--   category_change:<id>:2026-09-01:up, so the same cause stays gone on every
--   device and a new one comes back.
-- - coach_answers keeps the check-in's Planned, Impulse or Needed for one
--   charge (plan A20). Its foreign key names the charge and its owner
--   together, through a new unique (id, user_id) on transactions, so an
--   answer can never point at another person's charge.
--
-- Nothing derived is stored: no amount, total or balance, only words with
-- blanks, keys and the owner's own answers (CLAUDE.md, "Never").
--
-- The digit ranges below are characters, which needs a UTF-8 database, as
-- Supabase's is; the schema gate creates its own the same way.
--
-- Every table has row-level security and the user_id = auth.uid() policy.
-- Forward-only: 0001–0016 are not edited. The unique constraint on
-- transactions is additive and cannot fail on rows already stored, because
-- id alone is already unique.

begin;

-- False when the text holds a digit (ASCII, fullwidth, Arabic-Indic, Extended
-- Arabic-Indic or Devanagari) or a currency or percent sign. The backstop
-- behind the app's rule, which also refuses number words and every \p{N}.
-- A JSON number anywhere in the body is refused too, since its digits are
-- in the text.
create function public.ai_text_is_clean(p_body jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_body is not null
     and p_body::text !~ '[0-9０-９٠-٩۰-۹०-९$＄%％€£¥¢₹]'
$$;

-- An object whose every value is a string matching the pattern: the maps from
-- a card's letter to its signature, and from a fact's letter to its key.
create function public.ai_string_map_valid(p_map jsonb, p_value text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_typeof(p_map) = 'object'
     and not exists (
       select 1 from jsonb_each(p_map) e
        where e.key !~ '^[A-Z]{1,2}$'
           or jsonb_typeof(e.value) <> 'string'
           or (e.value #>> '{}') !~ p_value)
$$;

create table public.ai_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- daily: the Coach's pack; checkin: Sunday's; report: a month's review.
  surface    text not null,
  -- Which day, week or month the words are for.
  scope      text not null,
  -- SHA-256 of the brief the AI was given, which holds no amount.
  facts_sig  text not null,
  prompt_v   integer not null,
  body       jsonb not null,
  -- Each card's own signature, by its fact's letter, so one card can be
  -- reused while its claims hold even when the pack as a whole has changed.
  card_sigs  jsonb not null default '{}',
  -- Each letter's fact, by its stable key, so a reused card's blanks find
  -- the right live figures under today's letters.
  fact_keys  jsonb not null default '{}',
  provider   public.ai_provider not null,
  model      text not null,
  created_at timestamptz not null default now(),
  constraint ai_notes_surface check (surface in ('daily', 'checkin', 'report')),
  constraint ai_notes_scope check (scope ~ '^(day|week|month):[0-9]{4}-[0-9]{2}(-[0-9]{2})?$'),
  constraint ai_notes_facts_sig check (facts_sig ~ '^[0-9a-f]{64}$'),
  constraint ai_notes_prompt_v check (prompt_v >= 1),
  constraint ai_notes_body_object check (jsonb_typeof(body) = 'object'),
  constraint ai_notes_body_clean check (public.ai_text_is_clean(body)),
  constraint ai_notes_body_size check (octet_length(body::text) <= 8192),
  constraint ai_notes_card_sigs check (public.ai_string_map_valid(card_sigs, '^[0-9a-f]{64}$')),
  constraint ai_notes_fact_keys check (public.ai_string_map_valid(fact_keys, '^[A-Za-z0-9:_-]{1,120}$')),
  constraint ai_notes_model check (model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$'),
  constraint ai_notes_once unique (user_id, surface, scope, facts_sig)
);

alter table public.ai_notes enable row level security;

create policy ai_notes_own_rows on public.ai_notes
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Keeps the inserting owner's newest 30 notes on the surface just written.
-- An ordinary invoker function, so row-level security limits it to that
-- owner's rows: it can never reach anyone else's.
create function public.ai_notes_keep_newest()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from public.ai_notes n
   where n.user_id = new.user_id
     and n.surface = new.surface
     and n.id not in (
       select k.id from public.ai_notes k
        where k.user_id = new.user_id and k.surface = new.surface
        order by k.created_at desc, k.id desc
        limit 30);
  return null;
end;
$$;

create trigger ai_notes_keep_newest
  after insert on public.ai_notes
  for each row execute function public.ai_notes_keep_newest();

create table public.insight_dismissals (
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- The cause the engine names, such as category_change:<id>:2026-09-01:up.
  insight_key  text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, insight_key),
  constraint insight_dismissals_key check (insight_key ~ '^[a-z_]{1,40}(:[^[:cntrl:]]{1,160})?$')
);

alter table public.insight_dismissals enable row level security;

create policy insight_dismissals_own_rows on public.insight_dismissals
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Lets coach_answers name a charge and its owner together.
alter table public.transactions
  add constraint transactions_id_user_unique unique (id, user_id);

create table public.coach_answers (
  user_id        uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid not null,
  answer         text not null,
  -- The Monday of the week the question was asked in.
  asked_week     date not null,
  answered_at    timestamptz not null default now(),
  primary key (user_id, transaction_id),
  constraint coach_answers_answer check (answer in ('planned', 'impulse', 'needed')),
  constraint coach_answers_week_monday check (extract(isodow from asked_week) = 1),
  constraint coach_answers_own_charge foreign key (transaction_id, user_id)
    references public.transactions (id, user_id) on delete cascade
);

alter table public.coach_answers enable row level security;

create policy coach_answers_own_rows on public.coach_answers
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

commit;
