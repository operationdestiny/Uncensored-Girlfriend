-- EverBond AI: automatic Grok -> Wan video fallback with dynamic repricing.
-- Run this once in Supabase before deploying the matching application patch.
--
-- The request starts at the live Grok price. If Grok does not return a usable
-- video for any reason, this RPC atomically switches the request to Wan and
-- adjusts the reserved EverCoin amount to Wan's current live proportional price.
-- A later terminal failure is still refunded by fail_character_video_request().

begin;

set check_function_bodies = false;

create or replace function public.begin_character_video_fallback(
  p_user_id uuid,
  p_request_id uuid,
  p_expected_provider_model text,
  p_fallback_provider_model text,
  p_new_amount bigint
)
returns table (
  fallback_status text,
  balance bigint,
  debt bigint,
  previous_amount bigint,
  new_amount bigint,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.character_video_requests%rowtype;
  v_balance bigint := 0;
  v_debt bigint := 0;
  v_previous bigint := 0;
  v_delta bigint := 0;
  v_refund bigint := 0;
  v_to_debt bigint := 0;
  v_to_balance bigint := 0;
begin
  if p_new_amount <= 0 then
    raise exception 'INVALID_VIDEO_CHARGE';
  end if;

  if nullif(trim(coalesce(p_fallback_provider_model, '')), '') is null then
    raise exception 'INVALID_VIDEO_MODEL';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'video-fallback:' ||
      p_user_id::text ||
      ':' ||
      p_request_id::text,
      0
    )
  );

  select *
  into v_request
  from public.character_video_requests
  where request_id = p_request_id
    and user_id = p_user_id
  for update;

  if not found or v_request.status <> 'processing' then
    return query
    select
      'unavailable'::text,
      0::bigint,
      0::bigint,
      0::bigint,
      p_new_amount,
      'VIDEO_REQUEST_NOT_PROCESSING'::text;
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

  v_previous := greatest(
    coalesce(v_request.evercoin_charge, 0),
    0
  );

  if v_request.provider_model = trim(p_fallback_provider_model) then
    return query
    select
      'already_fallback'::text,
      v_balance,
      v_debt,
      v_previous,
      v_previous,
      null::text;
    return;
  end if;

  if v_request.provider_model <> trim(p_expected_provider_model) then
    return query
    select
      'unavailable'::text,
      v_balance,
      v_debt,
      v_previous,
      p_new_amount,
      'VIDEO_PROVIDER_CHANGED'::text;
    return;
  end if;

  v_delta := p_new_amount - v_previous;

  if v_delta > 0 then
    if v_debt > 0 then
      return query
      select
        'insufficient'::text,
        v_balance,
        v_debt,
        v_previous,
        p_new_amount,
        'EVERCOIN_DEBT'::text;
      return;
    end if;

    if v_balance < v_delta then
      return query
      select
        'insufficient'::text,
        v_balance,
        v_debt,
        v_previous,
        p_new_amount,
        'INSUFFICIENT_EVERCOIN'::text;
      return;
    end if;

    update public.evercoin_wallets w
    set
      balance = w.balance - v_delta,
      updated_at = clock_timestamp()
    where w.user_id = p_user_id
    returning w.balance, w.debt
    into v_balance, v_debt;

    insert into public.evercoin_transactions (
      user_id,
      amount,
      reason,
      reference_id
    )
    values (
      p_user_id,
      -v_delta,
      'character_video_generation_fallback_adjustment',
      p_request_id::text
    );
  elsif v_delta < 0 then
    v_refund := -v_delta;
    v_to_debt := least(v_debt, v_refund);
    v_to_balance := v_refund - v_to_debt;

    update public.evercoin_wallets w
    set
      debt = w.debt - v_to_debt,
      balance = w.balance + v_to_balance,
      updated_at = clock_timestamp()
    where w.user_id = p_user_id
    returning w.balance, w.debt
    into v_balance, v_debt;

    insert into public.evercoin_transactions (
      user_id,
      amount,
      reason,
      reference_id
    )
    values (
      p_user_id,
      v_refund,
      'character_video_generation_fallback_adjustment',
      p_request_id::text
    );

    if v_to_debt > 0 then
      insert into public.evercoin_debt_events (
        user_id,
        amount,
        reason,
        reference_id
      )
      values (
        p_user_id,
        -v_to_debt,
        'character_video_fallback_reprice_debt_payment',
        p_request_id::text
      );
    end if;
  end if;

  update public.character_video_requests
  set
    evercoin_charge = p_new_amount,
    provider_model = trim(p_fallback_provider_model),
    provider_queue_id = null,
    provider_download_url = null,
    error_code = 'VIDEO_FALLBACK_PENDING',
    updated_at = clock_timestamp()
  where request_id = p_request_id
    and user_id = p_user_id
    and status = 'processing';

  return query
  select
    'claimed'::text,
    v_balance,
    v_debt,
    v_previous,
    p_new_amount,
    null::text;
end;
$$;

revoke all on function public.begin_character_video_fallback(
  uuid,
  uuid,
  text,
  text,
  bigint
) from public, anon, authenticated;

grant execute on function public.begin_character_video_fallback(
  uuid,
  uuid,
  text,
  text,
  bigint
) to service_role;

notify pgrst, 'reload schema';

commit;
