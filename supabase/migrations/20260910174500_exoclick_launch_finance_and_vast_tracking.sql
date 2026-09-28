-- EverBond final ExoClick rewarded-chat + owner finance hardening.
-- Re-runnable through CREATE OR REPLACE / IF NOT EXISTS patterns.
-- No ad revenue estimate is treated as cash. Only recorded ExoClick payouts
-- received in the business bank account can increase the cash-backed ceiling.

alter table public.chat_rewarded_ad_tickets
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists rewarded_at timestamptz,
  add column if not exists no_fill_at timestamptz,
  add column if not exists impression_token text,
  add column if not exists start_token text,
  add column if not exists complete_token text,
  add column if not exists zone_id text;

alter table public.chat_rewarded_ad_tickets
  drop constraint if exists chat_rewarded_ad_tickets_status_check;

alter table public.chat_rewarded_ad_tickets
  add constraint chat_rewarded_ad_tickets_status_check
  check (status in ('pending','impression','rewarded','no_fill','expired'));

create unique index if not exists chat_rewarded_ad_tickets_impression_token_unique
  on public.chat_rewarded_ad_tickets(impression_token)
  where impression_token is not null;

create unique index if not exists chat_rewarded_ad_tickets_start_token_unique
  on public.chat_rewarded_ad_tickets(start_token)
  where start_token is not null;

create unique index if not exists chat_rewarded_ad_tickets_complete_token_unique
  on public.chat_rewarded_ad_tickets(complete_token)
  where complete_token is not null;

create or replace function public.rewarded_chat_track_vast_event(
  p_token_hash text,
  p_event text,
  p_event_token text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_event not in ('impression','start','complete') then
    return false;
  end if;

  select t.id
    into v_id
  from public.chat_rewarded_ad_tickets t
  where t.token_hash = p_token_hash
    and t.status = 'pending'
    and t.provider = 'exoclick'
    and t.expires_at > now()
    and (
      (p_event='impression' and t.impression_token=p_event_token) or
      (p_event='start' and t.start_token=p_event_token) or
      (p_event='complete' and t.complete_token=p_event_token)
    )
  for update;

  if v_id is null then
    return false;
  end if;

  if p_event='impression' then
    update public.chat_rewarded_ad_tickets
    set impression_at = coalesce(impression_at, now())
    where id=v_id;
  elsif p_event='start' then
    update public.chat_rewarded_ad_tickets
    set started_at = coalesce(started_at, now())
    where id=v_id;
  else
    update public.chat_rewarded_ad_tickets
    set completed_at = coalesce(completed_at, now())
    where id=v_id;
  end if;

  return true;
end;
$$;

create or replace function public.rewarded_chat_mark_no_fill(
  p_user_id uuid,
  p_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  select t.id
    into v_id
  from public.chat_rewarded_ad_tickets t
  where t.user_id=p_user_id
    and t.token_hash=p_token_hash
    and t.status='pending'
  for update;

  if v_id is null then
    return false;
  end if;

  update public.chat_rewarded_ad_tickets
  set status='no_fill',
      no_fill_at=coalesce(no_fill_at,now())
  where id=v_id;

  return true;
end;
$$;

create or replace function public.rewarded_chat_consume_ad_ticket(
  p_user_id uuid,
  p_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket public.chat_rewarded_ad_tickets%rowtype;
begin
  select *
    into v_ticket
  from public.chat_rewarded_ad_tickets t
  where t.user_id=p_user_id
    and t.token_hash=p_token_hash
  for update;

  if not found then
    return false;
  end if;

  if v_ticket.status='rewarded' and v_ticket.rewarded_at is not null then
    return true;
  end if;

  if v_ticket.status <> 'pending'
     or v_ticket.provider <> 'exoclick'
     or v_ticket.expires_at <= now()
     or v_ticket.impression_at is null
     or v_ticket.started_at is null
     or v_ticket.no_fill_at is not null
     or v_ticket.started_at > now() - interval '5 seconds'
  then
    return false;
  end if;

  update public.chat_rewarded_ad_tickets
  set status='rewarded',
      rewarded_at=now()
  where id=v_ticket.id
    and status='pending';

  insert into public.chat_rewarded_access_state(
    user_id,
    successful_messages_since_ad,
    updated_at
  )
  values(p_user_id,0,now())
  on conflict(user_id) do update
  set successful_messages_since_ad=0,
      updated_at=now();

  return true;
end;
$$;

create or replace function public.exoclick_rewarded_ad_summary(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
with all_time as (
  select
    count(*)::bigint as tickets,
    count(*) filter(where impression_at is not null)::bigint as verified_impressions,
    count(*) filter(where started_at is not null)::bigint as started,
    count(*) filter(where completed_at is not null)::bigint as completed,
    count(*) filter(where status='rewarded' and rewarded_at is not null)::bigint as rewarded_unlocks,
    count(*) filter(where status='no_fill' or no_fill_at is not null)::bigint as no_fill,
    count(*) filter(where status='pending')::bigint as pending,
    count(*) filter(where status='expired')::bigint as expired
  from public.chat_rewarded_ad_tickets
  where provider='exoclick'
),
period as (
  select
    count(*)::bigint as tickets,
    count(*) filter(where impression_at is not null)::bigint as verified_impressions,
    count(*) filter(where started_at is not null)::bigint as started,
    count(*) filter(where completed_at is not null)::bigint as completed,
    count(*) filter(where status='rewarded' and rewarded_at is not null)::bigint as rewarded_unlocks,
    count(*) filter(where status='no_fill' or no_fill_at is not null)::bigint as no_fill,
    count(*) filter(where status='pending')::bigint as pending,
    count(*) filter(where status='expired')::bigint as expired
  from public.chat_rewarded_ad_tickets
  where provider='exoclick'
    and created_at >= coalesce(p_from,'-infinity'::timestamptz)
    and created_at < coalesce(p_to,'infinity'::timestamptz)
)
select jsonb_build_object(
  'current', jsonb_build_object(
    'tickets',a.tickets,
    'verifiedImpressions',a.verified_impressions,
    'started',a.started,
    'completed',a.completed,
    'rewardedUnlocks',a.rewarded_unlocks,
    'noFill',a.no_fill,
    'pending',a.pending,
    'expired',a.expired
  ),
  'period', jsonb_build_object(
    'tickets',p.tickets,
    'verifiedImpressions',p.verified_impressions,
    'started',p.started,
    'completed',p.completed,
    'rewardedUnlocks',p.rewarded_unlocks,
    'noFill',p.no_fill,
    'pending',p.pending,
    'expired',p.expired
  )
)
from all_time a cross join period p;
$$;

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
ma as (
  select count(*)::bigint n
  from public.message_credit_usage u
  cross join s
  left join public.platform_provider_cost_events e
    on e.event_key='ad-chat:'||u.request_id::text
  where u.created_at>=s.enforce_from
    and u.source='ad_supported'
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
ra as (
  select count(*)::bigint n
  from public.chat_rewarded_ad_tickets t
  where t.status='rewarded'
    and (
      t.impression_at is null
      or t.started_at is null
      or t.rewarded_at is null
      or t.no_fill_at is not null
      or t.rewarded_at < t.started_at + interval '5 seconds'
    )
),
b as (
  select mv.n+mp.n+mt.n+ma.n+mi5.n+mi2.n+us.n+mdl.n+ra.n n
  from mv cross join mp cross join mt cross join ma cross join mi5
  cross join mi2 cross join us cross join mdl cross join ra
)
select jsonb_build_object(
  'healthy',b.n=0,
  'blockingIssues',b.n,
  'voiceMinutesMissingReserve',mv.n,
  'pricedSpendMissingProviderCost',mp.n,
  'trialChatsMissingProviderCost',mt.n,
  'adSupportedChatsMissingProviderCost',ma.n,
  'includedChatsMissingProviderCost',mi5.n+mi2.n,
  'unknownSpendTransactions',us.n,
  'paidDroppOrdersMissingCashLot',mdl.n,
  'unreconciledCashLots',ul.n,
  'rewardedAdIntegrityIssues',ra.n,
  'enforceFrom',s.enforce_from
)
from b cross join mv cross join mp cross join mt cross join ma
cross join mi5 cross join mi2 cross join us cross join mdl cross join ul
cross join ra cross join s;
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
  v_exoclick_payouts numeric:=0;
  v_payouts_received numeric:=0;
  v_period_dropp numeric:=0;
  v_period_exoclick numeric:=0;
  v_period_payouts numeric:=0;
  v_bank_cap numeric:=0;
  v_safe numeric:=0;
  v_waiting numeric:=0;
  v_partner_cost numeric:=0;
  v_partner_platform_reserve numeric:=0;
  v_partner_entitlement numeric:=0;
  v_partner_locked numeric:=0;
  v_partner_unpaid numeric:=0;
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
    into v_exoclick_payouts
  from public.platform_processor_payouts
  where provider='exoclick' and currency_code='USD';

  v_payouts_received:=v_dropp_payouts+v_exoclick_payouts;

  select coalesce(sum(amount_minor)::numeric/100.0,0)
    into v_period_dropp
  from public.platform_processor_payouts
  where provider='dropp'
    and currency_code='USD'
    and received_at>=coalesce(p_from,'-infinity'::timestamptz)
    and received_at<coalesce(p_to,'infinity'::timestamptz);

  select coalesce(sum(amount_minor)::numeric/100.0,0)
    into v_period_exoclick
  from public.platform_processor_payouts
  where provider='exoclick'
    and currency_code='USD'
    and received_at>=coalesce(p_from,'-infinity'::timestamptz)
    and received_at<coalesce(p_to,'infinity'::timestamptz);

  v_period_payouts:=v_period_dropp+v_period_exoclick;

  v_economic_safe:=greatest(
    v_cash_released
    + v_exoclick_payouts
    - v_provider_costs
    - v_owner_withdrawals
    - v_partner_cost
    - v_partner_platform_reserve,
    0
  );

  v_bank_cap:=greatest(
    v_payouts_received
    - v_unused_reserve
    - v_provider_costs
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
    'processorPayoutsReceivedUsd',round(v_payouts_received,2),
    'droppPayoutsReceivedUsd',round(v_dropp_payouts,2),
    'exoclickPayoutsReceivedUsd',round(v_exoclick_payouts,2),
    'adPayoutsReceivedUsd',round(v_exoclick_payouts,2),
    'bankCashAfterProtectionUsd',round(v_bank_cap,2),
    'profitAwaitingPayoutUsd',round(v_waiting,2),
    'safeToWithdrawUsd',round(v_safe,2),
    'financeHealthy',coalesce((v_health->>'healthy')::boolean,false),
    'partnerCommissionEntitlementUsd',round(v_partner_entitlement,2),
    'partnerLockedOrPaidUsd',round(v_partner_locked,2),
    'partnerProtectedCostUsd',round(v_partner_cost,2),
    'partnerPlatformProtectionReserveUsd',round(v_partner_platform_reserve,2),
    'partnerUnpaidLiabilityUsd',round(v_partner_unpaid,2)
  );

  v_period:=v_period||jsonb_build_object(
    'processorPayoutsReceivedUsd',round(v_period_payouts,2),
    'droppPayoutsReceivedUsd',round(v_period_dropp,2),
    'exoclickPayoutsReceivedUsd',round(v_period_exoclick,2),
    'adPayoutsReceivedUsd',round(v_period_exoclick,2)
  );

  return jsonb_build_object('current',v_current,'period',v_period);
end;
$$;

revoke all on function public.rewarded_chat_track_vast_event(text,text,text)
  from public, anon, authenticated;
grant execute on function public.rewarded_chat_track_vast_event(text,text,text)
  to service_role;

revoke all on function public.rewarded_chat_mark_no_fill(uuid,text)
  from public, anon, authenticated;
grant execute on function public.rewarded_chat_mark_no_fill(uuid,text)
  to service_role;

revoke all on function public.rewarded_chat_consume_ad_ticket(uuid,text)
  from public, anon, authenticated;
grant execute on function public.rewarded_chat_consume_ad_ticket(uuid,text)
  to service_role;

revoke all on function public.exoclick_rewarded_ad_summary(timestamptz,timestamptz)
  from public, anon, authenticated;
grant execute on function public.exoclick_rewarded_ad_summary(timestamptz,timestamptz)
  to service_role;

revoke all on function public.platform_finance_health()
  from public, anon, authenticated;
grant execute on function public.platform_finance_health()
  to service_role;

revoke all on function public.platform_finance_summary_safe(timestamptz,timestamptz)
  from public, anon, authenticated;
grant execute on function public.platform_finance_summary_safe(timestamptz,timestamptz)
  to service_role;
