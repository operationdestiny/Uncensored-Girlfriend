-- EverBond Retell voice billing launch fix
-- Production Supabase project: kvxztxljxngtpzqpgnxr
-- Production fixes already applied during launch-readiness audit.
--
-- Fixes:
-- 1) start_voice_call(): avoid PL/pgSQL ambiguity between RETURNS TABLE call_id
--    and voice_call_minutes.call_id in ON CONFLICT.
-- 2) prepare_voice_call_turn(): qualify voice_calls.started_at / paid_through
--    to avoid ambiguity with RETURNS TABLE started_at.
--
-- Billing RPCs remain SECURITY DEFINER and service-role-only.

create or replace function public.start_voice_call(
  p_user_id uuid,
  p_character_id text,
  p_amount bigint,
  p_max_minutes integer
)
returns table(
  started boolean,
  call_id uuid,
  balance bigint,
  debt bigint,
  started_at timestamptz,
  paid_through timestamptz,
  max_ends_at timestamptz,
  error_code text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_call_id uuid := gen_random_uuid();
  v_balance bigint;
  v_debt bigint;
  v_max_minutes integer := greatest(1, least(coalesce(p_max_minutes, 60), 60));
begin
  if p_amount < 0 then
    raise exception 'INVALID_VOICE_CALL_CHARGE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('voice-user:' || p_user_id::text, 0)
  );

  insert into public.evercoin_wallets (user_id, balance, debt)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select w.balance, w.debt
  into v_balance, v_debt
  from public.evercoin_wallets w
  where w.user_id = p_user_id
  for update;

  if v_debt > 0 then
    return query
    select false, null::uuid, v_balance, v_debt,
      null::timestamptz, null::timestamptz, null::timestamptz,
      'EVERCOIN_DEBT'::text;
    return;
  end if;

  if v_balance < p_amount then
    return query
    select false, null::uuid, v_balance, v_debt,
      null::timestamptz, null::timestamptz, null::timestamptz,
      'INSUFFICIENT_EVERCOIN'::text;
    return;
  end if;

  update public.voice_calls
  set
    status = 'ended',
    ended_at = coalesce(ended_at, v_now),
    end_reason = coalesce(end_reason, 'replaced_by_new_call'),
    updated_at = v_now
  where user_id = p_user_id
    and status = 'active';

  update public.evercoin_wallets w
  set
    balance = w.balance - p_amount,
    updated_at = v_now
  where w.user_id = p_user_id
  returning w.balance into v_balance;

  insert into public.voice_calls (
    id,
    user_id,
    character_id,
    status,
    started_at,
    paid_through,
    last_activity_at,
    max_ends_at,
    created_at,
    updated_at
  )
  values (
    v_call_id,
    p_user_id,
    p_character_id,
    'active',
    v_now,
    v_now + interval '1 minute',
    v_now,
    v_now + make_interval(mins => v_max_minutes),
    v_now,
    v_now
  );

  insert into public.voice_call_minutes (
    user_id,
    call_id,
    character_id,
    minute_index,
    evercoin_charge,
    created_at
  )
  values (
    p_user_id,
    v_call_id,
    p_character_id,
    1,
    p_amount,
    v_now
  )
  on conflict on constraint voice_call_minutes_pkey do nothing;

  if p_amount > 0 then
    insert into public.evercoin_transactions (
      user_id,
      amount,
      reason,
      reference_id,
      created_at
    )
    values (
      p_user_id,
      -p_amount,
      'voice_call_minute',
      v_call_id::text || ':1',
      v_now
    );
  end if;

  return query
  select true, v_call_id, v_balance, v_debt,
    v_now,
    v_now + interval '1 minute',
    v_now + make_interval(mins => v_max_minutes),
    null::text;
end;
$function$;

create or replace function public.prepare_voice_call_turn(
  p_user_id uuid,
  p_call_id uuid,
  p_character_id text,
  p_amount bigint,
  p_max_minutes integer,
  p_idle_timeout_seconds integer
)
returns table(
  allowed boolean,
  balance bigint,
  debt bigint,
  current_minute integer,
  newly_charged bigint,
  started_at timestamptz,
  max_ends_at timestamptz,
  error_code text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_call public.voice_calls%rowtype;
  v_balance bigint;
  v_debt bigint;
  v_current_minute integer;
  v_last_charged integer;
  v_missing integer;
  v_total bigint;
  v_max_minutes integer := greatest(1, least(coalesce(p_max_minutes, 60), 60));
  v_idle_seconds integer := greatest(30, least(coalesce(p_idle_timeout_seconds, 90), 90));
begin
  if p_amount < 0 then
    raise exception 'INVALID_VOICE_CALL_CHARGE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('voice-call:' || p_call_id::text, 0)
  );

  select *
  into v_call
  from public.voice_calls
  where id = p_call_id
    and user_id = p_user_id
    and character_id = p_character_id
  for update;

  if not found then
    return query
    select false, 0::bigint, 0::bigint, 0, 0::bigint,
      null::timestamptz, null::timestamptz, 'CALL_NOT_FOUND'::text;
    return;
  end if;

  if v_call.status <> 'active' then
    select coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_balance, v_debt
    from public.evercoin_wallets w
    where w.user_id = p_user_id;

    return query
    select false, coalesce(v_balance, 0), coalesce(v_debt, 0), 0, 0::bigint,
      v_call.started_at, v_call.max_ends_at, 'CALL_ENDED'::text;
    return;
  end if;

  if v_now >= v_call.max_ends_at
     or v_now >= v_call.started_at + make_interval(mins => v_max_minutes) then
    update public.voice_calls
    set status = 'ended', ended_at = v_now,
        end_reason = 'maximum_length', updated_at = v_now
    where id = p_call_id;

    return query
    select false, 0::bigint, 0::bigint, v_max_minutes, 0::bigint,
      v_call.started_at, v_call.max_ends_at, 'CALL_LIMIT_REACHED'::text;
    return;
  end if;

  if v_now > v_call.last_activity_at + make_interval(secs => v_idle_seconds) then
    update public.voice_calls
    set status = 'ended', ended_at = v_now,
        end_reason = 'idle_timeout', updated_at = v_now
    where id = p_call_id;

    return query
    select false, 0::bigint, 0::bigint, 0, 0::bigint,
      v_call.started_at, v_call.max_ends_at, 'CALL_IDLE_TIMEOUT'::text;
    return;
  end if;

  v_current_minute := floor(
    extract(epoch from (v_now - v_call.started_at)) / 60
  )::integer + 1;
  v_current_minute := greatest(1, least(v_current_minute, v_max_minutes));

  select coalesce(max(v.minute_index), 0)
  into v_last_charged
  from public.voice_call_minutes v
  where v.user_id = p_user_id
    and v.call_id = p_call_id;

  v_missing := greatest(v_current_minute - v_last_charged, 0);
  v_total := v_missing::bigint * p_amount;

  insert into public.evercoin_wallets (user_id, balance, debt)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select w.balance, w.debt
  into v_balance, v_debt
  from public.evercoin_wallets w
  where w.user_id = p_user_id
  for update;

  if v_debt > 0 then
    update public.voice_calls
    set status = 'ended', ended_at = v_now,
        end_reason = 'evercoin_debt', updated_at = v_now
    where id = p_call_id;

    return query
    select false, v_balance, v_debt, v_current_minute, 0::bigint,
      v_call.started_at, v_call.max_ends_at, 'EVERCOIN_DEBT'::text;
    return;
  end if;

  if v_balance < v_total then
    update public.voice_calls
    set status = 'ended', ended_at = v_now,
        end_reason = 'insufficient_evercoin', updated_at = v_now
    where id = p_call_id;

    return query
    select false, v_balance, v_debt, v_current_minute, 0::bigint,
      v_call.started_at, v_call.max_ends_at, 'INSUFFICIENT_EVERCOIN'::text;
    return;
  end if;

  if v_total > 0 then
    update public.evercoin_wallets w
    set balance = w.balance - v_total, updated_at = v_now
    where w.user_id = p_user_id
    returning w.balance into v_balance;
  end if;

  if v_missing > 0 then
    insert into public.voice_call_minutes (
      user_id,
      call_id,
      character_id,
      minute_index,
      evercoin_charge,
      created_at
    )
    select
      p_user_id,
      p_call_id,
      p_character_id,
      minute_number,
      p_amount,
      v_now
    from generate_series(v_last_charged + 1, v_current_minute) minute_number
    on conflict (user_id, call_id, minute_index) do nothing;

    if v_total > 0 then
      insert into public.evercoin_transactions (
        user_id,
        amount,
        reason,
        reference_id,
        created_at
      )
      values (
        p_user_id,
        -v_total,
        'voice_call_minutes',
        p_call_id::text || ':' || (v_last_charged + 1)::text || '-' || v_current_minute::text,
        v_now
      );
    end if;
  end if;

  update public.voice_calls as vc
  set
    paid_through = greatest(
      vc.paid_through,
      vc.started_at + make_interval(mins => v_current_minute)
    ),
    last_activity_at = v_now,
    updated_at = v_now
  where vc.id = p_call_id;

  return query
  select true, v_balance, v_debt, v_current_minute, v_total,
    v_call.started_at, v_call.max_ends_at, null::text;
end;
$function$;

revoke all on function public.start_voice_call(uuid,text,bigint,integer)
  from public, anon, authenticated;
grant execute on function public.start_voice_call(uuid,text,bigint,integer)
  to service_role;

revoke all on function public.prepare_voice_call_turn(uuid,uuid,text,bigint,integer,integer)
  from public, anon, authenticated;
grant execute on function public.prepare_voice_call_turn(uuid,uuid,text,bigint,integer,integer)
  to service_role;
