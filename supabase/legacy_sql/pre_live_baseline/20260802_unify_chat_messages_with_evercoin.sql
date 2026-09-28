begin;

-- ---------------------------------------------------------------------------
-- Convert the retired paid-message wallet into the single EverCoin wallet.
-- The existing 20-message free trial remains unchanged.
-- ---------------------------------------------------------------------------

alter table public.evercoin_wallets
  add column if not exists debt bigint not null default 0;

create table if not exists public.evercoin_debt_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null check (amount <> 0),
  reason text not null,
  reference_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.message_to_evercoin_migrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  message_balance_migrated bigint not null default 0,
  message_debt_migrated bigint not null default 0,
  migrated_at timestamptz not null default now()
);

alter table public.message_to_evercoin_migrations enable row level security;

drop policy if exists message_to_evercoin_migrations_owner_read
  on public.message_to_evercoin_migrations;
create policy message_to_evercoin_migrations_owner_read
on public.message_to_evercoin_migrations
for select
using (auth.uid() = user_id);

grant select on public.message_to_evercoin_migrations to authenticated;
grant all on public.message_to_evercoin_migrations to service_role;

do $$
declare
  r record;
  v_coin_balance bigint;
  v_coin_debt bigint;
  v_combined_balance bigint;
  v_combined_debt bigint;
  v_debt_paid bigint;
begin
  for r in
    select
      w.user_id,
      greatest(coalesce(w.balance, 0), 0)::bigint as message_balance,
      greatest(coalesce(w.debt, 0), 0)::bigint as message_debt
    from public.message_wallets as w
    left join public.message_to_evercoin_migrations as m
      on m.user_id = w.user_id
    where m.user_id is null
    order by w.user_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('currency-unification:' || r.user_id::text, 0)
    );

    insert into public.evercoin_wallets (user_id, balance, debt)
    values (r.user_id, 0, 0)
    on conflict (user_id) do nothing;

    select coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_coin_balance, v_coin_debt
    from public.evercoin_wallets as w
    where w.user_id = r.user_id
    for update;

    v_combined_balance := v_coin_balance + r.message_balance;
    v_combined_debt := v_coin_debt + r.message_debt;
    v_debt_paid := least(v_combined_balance, v_combined_debt);

    update public.evercoin_wallets as w
    set
      balance = v_combined_balance - v_debt_paid,
      debt = v_combined_debt - v_debt_paid,
      updated_at = clock_timestamp()
    where w.user_id = r.user_id;

    if r.message_balance > 0 then
      insert into public.evercoin_transactions (
        user_id,
        amount,
        reason,
        reference_id
      )
      values (
        r.user_id,
        r.message_balance,
        'message_balance_migrated_to_evercoin',
        '20260802_currency_unification'
      );
    end if;

    if r.message_debt > 0 then
      insert into public.evercoin_debt_events (
        user_id,
        amount,
        reason,
        reference_id
      )
      values (
        r.user_id,
        r.message_debt,
        'message_debt_migrated_to_evercoin',
        '20260802_currency_unification'
      );
    end if;

    if v_debt_paid > 0 then
      insert into public.evercoin_debt_events (
        user_id,
        amount,
        reason,
        reference_id
      )
      values (
        r.user_id,
        -v_debt_paid,
        'unified_currency_balance_paid_debt',
        '20260802_currency_unification'
      );
    end if;

    update public.message_wallets as w
    set
      balance = 0,
      debt = 0,
      updated_at = clock_timestamp()
    where w.user_id = r.user_id;

    insert into public.message_to_evercoin_migrations (
      user_id,
      message_balance_migrated,
      message_debt_migrated
    )
    values (
      r.user_id,
      r.message_balance,
      r.message_debt
    );
  end loop;
end;
$$;

-- Existing completed/reserved paid-message rows may still say `purchased`.
-- New reservations use `evercoin`.
alter table public.message_credit_usage
  drop constraint if exists message_credit_usage_source_check;

alter table public.message_credit_usage
  add constraint message_credit_usage_source_check
  check (source in ('trial', 'purchased', 'evercoin'));

-- ---------------------------------------------------------------------------
-- One free-trial message or one EverCoin is reserved atomically per request.
-- The return signature stays compatible with the current server wrapper;
-- `purchased_remaining` now carries the remaining EverCoin balance.
-- ---------------------------------------------------------------------------

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

    select w.balance, w.debt
    into v_balance, v_debt
    from public.evercoin_wallets as w
    where w.user_id = p_user_id
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

    v_source := 'evercoin';

    update public.evercoin_wallets as w
    set
      balance = w.balance - 1,
      updated_at = clock_timestamp()
    where w.user_id = p_user_id
    returning w.balance, w.debt into v_balance, v_debt;

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

create or replace function public.complete_chat_message_credit(
  p_user_id uuid,
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.message_credit_usage as u
  set
    status = 'completed',
    completed_at = clock_timestamp()
  where u.request_id = p_request_id
    and u.user_id = p_user_id
    and u.status = 'reserved';

  get diagnostics v_updated = row_count;

  return v_updated = 1 or exists (
    select 1
    from public.message_credit_usage as u
    where u.request_id = p_request_id
      and u.user_id = p_user_id
      and u.status = 'completed'
  );
end;
$$;

create or replace function public.refund_chat_message_credit(
  p_user_id uuid,
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
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

-- ---------------------------------------------------------------------------
-- Legacy safety: any old Paddle message-bundle checkout that completes after
-- this deployment is converted 1:1 into EverCoin instead of reviving a second
-- wallet. No new message-bundle checkout is exposed by the application.
-- ---------------------------------------------------------------------------

create or replace function public.credit_message_purchase(
  p_user_id uuid,
  p_transaction_id text,
  p_price_id text,
  p_bundle_code text,
  p_messages bigint,
  p_total_minor bigint,
  p_currency_code text
)
returns table (
  credited boolean,
  balance bigint,
  debt bigint,
  messages_applied_to_debt bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_debt bigint;
  v_to_debt bigint;
  v_to_balance bigint;
begin
  if p_messages <= 0 then
    raise exception 'INVALID_MESSAGE_PURCHASE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('paddle-message:' || p_transaction_id, 0)
  );

  if exists (
    select 1
    from public.message_purchases as p
    where p.paddle_transaction_id = p_transaction_id
  ) then
    select coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_balance, v_debt
    from public.evercoin_wallets as w
    where w.user_id = p_user_id;

    return query
    select false, coalesce(v_balance, 0), coalesce(v_debt, 0), 0::bigint;
    return;
  end if;

  insert into public.evercoin_wallets (user_id, balance, debt)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select w.balance, w.debt
  into v_balance, v_debt
  from public.evercoin_wallets as w
  where w.user_id = p_user_id
  for update;

  v_to_debt := least(v_debt, p_messages);
  v_to_balance := p_messages - v_to_debt;

  update public.evercoin_wallets as w
  set
    debt = w.debt - v_to_debt,
    balance = w.balance + v_to_balance,
    updated_at = clock_timestamp()
  where w.user_id = p_user_id
  returning w.balance, w.debt into v_balance, v_debt;

  insert into public.message_purchases (
    paddle_transaction_id,
    user_id,
    price_id,
    bundle_code,
    messages_granted,
    transaction_total_minor,
    currency_code,
    status
  )
  values (
    p_transaction_id,
    p_user_id,
    p_price_id,
    p_bundle_code,
    p_messages,
    p_total_minor,
    p_currency_code,
    'credited'
  );

  insert into public.evercoin_transactions (
    user_id,
    amount,
    reason,
    reference_id
  )
  values (
    p_user_id,
    p_messages,
    'legacy_message_bundle_converted_to_evercoin',
    p_transaction_id
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
      'legacy_message_bundle_paid_evercoin_debt',
      p_transaction_id
    );
  end if;

  return query
  select true, v_balance, v_debt, v_to_debt;
end;
$$;

create or replace function public.reverse_message_purchase(
  p_transaction_id text,
  p_adjustment_id text,
  p_action text,
  p_status text,
  p_messages bigint
)
returns table (
  reversed boolean,
  user_id uuid,
  balance bigint,
  debt bigint,
  messages_reversed bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.message_purchases%rowtype;
  v_balance bigint;
  v_debt bigint;
  v_remaining bigint;
  v_requested bigint;
  v_from_balance bigint;
  v_to_debt bigint;
  v_existing_user_id uuid;
begin
  if p_messages <= 0 then
    raise exception 'INVALID_MESSAGE_REVERSAL';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('paddle-message-adjustment:' || p_adjustment_id, 0)
  );

  if exists (
    select 1
    from public.message_adjustments as a
    where a.adjustment_id = p_adjustment_id
  ) then
    select p.user_id, coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_existing_user_id, v_balance, v_debt
    from public.message_purchases as p
    left join public.evercoin_wallets as w
      on w.user_id = p.user_id
    where p.paddle_transaction_id = p_transaction_id;

    return query
    select
      false,
      v_existing_user_id,
      coalesce(v_balance, 0),
      coalesce(v_debt, 0),
      0::bigint;
    return;
  end if;

  select p.*
  into v_purchase
  from public.message_purchases as p
  where p.paddle_transaction_id = p_transaction_id
  for update;

  if not found then
    return query
    select false, null::uuid, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  v_remaining := greatest(
    v_purchase.messages_granted - v_purchase.messages_reversed,
    0
  );
  v_requested := least(p_messages, v_remaining);

  insert into public.evercoin_wallets (user_id, balance, debt)
  values (v_purchase.user_id, 0, 0)
  on conflict (user_id) do nothing;

  select w.balance, w.debt
  into v_balance, v_debt
  from public.evercoin_wallets as w
  where w.user_id = v_purchase.user_id
  for update;

  v_from_balance := least(v_balance, v_requested);
  v_to_debt := v_requested - v_from_balance;

  update public.evercoin_wallets as w
  set
    balance = w.balance - v_from_balance,
    debt = w.debt + v_to_debt,
    updated_at = clock_timestamp()
  where w.user_id = v_purchase.user_id
  returning w.balance, w.debt into v_balance, v_debt;

  update public.message_purchases as p
  set
    messages_reversed = p.messages_reversed + v_requested,
    status = case
      when p.messages_reversed + v_requested >= p.messages_granted
        then 'reversed'
      else 'partially_reversed'
    end,
    updated_at = clock_timestamp()
  where p.paddle_transaction_id = p_transaction_id;

  insert into public.message_adjustments (
    adjustment_id,
    paddle_transaction_id,
    user_id,
    action,
    status,
    messages_reversed
  )
  values (
    p_adjustment_id,
    p_transaction_id,
    v_purchase.user_id,
    p_action,
    p_status,
    v_requested
  );

  if v_from_balance > 0 then
    insert into public.evercoin_transactions (
      user_id,
      amount,
      reason,
      reference_id
    )
    values (
      v_purchase.user_id,
      -v_from_balance,
      'legacy_message_bundle_reversal',
      p_adjustment_id
    );
  end if;

  if v_to_debt > 0 then
    insert into public.evercoin_debt_events (
      user_id,
      amount,
      reason,
      reference_id
    )
    values (
      v_purchase.user_id,
      v_to_debt,
      'legacy_message_bundle_reversal_debt',
      p_adjustment_id
    );
  end if;

  return query
  select true, v_purchase.user_id, v_balance, v_debt, v_requested;
end;
$$;

revoke all on function public.reserve_chat_message(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.complete_chat_message_credit(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.refund_chat_message_credit(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.credit_message_purchase(uuid, text, text, text, bigint, bigint, text)
from public, anon, authenticated;
revoke all on function public.reverse_message_purchase(text, text, text, text, bigint)
from public, anon, authenticated;

grant execute on function public.reserve_chat_message(uuid, uuid)
to service_role;
grant execute on function public.complete_chat_message_credit(uuid, uuid)
to service_role;
grant execute on function public.refund_chat_message_credit(uuid, uuid)
to service_role;
grant execute on function public.credit_message_purchase(uuid, text, text, text, bigint, bigint, text)
to service_role;
grant execute on function public.reverse_message_purchase(text, text, text, text, bigint)
to service_role;

notify pgrst, 'reload schema';

commit;
