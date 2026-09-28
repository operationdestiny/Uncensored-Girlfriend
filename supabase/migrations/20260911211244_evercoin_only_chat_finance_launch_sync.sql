begin;

-- EverCoin-only text chat launch sync.
-- First 20 successful text messages are free; after trial, 3 EC unlocks 19 messages.

create table if not exists public.evercoin_chat_allowances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  remaining integer not null default 0 check (remaining >= 0)
);

create table if not exists public.evercoin_chat_reservations (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_trial boolean not null
);

alter table public.evercoin_chat_allowances enable row level security;
alter table public.evercoin_chat_reservations enable row level security;
revoke all on public.evercoin_chat_allowances, public.evercoin_chat_reservations
  from public, anon, authenticated;
grant all on public.evercoin_chat_allowances, public.evercoin_chat_reservations
  to service_role;

with seeded as (
  insert into public.evercoin_chat_allowances(user_id, remaining)
  select
    p.user_id,
    case
      when b.created_at is not null then greatest(
        19 - (
          select count(*)::integer
          from public.message_credit_usage u
          where u.user_id=p.user_id
            and u.status='completed'
            and u.created_at>b.created_at
        ),
        0
      )
      else 0
    end
  from public.profiles p
  left join lateral (
    select created_at
    from public.chat_rewarded_coin_bypasses b
    where b.user_id=p.user_id
    order by created_at desc
    limit 1
  ) b on true
  on conflict (user_id) do nothing
  returning user_id
)
update public.profiles p
set
  trial_messages_used = least(
    20,
    greatest(
      coalesce(p.trial_messages_used, 0),
      coalesce((
        select count(*)::integer
        from public.message_credit_usage u
        where u.user_id = p.user_id
          and u.status = 'completed'
      ), 0)
    )
  ),
  trial_message_limit=20,
  trial_status = case
    when least(
      20,
      greatest(
        coalesce(p.trial_messages_used, 0),
        coalesce((
          select count(*)::integer
          from public.message_credit_usage u
          where u.user_id = p.user_id
            and u.status = 'completed'
        ), 0)
      )
    ) >= 20 then 'ended'
    when least(
      20,
      greatest(
        coalesce(p.trial_messages_used, 0),
        coalesce((
          select count(*)::integer
          from public.message_credit_usage u
          where u.user_id = p.user_id
            and u.status = 'completed'
        ), 0)
      )
    ) > 0 then 'active'
    else 'not_started'
  end,
  updated_at = clock_timestamp()
where p.user_id in (select user_id from seeded);

create or replace function public.reserve_chat_message(
  p_user_id uuid,
  p_request_id uuid
)
returns table(
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
set search_path=public,pg_temp
as $$
declare
  u public.message_credit_usage%rowtype;
  used integer;
  left_paid integer;
  coins bigint;
  owed bigint;
  src text;
  v_charged boolean := false;
begin
  if p_user_id is null or p_request_id is null then
    raise exception 'INVALID_CHAT_RESERVATION';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('chat-credit:' || p_user_id::text, 0)
  );

  insert into public.profiles(user_id)
  values(p_user_id)
  on conflict do nothing;

  insert into public.evercoin_chat_allowances(user_id)
  values(p_user_id)
  on conflict do nothing;

  insert into public.evercoin_wallets(user_id,balance,debt)
  values(p_user_id,0,0)
  on conflict do nothing;

  select coalesce(p.trial_messages_used,0)
    into used
  from public.profiles p
  where p.user_id=p_user_id
  for update;

  select coalesce(w.balance,0),coalesce(w.debt,0)
    into coins,owed
  from public.evercoin_wallets w
  where w.user_id=p_user_id
  for update;

  select a.remaining
    into left_paid
  from public.evercoin_chat_allowances a
  where a.user_id=p_user_id
  for update;

  select m.*
    into u
  from public.message_credit_usage m
  where m.request_id=p_request_id;

  if found then
    if u.user_id <> p_user_id then
      raise exception 'REQUEST_OWNER_MISMATCH';
    end if;

    return query
    select
      u.status in ('reserved','completed'),
      u.source,
      greatest(20-used,0),
      coins,
      owed,
      true,
      case when u.status='refunded' then 'REQUEST_ALREADY_REFUNDED'::text else null::text end;
    return;
  end if;

  if used < 20 then
    src := 'trial';
    update public.profiles
    set
      trial_messages_used=used+1,
      trial_message_limit=20,
      trial_status=case when used+1>=20 then 'ended' else 'active' end,
      trial_started_at=coalesce(trial_started_at,clock_timestamp()),
      trial_ended_at=case when used+1>=20 then clock_timestamp() else null end,
      updated_at=clock_timestamp()
    where user_id=p_user_id;
    used:=used+1;
  else
    if left_paid=0 then
      if owed>0 or coins<3 then
        return query
        select
          false,
          null::text,
          0,
          coins,
          owed,
          false,
          case when owed>0 then 'EVERCOIN_DEBT' else 'INSUFFICIENT_EVERCOIN' end;
        return;
      end if;

      select c.charged, c.balance
        into v_charged, coins
      from public.charge_evercoin(
        p_user_id,
        3,
        'chat_message',
        p_request_id::text
      ) as c
      limit 1;

      if coalesce(v_charged,false) is not true then
        return query
        select false,null::text,0,coalesce(coins,0),owed,false,'INSUFFICIENT_EVERCOIN'::text;
        return;
      end if;
      left_paid:=19;
      src:='evercoin_two_charge';
    else
      src:='evercoin_two_included';
    end if;

    update public.evercoin_chat_allowances
    set remaining=left_paid-1
    where user_id=p_user_id;
  end if;

  insert into public.message_credit_usage(request_id,user_id,source,status)
  values(p_request_id,p_user_id,src,'reserved');

  insert into public.evercoin_chat_reservations(request_id,user_id,is_trial)
  values(p_request_id,p_user_id,src='trial')
  on conflict (request_id) do nothing;

  return query
  select
    true,
    src,
    greatest(20-used,0),
    coins,
    owed,
    false,
    null::text;
end;
$$;

create or replace function public.refund_chat_message_credit(
  p_user_id uuid,
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  r public.evercoin_chat_reservations%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('chat-credit:' || p_user_id::text,0)
  );

  update public.message_credit_usage
  set status='refunded',refunded_at=clock_timestamp()
  where user_id=p_user_id
    and request_id=p_request_id
    and status='reserved';

  if not found then
    return false;
  end if;

  select * into r
  from public.evercoin_chat_reservations
  where request_id=p_request_id and user_id=p_user_id;

  if not found then
    return true;
  end if;

  if r.is_trial then
    update public.profiles
    set
      trial_messages_used=greatest(trial_messages_used-1,0),
      trial_status=case when greatest(trial_messages_used-1,0)=0 then 'not_started' else 'active' end,
      trial_ended_at=null,
      updated_at=clock_timestamp()
    where user_id=p_user_id;
  else
    update public.evercoin_chat_allowances
    set remaining=remaining+1
    where user_id=p_user_id;
  end if;

  return true;
end;
$$;

revoke all on function public.reserve_chat_message(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.refund_chat_message_credit(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.reserve_chat_message(uuid,uuid)
  to service_role;
grant execute on function public.refund_chat_message_credit(uuid,uuid)
  to service_role;

drop trigger if exists zz_platform_account_zero_cost_ad_free_trigger
  on public.evercoin_transactions;

create or replace function public.platform_finance_health()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
with
s as (
  select '2026-08-24 02:07:00+00'::timestamptz enforce_from
),
mv as (
  select count(*)::bigint n
  from public.voice_call_minutes m
  cross join s
  left join public.platform_provider_cost_events e
    on e.event_key='voice-minute:'||m.call_id::text||':'||m.minute_index::text
  where m.created_at>=s.enforce_from and e.id is null
),
mp as (
  select count(*)::bigint n
  from public.evercoin_transactions t
  cross join s
  join public.platform_feature_cost_rates r on r.reason=t.reason
  left join public.platform_provider_cost_events e
    on e.evercoin_transaction_id=t.id
  where t.created_at>=s.enforce_from
    and t.amount<0
    and t.reason not in('voice_call_minute','voice_call_minutes')
    and e.id is null
),
mt as (
  select count(*)::bigint n
  from public.message_credit_usage u
  cross join s
  left join public.platform_provider_cost_events e
    on e.event_key='trial-chat:'||u.request_id::text
  where u.created_at>=s.enforce_from
    and u.source='trial'
    and u.status='completed'
    and e.id is null
),
mi5 as (
  select count(*)::bigint n
  from public.message_credit_usage u
  cross join s
  left join public.platform_provider_cost_events e
    on e.event_key='five-chat:'||u.request_id::text
  where u.created_at>=s.enforce_from
    and u.source='evercoin_five_included'
    and u.status='completed'
    and e.id is null
),
mi2 as (
  select count(*)::bigint n
  from public.message_credit_usage u
  cross join s
  left join public.platform_provider_cost_events e
    on e.event_key='two-chat:'||u.request_id::text
  where u.created_at>=s.enforce_from
    and u.source='evercoin_two_included'
    and u.status='completed'
    and e.id is null
),
us as (
  select count(*)::bigint n
  from public.evercoin_transactions t
  cross join s
  left join public.platform_feature_cost_rates r on r.reason=t.reason
  where t.created_at>=s.enforce_from
    and t.amount<0
    and r.reason is null
    and t.reason not in(
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
  left join public.evercoin_cash_lots l on l.payment_order_id=o.id
  where o.provider='dropp'
    and o.status='paid'
    and l.id is null
),
ul as (
  select count(*)::bigint n
  from public.evercoin_cash_lots
  where status='active' and net_minor is null
),
b as (
  select mv.n+mp.n+mt.n+mi5.n+mi2.n+us.n+mdl.n+ul.n n
  from mv cross join mp cross join mt cross join mi5 cross join mi2
  cross join us cross join mdl cross join ul
)
select jsonb_build_object(
  'healthy',b.n=0,
  'blockingIssues',b.n,
  'voiceMinutesMissingReserve',mv.n,
  'pricedSpendMissingProviderCost',mp.n,
  'trialChatsMissingProviderCost',mt.n,
  'includedChatsMissingProviderCost',mi5.n+mi2.n,
  'unknownSpendTransactions',us.n,
  'paidDroppOrdersMissingCashLot',mdl.n,
  'unreconciledCashLots',ul.n,
  'enforceFrom',s.enforce_from
)
from b cross join mv cross join mp cross join mt cross join mi5
cross join mi2 cross join us cross join mdl cross join ul cross join s;
$$;

create or replace function public.platform_finance_summary_safe(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_base jsonb;
  v_current jsonb;
  v_period jsonb;
  v_health jsonb;
  v_cash_released numeric:=0;
  v_economic_safe numeric:=0;
  v_unused_reserve numeric:=0;
  v_provider_costs numeric:=0;
  v_owner_withdrawals numeric:=0;
  v_dropp_payouts numeric:=0;
  v_period_dropp numeric:=0;
  v_bank_cap numeric:=0;
  v_safe numeric:=0;
  v_waiting numeric:=0;
  v_partner_cost numeric:=0;
  v_partner_platform_reserve numeric:=0;
  v_partner_entitlement numeric:=0;
  v_partner_locked numeric:=0;
  v_partner_unpaid numeric:=0;
  v_paid_chat_messages bigint:=0;
  v_chat_rate numeric:=0;
  v_chat_block_reserve numeric:=0;
begin
  perform public.partner_reconcile_all();

  v_base:=public.platform_finance_summary(p_from,p_to);
  v_current:=coalesce(v_base->'current','{}'::jsonb);
  v_period:=coalesce(v_base->'period','{}'::jsonb);
  v_health:=public.platform_finance_health();

  v_cash_released:=coalesce((v_current->>'cashReleasedByUsageUsd')::numeric,0);
  v_unused_reserve:=coalesce((v_current->>'unusedEcReserveUsd')::numeric,0);
  v_provider_costs:=coalesce((v_current->>'providerCostsUsd')::numeric,0);
  v_owner_withdrawals:=coalesce((v_current->>'ownerWithdrawalsUsd')::numeric,0);

  select coalesce(r.cost_usd,0)
    into v_chat_rate
  from public.platform_feature_cost_rates r
  where r.reason='chat_message';
  v_chat_rate:=coalesce(v_chat_rate,0);

  select
    coalesce((select sum(a.remaining)::bigint from public.evercoin_chat_allowances a),0)
    + coalesce((
      select count(*)::bigint
      from public.evercoin_chat_reservations r
      join public.message_credit_usage u
        on u.request_id=r.request_id and u.user_id=r.user_id
      where r.is_trial=false and u.status='reserved'
    ),0)
  into v_paid_chat_messages;

  v_chat_block_reserve:=v_paid_chat_messages::numeric*v_chat_rate;

  with locked as (
    select partner_id,
           coalesce(sum(amount_minor)::numeric/100.0,0) amt
    from public.partner_payouts
    where status in('reserved','processing','paid')
    group by partner_id
  )
  select
    coalesce(sum(coalesce(fs.current_commission_usd,0)),0),
    coalesce(sum(coalesce(l.amt,0)),0),
    coalesce(sum(greatest(coalesce(fs.current_commission_usd,0),coalesce(l.amt,0))),0),
    coalesce(sum(greatest(coalesce(fs.current_commission_usd,0)-coalesce(l.amt,0),0)),0)
  into
    v_partner_entitlement,
    v_partner_locked,
    v_partner_cost,
    v_partner_unpaid
  from public.partners p
  left join public.partner_finance_state fs on fs.partner_id=p.id
  left join locked l on l.partner_id=p.id;

  select coalesce(sum(platform_protection_usd),0)
    into v_partner_platform_reserve
  from public.partner_economic_source_state
  where source_type='eligible_cash_release';

  select coalesce(sum(amount_minor)::numeric/100.0,0)
    into v_dropp_payouts
  from public.platform_processor_payouts
  where provider='dropp' and currency_code='USD';

  select coalesce(sum(amount_minor)::numeric/100.0,0)
    into v_period_dropp
  from public.platform_processor_payouts
  where provider='dropp'
    and currency_code='USD'
    and received_at>=coalesce(p_from,'-infinity'::timestamptz)
    and received_at<coalesce(p_to,'infinity'::timestamptz);

  v_economic_safe:=greatest(
    v_cash_released
    - v_provider_costs
    - v_chat_block_reserve
    - v_owner_withdrawals
    - v_partner_cost
    - v_partner_platform_reserve,
    0
  );

  v_bank_cap:=greatest(
    v_dropp_payouts
    - v_unused_reserve
    - v_provider_costs
    - v_chat_block_reserve
    - v_owner_withdrawals
    - v_partner_cost
    - v_partner_platform_reserve,
    0
  );

  v_safe:=least(v_economic_safe,v_bank_cap);

  if coalesce((v_health->>'healthy')::boolean,false) is not true then
    v_safe:=0;
  end if;

  v_waiting:=greatest(v_economic_safe-v_safe,0);

  v_current:=v_current||jsonb_build_object(
    'economicSafeToWithdrawUsd',round(v_economic_safe,2),
    'processorPayoutsReceivedUsd',round(v_dropp_payouts,2),
    'droppPayoutsReceivedUsd',round(v_dropp_payouts,2),
    'bankCashAfterProtectionUsd',round(v_bank_cap,2),
    'profitAwaitingPayoutUsd',round(v_waiting,2),
    'safeToWithdrawUsd',round(v_safe,2),
    'financeHealthy',coalesce((v_health->>'healthy')::boolean,false),
    'paidChatMessagesRemaining',v_paid_chat_messages,
    'chatProviderRateUsd',round(v_chat_rate,8),
    'chatBlockProviderReserveUsd',round(v_chat_block_reserve,8),
    'partnerCommissionEntitlementUsd',round(v_partner_entitlement,2),
    'partnerLockedOrPaidUsd',round(v_partner_locked,2),
    'partnerProtectedCostUsd',round(v_partner_cost,2),
    'partnerPlatformProtectionReserveUsd',round(v_partner_platform_reserve,2),
    'partnerUnpaidLiabilityUsd',round(v_partner_unpaid,2)
  );

  v_period:=v_period||jsonb_build_object(
    'processorPayoutsReceivedUsd',round(v_period_dropp,2),
    'droppPayoutsReceivedUsd',round(v_period_dropp,2)
  );

  return jsonb_build_object('current',v_current,'period',v_period);
end;
$$;

revoke all on function public.platform_finance_health()
  from public,anon,authenticated;
grant execute on function public.platform_finance_health()
  to service_role;

revoke all on function public.platform_finance_summary_safe(timestamptz,timestamptz)
  from public,anon,authenticated;
grant execute on function public.platform_finance_summary_safe(timestamptz,timestamptz)
  to service_role;

commit;
