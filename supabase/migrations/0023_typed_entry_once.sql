-- 0023_typed_entry_once.sql
--
-- A typed entry sent again is the same entry (backend-a-07, backend-b-03).
--
-- add_typed_transaction gives each call a random dedupe hash, so that two
-- coffees typed on one day are two coffees (0004). But when a write
-- committed and its answer was lost (a phone moving between Wi-Fi and
-- cellular), the app said nothing was saved and kept the form filled, and
-- pressing Add again posted the same cash purchase twice, with no review.
--
-- Now the app sends an entry id with each filled form, made once and kept
-- until the entry is added or the form changes. This overload hashes that
-- id with the owner's ('typed:<user>:<entry>'), and a new unique index on
-- typed candidates makes the insert do nothing when the entry is already
-- in: the call returns the candidate already there, and its own batch says
-- parsed 1 = deduped 1, so the counts still balance. Two entries typed
-- alike carry two ids, and are two. The hash is stamped dedupe_hash_v 1, as
-- every typed row's is; it is not dedupe.ts's canonical string, and never
-- was for typed rows.
--
-- The 6-argument add_typed_transaction is left as it is, for a copy of the
-- app from before this update. Existing typed rows keep their random
-- hashes, which are unique, so the index builds over them and nothing needs
-- a backfill.
--
-- SECURITY DEFINER, so it checks ownership itself, with search_path pinned,
-- and 0019's guard is its first statement. Callable by a signed-in user and
-- nobody else.
--
-- Forward-only: 0001–0022 are not edited.

-- paste-order-check start
do $$
begin
  -- Pasted again after it is in: refused before anything changes, so
  -- schema_level() never goes back (re-paste guard).
  if to_regprocedure('public.schema_level()') is not null then
    if public.schema_level() >= 23 then
      raise exception '0023 is already in; nothing to do';
    end if;
  end if;
  if to_regprocedure('public.schema_level()') is null or public.schema_level() < 22 then
    raise exception 'Paste 0022 first: 0023 needs 0022_removed_charge_waits.sql, which is not in yet';
  end if;
end $$;
-- paste-order-check end

begin;

create unique index ingest_candidates_typed_entry
  on public.ingest_candidates (user_id, dedupe_hash)
  where source = 'typed';

create function public.add_typed_transaction(
  p_account_id   uuid,
  p_posted_on    date,
  p_amount_cents bigint,
  p_merchant     text,
  p_merchant_raw text,
  p_category     uuid,
  p_entry        uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_hash  text;
  v_batch uuid;
  v_cand  uuid;
begin
  perform public._not_an_ai_app();
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_entry is null then
    raise exception 'entry id missing' using errcode = '22004';
  end if;
  if not exists (select 1 from public.accounts a where a.id = p_account_id and a.user_id = v_user) then
    raise exception 'account not found' using errcode = '42501';
  end if;
  if not exists (select 1 from public.categories k where k.id = p_category and k.user_id = v_user) then
    raise exception 'category not found' using errcode = '42501';
  end if;

  v_hash := encode(sha256(convert_to('typed:' || v_user::text || ':' || p_entry::text, 'UTF8')), 'hex');

  insert into public.ingest_batches (user_id, account_id, source, parsed, deduped, inserted, rejected)
  values (v_user, p_account_id, 'typed', 1, 0, 1, 0)
  returning id into v_batch;

  insert into public.ingest_candidates (
    user_id, batch_id, account_id, posted_on, amount_cents, merchant, merchant_raw,
    category_id, category_source, status, dedupe_hash, dedupe_hash_v, source
  )
  values (
    v_user, v_batch, p_account_id, p_posted_on, p_amount_cents,
    p_merchant::public.ingested_text, p_merchant_raw::public.ingested_text,
    p_category, 'user', 'approved', v_hash, 1, 'typed'
  )
  on conflict (user_id, dedupe_hash) where source = 'typed' do nothing
  returning id into v_cand;

  if v_cand is null then
    -- Already in: this call was a repeat, and its batch says so.
    update public.ingest_batches set deduped = 1, inserted = 0 where id = v_batch;
    select c.id into v_cand from public.ingest_candidates c
     where c.user_id = v_user and c.dedupe_hash = v_hash and c.source = 'typed';
    return v_cand;
  end if;

  perform public._post_candidate(v_cand);
  return v_cand;
end;
$$;

revoke all on function public.add_typed_transaction(uuid, date, bigint, text, text, uuid, uuid) from public, anon;
grant execute on function public.add_typed_transaction(uuid, date, bigint, text, text, uuid, uuid) to authenticated;

create or replace function public.schema_level()
returns integer
language sql
immutable
as $$ select 23 $$;

commit;
