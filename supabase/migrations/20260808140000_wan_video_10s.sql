-- EverBond AI: Wan 2.7 Reference-to-Video
-- Run this ONCE in Supabase -> SQL Editor.
--
-- Existing historical 8-second videos remain valid.
-- Every NEW EverBond video request must be 10 seconds.

begin;

set check_function_bodies = false;

alter table public.character_gallery_videos
  drop constraint if exists character_gallery_videos_duration_seconds_check;

alter table public.character_gallery_videos
  add constraint character_gallery_videos_duration_seconds_check
  check (duration_seconds in (8, 10)) not valid;

alter table public.character_video_requests
  drop constraint if exists character_video_requests_duration_seconds_check;

alter table public.character_video_requests
  add constraint character_video_requests_duration_seconds_check
  check (duration_seconds in (8, 10)) not valid;

create or replace function public.start_character_video_request(
  p_user_id uuid,
  p_request_id uuid,
  p_character_id text,
  p_prompt text,
  p_duration_seconds integer,
  p_amount bigint,
  p_gallery_limit integer,
  p_provider_model text
)
returns table (
  request_status text,
  balance bigint,
  debt bigint,
  video_id uuid,
  provider_queue_id text,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.character_video_requests%rowtype;
  v_balance bigint;
  v_debt bigint;
  v_count integer;
  v_limit integer := greatest(
    1,
    least(coalesce(p_gallery_limit, 5), 5)
  );
begin
  if p_amount <= 0 then
    raise exception 'INVALID_VIDEO_CHARGE';
  end if;

  -- Wan 2.7 Reference product is fixed at 10 seconds.
  if p_duration_seconds <> 10 then
    raise exception 'INVALID_VIDEO_DURATION';
  end if;

  if nullif(trim(coalesce(p_provider_model, '')), '') is null then
    raise exception 'INVALID_VIDEO_MODEL';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'video-request:' ||
      p_user_id::text ||
      ':' ||
      p_request_id::text,
      0
    )
  );

  select *
  into v_existing
  from public.character_video_requests
  where request_id = p_request_id
    and user_id = p_user_id;

  if found then
    select
      coalesce(w.balance, 0),
      coalesce(w.debt, 0)
    into
      v_balance,
      v_debt
    from public.evercoin_wallets w
    where w.user_id = p_user_id;

    return query
    select
      v_existing.status,
      coalesce(v_balance, 0),
      coalesce(v_debt, 0),
      v_existing.video_id,
      v_existing.provider_queue_id,
      v_existing.error_code;

    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'video-character:' ||
      p_user_id::text ||
      ':' ||
      p_character_id,
      0
    )
  );

  -- Existing route recovery checks Venice's real provider status.
  -- Do not auto-refund merely because a queue request is old.
  if exists (
    select 1
    from public.character_video_requests
    where user_id = p_user_id
      and character_id = p_character_id
      and status = 'processing'
  ) then
    return query
    select
      'busy'::text,
      0::bigint,
      0::bigint,
      null::uuid,
      null::text,
      'VIDEO_REQUEST_IN_PROGRESS'::text;

    return;
  end if;

  select count(*)
  into v_count
  from public.character_gallery_videos
  where user_id = p_user_id
    and character_id = p_character_id;

  if v_count >= v_limit then
    return query
    select
      'limit_reached'::text,
      0::bigint,
      0::bigint,
      null::uuid,
      null::text,
      'VIDEO_LIMIT_REACHED'::text;

    return;
  end if;

  insert into public.evercoin_wallets (
    user_id,
    balance,
    debt
  )
  values (
    p_user_id,
    0,
    0
  )
  on conflict (user_id) do nothing;

  select
    w.balance,
    w.debt
  into
    v_balance,
    v_debt
  from public.evercoin_wallets w
  where w.user_id = p_user_id
  for update;

  if v_debt > 0 then
    return query
    select
      'insufficient'::text,
      v_balance,
      v_debt,
      null::uuid,
      null::text,
      'EVERCOIN_DEBT'::text;

    return;
  end if;

  if v_balance < p_amount then
    return query
    select
      'insufficient'::text,
      v_balance,
      v_debt,
      null::uuid,
      null::text,
      'INSUFFICIENT_EVERCOIN'::text;

    return;
  end if;

  update public.evercoin_wallets w
  set
    balance = w.balance - p_amount,
    updated_at = clock_timestamp()
  where w.user_id = p_user_id
  returning w.balance into v_balance;

  insert into public.character_video_requests (
    request_id,
    user_id,
    character_id,
    prompt,
    duration_seconds,
    status,
    evercoin_charge,
    provider_model
  )
  values (
    p_request_id,
    p_user_id,
    p_character_id,
    p_prompt,
    10,
    'processing',
    p_amount,
    trim(p_provider_model)
  );

  insert into public.evercoin_transactions (
    user_id,
    amount,
    reason,
    reference_id
  )
  values (
    p_user_id,
    -p_amount,
    'character_video_generation',
    p_request_id::text
  );

  return query
  select
    'claimed'::text,
    v_balance,
    v_debt,
    null::uuid,
    null::text,
    null::text;
end;
$$;

revoke all on function public.start_character_video_request(
  uuid,
  uuid,
  text,
  text,
  integer,
  bigint,
  integer,
  text
) from public, anon, authenticated;

grant execute on function public.start_character_video_request(
  uuid,
  uuid,
  text,
  text,
  integer,
  bigint,
  integer,
  text
) to service_role;

notify pgrst, 'reload schema';

commit;
