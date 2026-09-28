create or replace function public.reconcile_voice_call_evercoin_proration(
  p_call_id uuid,
  p_duration_seconds numeric
)
returns table (
  applied boolean,
  reserved_evercoin bigint,
  target_evercoin bigint,
  adjustment_evercoin bigint,
  balance bigint,
  debt bigint
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid;
  v_reserved bigint := 0;
  v_rate bigint := 69;
  v_duration numeric := least(greatest(coalesce(p_duration_seconds, 0), 0), 1800);
  v_target bigint := 0;
  v_refunded bigint := 0;
  v_added bigint := 0;
  v_current_net bigint := 0;
  v_delta bigint := 0;
  v_balance bigint := 0;
  v_debt bigint := 0;
  v_to_debt bigint := 0;
  v_to_balance bigint := 0;
  v_shortfall bigint := 0;
  v_existing_reversed bigint := 0;
  v_reverse_needed bigint := 0;
  v_take bigint := 0;
  v_allocation record;
begin
  if p_call_id is null then
    return query select false, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('voice-proration:' || p_call_id::text, 0)
  );

  select vc.user_id
  into v_user_id
  from public.voice_calls as vc
  where vc.id = p_call_id
  for update;

  if not found then
    return query select false, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  select
    coalesce(sum(m.evercoin_charge), 0)::bigint,
    coalesce(max(m.evercoin_charge), 69)::bigint
  into v_reserved, v_rate
  from public.voice_call_minutes as m
  where m.call_id = p_call_id
    and m.user_id = v_user_id;

  if v_reserved <= 0 or v_rate <= 0 then
    select coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_balance, v_debt
    from public.evercoin_wallets as w
    where w.user_id = v_user_id;

    return query
    select false, v_reserved, 0::bigint, 0::bigint,
      coalesce(v_balance, 0), coalesce(v_debt, 0);
    return;
  end if;

  if v_duration > 0 then
    v_target := ceil((v_rate::numeric * v_duration) / 60)::bigint;
  end if;
  v_target := greatest(v_target, 0);

  select
    coalesce(sum(
      case
        when t.reason = 'voice_call_prorated_refund' and t.amount > 0
          then t.amount
        else 0
      end
    ), 0)::bigint,
    coalesce(sum(
      case
        when t.reason = 'voice_call_prorated_adjustment' and t.amount < 0
          then -t.amount
        else 0
      end
    ), 0)::bigint
  into v_refunded, v_added
  from public.evercoin_transactions as t
  where t.user_id = v_user_id
    and t.reference_id = p_call_id::text
    and t.reason in (
      'voice_call_prorated_refund',
      'voice_call_prorated_adjustment'
    );

  v_current_net := greatest(v_reserved - v_refunded + v_added, 0);
  v_delta := v_target - v_current_net;

  insert into public.evercoin_wallets (user_id, balance, debt)
  values (v_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select w.balance, w.debt
  into v_balance, v_debt
  from public.evercoin_wallets as w
  where w.user_id = v_user_id
  for update;

  if v_delta < 0 then
    v_to_debt := least(v_debt, -v_delta);
    v_to_balance := (-v_delta) - v_to_debt;

    update public.evercoin_wallets as w
    set
      debt = w.debt - v_to_debt,
      balance = w.balance + v_to_balance,
      updated_at = clock_timestamp()
    where w.user_id = v_user_id
    returning w.balance, w.debt into v_balance, v_debt;

    insert into public.evercoin_transactions (
      user_id, amount, reason, reference_id
    )
    values (
      v_user_id, -v_delta, 'voice_call_prorated_refund', p_call_id::text
    );

    if v_to_debt > 0 then
      insert into public.evercoin_debt_events (
        user_id, amount, reason, reference_id
      )
      values (
        v_user_id,
        -v_to_debt,
        'voice_call_prorated_refund_debt_payment',
        p_call_id::text
      );
    end if;

    v_refunded := v_refunded + (-v_delta);
  elsif v_delta > 0 then
    v_shortfall := greatest(v_delta - v_balance, 0);

    update public.evercoin_wallets as w
    set
      balance = greatest(w.balance - v_delta, 0),
      debt = w.debt + v_shortfall,
      updated_at = clock_timestamp()
    where w.user_id = v_user_id
    returning w.balance, w.debt into v_balance, v_debt;

    insert into public.evercoin_transactions (
      user_id, amount, reason, reference_id
    )
    values (
      v_user_id, -v_delta, 'voice_call_prorated_adjustment', p_call_id::text
    );

    if v_shortfall > 0 then
      insert into public.evercoin_debt_events (
        user_id, amount, reason, reference_id
      )
      values (
        v_user_id,
        v_shortfall,
        'voice_call_proration_shortfall',
        p_call_id::text
      );
    end if;
  end if;

  -- Return paid-cash allocation whenever prorated EC is returned to a user.
  -- Provider-cost protection is intentionally separate and remains until
  -- Retell actual-cost reconciliation settles the provider side.
  select coalesce(sum(a.ec_reversed), 0)::bigint
  into v_existing_reversed
  from public.evercoin_cash_allocations as a
  join public.evercoin_transactions as t
    on t.id = a.evercoin_transaction_id
  where t.user_id = v_user_id
    and t.amount < 0
    and t.reason in ('voice_call_minute', 'voice_call_minutes')
    and t.reference_id like p_call_id::text || ':%';

  v_reverse_needed := greatest(v_refunded - v_existing_reversed, 0);

  for v_allocation in
    select
      a.id as allocation_id,
      a.cash_lot_id,
      a.ec_amount,
      a.ec_reversed
    from public.evercoin_cash_allocations as a
    join public.evercoin_transactions as t
      on t.id = a.evercoin_transaction_id
    where t.user_id = v_user_id
      and t.amount < 0
      and t.reason in ('voice_call_minute', 'voice_call_minutes')
      and t.reference_id like p_call_id::text || ':%'
      and a.ec_reversed < a.ec_amount
    order by t.created_at desc, a.created_at desc, a.id desc
    for update of a
  loop
    exit when v_reverse_needed <= 0;
    v_take := least(
      v_reverse_needed,
      v_allocation.ec_amount - v_allocation.ec_reversed
    );

    update public.evercoin_cash_allocations
    set ec_reversed = ec_reversed + v_take
    where id = v_allocation.allocation_id;

    update public.evercoin_cash_lots
    set
      coins_remaining = least(coins_granted, coins_remaining + v_take),
      updated_at = clock_timestamp()
    where id = v_allocation.cash_lot_id;

    v_reverse_needed := v_reverse_needed - v_take;
  end loop;

  return query
  select true, v_reserved, v_target, v_delta, v_balance, v_debt;
end;
$function$;

revoke all on function public.reconcile_voice_call_evercoin_proration(uuid, numeric)
from public;
revoke all on function public.reconcile_voice_call_evercoin_proration(uuid, numeric)
from anon;
revoke all on function public.reconcile_voice_call_evercoin_proration(uuid, numeric)
from authenticated;
grant execute on function public.reconcile_voice_call_evercoin_proration(uuid, numeric)
to service_role;

create or replace function public.trigger_voice_call_evercoin_proration()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  perform 1
  from public.reconcile_voice_call_evercoin_proration(
    new.billing_call_id,
    new.duration_seconds
  );
  return new;
end;
$function$;

revoke all on function public.trigger_voice_call_evercoin_proration()
from public;

drop trigger if exists voice_call_evercoin_proration_after_reconcile
on public.platform_voice_call_cost_reconciliations;

create trigger voice_call_evercoin_proration_after_reconcile
after insert or update of duration_seconds
on public.platform_voice_call_cost_reconciliations
for each row
execute function public.trigger_voice_call_evercoin_proration();

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
      'character_video_generation_fallback_adjustment'
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
  select mv.n + mp.n + mt.n + us.n + mdl.n n
  from mv cross join mp cross join mt cross join us cross join mdl
)
select jsonb_build_object(
  'healthy', b.n = 0,
  'blockingIssues', b.n,
  'voiceMinutesMissingReserve', mv.n,
  'pricedSpendMissingProviderCost', mp.n,
  'trialChatsMissingProviderCost', mt.n,
  'unknownSpendTransactions', us.n,
  'paidDroppOrdersMissingCashLot', mdl.n,
  'unreconciledCashLots', ul.n,
  'enforceFrom', s.enforce_from
)
from b
cross join mv
cross join mp
cross join mt
cross join us
cross join mdl
cross join ul
cross join s;
$function$;

update public.platform_feature_cost_rates
set
  cost_usd = 0.04500000,
  feature = '1K image generation',
  notes = 'WaveSpeed Seedream V5.0 Pro Edit at 1K with the first reference image included.',
  updated_at = clock_timestamp()
where reason = 'character_image_generation';

update public.platform_feature_cost_rates
set
  cost_usd = 0.26000000,
  feature = '10s 720p video generation',
  notes = 'WaveSpeed Seedance V1.5 Pro Image-to-Video Spicy, 10 seconds, 720p, audio off.',
  updated_at = clock_timestamp()
where reason = 'character_video_generation';
