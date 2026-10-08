-- 0041_ai_free_order.sql
--
-- The AI services are tried free and quick first: OpenRouter, then Groq,
-- then Gemini, then the paid ones (ADR 0015, the owner's wish of
-- 2026-10-08: "I want open router, groq, and any other Free that does
-- not take a long time... I want the AI to be available and quick";
-- Gemini is slow for the owner).
--
-- 0016 made Gemini first: its column default, and ai_context_for's answer
-- for an owner who has saved no choice. Both say the new order now, and
-- an owner whose saved order is still 0016's default is moved to it: that
-- order was never chosen, only inherited. An order the owner changed is
-- left exactly as it is, and the Supabase enum, which only sorts, is
-- untouched.
--
-- Deletes nothing. schema_level() answers 41, so One-time updates can tell
-- it is in; it is pasted after 0038 (the last update to move that level)
-- and needs 0016's table. Pasted again, it stops before changing anything.

-- paste-order-check start
do $$
begin
  -- Pasted again after it is in: refused before anything changes, so
  -- schema_level() never goes back (re-paste guard).
  if to_regprocedure('public.schema_level()') is not null then
    if public.schema_level() >= 41 then
      raise exception '0041 is already in; nothing to do';
    end if;
  end if;
  -- Two checks, not one with 'or': plpgsql plans an expression whole,
  -- so naming schema_level() before it exists fails as "does not exist".
  if to_regprocedure('public.schema_level()') is null then
    raise exception 'Paste 0038 first: 0041 needs 0038_intuit_prefix_merchants.sql, which is not in yet';
  end if;
  if public.schema_level() < 38 then
    raise exception 'Paste 0038 first: 0041 needs 0038_intuit_prefix_merchants.sql, which is not in yet';
  end if;
  if to_regclass('public.ai_settings') is null then
    raise exception 'Paste 0016 first: 0041 needs 0016_ai_foundation.sql, which is not in yet';
  end if;
end $$;
-- paste-order-check end

begin;

-- The new default for an owner who saves a first choice.
alter table public.ai_settings
  alter column provider_order set default '{openrouter,groq,gemini,openai,anthropic}';

-- An order never chosen, only inherited from 0016, follows the new default.
update public.ai_settings
   set provider_order = '{openrouter,groq,gemini,openai,anthropic}', updated_at = now()
 where provider_order = '{gemini,groq,openrouter,openai,anthropic}';

-- 0016's ai_context_for, byte for byte, but for the order it answers for an
-- owner who has saved no choice (its "above" is 0016's column defaults).
-- Grants are kept by create or replace: service_role alone may call it.
create or replace function public.ai_context_for(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'day', public.ai_today(),
    -- The column defaults above, for an owner who has saved no choice.
    'settings', coalesce(
      (select jsonb_build_object(
                'enabled', s.enabled, 'provider_order', to_jsonb(s.provider_order), 'models', s.models,
                'daily_cap', s.daily_cap, 'allow_paid', s.allow_paid, 'tone', s.tone,
                'share_shop_names', s.share_shop_names)
         from public.ai_settings s where s.user_id = p_user),
      jsonb_build_object(
        'enabled', true, 'provider_order', to_jsonb('{openrouter,groq,gemini,openai,anthropic}'::public.ai_provider[]),
        'models', '{}'::jsonb, 'daily_cap', 40, 'allow_paid', false, 'tone', 'cheerleader',
        'share_shop_names', true)),
    'keys', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'provider', k.provider, 'ciphertext', k.ciphertext, 'iv', k.iv, 'kek_id', k.kek_id,
                'key_v', k.key_v, 'key_hint', k.key_hint, 'status', k.status, 'model', k.model,
                'tested_at', k.tested_at) order by k.provider)
         from public.ai_provider_keys k where k.user_id = p_user),
      '[]'::jsonb),
    'usage', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'provider', u.provider, 'model', u.model, 'task', u.task,
                'attempts', u.attempts, 'tokens_est', u.tokens_est, 'ok', u.ok)
                order by u.provider, u.model, u.task)
         from public.ai_usage u where u.user_id = p_user and u.day = public.ai_today()),
      '[]'::jsonb),
    'resting', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'provider', r.provider, 'model', r.model, 'until', r.cooldown_until, 'code', r.last_code)
                order by r.provider, r.model)
         from public.ai_provider_state r where r.user_id = p_user and r.cooldown_until > now()),
      '[]'::jsonb))
$$;

create or replace function public.schema_level()
returns integer
language sql
immutable
as $$ select 41 $$;

commit;
