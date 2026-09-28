create or replace function public.reverse_evercoin_purchase(
  p_transaction_id text,
  p_adjustment_id text,
  p_action text,
  p_status text,
  p_coins bigint
)
returns table(
  reversed boolean,
  user_id uuid,
  balance bigint,
  debt bigint,
  coins_reversed bigint
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_purchase public.evercoin_purchases%rowtype;
  v_balance bigint;
  v_debt bigint;
  v_remaining bigint;
  v_requested bigint;
  v_from_balance bigint;
  v_to_debt bigint;
  v_existing_user_id uuid;
begin
  if p_coins <= 0 then
    raise exception 'INVALID_EVERCOIN_REVERSAL';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('paddle-adjustment:' || p_adjustment_id, 0)
  );

  if exists (
    select 1 from public.evercoin_adjustments
    where adjustment_id = p_adjustment_id
  ) then
    select p.user_id, coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_existing_user_id, v_balance, v_debt
    from public.evercoin_purchases p
    left join public.evercoin_wallets w on w.user_id = p.user_id
    where p.paddle_transaction_id = p_transaction_id;

    return query
    select false, v_existing_user_id, coalesce(v_balance, 0),
      coalesce(v_debt, 0), 0::bigint;
    return;
  end if;

  select * into v_purchase
  from public.evercoin_purchases
  where paddle_transaction_id = p_transaction_id
  for update;

  if not found then
    return query
    select false, null::uuid, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  v_remaining := greatest(v_purchase.coins_granted - v_purchase.coins_reversed, 0);
  v_requested := least(p_coins, v_remaining);

  insert into public.evercoin_wallets (user_id, balance, debt)
  values (v_purchase.user_id, 0, 0)
  on conflict on constraint evercoin_wallets_pkey do nothing;

  select w.balance, w.debt
  into v_balance, v_debt
  from public.evercoin_wallets w
  where w.user_id = v_purchase.user_id
  for update;

  v_from_balance := least(v_balance, v_requested);
  v_to_debt := v_requested - v_from_balance;

  update public.evercoin_wallets w
  set
    balance = w.balance - v_from_balance,
    debt = w.debt + v_to_debt,
    updated_at = clock_timestamp()
  where w.user_id = v_purchase.user_id
  returning w.balance, w.debt into v_balance, v_debt;

  update public.evercoin_purchases
  set
    coins_reversed = coins_reversed + v_requested,
    status = case
      when coins_reversed + v_requested >= coins_granted then 'reversed'
      else 'partially_reversed'
    end,
    updated_at = clock_timestamp()
  where paddle_transaction_id = p_transaction_id;

  insert into public.evercoin_adjustments (
    adjustment_id,
    paddle_transaction_id,
    user_id,
    action,
    status,
    coins_reversed
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
      'evercoin_purchase_reversal',
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
      'evercoin_purchase_reversal_debt',
      p_adjustment_id
    );
  end if;

  return query
  select true, v_purchase.user_id, v_balance, v_debt, v_requested;
end;
$$;

revoke all on function public.reverse_evercoin_purchase(text,text,text,text,bigint)
  from public, anon, authenticated;
grant execute on function public.reverse_evercoin_purchase(text,text,text,text,bigint)
  to service_role;
