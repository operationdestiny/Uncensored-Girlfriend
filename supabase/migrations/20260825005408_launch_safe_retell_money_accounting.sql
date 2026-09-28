begin;

-- Launch-safe Retell + EverCoin money accounting.
-- This migration is intentionally idempotent because the live database already
-- contains the first version of the voice-finance safety layer.

alter table public.voice_calls
  add column if not exists retell_call_id text;

create unique index if not exists voice_calls_retell_call_id_uidx
  on public.voice_calls (retell_call_id)
  where retell_call_id is not null;

create table if not exists public.platform_processor_payouts (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'dropp',
  payout_reference text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null default 'USD' check (currency_code = 'USD'),
  received_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  unique (provider, payout_reference)
);

create index if not exists platform_processor_payouts_received_idx
  on public.platform_processor_payouts (received_at desc);

alter table public.platform_processor_payouts enable row level security;
revoke all on table public.platform_processor_payouts from anon, authenticated;
grant all on table public.platform_processor_payouts to service_role;

create table if not exists public.platform_voice_call_cost_reconciliations (
  billing_call_id uuid primary key references public.voice_calls(id) on delete restrict,
  retell_call_id text not null unique,
  billed_minutes integer not null check (billed_minutes >= 0),
  duration_seconds numeric(18,4) not null default 0 check (duration_seconds >= 0),
  retell_cost_usd numeric(18,8) not null check (retell_cost_usd >= 0),
  venice_reserve_usd numeric(18,8) not null check (venice_reserve_usd >= 0),
  total_voice_cost_usd numeric(18,8) not null check (total_voice_cost_usd >= 0),
  source text not null,
  metadata jsonb not null default '{}'::jsonb,
  reconciled_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_voice_call_reconciled_at_idx
  on public.platform_voice_call_cost_reconciliations (reconciled_at desc);

alter table public.platform_voice_call_cost_reconciliations enable row level security;
revoke all on table public.platform_voice_call_cost_reconciliations from anon, authenticated;
grant all on table public.platform_voice_call_cost_reconciliations to service_role;

-- Each started minute carries a conservative combined Retell + Venice reserve
-- until Retell reports the completed-call cost. This makes unfinished or
-- temporarily unreconciled calls LOWER withdrawable profit, never raise it.
insert into public.platform_feature_cost_rates (
  reason, provider, feature, cost_usd, notes, updated_at
)
values
  (
    'voice_call_safety_minute',
    'retell',
    'Voice call safety reserve / billed minute',
    0.50,
    'Temporary launch-safe combined reserve per started minute. Completed calls reconcile to Retell actual cost plus a conservative Venice custom-LLM reserve.',
    now()
  ),
  (
    'voice_call_venice_minute',
    'venice',
    'Voice call Venice reserve / billed minute',
    0.10,
    'Conservative Venice custom-LLM reserve used after Retell actual cost is known. It intentionally errs high so Safe to withdraw cannot be inflated by missing custom-LLM billing data.',
    now()
  )
on conflict (reason) do update set
  provider = excluded.provider,
  feature = excluded.feature,
  cost_usd = excluded.cost_usd,
  notes = excluded.notes,
  updated_at = now();

-- Remove the old direct voice transaction rate. Voice cost is now accounted
-- from voice_call_minutes so minute 1 and every later minute use the same path.
delete from public.platform_feature_cost_rates
where reason in ('voice_call_minute', 'voice_call_minutes');

-- Existing old voice provider-cost events, if any, are superseded by the
-- per-minute safety events below.
update public.platform_provider_cost_events
set
  reversed_usd = cost_usd,
  metadata = metadata || jsonb_build_object('superseded_by', 'voice_call_safety_minute'),
  updated_at = clock_timestamp()
where reason in ('voice_call_minute', 'voice_call_minutes')
  and reversed_usd < cost_usd;

create or replace function public.platform_account_voice_call_minute()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rate public.platform_feature_cost_rates%rowtype;
begin
  select * into v_rate
  from public.platform_feature_cost_rates
  where reason = 'voice_call_safety_minute';

  if found and v_rate.cost_usd > 0 then
    insert into public.platform_provider_cost_events (
      event_key,
      evercoin_transaction_id,
      user_id,
      reason,
      reference_id,
      provider,
      feature,
      cost_usd,
      reversed_usd,
      metadata,
      created_at,
      updated_at
    )
    values (
      'voice-minute:' || new.call_id::text || ':' || new.minute_index::text,
      null,
      new.user_id,
      'voice_call_safety_minute',
      new.call_id::text || ':' || new.minute_index::text,
      v_rate.provider,
      v_rate.feature,
      v_rate.cost_usd,
      0,
      jsonb_build_object(
        'call_id', new.call_id::text,
        'minute_index', new.minute_index,
        'evercoin_charge', new.evercoin_charge,
        'accounting_state', 'safety_reserve'
      ),
      new.created_at,
      new.created_at
    )
    on conflict (event_key) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.platform_account_voice_call_minute() from public;
grant execute on function public.platform_account_voice_call_minute() to service_role;

drop trigger if exists platform_account_voice_call_minute_trigger
  on public.voice_call_minutes;
create trigger platform_account_voice_call_minute_trigger
after insert on public.voice_call_minutes
for each row execute function public.platform_account_voice_call_minute();

-- Backfill a reserve for every already-billed voice minute. ON CONFLICT keeps
-- this safe to run repeatedly.
insert into public.platform_provider_cost_events (
  event_key,
  evercoin_transaction_id,
  user_id,
  reason,
  reference_id,
  provider,
  feature,
  cost_usd,
  reversed_usd,
  metadata,
  created_at,
  updated_at
)
select
  'voice-minute:' || m.call_id::text || ':' || m.minute_index::text,
  null,
  m.user_id,
  'voice_call_safety_minute',
  m.call_id::text || ':' || m.minute_index::text,
  r.provider,
  r.feature,
  r.cost_usd,
  0,
  jsonb_build_object(
    'call_id', m.call_id::text,
    'minute_index', m.minute_index,
    'evercoin_charge', m.evercoin_charge,
    'accounting_state', 'safety_reserve'
  ),
  m.created_at,
  m.created_at
from public.voice_call_minutes m
join public.platform_feature_cost_rates r
  on r.reason = 'voice_call_safety_minute'
on conflict (event_key) do nothing;

-- Keep Retell IDs on local calls for automatic post-call reconciliation.
update public.voice_calls vc
set retell_call_id = r.retell_call_id,
    updated_at = clock_timestamp()
from public.platform_voice_call_cost_reconciliations r
where r.billing_call_id = vc.id
  and vc.retell_call_id is null;

create or replace function public.platform_reconcile_voice_call_cost(
  p_call_id uuid,
  p_retell_call_id text,
  p_retell_cost_usd numeric,
  p_duration_seconds numeric default 0,
  p_source text default 'retell',
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_call public.voice_calls%rowtype;
  v_billed integer;
  v_venice_per numeric(18,8) := 0.10000000;
  v_venice numeric(18,8);
  v_target numeric(18,8);
  v_reserve numeric(18,8);
  v_reverse numeric(18,8);
  v_here numeric(18,8);
  v_extra numeric(18,8);
  v_event record;
  v_rate public.platform_feature_cost_rates%rowtype;
begin
  if p_retell_call_id is null
     or trim(p_retell_call_id) = ''
     or p_retell_cost_usd is null
     or p_retell_cost_usd < 0 then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('voice-finance:' || p_call_id::text, 0)
  );

  select * into v_call
  from public.voice_calls
  where id = p_call_id
  for update;

  if not found then
    return false;
  end if;

  if v_call.retell_call_id is not null
     and v_call.retell_call_id <> trim(p_retell_call_id) then
    return false;
  end if;

  update public.voice_calls
  set retell_call_id = trim(p_retell_call_id),
      updated_at = clock_timestamp()
  where id = p_call_id;

  select count(*)::integer into v_billed
  from public.voice_call_minutes
  where call_id = p_call_id
    and user_id = v_call.user_id;

  if coalesce(v_billed, 0) <= 0 then
    return false;
  end if;

  select cost_usd into v_venice_per
  from public.platform_feature_cost_rates
  where reason = 'voice_call_venice_minute';

  v_venice_per := coalesce(v_venice_per, 0.10000000);
  v_venice := round(v_billed::numeric * v_venice_per, 8);
  v_target := round(greatest(p_retell_cost_usd, 0) + v_venice, 8);

  select * into v_rate
  from public.platform_feature_cost_rates
  where reason = 'voice_call_safety_minute';

  if found then
    insert into public.platform_provider_cost_events (
      event_key,
      evercoin_transaction_id,
      user_id,
      reason,
      reference_id,
      provider,
      feature,
      cost_usd,
      reversed_usd,
      metadata,
      created_at,
      updated_at
    )
    select
      'voice-minute:' || m.call_id::text || ':' || m.minute_index::text,
      null,
      m.user_id,
      'voice_call_safety_minute',
      m.call_id::text || ':' || m.minute_index::text,
      v_rate.provider,
      v_rate.feature,
      v_rate.cost_usd,
      0,
      jsonb_build_object(
        'call_id', m.call_id::text,
        'minute_index', m.minute_index,
        'evercoin_charge', m.evercoin_charge,
        'accounting_state', 'safety_reserve'
      ),
      m.created_at,
      m.created_at
    from public.voice_call_minutes m
    where m.call_id = p_call_id
      and m.user_id = v_call.user_id
    on conflict (event_key) do nothing;
  end if;

  select coalesce(sum(cost_usd), 0)
  into v_reserve
  from public.platform_provider_cost_events
  where event_key like 'voice-minute:' || p_call_id::text || ':%';

  -- Rebuild the net reserve idempotently from the current actual cost.
  update public.platform_provider_cost_events
  set
    reversed_usd = 0,
    updated_at = clock_timestamp(),
    metadata = metadata || jsonb_build_object('accounting_state', 'reconciling')
  where event_key like 'voice-minute:' || p_call_id::text || ':%';

  v_reverse := greatest(v_reserve - v_target, 0);

  for v_event in
    select id, cost_usd
    from public.platform_provider_cost_events
    where event_key like 'voice-minute:' || p_call_id::text || ':%'
    order by created_at, id
    for update
  loop
    exit when v_reverse <= 0;
    v_here := least(v_event.cost_usd, v_reverse);

    update public.platform_provider_cost_events
    set
      reversed_usd = v_here,
      updated_at = clock_timestamp(),
      metadata = metadata || jsonb_build_object(
        'accounting_state', 'retell_actual_reconciled'
      )
    where id = v_event.id;

    v_reverse := v_reverse - v_here;
  end loop;

  update public.platform_provider_cost_events
  set
    metadata = metadata || jsonb_build_object(
      'accounting_state', 'retell_actual_reconciled'
    ),
    updated_at = clock_timestamp()
  where event_key like 'voice-minute:' || p_call_id::text || ':%';

  v_extra := greatest(v_target - v_reserve, 0);

  insert into public.platform_provider_cost_events (
    event_key,
    evercoin_transaction_id,
    user_id,
    reason,
    reference_id,
    provider,
    feature,
    cost_usd,
    reversed_usd,
    metadata,
    created_at,
    updated_at
  )
  values (
    'voice-actual-extra:' || p_call_id::text,
    null,
    v_call.user_id,
    'voice_call_actual_overage',
    p_call_id::text,
    'retell+venice',
    'Voice call actual cost above safety reserve',
    v_extra,
    0,
    jsonb_build_object(
      'retell_call_id', p_retell_call_id,
      'retell_cost_usd', p_retell_cost_usd,
      'venice_reserve_usd', v_venice,
      'billed_minutes', v_billed
    ),
    coalesce(v_call.ended_at, v_call.started_at, now()),
    clock_timestamp()
  )
  on conflict (event_key) do update set
    cost_usd = excluded.cost_usd,
    reversed_usd = 0,
    metadata = excluded.metadata,
    updated_at = clock_timestamp();

  insert into public.platform_voice_call_cost_reconciliations (
    billing_call_id,
    retell_call_id,
    billed_minutes,
    duration_seconds,
    retell_cost_usd,
    venice_reserve_usd,
    total_voice_cost_usd,
    source,
    metadata,
    reconciled_at,
    updated_at
  )
  values (
    p_call_id,
    trim(p_retell_call_id),
    v_billed,
    greatest(coalesce(p_duration_seconds, 0), 0),
    round(greatest(p_retell_cost_usd, 0), 8),
    v_venice,
    v_target,
    left(coalesce(nullif(trim(p_source), ''), 'retell'), 80),
    coalesce(p_metadata, '{}'::jsonb),
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (billing_call_id) do update set
    retell_call_id = excluded.retell_call_id,
    billed_minutes = excluded.billed_minutes,
    duration_seconds = excluded.duration_seconds,
    retell_cost_usd = excluded.retell_cost_usd,
    venice_reserve_usd = excluded.venice_reserve_usd,
    total_voice_cost_usd = excluded.total_voice_cost_usd,
    source = excluded.source,
    metadata = excluded.metadata,
    reconciled_at = excluded.reconciled_at,
    updated_at = excluded.updated_at;

  return true;
end;
$$;

revoke all on function public.platform_reconcile_voice_call_cost(uuid,text,numeric,numeric,text,jsonb) from public;
grant execute on function public.platform_reconcile_voice_call_cost(uuid,text,numeric,numeric,text,jsonb) to service_role;

create or replace function public.platform_finance_health()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
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
  join public.platform_feature_cost_rates r on r.reason = t.reason
  left join public.platform_provider_cost_events e on e.evercoin_transaction_id = t.id
  where t.created_at >= s.enforce_from
    and t.amount < 0
    and t.reason not in ('voice_call_minute', 'voice_call_minutes')
    and e.id is null
),
us as (
  select count(*)::bigint n
  from public.evercoin_transactions t
  cross join s
  left join public.platform_feature_cost_rates r on r.reason = t.reason
  where t.created_at >= s.enforce_from
    and t.amount < 0
    and r.reason is null
    and t.reason not in (
      'voice_call_minute',
      'voice_call_minutes',
      'character_video_generation_fallback_adjustment'
    )
),
mdl as (
  select count(*)::bigint n
  from public.evercoin_payment_orders o
  left join public.evercoin_cash_lots l on l.payment_order_id = o.id
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
  select mv.n + mp.n + us.n + mdl.n n
  from mv cross join mp cross join us cross join mdl
)
select jsonb_build_object(
  'healthy', b.n = 0,
  'blockingIssues', b.n,
  'voiceMinutesMissingReserve', mv.n,
  'pricedSpendMissingProviderCost', mp.n,
  'unknownSpendTransactions', us.n,
  'paidDroppOrdersMissingCashLot', mdl.n,
  'unreconciledCashLots', ul.n,
  'enforceFrom', s.enforce_from
)
from b cross join mv cross join mp cross join us cross join mdl cross join ul cross join s;
$$;

revoke all on function public.platform_finance_health() from public;
grant execute on function public.platform_finance_health() to service_role;

create or replace function public.platform_voice_finance_status()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
with vm as (
  select count(*)::bigint billed_minutes
  from public.voice_call_minutes
),
r as (
  select
    count(*)::bigint reconciled_calls,
    coalesce(sum(retell_cost_usd), 0::numeric) retell_actual_usd,
    coalesce(sum(venice_reserve_usd), 0::numeric) venice_reserve_usd,
    coalesce(sum(total_voice_cost_usd), 0::numeric) reconciled_voice_cost_usd,
    max(reconciled_at) last_reconciled_at
  from public.platform_voice_call_cost_reconciliations
),
pv as (
  select coalesce(sum(cost_usd - reversed_usd), 0::numeric) protected_voice_cost_usd
  from public.platform_provider_cost_events
  where reason in ('voice_call_safety_minute', 'voice_call_actual_overage')
),
sc as (
  select count(distinct m.call_id)::bigint calls_on_safety_reserve
  from public.voice_call_minutes m
  left join public.platform_voice_call_cost_reconciliations r
    on r.billing_call_id = m.call_id
  join public.platform_provider_cost_events e
    on e.event_key = 'voice-minute:' || m.call_id::text || ':' || m.minute_index::text
  where r.billing_call_id is null
    and (e.cost_usd - e.reversed_usd) > 0
),
a as (
  select count(*)::bigint active_calls
  from public.voice_calls
  where status = 'active'
),
w as (
  select count(*)::bigint ended_calls_awaiting_actual
  from public.voice_calls v
  left join public.platform_voice_call_cost_reconciliations r
    on r.billing_call_id = v.id
  where v.status = 'ended'
    and v.retell_call_id is not null
    and r.billing_call_id is null
)
select jsonb_build_object(
  'billedMinutes', vm.billed_minutes,
  'reconciledCalls', r.reconciled_calls,
  'callsOnSafetyReserve', sc.calls_on_safety_reserve,
  'activeCalls', a.active_calls,
  'endedCallsAwaitingActual', w.ended_calls_awaiting_actual,
  'retellActualUsd', round(r.retell_actual_usd, 4),
  'veniceSafetyReserveUsd', round(r.venice_reserve_usd, 4),
  'reconciledVoiceCostUsd', round(r.reconciled_voice_cost_usd, 4),
  'protectedVoiceCostUsd', round(pv.protected_voice_cost_usd, 4),
  'lastReconciledAt', r.last_reconciled_at
)
from vm cross join r cross join pv cross join sc cross join a cross join w;
$$;

revoke all on function public.platform_voice_finance_status() from public;
grant execute on function public.platform_voice_finance_status() to service_role;

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
  v_economic_safe numeric := 0;
  v_unused_reserve numeric := 0;
  v_provider_costs numeric := 0;
  v_owner_withdrawals numeric := 0;
  v_payouts_received numeric := 0;
  v_period_payouts numeric := 0;
  v_bank_cap numeric := 0;
  v_safe numeric := 0;
  v_waiting numeric := 0;
begin
  v_base := public.platform_finance_summary(p_from, p_to);
  v_current := coalesce(v_base -> 'current', '{}'::jsonb);
  v_period := coalesce(v_base -> 'period', '{}'::jsonb);
  v_health := public.platform_finance_health();

  v_economic_safe := coalesce((v_current ->> 'safeToWithdrawUsd')::numeric, 0);
  v_unused_reserve := coalesce((v_current ->> 'unusedEcReserveUsd')::numeric, 0);
  v_provider_costs := coalesce((v_current ->> 'providerCostsUsd')::numeric, 0);
  v_owner_withdrawals := coalesce((v_current ->> 'ownerWithdrawalsUsd')::numeric, 0);

  select coalesce(sum(p.amount_minor)::numeric / 100::numeric, 0::numeric)
  into v_payouts_received
  from public.platform_processor_payouts p
  where p.provider = 'dropp'
    and p.currency_code = 'USD';

  select coalesce(sum(p.amount_minor)::numeric / 100::numeric, 0::numeric)
  into v_period_payouts
  from public.platform_processor_payouts p
  where p.provider = 'dropp'
    and p.currency_code = 'USD'
    and p.received_at >= coalesce(p_from, '-infinity'::timestamptz)
    and p.received_at < coalesce(p_to, 'infinity'::timestamptz);

  v_bank_cap := greatest(
    v_payouts_received - v_unused_reserve - v_provider_costs - v_owner_withdrawals,
    0::numeric
  );

  v_safe := least(v_economic_safe, v_bank_cap);

  -- Fail closed if any tracked feature spend is missing required accounting.
  if coalesce((v_health ->> 'healthy')::boolean, false) is not true then
    v_safe := 0;
  end if;

  v_waiting := greatest(v_economic_safe - v_safe, 0::numeric);

  v_current := v_current || jsonb_build_object(
    'economicSafeToWithdrawUsd', round(v_economic_safe, 2),
    'processorPayoutsReceivedUsd', round(v_payouts_received, 2),
    'bankCashAfterProtectionUsd', round(v_bank_cap, 2),
    'profitAwaitingPayoutUsd', round(v_waiting, 2),
    'safeToWithdrawUsd', round(v_safe, 2),
    'financeHealthy', coalesce((v_health ->> 'healthy')::boolean, false)
  );

  v_period := v_period || jsonb_build_object(
    'processorPayoutsReceivedUsd', round(v_period_payouts, 2)
  );

  return jsonb_build_object('current', v_current, 'period', v_period);
end;
$$;

revoke all on function public.platform_finance_summary_safe(timestamptz,timestamptz) from public;
grant execute on function public.platform_finance_summary_safe(timestamptz,timestamptz) to service_role;

commit;
