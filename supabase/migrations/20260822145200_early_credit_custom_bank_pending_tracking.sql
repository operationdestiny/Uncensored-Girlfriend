alter table public.plaid_incoming_transactions
  add column if not exists pending_transaction_id text,
  add column if not exists removed_at timestamptz,
  add column if not exists replacement_transaction_id text;

alter table public.evercoin_payment_orders
  add column if not exists settled_transaction_id text;

create index if not exists plaid_incoming_transactions_pending_transaction_idx
  on public.plaid_incoming_transactions(pending_transaction_id)
  where pending_transaction_id is not null;

create index if not exists plaid_incoming_transactions_removed_idx
  on public.plaid_incoming_transactions(removed_at)
  where removed_at is not null;

drop index if exists public.evercoin_payment_orders_custom_bank_pending_amount_key;

create unique index evercoin_payment_orders_custom_bank_pending_amount_key
  on public.evercoin_payment_orders(amount_minor)
  where rail = 'bank'
    and provider = 'direct_bank'
    and pack_code = 'custom'
    and (status = 'pending' or provider_state = 'PENDING_CREDITED');

create or replace function public.reserve_custom_evercoin_bank_order(
  p_user_id uuid,
  p_requested_amount_minor bigint
)
returns table(
  order_id uuid,
  assigned_amount_minor bigint,
  coins bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta integer;
  v_amount bigint;
  v_order_id uuid;
begin
  if p_user_id is null then
    raise exception 'BANK_USER_REQUIRED';
  end if;

  if p_requested_amount_minor < 6 or p_requested_amount_minor > 1000000 then
    raise exception 'BANK_AMOUNT_OUT_OF_RANGE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('everbond-custom-bank-amount-reservation', 0)
  );

  update public.evercoin_payment_orders
  set
    status = 'expired',
    provider_state = 'EXPIRED',
    updated_at = clock_timestamp()
  where rail = 'bank'
    and provider = 'direct_bank'
    and pack_code = 'custom'
    and status = 'pending'
    and provider_state = 'AMOUNT_RESERVED'
    and expires_at is not null
    and expires_at < clock_timestamp();

  update public.evercoin_payment_orders
  set
    status = 'cancelled',
    provider_state = 'CANCELLED',
    updated_at = clock_timestamp()
  where user_id = p_user_id
    and rail = 'bank'
    and provider = 'direct_bank'
    and pack_code = 'custom'
    and status = 'pending'
    and provider_state = 'AMOUNT_RESERVED';

  for v_delta in 0..5 loop
    v_amount := p_requested_amount_minor - v_delta;

    if not exists (
      select 1
      from public.evercoin_payment_orders o
      where o.rail = 'bank'
        and o.provider = 'direct_bank'
        and o.pack_code = 'custom'
        and o.amount_minor = v_amount
        and (o.status = 'pending' or o.provider_state = 'PENDING_CREDITED')
    ) then
      insert into public.evercoin_payment_orders (
        user_id,
        rail,
        provider,
        pack_code,
        coins,
        amount_minor,
        requested_amount_minor,
        currency_code,
        status,
        provider_reference,
        provider_state,
        expires_at
      )
      values (
        p_user_id,
        'bank',
        'direct_bank',
        'custom',
        v_amount,
        v_amount,
        p_requested_amount_minor,
        'USD',
        'pending',
        null,
        'AMOUNT_RESERVED',
        clock_timestamp() + interval '2 hours'
      )
      returning id into v_order_id;

      return query select v_order_id, v_amount, v_amount;
      return;
    end if;
  end loop;

  raise exception 'BANK_AMOUNT_SLOTS_BUSY';
end;
$$;

revoke all on function public.reserve_custom_evercoin_bank_order(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.reserve_custom_evercoin_bank_order(uuid, bigint)
  to service_role;
