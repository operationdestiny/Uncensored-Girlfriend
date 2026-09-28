begin;

-- Final launch hardening for the owner money dashboard.
-- Keep provider reserves conservative, make owner withdrawals atomic, and
-- expand the fail-closed health check to free-trial chat provider cost.

-- Launch-safe provider reserves for every currently paid/provider-backed path.
insert into public.platform_feature_cost_rates (
  reason, provider, feature, cost_usd, notes, updated_at
)
values
  (
    'chat_message',
    'venice',
    'Chat message',
    0.01000000,
    'Conservative Venice chat reserve including prompt/memory overhead and retry headroom.',
    now()
  ),
  (
    'character_image_generation',
    'wavespeed',
    'Image generation',
    0.09000000,
    'Conservative WaveSpeed image reserve covering the current Seedream image path up to the 2K safety amount.',
    now()
  ),
  (
    'character_video_generation',
    'wavespeed',
    '8s video generation',
    0.42000000,
    'Launch-safe WaveSpeed 8-second Seedance reserve covering the current route through its highest supported 1080p setting.',
    now()
  ),
  (
    'evershop_gift_purchase',
    'venice',
    'Gift interaction',
    0.01000000,
    'Conservative Venice reserve for the AI interaction associated with a gift.',
    now()
  ),
  (
    'voice_call_safety_minute',
    'retell',
    'Voice call safety reserve / billed minute',
    0.50000000,
    'Temporary per-started-minute safety reserve. Completed Retell calls reconcile to actual Retell cost plus the Venice voice reserve.',
    now()
  ),
  (
    'voice_call_venice_minute',
    'venice',
    'Voice call Venice safety reserve / billed minute',
    0.10000000,
    'Conservative custom-LLM reserve on top of Retell actual cost; Retell does not report custom-LLM token usage.',
    now()
  )
on conflict (reason) do update set
  provider = excluded.provider,
  feature = excluded.feature,
  cost_usd = excluded.cost_usd,
  notes = excluded.notes,
  updated_at = excluded.updated_at;

-- Never reduce already-created launch-period provider events below the current
-- conservative rate. This is intentionally one-way: safety can understate
-- profit, but must not overstate it.
update public.platform_provider_cost_events e
set
  cost_usd = greatest(e.cost_usd, r.cost_usd),
  updated_at = clock_timestamp()
from public.platform_feature_cost_rates r
where e.reason = r.reason
  and e.created_at >= '2026-08-24 02:07:00+00'::timestamptz
  and e.reason in (
    'chat_message',
    'character_image_generation',
    'character_video_generation',
    'evershop_gift_purchase'
  );

-- The base EC-return path restores the user's EC/cash obligation on a failed
-- feature. Provider cost is different: an upstream attempt may still have cost
-- money. Keep that provider reserve conservatively unless this is the special
-- voice-start refund where Retell never reached the user call.
create or replace function public.platform_preserve_failed_provider_reserve()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.amount <= 0 or new.reference_id is null then
    return new;
  end if;

  if new.reason ilike 'voice_call%refund%' then
    update public.platform_provider_cost_events
    set
      reversed_usd = cost_usd,
      updated_at = clock_timestamp(),
      metadata = metadata || jsonb_build_object(
        'accounting_state', 'refunded_before_retell_start'
      )
    where reason = 'voice_call_safety_minute'
      and reference_id = new.reference_id;
    return new;
  end if;

  if new.reason ilike '%failed%'
     or new.reason ilike '%refund%'
     or new.reason ilike '%reversal%' then
    update public.platform_provider_cost_events e
    set
      reversed_usd = 0,
      updated_at = clock_timestamp(),
      metadata = e.metadata || jsonb_build_object(
        'accounting_state', 'failure_cost_kept_conservative'
      )
    from public.evercoin_transactions original
    where e.evercoin_transaction_id = original.id
      and original.user_id = new.user_id
      and original.reference_id = new.reference_id
      and original.amount < 0
      and e.reversed_usd > 0;
  end if;

  return new;
end;
$$;

revoke all on function public.platform_preserve_failed_provider_reserve() from public;
grant execute on function public.platform_preserve_failed_provider_reserve() to service_role;

drop trigger if exists zz_platform_preserve_failed_provider_reserve_trigger
  on public.evercoin_transactions;
create trigger zz_platform_preserve_failed_provider_reserve_trigger
after insert on public.evercoin_transactions
for each row
execute function public.platform_preserve_failed_provider_reserve();

-- Fail-closed launch health. Any missing cost event on a tracked paid feature,
-- missing voice-minute safety reserve, missing trial-chat provider cost,
-- unknown future spend reason, or paid DROPP order without a cash lot blocks
-- withdrawals by forcing Safe to withdraw to $0.
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
$$;

revoke all on function public.platform_finance_health() from public;
grant execute on function public.platform_finance_health() to service_role;

-- Owner-withdrawal recording must be atomic. The previous route could check the
-- safe balance and insert in two separate database statements. This RPC locks
-- the withdrawal pool, recomputes the fail-closed amount, and inserts in the
-- same transaction so two simultaneous requests cannot withdraw the same profit.
create or replace function public.platform_record_owner_withdrawal_safe(
  p_amount_minor bigint,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_summary jsonb;
  v_safe_usd numeric := 0;
  v_safe_minor bigint := 0;
  v_row public.platform_owner_withdrawals%rowtype;
begin
  if coalesce(p_amount_minor, 0) <= 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_WITHDRAWAL_AMOUNT',
      'safeMinor', 0
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('platform-owner-withdrawal', 0)
  );

  v_summary := public.platform_finance_summary_safe(null, null);
  v_safe_usd := coalesce(
    (v_summary -> 'current' ->> 'safeToWithdrawUsd')::numeric,
    0
  );
  v_safe_minor := greatest(floor(v_safe_usd * 100)::bigint, 0);

  if p_amount_minor > v_safe_minor then
    return jsonb_build_object(
      'ok', false,
      'error', 'WITHDRAWAL_EXCEEDS_SAFE_PROFIT',
      'safeMinor', v_safe_minor
    );
  end if;

  insert into public.platform_owner_withdrawals (
    amount_minor,
    currency_code,
    note
  )
  values (
    p_amount_minor,
    'USD',
    coalesce(nullif(trim(p_note), ''), 'Owner withdrawal/distribution')
  )
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'safeMinorBefore', v_safe_minor,
    'withdrawal', jsonb_build_object(
      'id', v_row.id,
      'amount_minor', v_row.amount_minor,
      'created_at', v_row.created_at
    )
  );
end;
$$;

revoke all on function public.platform_record_owner_withdrawal_safe(bigint,text)
  from public, anon, authenticated;
grant execute on function public.platform_record_owner_withdrawal_safe(bigint,text)
  to service_role;

-- A payout reference is the idempotency key for a manual bank-payout entry.
-- Blank references are not allowed so accidental retry/double-entry can be
-- rejected by the existing UNIQUE(provider, payout_reference) constraint.
alter table public.platform_processor_payouts
  drop constraint if exists platform_processor_payouts_reference_nonblank;
alter table public.platform_processor_payouts
  add constraint platform_processor_payouts_reference_nonblank
  check (length(trim(payout_reference)) > 0);

commit;
