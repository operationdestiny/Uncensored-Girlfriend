create or replace function public.finalize_custom_bank_posted_match(
  p_order_id uuid,
  p_pending_transaction_id text,
  p_posted_transaction_id text,
  p_posted_amount_minor bigint,
  p_external_transaction_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.evercoin_payment_orders%rowtype;
  v_posted_order_id uuid;
begin
  if p_order_id is null
     or p_posted_transaction_id is null
     or btrim(p_posted_transaction_id) = ''
     or p_posted_amount_minor <= 0 then
    raise exception 'INVALID_CUSTOM_BANK_SETTLEMENT';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('everbond-custom-bank-settlement:' || p_order_id::text, 0)
  );

  select * into v_order
  from public.evercoin_payment_orders
  where id = p_order_id
    and rail = 'bank'
    and provider = 'direct_bank'
    and pack_code = 'custom'
  for update;

  if not found then
    return false;
  end if;

  if v_order.provider_state = 'RECEIVED'
     and v_order.settled_transaction_id = p_posted_transaction_id then
    return true;
  end if;

  if v_order.provider_state not in ('PENDING_CREDITED', 'PENDING_REVERSED') then
    return false;
  end if;

  select matched_order_id into v_posted_order_id
  from public.plaid_incoming_transactions
  where transaction_id = p_posted_transaction_id
  for update;

  if not found then
    raise exception 'POSTED_TRANSACTION_NOT_FOUND';
  end if;

  if v_posted_order_id is not null and v_posted_order_id <> p_order_id then
    raise exception 'POSTED_TRANSACTION_ALREADY_MATCHED';
  end if;

  if p_pending_transaction_id is not null and btrim(p_pending_transaction_id) <> '' then
    update public.plaid_incoming_transactions
    set
      matched_order_id = null,
      replacement_transaction_id = p_posted_transaction_id,
      last_seen_at = clock_timestamp()
    where transaction_id = p_pending_transaction_id
      and matched_order_id = p_order_id;
  else
    update public.plaid_incoming_transactions
    set
      matched_order_id = null,
      replacement_transaction_id = p_posted_transaction_id,
      last_seen_at = clock_timestamp()
    where matched_order_id = p_order_id
      and pending = true;
  end if;

  update public.plaid_incoming_transactions
  set
    matched_order_id = p_order_id,
    last_seen_at = clock_timestamp()
  where transaction_id = p_posted_transaction_id
    and (matched_order_id is null or matched_order_id = p_order_id);

  if not found then
    raise exception 'POSTED_TRANSACTION_MATCH_FAILED';
  end if;

  update public.evercoin_payment_orders
  set
    coins = p_posted_amount_minor,
    amount_minor = p_posted_amount_minor,
    status = 'paid',
    external_transaction_id = coalesce(p_external_transaction_id, external_transaction_id),
    settled_transaction_id = p_posted_transaction_id,
    provider_state = 'RECEIVED',
    paid_at = coalesce(paid_at, clock_timestamp()),
    updated_at = clock_timestamp(),
    error_code = null
  where id = p_order_id;

  return true;
end;
$$;

revoke all on function public.finalize_custom_bank_posted_match(uuid, text, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.finalize_custom_bank_posted_match(uuid, text, text, bigint, text)
  to service_role;
