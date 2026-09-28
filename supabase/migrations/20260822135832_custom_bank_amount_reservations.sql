alter table public.evercoin_payment_orders
  add column if not exists requested_amount_minor bigint;

comment on column public.evercoin_payment_orders.requested_amount_minor is
  'Original customer-selected amount in cents for custom direct-bank EverCoin orders. The reserved transfer amount may be 0-5 cents lower to keep it unique.';

create index if not exists evercoin_payment_orders_direct_bank_pending_amount_idx
  on public.evercoin_payment_orders(amount_minor, created_at)
  where rail = 'bank' and provider = 'direct_bank' and status = 'pending';

create unique index if not exists evercoin_payment_orders_custom_bank_pending_amount_key
  on public.evercoin_payment_orders(amount_minor)
  where rail = 'bank'
    and provider = 'direct_bank'
    and pack_code = 'custom'
    and status = 'pending';

alter table public.evercoin_payment_orders
  drop constraint if exists evercoin_payment_orders_custom_amount_check;

alter table public.evercoin_payment_orders
  add constraint evercoin_payment_orders_custom_amount_check
  check (
    pack_code <> 'custom'
    or (
      rail = 'bank'
      and provider = 'direct_bank'
      and requested_amount_minor is not null
      and requested_amount_minor >= 6
      and amount_minor between requested_amount_minor - 5 and requested_amount_minor
      and coins = amount_minor
      and provider_reference is null
    )
  );

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

  for v_delta in 0..5 loop
    v_amount := p_requested_amount_minor - v_delta;

    if not exists (
      select 1
      from public.evercoin_payment_orders o
      where o.rail = 'bank'
        and o.provider = 'direct_bank'
        and o.status = 'pending'
        and o.amount_minor = v_amount
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
        provider_state
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
        'AMOUNT_RESERVED'
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
