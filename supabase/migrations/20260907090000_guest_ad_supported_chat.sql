begin;

-- Guest chat uses Supabase anonymous Auth users, so the existing user_id based
-- conversations, messages, relationship state and Ever Memory model continue
-- to work without duplicating the memory schema.

create table if not exists public.chat_human_verifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ip_hash text,
  verified_until timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists chat_human_verifications_ip_idx
  on public.chat_human_verifications (ip_hash, verified_until desc);

create table if not exists public.chat_abuse_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists chat_abuse_events_user_created_idx
  on public.chat_abuse_events (user_id, created_at desc);
create index if not exists chat_abuse_events_ip_created_idx
  on public.chat_abuse_events (ip_hash, created_at desc);

alter table public.chat_human_verifications enable row level security;
alter table public.chat_abuse_events enable row level security;
revoke all on public.chat_human_verifications from public, anon, authenticated;
revoke all on public.chat_abuse_events from public, anon, authenticated;
grant all on public.chat_human_verifications to service_role;
grant all on public.chat_abuse_events to service_role;

create table if not exists public.ad_free_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  ec_per_block integer not null default 1 check (ec_per_block > 0),
  block_seconds integer not null default 300 check (block_seconds >= 60),
  unbilled_active_seconds integer not null default 0 check (unbilled_active_seconds >= 0),
  enabled_at timestamptz,
  disabled_at timestamptz,
  last_heartbeat_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.ad_free_billing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  evercoin_amount integer not null check (evercoin_amount > 0),
  active_seconds integer not null default 0,
  reference_id text not null unique,
  created_at timestamptz not null default now()
);

alter table public.ad_free_sessions enable row level security;
alter table public.ad_free_billing_events enable row level security;
revoke all on public.ad_free_sessions from public, anon, authenticated;
revoke all on public.ad_free_billing_events from public, anon, authenticated;
grant all on public.ad_free_sessions to service_role;
grant all on public.ad_free_billing_events to service_role;

-- Ad-Free is an EverCoin product, not an AI/provider call by itself. The chat
-- requests that happen while Ad-Free is enabled are cost-accounted separately by
-- the normal free-chat provider-cost path. Register this spend reason so the
-- fail-closed /money health check recognizes it, and create an explicit $0
-- provider event for every Ad-Free EC deduction.
insert into public.platform_feature_cost_rates (
  reason, provider, feature, cost_usd, notes, updated_at
)
values (
  'ad_free_chat',
  'none',
  'Ad-Free chat access (no direct provider call)',
  0,
  'EverCoin buys removal of advertising. AI reply and Ever Memory provider costs are accounted separately on each text-chat request.',
  clock_timestamp()
)
on conflict (reason) do update set
  provider = excluded.provider,
  feature = excluded.feature,
  cost_usd = excluded.cost_usd,
  notes = excluded.notes,
  updated_at = excluded.updated_at;

create or replace function public.platform_account_zero_cost_ad_free()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.amount < 0 and new.reason = 'ad_free_chat' then
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
      'evercoin:' || new.id::text,
      new.id,
      new.user_id,
      new.reason,
      new.reference_id,
      'none',
      'Ad-Free chat access (no direct provider call)',
      0,
      0,
      jsonb_build_object(
        'accounting_state', 'no_direct_provider_call',
        'ai_cost_accounted_by', 'free_chat_request'
      ),
      new.created_at,
      clock_timestamp()
    )
    on conflict (event_key) do update set
      evercoin_transaction_id = excluded.evercoin_transaction_id,
      provider = excluded.provider,
      feature = excluded.feature,
      cost_usd = 0,
      reversed_usd = 0,
      metadata = excluded.metadata,
      updated_at = clock_timestamp();
  end if;

  return new;
end;
$$;

revoke all on function public.platform_account_zero_cost_ad_free()
from public, anon, authenticated;
grant execute on function public.platform_account_zero_cost_ad_free()
to service_role;

drop trigger if exists zz_platform_account_zero_cost_ad_free_trigger
on public.evercoin_transactions;
create trigger zz_platform_account_zero_cost_ad_free_trigger
after insert on public.evercoin_transactions
for each row
execute function public.platform_account_zero_cost_ad_free();

create or replace function public.everbond_enable_ad_free(
  p_user_id uuid,
  p_ec_per_block integer,
  p_block_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance bigint := 0;
  v_debt bigint := 0;
  v_reference text;
begin
  if p_user_id is null or p_ec_per_block < 1 or p_block_seconds < 60 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_AD_FREE_REQUEST');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ad-free:' || p_user_id::text, 0));

  if exists (
    select 1 from public.ad_free_sessions
    where user_id = p_user_id and enabled is true
  ) then
    select coalesce(balance, 0) into v_balance
    from public.evercoin_wallets where user_id = p_user_id;
    return jsonb_build_object(
      'ok', true, 'enabled', true, 'balance', coalesce(v_balance, 0)
    );
  end if;

  insert into public.evercoin_wallets (user_id, balance, debt)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select balance, debt into v_balance, v_debt
  from public.evercoin_wallets
  where user_id = p_user_id
  for update;

  if v_debt > 0 or v_balance < p_ec_per_block then
    return jsonb_build_object(
      'ok', false,
      'error', 'INSUFFICIENT_EVERCOIN',
      'enabled', false,
      'balance', v_balance
    );
  end if;

  update public.evercoin_wallets
  set balance = balance - p_ec_per_block, updated_at = clock_timestamp()
  where user_id = p_user_id
  returning balance into v_balance;

  v_reference := 'ad-free:' || gen_random_uuid()::text;

  insert into public.evercoin_transactions (user_id, amount, reason, reference_id)
  values (p_user_id, -p_ec_per_block, 'ad_free_chat', v_reference);

  insert into public.ad_free_billing_events (
    user_id, evercoin_amount, active_seconds, reference_id
  )
  values (p_user_id, p_ec_per_block, 0, v_reference);

  insert into public.ad_free_sessions (
    user_id, enabled, ec_per_block, block_seconds,
    unbilled_active_seconds, enabled_at, disabled_at,
    last_heartbeat_at, updated_at
  )
  values (
    p_user_id, true, p_ec_per_block, p_block_seconds,
    0, clock_timestamp(), null, clock_timestamp(), clock_timestamp()
  )
  on conflict (user_id) do update set
    enabled = true,
    ec_per_block = excluded.ec_per_block,
    block_seconds = excluded.block_seconds,
    unbilled_active_seconds = 0,
    enabled_at = clock_timestamp(),
    disabled_at = null,
    last_heartbeat_at = clock_timestamp(),
    updated_at = clock_timestamp();

  return jsonb_build_object('ok', true, 'enabled', true, 'balance', v_balance);
end;
$$;

revoke all on function public.everbond_enable_ad_free(uuid, integer, integer)
from public, anon, authenticated;
grant execute on function public.everbond_enable_ad_free(uuid, integer, integer)
to service_role;

create or replace function public.everbond_disable_ad_free(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.ad_free_sessions
  set
    enabled = false,
    disabled_at = clock_timestamp(),
    last_heartbeat_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where user_id = p_user_id;
  return true;
end;
$$;

revoke all on function public.everbond_disable_ad_free(uuid)
from public, anon, authenticated;
grant execute on function public.everbond_disable_ad_free(uuid)
to service_role;

create or replace function public.everbond_ad_free_heartbeat(
  p_user_id uuid,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.ad_free_sessions%rowtype;
  v_elapsed integer := 0;
  v_accumulated integer := 0;
  v_blocks integer := 0;
  v_charge integer := 0;
  v_balance bigint := 0;
  v_debt bigint := 0;
  v_reference text;
begin
  perform pg_advisory_xact_lock(hashtextextended('ad-free:' || p_user_id::text, 0));

  select * into v_session
  from public.ad_free_sessions
  where user_id = p_user_id
  for update;

  if not found or v_session.enabled is not true then
    select coalesce(balance, 0) into v_balance
    from public.evercoin_wallets where user_id = p_user_id;
    return jsonb_build_object('ok', true, 'enabled', false, 'balance', coalesce(v_balance, 0));
  end if;

  if p_active and v_session.last_heartbeat_at is not null then
    v_elapsed := greatest(
      floor(extract(epoch from (clock_timestamp() - v_session.last_heartbeat_at)))::integer,
      0
    );
    -- Heartbeats are sent every ~30 seconds only while the user is active.
    -- A long gap means the tab was idle/closed, so never back-bill that gap.
    if v_elapsed > 60 then
      v_elapsed := 30;
    else
      v_elapsed := least(v_elapsed, 35);
    end if;
  end if;

  v_accumulated := v_session.unbilled_active_seconds + v_elapsed;
  v_blocks := floor(v_accumulated::numeric / v_session.block_seconds)::integer;
  v_charge := v_blocks * v_session.ec_per_block;

  insert into public.evercoin_wallets (user_id, balance, debt)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select balance, debt into v_balance, v_debt
  from public.evercoin_wallets
  where user_id = p_user_id
  for update;

  if v_charge > 0 then
    if v_debt > 0 or v_balance < v_charge then
      update public.ad_free_sessions
      set
        enabled = false,
        disabled_at = clock_timestamp(),
        unbilled_active_seconds = 0,
        last_heartbeat_at = clock_timestamp(),
        updated_at = clock_timestamp()
      where user_id = p_user_id;

      return jsonb_build_object(
        'ok', true,
        'enabled', false,
        'balance', v_balance,
        'error', 'INSUFFICIENT_EVERCOIN'
      );
    end if;

    update public.evercoin_wallets
    set balance = balance - v_charge, updated_at = clock_timestamp()
    where user_id = p_user_id
    returning balance into v_balance;

    v_reference := 'ad-free:' || gen_random_uuid()::text;

    insert into public.evercoin_transactions (user_id, amount, reason, reference_id)
    values (p_user_id, -v_charge, 'ad_free_chat', v_reference);

    insert into public.ad_free_billing_events (
      user_id, evercoin_amount, active_seconds, reference_id
    )
    values (
      p_user_id,
      v_charge,
      v_blocks * v_session.block_seconds,
      v_reference
    );

    v_accumulated := mod(v_accumulated, v_session.block_seconds);
  end if;

  update public.ad_free_sessions
  set
    unbilled_active_seconds = v_accumulated,
    last_heartbeat_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where user_id = p_user_id;

  return jsonb_build_object('ok', true, 'enabled', true, 'balance', v_balance);
end;
$$;

revoke all on function public.everbond_ad_free_heartbeat(uuid, boolean)
from public, anon, authenticated;
grant execute on function public.everbond_ad_free_heartbeat(uuid, boolean)
to service_role;

-- Transfer guest relationship data after normal EverBond login/signup. The
-- HMAC claim proof is verified in the server route; this function is service-role only.
create or replace function public.claim_guest_chat_data(
  p_guest_user_id uuid,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conversations integer := 0;
  v_memories integer := 0;
  v_relationships integer := 0;
begin
  if p_guest_user_id is null or p_target_user_id is null then
    raise exception 'INVALID_GUEST_CLAIM';
  end if;
  if p_guest_user_id = p_target_user_id then
    return jsonb_build_object('ok', true, 'conversations', 0, 'memories', 0, 'relationships', 0);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('guest-claim:' || p_guest_user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('guest-claim:' || p_target_user_id::text, 0));

  update public.conversations
  set user_id = p_target_user_id, updated_at = clock_timestamp()
  where user_id = p_guest_user_id;
  get diagnostics v_conversations = row_count;

  update public.ever_memory
  set user_id = p_target_user_id, updated_at = clock_timestamp()
  where user_id = p_guest_user_id;
  get diagnostics v_memories = row_count;

  -- Merge guest relationship rows into an already-existing account relationship
  -- instead of throwing on the (user_id, character_id) unique key.
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

  -- Remove exact duplicate long-term memories after the merge.
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
    'relationships', v_relationships
  );
end;
$$;

revoke all on function public.claim_guest_chat_data(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.claim_guest_chat_data(uuid, uuid)
to service_role;

commit;
