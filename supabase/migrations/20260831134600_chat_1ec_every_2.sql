begin;

-- ============================================================================
-- EVERBOND TEXT CHAT PRICING: 1 EC / 2 MESSAGES
-- Keep the existing 20-message free trial exactly unchanged.
-- After the trial, message 1 is included and message 2 costs 1 EverCoin.
-- The two-message meter then repeats.
-- Voice calls, voice pricing, images, video, gifts, models and Ever Memory are
-- intentionally untouched.
-- ============================================================================

create table if not exists public.chat_message_two_counters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  messages_since_charge integer not null default 0
    check (messages_since_charge >= 0 and messages_since_charge <= 1),
  updated_at timestamptz not null default now()
);

alter table public.chat_message_two_counters enable row level security;
revoke all on public.chat_message_two_counters from public, anon, authenticated;
grant all on public.chat_message_two_counters to service_role;

-- Start the new pricing meter cleanly for everyone at deployment. Historical
-- five-message usage remains in its old audit table and transaction history.
truncate table public.chat_message_two_counters;

alter table public.message_credit_usage
  drop constraint if exists message_credit_usage_source_check;

alter table public.message_credit_usage
  add constraint message_credit_usage_source_check
  check (
    source in (
      'trial',
      'purchased',
      'evercoin',
      'evercoin_five_charge',
      'evercoin_five_included',
      'evercoin_two_charge',
      'evercoin_two_included'
    )
  );

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
set search_path = public, pg_temp
as $$
declare
  v_usage public.message_credit_usage%rowtype;
  v_trial_used integer;
  v_trial_limit integer;
  v_balance bigint := 0;
  v_debt bigint := 0;
  v_messages_since_charge integer := 0;
  v_source text;
begin
  if p_user_id is null or p_request_id is null then
    raise exception 'INVALID_CHAT_RESERVATION';
  end if;

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
    from public.evercoin_wallets as w
    where w.user_id = p_user_id;

    return query
    select
      true,
      v_usage.source,
      greatest(coalesce(v_trial_limit, 20) - coalesce(v_trial_used, 0), 0),
      coalesce(v_balance, 0),
      coalesce(v_debt, 0),
      true,
      null::text;
    return;
  end if;

  if found and v_usage.status = 'refunded' then
    select p.trial_messages_used, p.trial_message_limit
    into v_trial_used, v_trial_limit
    from public.profiles as p
    where p.user_id = p_user_id;

    select coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_balance, v_debt
    from public.evercoin_wallets as w
    where w.user_id = p_user_id;

    return query
    select
      false,
      v_usage.source,
      greatest(coalesce(v_trial_limit, 20) - coalesce(v_trial_used, 0), 0),
      coalesce(v_balance, 0),
      coalesce(v_debt, 0),
      true,
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
    insert into public.evercoin_wallets (user_id, balance, debt)
    values (p_user_id, 0, 0)
    on conflict (user_id) do nothing;

    insert into public.chat_message_two_counters (
      user_id,
      messages_since_charge
    )
    values (p_user_id, 0)
    on conflict (user_id) do nothing;

    select w.balance, w.debt
    into v_balance, v_debt
    from public.evercoin_wallets as w
    where w.user_id = p_user_id
    for update;

    select c.messages_since_charge
    into v_messages_since_charge
    from public.chat_message_two_counters as c
    where c.user_id = p_user_id
    for update;

    if v_debt > 0 then
      return query
      select
        false,
        null::text,
        0,
        v_balance,
        v_debt,
        false,
        'EVERCOIN_DEBT'::text;
      return;
    end if;

    if v_messages_since_charge < 1 then
      -- First message of the two-message block is included.
      v_source := 'evercoin_two_included';

      update public.chat_message_two_counters as c
      set
        messages_since_charge = 1,
        updated_at = clock_timestamp()
      where c.user_id = p_user_id;
    else
      -- Second successful message completes the block and costs exactly 1 EC.
      if v_balance < 1 then
        return query
        select
          false,
          null::text,
          0,
          v_balance,
          v_debt,
          false,
          'INSUFFICIENT_EVERCOIN'::text;
        return;
      end if;

      v_source := 'evercoin_two_charge';

      update public.evercoin_wallets as w
      set
        balance = w.balance - 1,
        updated_at = clock_timestamp()
      where w.user_id = p_user_id
      returning w.balance, w.debt into v_balance, v_debt;

      update public.chat_message_two_counters as c
      set
        messages_since_charge = 0,
        updated_at = clock_timestamp()
      where c.user_id = p_user_id;

      insert into public.evercoin_transactions (
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
    from public.evercoin_wallets as w
    where w.user_id = p_user_id;
  end if;

  return query
  select
    true,
    v_source,
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

revoke all on function public.reserve_chat_message(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.reserve_chat_message(uuid, uuid)
to service_role;

create or replace function public.refund_chat_message_credit(
  p_user_id uuid,
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usage public.message_credit_usage%rowtype;
  v_balance bigint;
  v_debt bigint;
  v_to_debt bigint;
  v_to_balance bigint;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('chat-credit:' || p_user_id::text, 0)
  );

  select u.*
  into v_usage
  from public.message_credit_usage as u
  where u.request_id = p_request_id
    and u.user_id = p_user_id
    and u.status = 'reserved'
  for update;

  if not found then
    return false;
  end if;

  update public.message_credit_usage as u
  set
    status = 'refunded',
    refunded_at = clock_timestamp()
  where u.request_id = p_request_id
    and u.user_id = p_user_id;

  if v_usage.source = 'trial' then
    update public.profiles as p
    set
      trial_messages_used = greatest(p.trial_messages_used - 1, 0),
      trial_status = case
        when greatest(p.trial_messages_used - 1, 0) = 0 then 'not_started'
        else 'active'
      end,
      trial_ended_at = null,
      updated_at = clock_timestamp()
    where p.user_id = p_user_id;
    return true;
  end if;

  if v_usage.source = 'evercoin_two_included' then
    update public.chat_message_two_counters as c
    set
      messages_since_charge = 0,
      updated_at = clock_timestamp()
    where c.user_id = p_user_id;
    return true;
  end if;

  if v_usage.source = 'evercoin_two_charge' then
    -- The charged second message failed: restore the meter to one and refund 1 EC.
    insert into public.chat_message_two_counters (
      user_id,
      messages_since_charge
    )
    values (p_user_id, 1)
    on conflict (user_id) do update set
      messages_since_charge = 1,
      updated_at = clock_timestamp();
  elsif v_usage.source = 'evercoin_five_included' then
    -- Preserve failure behavior for any old five-message request still in flight.
    update public.chat_message_five_counters as c
    set
      messages_since_charge = greatest(c.messages_since_charge - 1, 0),
      updated_at = clock_timestamp()
    where c.user_id = p_user_id;
    return true;
  elsif v_usage.source = 'evercoin_five_charge' then
    -- Preserve failure behavior for any old charged fifth message still in flight.
    insert into public.chat_message_five_counters (
      user_id,
      messages_since_charge
    )
    values (p_user_id, 4)
    on conflict (user_id) do update set
      messages_since_charge = 4,
      updated_at = clock_timestamp();
  end if;

  -- Charged two-message rows, old five-message charged rows, and legacy
  -- per-message rows all use the established 1 EC refund path.
  insert into public.evercoin_wallets (user_id, balance, debt)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select w.balance, w.debt
  into v_balance, v_debt
  from public.evercoin_wallets as w
  where w.user_id = p_user_id
  for update;

  v_to_debt := least(v_debt, 1);
  v_to_balance := 1 - v_to_debt;

  update public.evercoin_wallets as w
  set
    debt = w.debt - v_to_debt,
    balance = w.balance + v_to_balance,
    updated_at = clock_timestamp()
  where w.user_id = p_user_id;

  insert into public.evercoin_transactions (
    user_id,
    amount,
    reason,
    reference_id
  )
  values (
    p_user_id,
    1,
    'chat_message_failed',
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
      'chat_message_refund_debt_payment',
      p_request_id::text
    );
  end if;

  return true;
end;
$$;

revoke all on function public.refund_chat_message_credit(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.refund_chat_message_credit(uuid, uuid)
to service_role;

-- ============================================================================
-- CHAT PROVIDER COST ACCOUNTING
-- Keep the same safe fallback and the same actual Gemma + Ever Memory token
-- reconciliation. Only the paid-stage meter changes from five messages to two.
-- ============================================================================

update public.platform_feature_cost_rates
set
  provider = 'venice',
  feature = 'Chat message fallback reserve',
  cost_usd = 0.01000000,
  notes = 'Temporary fail-safe reserve per chat. Each event reconciles to actual Gemma 4 Uncensored visible-reply tokens plus actual Venice Role Play Ever Memory tokens after both calls report usage.',
  updated_at = clock_timestamp()
where reason = 'chat_message';

drop trigger if exists platform_account_five_included_chat_cost_trigger
on public.message_credit_usage;

create or replace function public.platform_account_two_included_chat_cost()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rate public.platform_feature_cost_rates%rowtype;
begin
  if new.status = 'completed'
     and new.source = 'evercoin_two_included'
     and old.status is distinct from new.status
  then
    select * into v_rate
    from public.platform_feature_cost_rates
    where reason = 'chat_message';

    if found and v_rate.cost_usd > 0 then
      insert into public.platform_provider_cost_events (
        event_key,
        user_id,
        reason,
        reference_id,
        provider,
        feature,
        cost_usd,
        metadata
      )
      values (
        'two-chat:' || new.request_id::text,
        new.user_id,
        'chat_message',
        new.request_id::text,
        v_rate.provider,
        'Chat message included in two-message meter',
        v_rate.cost_usd,
        jsonb_build_object(
          'source', new.source,
          'accounting_state', 'fallback_waiting_for_token_reconciliation'
        )
      )
      on conflict (event_key) do nothing;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.platform_account_two_included_chat_cost()
from public;
grant execute on function public.platform_account_two_included_chat_cost()
to service_role;

drop trigger if exists platform_account_two_included_chat_cost_trigger
on public.message_credit_usage;
create trigger platform_account_two_included_chat_cost_trigger
after update of status on public.message_credit_usage
for each row
execute function public.platform_account_two_included_chat_cost();

-- Replace only the source/event selection portion of chat reconciliation while
-- preserving the exact token-cost math used by the current five-message system.
create or replace function public.platform_reconcile_chat_cost(
  p_request_id uuid,
  p_visible_input_tokens integer default null,
  p_visible_output_tokens integer default null,
  p_visible_model text default null,
  p_memory_input_tokens integer default null,
  p_memory_output_tokens integer default null,
  p_memory_model text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usage public.message_credit_usage%rowtype;
  v_rate public.platform_feature_cost_rates%rowtype;
  v_event public.platform_provider_cost_events%rowtype;
  v_transaction_id uuid;
  v_expected_key text;
  v_metadata jsonb := '{}'::jsonb;
  v_visible_cost numeric(18,8);
  v_memory_cost numeric(18,8);
  v_total_cost numeric(18,8);
  v_has_visible boolean := false;
  v_has_memory boolean := false;
  v_visible_model text;
  v_memory_model text;
begin
  if p_request_id is null then
    return jsonb_build_object('ok', false, 'error', 'REQUEST_ID_REQUIRED');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('chat-finance:' || p_request_id::text, 0)
  );

  select u.*
  into v_usage
  from public.message_credit_usage as u
  where u.request_id = p_request_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'CHAT_USAGE_NOT_FOUND');
  end if;

  select * into v_rate
  from public.platform_feature_cost_rates
  where reason = 'chat_message';

  if not found then
    return jsonb_build_object('ok', false, 'error', 'CHAT_RATE_NOT_FOUND');
  end if;

  if v_usage.source = 'trial' then
    v_expected_key := 'trial-chat:' || p_request_id::text;

    insert into public.platform_provider_cost_events (
      event_key, user_id, reason, reference_id, provider, feature,
      cost_usd, metadata
    )
    values (
      v_expected_key,
      v_usage.user_id,
      'trial_chat_message',
      p_request_id::text,
      v_rate.provider,
      'Free-trial chat message',
      v_rate.cost_usd,
      jsonb_build_object('source', v_usage.source)
    )
    on conflict (event_key) do nothing;

    select * into v_event
    from public.platform_provider_cost_events
    where event_key = v_expected_key
    for update;
  elsif v_usage.source = 'evercoin_two_included' then
    v_expected_key := 'two-chat:' || p_request_id::text;

    insert into public.platform_provider_cost_events (
      event_key, user_id, reason, reference_id, provider, feature,
      cost_usd, metadata
    )
    values (
      v_expected_key,
      v_usage.user_id,
      'chat_message',
      p_request_id::text,
      v_rate.provider,
      'Chat message included in two-message meter',
      v_rate.cost_usd,
      jsonb_build_object('source', v_usage.source)
    )
    on conflict (event_key) do nothing;

    select * into v_event
    from public.platform_provider_cost_events
    where event_key = v_expected_key
    for update;
  elsif v_usage.source = 'evercoin_five_included' then
    -- Historical compatibility for any previously completed five-meter row.
    v_expected_key := 'five-chat:' || p_request_id::text;

    select * into v_event
    from public.platform_provider_cost_events
    where event_key = v_expected_key
    for update;
  else
    select t.id
    into v_transaction_id
    from public.evercoin_transactions as t
    where t.user_id = v_usage.user_id
      and t.reference_id = p_request_id::text
      and t.reason = 'chat_message'
      and t.amount < 0
    order by t.created_at desc, t.id desc
    limit 1;

    if v_transaction_id is not null then
      insert into public.platform_provider_cost_events (
        event_key,
        evercoin_transaction_id,
        user_id,
        reason,
        reference_id,
        provider,
        feature,
        cost_usd,
        metadata
      )
      values (
        'evercoin:' || v_transaction_id::text,
        v_transaction_id,
        v_usage.user_id,
        'chat_message',
        p_request_id::text,
        v_rate.provider,
        'Chat message',
        v_rate.cost_usd,
        jsonb_build_object('source', v_usage.source)
      )
      on conflict (event_key) do nothing;

      select * into v_event
      from public.platform_provider_cost_events
      where evercoin_transaction_id = v_transaction_id
      order by created_at desc
      limit 1
      for update;
    end if;
  end if;

  if v_event.id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHAT_PROVIDER_COST_EVENT_NOT_FOUND',
      'source', v_usage.source
    );
  end if;

  v_metadata := coalesce(v_event.metadata, '{}'::jsonb);

  if p_visible_input_tokens is not null
     and p_visible_output_tokens is not null
  then
    v_visible_model := coalesce(
      nullif(trim(p_visible_model), ''),
      'gemma-4-uncensored'
    );

    if v_visible_model = 'gemma-4-uncensored' then
      v_visible_cost :=
        greatest(p_visible_input_tokens, 0)::numeric * 0.16300000 / 1000000::numeric
        + greatest(p_visible_output_tokens, 0)::numeric * 0.50000000 / 1000000::numeric;
    elsif v_visible_model = 'venice-uncensored-role-play' then
      v_visible_cost :=
        greatest(p_visible_input_tokens, 0)::numeric * 0.50000000 / 1000000::numeric
        + greatest(p_visible_output_tokens, 0)::numeric * 2.00000000 / 1000000::numeric;
    else
      v_visible_cost :=
        greatest(p_visible_input_tokens, 0)::numeric * 0.50000000 / 1000000::numeric
        + greatest(p_visible_output_tokens, 0)::numeric * 2.00000000 / 1000000::numeric;
    end if;

    v_visible_cost := round(v_visible_cost, 8);
    v_has_visible := true;
    v_metadata := v_metadata || jsonb_build_object(
      'visible_model', v_visible_model,
      'visible_input_tokens', greatest(p_visible_input_tokens, 0),
      'visible_output_tokens', greatest(p_visible_output_tokens, 0),
      'visible_actual_usd', v_visible_cost,
      'visible_input_per_million_usd',
        case when v_visible_model = 'gemma-4-uncensored' then 0.163 else 0.500 end,
      'visible_output_per_million_usd',
        case when v_visible_model = 'gemma-4-uncensored' then 0.500 else 2.000 end
    );
  elsif v_metadata ? 'visible_actual_usd' then
    v_visible_cost := (v_metadata ->> 'visible_actual_usd')::numeric;
    v_has_visible := true;
  end if;

  if p_memory_input_tokens is not null
     and p_memory_output_tokens is not null
  then
    v_memory_model := coalesce(
      nullif(trim(p_memory_model), ''),
      'venice-uncensored-role-play'
    );

    v_memory_cost :=
      greatest(p_memory_input_tokens, 0)::numeric * 0.50000000 / 1000000::numeric
      + greatest(p_memory_output_tokens, 0)::numeric * 2.00000000 / 1000000::numeric;

    v_memory_cost := round(v_memory_cost, 8);
    v_has_memory := true;
    v_metadata := v_metadata || jsonb_build_object(
      'memory_model', v_memory_model,
      'memory_input_tokens', greatest(p_memory_input_tokens, 0),
      'memory_output_tokens', greatest(p_memory_output_tokens, 0),
      'memory_actual_usd', v_memory_cost,
      'memory_input_per_million_usd', 0.500,
      'memory_output_per_million_usd', 2.000
    );
  elsif v_metadata ? 'memory_actual_usd' then
    v_memory_cost := (v_metadata ->> 'memory_actual_usd')::numeric;
    v_has_memory := true;
  end if;

  if v_has_visible and v_has_memory then
    v_total_cost := round(v_visible_cost + v_memory_cost, 8);
    v_metadata := v_metadata || jsonb_build_object(
      'accounting_state', 'actual_token_cost_reconciled',
      'actual_total_usd', v_total_cost,
      'reconciled_at', clock_timestamp()
    );
  else
    v_total_cost := greatest(
      v_event.cost_usd,
      coalesce(v_visible_cost, 0) + coalesce(v_memory_cost, 0),
      v_rate.cost_usd
    );
    v_metadata := v_metadata || jsonb_build_object(
      'accounting_state', 'fallback_waiting_for_both_token_counts'
    );
  end if;

  update public.platform_provider_cost_events
  set
    provider = 'venice',
    cost_usd = v_total_cost,
    reversed_usd = least(reversed_usd, v_total_cost),
    metadata = v_metadata,
    updated_at = clock_timestamp()
  where id = v_event.id;

  return jsonb_build_object(
    'ok', true,
    'source', v_usage.source,
    'eventId', v_event.id,
    'costUsd', v_total_cost,
    'visibleActual', v_has_visible,
    'memoryActual', v_has_memory
  );
end;
$$;

revoke all on function public.platform_reconcile_chat_cost(
  uuid, integer, integer, text, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.platform_reconcile_chat_cost(
  uuid, integer, integer, text, integer, integer, text
) to service_role;

-- ============================================================================
-- FAIL-CLOSED FINANCE HEALTH
-- Keep all prior checks and add the new two-message included rows. Historical
-- five-message included rows remain checked too.
-- ============================================================================

create or replace function public.platform_finance_health()
returns jsonb
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
with s as (
  select '2026-08-24 02:07:00+00'::timestamptz enforce_from
),
mv as (
  select count(*)::bigint n
  from public.voice_call_minutes m
  cross join s
  left join public.platform_provider_cost_events e
    on e.event_key = 'voice-minute:' || m.call_id::text || ':' || m.minute_index::text
  where m.created_at >= s.enforce_from
    and e.id is null
),
mp as (
  select count(*)::bigint n
  from public.evercoin_transactions t
  cross join s
  join public.platform_feature_cost_rates r
    on r.reason = t.reason
  left join public.platform_provider_cost_events e
    on e.evercoin_transaction_id = t.id
  where t.created_at >= s.enforce_from
    and t.amount < 0
    and t.reason not in ('voice_call_minute', 'voice_call_minutes')
    and e.id is null
),
mt as (
  select count(*)::bigint n
  from public.message_credit_usage u
  cross join s
  left join public.platform_provider_cost_events e
    on e.event_key = 'trial-chat:' || u.request_id::text
  where u.created_at >= s.enforce_from
    and u.source = 'trial'
    and u.status = 'completed'
    and e.id is null
),
mi5 as (
  select count(*)::bigint n
  from public.message_credit_usage u
  cross join s
  left join public.platform_provider_cost_events e
    on e.event_key = 'five-chat:' || u.request_id::text
  where u.created_at >= s.enforce_from
    and u.source = 'evercoin_five_included'
    and u.status = 'completed'
    and e.id is null
),
mi2 as (
  select count(*)::bigint n
  from public.message_credit_usage u
  cross join s
  left join public.platform_provider_cost_events e
    on e.event_key = 'two-chat:' || u.request_id::text
  where u.created_at >= s.enforce_from
    and u.source = 'evercoin_two_included'
    and u.status = 'completed'
    and e.id is null
),
us as (
  select count(*)::bigint n
  from public.evercoin_transactions t
  cross join s
  left join public.platform_feature_cost_rates r
    on r.reason = t.reason
  where t.created_at >= s.enforce_from
    and t.amount < 0
    and r.reason is null
    and t.reason not in (
      'voice_call_minute',
      'voice_call_minutes',
      'voice_call_prorated_adjustment',
      'character_video_generation_fallback_adjustment',
      'account_deletion_forfeit'
    )
),
mdl as (
  select count(*)::bigint n
  from public.evercoin_payment_orders o
  left join public.evercoin_cash_lots l
    on l.payment_order_id = o.id
  where o.provider = 'dropp'
    and o.status = 'paid'
    and l.id is null
),
ul as (
  select count(*)::bigint n
  from public.evercoin_cash_lots
  where status = 'active'
    and net_minor is null
),
b as (
  select mv.n + mp.n + mt.n + mi5.n + mi2.n + us.n + mdl.n n
  from mv
  cross join mp
  cross join mt
  cross join mi5
  cross join mi2
  cross join us
  cross join mdl
)
select jsonb_build_object(
  'healthy', b.n = 0,
  'blockingIssues', b.n,
  'voiceMinutesMissingReserve', mv.n,
  'pricedSpendMissingProviderCost', mp.n,
  'trialChatsMissingProviderCost', mt.n,
  'includedChatsMissingProviderCost', mi5.n + mi2.n,
  'unknownSpendTransactions', us.n,
  'paidDroppOrdersMissingCashLot', mdl.n,
  'unreconciledCashLots', ul.n,
  'enforceFrom', s.enforce_from
)
from b
cross join mv
cross join mp
cross join mt
cross join mi5
cross join mi2
cross join us
cross join mdl
cross join ul
cross join s;
$function$;

revoke all on function public.platform_finance_health()
from public, anon, authenticated;
grant execute on function public.platform_finance_health()
to service_role;

commit;
