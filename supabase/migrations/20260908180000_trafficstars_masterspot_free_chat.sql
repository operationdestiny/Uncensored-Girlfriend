begin;

-- =============================================================================
-- TrafficStars + permanently free text chat
-- - manual cumulative TrafficStars publisher snapshots for exact economics
-- - ad-supported chat has its own finance source/event key
-- - Gemma 4 pricing applies to visible chat AND Ever Memory
-- - Ever Memory skipped turns can reconcile as an explicit $0 memory cost
-- - realized TrafficStars payouts are included in owner cash safety
-- - rapid successful free-chat generation is capped server-side
-- =============================================================================

create table if not exists public.trafficstars_stats_snapshots (
  id uuid primary key default gen_random_uuid(),
  recorded_at timestamptz not null default now(),
  revenue_usd numeric(18,8) not null check (revenue_usd >= 0),
  impressions bigint not null check (impressions >= 0),
  clicks bigint not null default 0 check (clicks >= 0),
  note text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists trafficstars_stats_snapshots_recorded_at_idx
  on public.trafficstars_stats_snapshots (recorded_at desc);

alter table public.trafficstars_stats_snapshots enable row level security;
revoke all on table public.trafficstars_stats_snapshots from public, anon, authenticated;
grant all on table public.trafficstars_stats_snapshots to service_role;

-- New requests use a truthful source name instead of the historical free-trial
-- compatibility label. Historical rows remain valid.
alter table public.message_credit_usage
  drop constraint if exists message_credit_usage_source_check;
alter table public.message_credit_usage
  add constraint message_credit_usage_source_check
  check (
    source = any (
      array[
        'trial'::text,
        'ad_supported'::text,
        'purchased'::text,
        'evercoin'::text,
        'evercoin_five_charge'::text,
        'evercoin_five_included'::text,
        'evercoin_two_charge'::text,
        'evercoin_two_included'::text
      ]
    )
  );

create or replace function public.platform_reconcile_chat_cost(
  p_request_id uuid,
  p_visible_input_tokens integer default null,
  p_visible_output_tokens integer default null,
  p_visible_model text default null,
  p_memory_input_tokens integer default null,
  p_memory_output_tokens integer default null,
  p_memory_model text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_usage public.message_credit_usage%rowtype;
  v_rate public.platform_feature_cost_rates%rowtype;
  v_event public.platform_provider_cost_events%rowtype;
  v_transaction_id uuid;
  v_expected_key text;
  v_metadata jsonb := '{}'::jsonb;
  v_visible_cost numeric(18,8);
  v_memory_cost numeric(18,8);
  v_total_cost numeric(18,8);
  v_has_visible boolean := false;
  v_has_memory boolean := false;
  v_visible_model text;
  v_memory_model text;
begin
  if p_request_id is null then
    return jsonb_build_object('ok', false, 'error', 'REQUEST_ID_REQUIRED');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('chat-finance:' || p_request_id::text, 0)
  );

  select u.* into v_usage
  from public.message_credit_usage as u
  where u.request_id = p_request_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'CHAT_USAGE_NOT_FOUND');
  end if;

  select * into v_rate
  from public.platform_feature_cost_rates
  where reason = 'chat_message';

  if not found then
    return jsonb_build_object('ok', false, 'error', 'CHAT_RATE_NOT_FOUND');
  end if;

  if v_usage.source = 'ad_supported' then
    v_expected_key := 'ad-chat:' || p_request_id::text;

    insert into public.platform_provider_cost_events (
      event_key, user_id, reason, reference_id, provider, feature,
      cost_usd, metadata
    )
    values (
      v_expected_key,
      v_usage.user_id,
      'ad_supported_chat_message',
      p_request_id::text,
      v_rate.provider,
      'Ad-supported text chat',
      v_rate.cost_usd,
      jsonb_build_object('source', v_usage.source, 'memory_cadence', 5)
    )
    on conflict (event_key) do nothing;

    select * into v_event
    from public.platform_provider_cost_events
    where event_key = v_expected_key
    for update;
  elsif v_usage.source = 'trial' then
    -- Historical compatibility for requests completed before the TrafficStars
    -- source label was introduced.
    v_expected_key := 'trial-chat:' || p_request_id::text;

    insert into public.platform_provider_cost_events (
      event_key, user_id, reason, reference_id, provider, feature,
      cost_usd, metadata
    )
    values (
      v_expected_key,
      v_usage.user_id,
      'trial_chat_message',
      p_request_id::text,
      v_rate.provider,
      'Historical included text chat',
      v_rate.cost_usd,
      jsonb_build_object('source', v_usage.source)
    )
    on conflict (event_key) do nothing;

    select * into v_event
    from public.platform_provider_cost_events
    where event_key = v_expected_key
    for update;
  elsif v_usage.source = 'evercoin_two_included' then
    v_expected_key := 'two-chat:' || p_request_id::text;

    insert into public.platform_provider_cost_events (
      event_key, user_id, reason, reference_id, provider, feature,
      cost_usd, metadata
    )
    values (
      v_expected_key,
      v_usage.user_id,
      'chat_message',
      p_request_id::text,
      v_rate.provider,
      'Historical chat message included in two-message meter',
      v_rate.cost_usd,
      jsonb_build_object('source', v_usage.source)
    )
    on conflict (event_key) do nothing;

    select * into v_event
    from public.platform_provider_cost_events
    where event_key = v_expected_key
    for update;
  elsif v_usage.source = 'evercoin_five_included' then
    v_expected_key := 'five-chat:' || p_request_id::text;
    select * into v_event
    from public.platform_provider_cost_events
    where event_key = v_expected_key
    for update;
  else
    select t.id into v_transaction_id
    from public.evercoin_transactions as t
    where t.user_id = v_usage.user_id
      and t.reference_id = p_request_id::text
      and t.reason = 'chat_message'
      and t.amount < 0
    order by t.created_at desc, t.id desc
    limit 1;

    if v_transaction_id is not null then
      insert into public.platform_provider_cost_events (
        event_key, evercoin_transaction_id, user_id, reason, reference_id,
        provider, feature, cost_usd, metadata
      )
      values (
        'evercoin:' || v_transaction_id::text,
        v_transaction_id,
        v_usage.user_id,
        'chat_message',
        p_request_id::text,
        v_rate.provider,
        'Historical paid chat message',
        v_rate.cost_usd,
        jsonb_build_object('source', v_usage.source)
      )
      on conflict (event_key) do nothing;

      select * into v_event
      from public.platform_provider_cost_events
      where evercoin_transaction_id = v_transaction_id
      order by created_at desc
      limit 1
      for update;
    end if;
  end if;

  if v_event.id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'CHAT_PROVIDER_COST_EVENT_NOT_FOUND',
      'source', v_usage.source
    );
  end if;

  v_metadata := coalesce(v_event.metadata, '{}'::jsonb);

  if p_visible_input_tokens is not null
     and p_visible_output_tokens is not null
  then
    v_visible_model := coalesce(
      nullif(trim(p_visible_model), ''),
      'gemma-4-uncensored'
    );

    if v_visible_model = 'gemma-4-uncensored' then
      v_visible_cost :=
        greatest(p_visible_input_tokens, 0)::numeric * 0.16300000 / 1000000::numeric
        + greatest(p_visible_output_tokens, 0)::numeric * 0.50000000 / 1000000::numeric;
    elsif v_visible_model = 'venice-uncensored-role-play' then
      v_visible_cost :=
        greatest(p_visible_input_tokens, 0)::numeric * 0.50000000 / 1000000::numeric
        + greatest(p_visible_output_tokens, 0)::numeric * 2.00000000 / 1000000::numeric;
    else
      -- Fail closed for an unknown text model by using the higher historical rate.
      v_visible_cost :=
        greatest(p_visible_input_tokens, 0)::numeric * 0.50000000 / 1000000::numeric
        + greatest(p_visible_output_tokens, 0)::numeric * 2.00000000 / 1000000::numeric;
    end if;

    v_visible_cost := round(v_visible_cost, 8);
    v_has_visible := true;
    v_metadata := v_metadata || jsonb_build_object(
      'visible_model', v_visible_model,
      'visible_input_tokens', greatest(p_visible_input_tokens, 0),
      'visible_output_tokens', greatest(p_visible_output_tokens, 0),
      'visible_actual_usd', v_visible_cost,
      'visible_input_per_million_usd',
        case when v_visible_model = 'gemma-4-uncensored' then 0.163 else 0.500 end,
      'visible_output_per_million_usd',
        case when v_visible_model = 'gemma-4-uncensored' then 0.500 else 2.000 end
    );
  elsif v_metadata ? 'visible_actual_usd' then
    v_visible_cost := (v_metadata ->> 'visible_actual_usd')::numeric;
    v_has_visible := true;
  end if;

  if p_memory_input_tokens is not null
     and p_memory_output_tokens is not null
  then
    v_memory_model := coalesce(
      nullif(trim(p_memory_model), ''),
      'gemma-4-uncensored'
    );

    if v_memory_model = 'gemma-4-uncensored' then
      v_memory_cost :=
        greatest(p_memory_input_tokens, 0)::numeric * 0.16300000 / 1000000::numeric
        + greatest(p_memory_output_tokens, 0)::numeric * 0.50000000 / 1000000::numeric;
    elsif v_memory_model = 'venice-uncensored-role-play' then
      v_memory_cost :=
        greatest(p_memory_input_tokens, 0)::numeric * 0.50000000 / 1000000::numeric
        + greatest(p_memory_output_tokens, 0)::numeric * 2.00000000 / 1000000::numeric;
    else
      v_memory_cost :=
        greatest(p_memory_input_tokens, 0)::numeric * 0.50000000 / 1000000::numeric
        + greatest(p_memory_output_tokens, 0)::numeric * 2.00000000 / 1000000::numeric;
    end if;

    v_memory_cost := round(v_memory_cost, 8);
    v_has_memory := true;
    v_metadata := v_metadata || jsonb_build_object(
      'memory_model', v_memory_model,
      'memory_input_tokens', greatest(p_memory_input_tokens, 0),
      'memory_output_tokens', greatest(p_memory_output_tokens, 0),
      'memory_actual_usd', v_memory_cost,
      'memory_input_per_million_usd',
        case when v_memory_model = 'gemma-4-uncensored' then 0.163 else 0.500 end,
      'memory_output_per_million_usd',
        case when v_memory_model = 'gemma-4-uncensored' then 0.500 else 2.000 end,
      'memory_skipped_by_cadence',
        greatest(p_memory_input_tokens, 0) = 0 and greatest(p_memory_output_tokens, 0) = 0,
      'memory_cadence', 5
    );
  elsif v_metadata ? 'memory_actual_usd' then
    v_memory_cost := (v_metadata ->> 'memory_actual_usd')::numeric;
    v_has_memory := true;
  end if;

  if v_has_visible and v_has_memory then
    v_total_cost := round(v_visible_cost + v_memory_cost, 8);
    v_metadata := v_metadata || jsonb_build_object(
      'accounting_state', 'actual_token_cost_reconciled',
      'actual_total_usd', v_total_cost,
      'reconciled_at', clock_timestamp()
    );
  else
    v_total_cost := greatest(
      v_event.cost_usd,
      coalesce(v_visible_cost, 0) + coalesce(v_memory_cost, 0),
      v_rate.cost_usd
    );
    v_metadata := v_metadata || jsonb_build_object(
      'accounting_state', 'fallback_waiting_for_both_token_counts'
    );
  end if;

  update public.platform_provider_cost_events
  set
    provider = 'venice',
    cost_usd = v_total_cost,
    reversed_usd = least(reversed_usd, v_total_cost),
    metadata = v_metadata,
    updated_at = clock_timestamp()
  where id = v_event.id;

  return jsonb_build_object(
    'ok', true,
    'source', v_usage.source,
    'eventId', v_event.id,
    'costUsd', v_total_cost,
    'visibleActual', v_has_visible,
    'memoryActual', v_has_memory
  );
end;
$function$;

revoke all on function public.platform_reconcile_chat_cost(uuid,integer,integer,text,integer,integer,text)
  from public, anon, authenticated;
grant execute on function public.platform_reconcile_chat_cost(uuid,integer,integer,text,integer,integer,text)
  to service_role;

-- One request corresponds to one user Send interaction. Character replies are
-- never counted as sends. Keep the existing 20-attempt abuse ceiling and add a
-- 6-successful-send rolling-minute ceiling to bound free-AI spend.
create or replace function public.begin_chat_request(
  p_user_id uuid,
  p_request_id uuid,
  p_character_id text
)
returns table(
  request_status text,
  existing_reply text,
  existing_conversation_id uuid,
  existing_input_tokens integer,
  existing_output_tokens integer,
  existing_provider text,
  existing_model text,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  existing_request public.chat_requests%rowtype;
  recent_request_count integer;
  recent_completed_count integer;
  oldest_recent_completion timestamptz;
  success_retry integer := 10;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  update public.chat_requests
  set status = 'failed', error_code = 'STALE_REQUEST', updated_at = now()
  where user_id = p_user_id
    and status = 'pending'
    and created_at < now() - interval '2 minutes';

  select * into existing_request
  from public.chat_requests
  where user_id = p_user_id and request_id = p_request_id;

  if found then
    if existing_request.status = 'completed' then
      return query select
        'completed'::text,
        existing_request.reply,
        existing_request.conversation_id,
        existing_request.input_tokens,
        existing_request.output_tokens,
        existing_request.provider,
        existing_request.model,
        null::integer;
      return;
    end if;

    if existing_request.status = 'pending' then
      return query select
        'in_progress'::text, null::text, null::uuid, null::integer, null::integer,
        null::text, null::text, 5::integer;
      return;
    end if;

    return query select
      'failed'::text, null::text, null::uuid, null::integer, null::integer,
      null::text, null::text, null::integer;
    return;
  end if;

  select count(*) into recent_request_count
  from public.chat_requests
  where user_id = p_user_id
    and created_at >= now() - interval '1 minute';

  if recent_request_count >= 20 then
    return query select
      'rate_limited'::text, null::text, null::uuid, null::integer, null::integer,
      null::text, null::text, 60::integer;
    return;
  end if;

  select count(*), min(completed_at)
  into recent_completed_count, oldest_recent_completion
  from public.chat_requests
  where user_id = p_user_id
    and status = 'completed'
    and completed_at >= now() - interval '1 minute';

  if recent_completed_count >= 6 then
    success_retry := greatest(
      ceil(extract(epoch from (oldest_recent_completion + interval '1 minute' - now())))::integer,
      1
    );
    return query select
      'rate_limited'::text, null::text, null::uuid, null::integer, null::integer,
      null::text, null::text, success_retry;
    return;
  end if;

  if exists (
    select 1 from public.chat_requests
    where user_id = p_user_id and status = 'pending'
  ) then
    return query select
      'busy'::text, null::text, null::uuid, null::integer, null::integer,
      null::text, null::text, 5::integer;
    return;
  end if;

  insert into public.chat_requests (user_id, request_id, character_id, status)
  values (p_user_id, p_request_id, p_character_id, 'pending');

  return query select
    'claimed'::text, null::text, null::uuid, null::integer, null::integer,
    null::text, null::text, null::integer;
end;
$function$;

revoke all on function public.begin_chat_request(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.begin_chat_request(uuid,uuid,text)
  to service_role;

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
  where m.created_at >= s.enforce_from and e.id is null
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
ma as (
  select count(*)::bigint n
  from public.message_credit_usage u
  cross join s
  left join public.platform_provider_cost_events e
    on e.event_key = 'ad-chat:' || u.request_id::text
  where u.created_at >= s.enforce_from
    and u.source = 'ad_supported'
    and u.status = 'completed'
    and e.id is null
),
mi5 as (
  select count(*)::bigint n
  from public.message_credit_usage u
  cross join s
  left join public.platform_provider_cost_events e
    on e.event_key = 'five-chat:' || u.request_id::text
  where u.created_at >= s.enforce_from
    and u.source = 'evercoin_five_included'
    and u.status = 'completed'
    and e.id is null
),
mi2 as (
  select count(*)::bigint n
  from public.message_credit_usage u
  cross join s
  left join public.platform_provider_cost_events e
    on e.event_key = 'two-chat:' || u.request_id::text
  where u.created_at >= s.enforce_from
    and u.source = 'evercoin_two_included'
    and u.status = 'completed'
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
      'voice_call_minute', 'voice_call_minutes', 'voice_call_prorated_adjustment',
      'character_video_generation_fallback_adjustment', 'account_deletion_forfeit'
    )
),
mdl as (
  select count(*)::bigint n
  from public.evercoin_payment_orders o
  left join public.evercoin_cash_lots l on l.payment_order_id = o.id
  where o.provider = 'dropp' and o.status = 'paid' and l.id is null
),
ul as (
  select count(*)::bigint n
  from public.evercoin_cash_lots
  where status = 'active' and net_minor is null
),
b as (
  select mv.n + mp.n + mt.n + ma.n + mi5.n + mi2.n + us.n + mdl.n n
  from mv cross join mp cross join mt cross join ma cross join mi5 cross join mi2 cross join us cross join mdl
)
select jsonb_build_object(
  'healthy', b.n = 0,
  'blockingIssues', b.n,
  'voiceMinutesMissingReserve', mv.n,
  'pricedSpendMissingProviderCost', mp.n,
  'trialChatsMissingProviderCost', mt.n,
  'adSupportedChatsMissingProviderCost', ma.n,
  'includedChatsMissingProviderCost', mi5.n + mi2.n,
  'unknownSpendTransactions', us.n,
  'paidDroppOrdersMissingCashLot', mdl.n,
  'unreconciledCashLots', ul.n,
  'enforceFrom', s.enforce_from
)
from b cross join mv cross join mp cross join mt cross join ma cross join mi5 cross join mi2 cross join us cross join mdl cross join ul cross join s;
$function$;

revoke all on function public.platform_finance_health() from public, anon, authenticated;
grant execute on function public.platform_finance_health() to service_role;

create or replace function public.platform_ad_supported_chat_economics(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
with rows as (
  select
    u.request_id,
    u.completed_at,
    e.cost_usd,
    e.reversed_usd,
    coalesce(e.metadata, '{}'::jsonb) as metadata
  from public.message_credit_usage u
  left join public.platform_provider_cost_events e
    on e.event_key = 'ad-chat:' || u.request_id::text
  where u.source = 'ad_supported'
    and u.status = 'completed'
    and u.completed_at >= coalesce(p_from, '-infinity'::timestamptz)
    and u.completed_at < coalesce(p_to, 'infinity'::timestamptz)
)
select jsonb_build_object(
  'freeMessages', count(*)::bigint,
  'visibleAiCostUsd', round(coalesce(sum((metadata->>'visible_actual_usd')::numeric), 0), 8),
  'memoryAiCostUsd', round(coalesce(sum((metadata->>'memory_actual_usd')::numeric), 0), 8),
  'totalAiCostUsd', round(coalesce(sum(coalesce(cost_usd,0) - coalesce(reversed_usd,0)), 0), 8),
  'memoryUpdates', count(*) filter (
    where coalesce((metadata->>'memory_output_tokens')::integer, 0) > 0
  )::bigint,
  'memorySkipped', count(*) filter (
    where metadata ? 'memory_actual_usd'
      and coalesce((metadata->>'memory_input_tokens')::integer, 0) = 0
      and coalesce((metadata->>'memory_output_tokens')::integer, 0) = 0
  )::bigint,
  'averageVisibleInputTokens', round(coalesce(avg((metadata->>'visible_input_tokens')::numeric), 0), 2),
  'averageVisibleOutputTokens', round(coalesce(avg((metadata->>'visible_output_tokens')::numeric), 0), 2)
)
from rows;
$function$;

revoke all on function public.platform_ad_supported_chat_economics(timestamptz,timestamptz)
  from public, anon, authenticated;
grant execute on function public.platform_ad_supported_chat_economics(timestamptz,timestamptz)
  to service_role;

-- Safe-to-withdraw includes TrafficStars only when an actual USD payout has been
-- recorded as received. TrafficStars dashboard snapshots remain informational.
create or replace function public.platform_finance_summary_safe(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_base jsonb; v_current jsonb; v_period jsonb; v_health jsonb;
  v_cash_released numeric:=0; v_economic_safe numeric:=0;
  v_unused_reserve numeric:=0; v_provider_costs numeric:=0; v_owner_withdrawals numeric:=0;
  v_dropp_payouts numeric:=0; v_trafficstars_payouts numeric:=0; v_payouts_received numeric:=0;
  v_period_dropp numeric:=0; v_period_trafficstars numeric:=0; v_period_payouts numeric:=0;
  v_bank_cap numeric:=0; v_safe numeric:=0; v_waiting numeric:=0;
  v_partner_cost numeric:=0; v_partner_platform_reserve numeric:=0;
  v_partner_entitlement numeric:=0; v_partner_locked numeric:=0; v_partner_unpaid numeric:=0;
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
    select partner_id,coalesce(sum(amount_minor)::numeric/100.0,0) amt
    from public.partner_payouts where status in('reserved','processing','paid') group by partner_id
  )
  select coalesce(sum(coalesce(fs.current_commission_usd,0)),0),
         coalesce(sum(coalesce(l.amt,0)),0),
         coalesce(sum(greatest(coalesce(fs.current_commission_usd,0),coalesce(l.amt,0))),0),
         coalesce(sum(greatest(coalesce(fs.current_commission_usd,0)-coalesce(l.amt,0),0)),0)
  into v_partner_entitlement,v_partner_locked,v_partner_cost,v_partner_unpaid
  from public.partners p
  left join public.partner_finance_state fs on fs.partner_id=p.id
  left join locked l on l.partner_id=p.id;

  select coalesce(sum(platform_protection_usd),0) into v_partner_platform_reserve
  from public.partner_economic_source_state where source_type='eligible_cash_release';

  select coalesce(sum(amount_minor)::numeric/100.0,0) into v_dropp_payouts
  from public.platform_processor_payouts where provider='dropp' and currency_code='USD';
  select coalesce(sum(amount_minor)::numeric/100.0,0) into v_trafficstars_payouts
  from public.platform_processor_payouts where provider='trafficstars' and currency_code='USD';
  v_payouts_received:=v_dropp_payouts+v_trafficstars_payouts;

  select coalesce(sum(amount_minor)::numeric/100.0,0) into v_period_dropp
  from public.platform_processor_payouts
  where provider='dropp' and currency_code='USD'
    and received_at>=coalesce(p_from,'-infinity'::timestamptz)
    and received_at<coalesce(p_to,'infinity'::timestamptz);
  select coalesce(sum(amount_minor)::numeric/100.0,0) into v_period_trafficstars
  from public.platform_processor_payouts
  where provider='trafficstars' and currency_code='USD'
    and received_at>=coalesce(p_from,'-infinity'::timestamptz)
    and received_at<coalesce(p_to,'infinity'::timestamptz);
  v_period_payouts:=v_period_dropp+v_period_trafficstars;

  -- Affiliate commission/protection applies only to eligible EverCoin cash
  -- release. Platform ad revenue is deliberately excluded from partner terms.
  v_economic_safe:=greatest(
    v_cash_released + v_trafficstars_payouts - v_provider_costs - v_owner_withdrawals
    - v_partner_cost - v_partner_platform_reserve,
    0
  );

  v_bank_cap:=greatest(
    v_payouts_received - v_unused_reserve - v_provider_costs - v_owner_withdrawals
    - v_partner_cost - v_partner_platform_reserve,
    0
  );

  v_safe:=least(v_economic_safe,v_bank_cap);
  if coalesce((v_health->>'healthy')::boolean,false) is not true then v_safe:=0; end if;
  v_waiting:=greatest(v_economic_safe-v_safe,0);

  v_current:=v_current||jsonb_build_object(
    'economicSafeToWithdrawUsd',round(v_economic_safe,2),
    'processorPayoutsReceivedUsd',round(v_payouts_received,2),
    'droppPayoutsReceivedUsd',round(v_dropp_payouts,2),
    'trafficStarsPayoutsReceivedUsd',round(v_trafficstars_payouts,2),
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
    'trafficStarsPayoutsReceivedUsd',round(v_period_trafficstars,2)
  );

  return jsonb_build_object('current',v_current,'period',v_period);
end;
$function$;

revoke all on function public.platform_finance_summary_safe(timestamptz,timestamptz)
  from public, anon, authenticated;
grant execute on function public.platform_finance_summary_safe(timestamptz,timestamptz)
  to service_role;


-- Preserve the successful-user-Send ledger when an anonymous guest becomes a
-- permanent account. This keeps the every-5 memory cadence continuous across
-- signup and keeps ad-supported provider-cost history attached to the account.
create or replace function public.claim_guest_chat_data(
  p_guest_user_id uuid,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_conversations integer := 0;
  v_memories integer := 0;
  v_relationships integer := 0;
  v_chat_requests integer := 0;
  v_usage_rows integer := 0;
begin
  if p_guest_user_id is null or p_target_user_id is null then
    raise exception 'INVALID_GUEST_CLAIM';
  end if;
  if p_guest_user_id = p_target_user_id then
    return jsonb_build_object(
      'ok', true,
      'conversations', 0,
      'memories', 0,
      'relationships', 0,
      'chatRequests', 0,
      'usageRows', 0
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended('guest-claim:' || p_guest_user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('guest-claim:' || p_target_user_id::text, 0));

  update public.conversations
  set user_id = p_target_user_id, updated_at = clock_timestamp()
  where user_id = p_guest_user_id;
  get diagnostics v_conversations = row_count;

  -- A UUID request collision is extraordinarily unlikely; if it ever occurs,
  -- retain the permanent account's request and discard the duplicate guest key.
  delete from public.chat_requests guest
  using public.chat_requests target
  where guest.user_id = p_guest_user_id
    and target.user_id = p_target_user_id
    and guest.request_id = target.request_id;

  update public.chat_requests
  set user_id = p_target_user_id, updated_at = clock_timestamp()
  where user_id = p_guest_user_id;
  get diagnostics v_chat_requests = row_count;

  update public.message_credit_usage
  set user_id = p_target_user_id
  where user_id = p_guest_user_id;
  get diagnostics v_usage_rows = row_count;

  update public.platform_provider_cost_events
  set user_id = p_target_user_id, updated_at = clock_timestamp()
  where user_id = p_guest_user_id;

  update public.ever_memory
  set user_id = p_target_user_id, updated_at = clock_timestamp()
  where user_id = p_guest_user_id;
  get diagnostics v_memories = row_count;

  insert into public.relationship_states (
    user_id,
    character_id,
    stage,
    summary,
    emotional_state,
    open_threads,
    important_promises,
    important_events,
    user_name,
    user_gender,
    user_core_identity,
    updated_at
  )
  select
    p_target_user_id,
    r.character_id,
    r.stage,
    r.summary,
    r.emotional_state,
    r.open_threads,
    r.important_promises,
    r.important_events,
    r.user_name,
    r.user_gender,
    r.user_core_identity,
    r.updated_at
  from public.relationship_states r
  where r.user_id = p_guest_user_id
  on conflict (user_id, character_id) do update set
    stage = case
      when excluded.updated_at >= public.relationship_states.updated_at
        then excluded.stage else public.relationship_states.stage end,
    summary = case
      when excluded.updated_at >= public.relationship_states.updated_at
        then excluded.summary else public.relationship_states.summary end,
    emotional_state = case
      when excluded.updated_at >= public.relationship_states.updated_at
        then excluded.emotional_state else public.relationship_states.emotional_state end,
    open_threads = case
      when excluded.updated_at >= public.relationship_states.updated_at
        then excluded.open_threads else public.relationship_states.open_threads end,
    important_promises = case
      when excluded.updated_at >= public.relationship_states.updated_at
        then excluded.important_promises else public.relationship_states.important_promises end,
    important_events = case
      when excluded.updated_at >= public.relationship_states.updated_at
        then excluded.important_events else public.relationship_states.important_events end,
    user_name = coalesce(excluded.user_name, public.relationship_states.user_name),
    user_gender = coalesce(excluded.user_gender, public.relationship_states.user_gender),
    user_core_identity = coalesce(excluded.user_core_identity, public.relationship_states.user_core_identity),
    updated_at = greatest(excluded.updated_at, public.relationship_states.updated_at);

  get diagnostics v_relationships = row_count;
  delete from public.relationship_states where user_id = p_guest_user_id;

  delete from public.ever_memory m
  using public.ever_memory newer
  where m.user_id = p_target_user_id
    and newer.user_id = p_target_user_id
    and m.character_id = newer.character_id
    and m.memory_type = newer.memory_type
    and lower(trim(m.content)) = lower(trim(newer.content))
    and (
      newer.importance > m.importance
      or (newer.importance = m.importance and newer.updated_at > m.updated_at)
      or (
        newer.importance = m.importance
        and newer.updated_at = m.updated_at
        and newer.id::text > m.id::text
      )
    );

  return jsonb_build_object(
    'ok', true,
    'conversations', v_conversations,
    'memories', v_memories,
    'relationships', v_relationships,
    'chatRequests', v_chat_requests,
    'usageRows', v_usage_rows
  );
end;
$function$;

revoke all on function public.claim_guest_chat_data(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.claim_guest_chat_data(uuid,uuid)
  to service_role;

commit;
