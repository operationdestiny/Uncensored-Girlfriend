begin;

create or replace function public.reserve_chat_message(
  p_user_id uuid,
  p_request_id uuid
)
returns table (
  allowed boolean,
  credit_source text,
  trial_remaining integer,
  purchased_remaining bigint,
  debt bigint,
  already_reserved boolean,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage public.message_credit_usage%rowtype;
  v_trial_used integer;
  v_trial_limit integer;
  v_balance bigint;
  v_debt bigint;
  v_source text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('chat-credit:' || p_user_id::text, 0)
  );

  select u.*
  into v_usage
  from public.message_credit_usage as u
  where u.request_id = p_request_id
    and u.user_id = p_user_id;

  if found and v_usage.status in ('reserved', 'completed') then
    select p.trial_messages_used, p.trial_message_limit
    into v_trial_used, v_trial_limit
    from public.profiles as p
    where p.user_id = p_user_id;

    select coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_balance, v_debt
    from public.message_wallets as w
    where w.user_id = p_user_id;

    return query
    select true, v_usage.source,
      greatest(coalesce(v_trial_limit, 20) - coalesce(v_trial_used, 0), 0),
      coalesce(v_balance, 0), coalesce(v_debt, 0), true, null::text;
    return;
  end if;

  if found and v_usage.status = 'refunded' then
    select p.trial_messages_used, p.trial_message_limit
    into v_trial_used, v_trial_limit
    from public.profiles as p
    where p.user_id = p_user_id;

    select coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_balance, v_debt
    from public.message_wallets as w
    where w.user_id = p_user_id;

    return query
    select false, v_usage.source,
      greatest(coalesce(v_trial_limit, 20) - coalesce(v_trial_used, 0), 0),
      coalesce(v_balance, 0), coalesce(v_debt, 0), true,
      'REQUEST_ALREADY_REFUNDED'::text;
    return;
  end if;

  insert into public.profiles (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select p.trial_messages_used, p.trial_message_limit
  into v_trial_used, v_trial_limit
  from public.profiles as p
  where p.user_id = p_user_id
  for update;

  v_trial_used := greatest(coalesce(v_trial_used, 0), 0);
  v_trial_limit := greatest(coalesce(v_trial_limit, 20), 0);

  if v_trial_used < v_trial_limit then
    v_source := 'trial';

    update public.profiles as p
    set
      trial_messages_used = v_trial_used + 1,
      trial_status = case
        when v_trial_used + 1 >= v_trial_limit then 'ended'
        else 'active'
      end,
      trial_started_at = coalesce(p.trial_started_at, clock_timestamp()),
      trial_ended_at = case
        when v_trial_used + 1 >= v_trial_limit then clock_timestamp()
        else null
      end,
      updated_at = clock_timestamp()
    where p.user_id = p_user_id;
  else
    insert into public.message_wallets (user_id, balance, debt)
    values (p_user_id, 0, 0)
    on conflict (user_id) do nothing;

    select w.balance, w.debt
    into v_balance, v_debt
    from public.message_wallets as w
    where w.user_id = p_user_id
    for update;

    if v_debt > 0 then
      return query
      select false, null::text, 0, v_balance, v_debt, false,
        'MESSAGE_DEBT'::text;
      return;
    end if;

    if v_balance < 1 then
      return query
      select false, null::text, 0, v_balance, v_debt, false,
        'NO_MESSAGE_CREDITS'::text;
      return;
    end if;

    v_source := 'purchased';

    update public.message_wallets as w
    set
      balance = w.balance - 1,
      updated_at = clock_timestamp()
    where w.user_id = p_user_id
    returning w.balance, w.debt into v_balance, v_debt;

    insert into public.message_transactions (
      user_id,
      amount,
      reason,
      reference_id
    )
    values (
      p_user_id,
      -1,
      'chat_message',
      p_request_id::text
    );
  end if;

  insert into public.message_credit_usage (
    request_id,
    user_id,
    source,
    status
  )
  values (
    p_request_id,
    p_user_id,
    v_source,
    'reserved'
  );

  if v_source = 'trial' then
    select coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_balance, v_debt
    from public.message_wallets as w
    where w.user_id = p_user_id;
  end if;

  return query
  select true, v_source,
    greatest(
      v_trial_limit - case
        when v_source = 'trial' then v_trial_used + 1
        else v_trial_used
      end,
      0
    ),
    coalesce(v_balance, 0),
    coalesce(v_debt, 0),
    false,
    null::text;
end;
$$;

revoke all
on function public.reserve_chat_message(uuid, uuid)
from public, anon, authenticated;

grant execute
on function public.reserve_chat_message(uuid, uuid)
to service_role;

notify pgrst, 'reload schema';

commit;
