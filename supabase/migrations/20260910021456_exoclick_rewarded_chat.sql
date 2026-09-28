-- EverBond rewarded-chat access state for the ExoClick rewarded In-Stream gate.
-- Text chat remains free in blocks of 19 successful user messages. A qualifying
-- sponsored-video impression or an explicit EverCoin block purchase resets the
-- counter. All tables are service-role only; the browser never writes them.

create table if not exists public.chat_rewarded_access_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  successful_messages_since_ad integer not null default 0
    check (successful_messages_since_ad >= 0 and successful_messages_since_ad <= 19),
  updated_at timestamptz not null default now()
);

alter table public.chat_rewarded_access_state enable row level security;

create table if not exists public.chat_rewarded_ad_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  provider text not null default 'exoclick',
  status text not null default 'pending'
    check (status in ('pending', 'impression', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  impression_at timestamptz
);

create index if not exists chat_rewarded_ad_tickets_user_status_idx
  on public.chat_rewarded_ad_tickets (user_id, status, created_at desc);

alter table public.chat_rewarded_ad_tickets enable row level security;

create table if not exists public.chat_rewarded_coin_bypasses (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  evercoin_amount bigint not null check (evercoin_amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists chat_rewarded_coin_bypasses_user_idx
  on public.chat_rewarded_coin_bypasses (user_id, created_at desc);

alter table public.chat_rewarded_coin_bypasses enable row level security;

create or replace function public.rewarded_chat_get_state(p_user_id uuid)
returns table(messages_since_ad integer, gate_required boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.chat_rewarded_access_state (
    user_id,
    successful_messages_since_ad,
    updated_at
  )
  values (p_user_id, 0, now())
  on conflict (user_id) do nothing;

  select s.successful_messages_since_ad
    into v_count
  from public.chat_rewarded_access_state s
  where s.user_id = p_user_id;

  v_count := coalesce(v_count, 0);
  return query select v_count, v_count >= 19;
end;
$$;

create or replace function public.rewarded_chat_record_success(p_user_id uuid)
returns table(messages_since_ad integer, gate_required boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.chat_rewarded_access_state (
    user_id,
    successful_messages_since_ad,
    updated_at
  )
  values (p_user_id, 1, now())
  on conflict (user_id) do update
  set successful_messages_since_ad = least(
        19,
        public.chat_rewarded_access_state.successful_messages_since_ad + 1
      ),
      updated_at = now()
  returning successful_messages_since_ad into v_count;

  return query select v_count, v_count >= 19;
end;
$$;

create or replace function public.rewarded_chat_consume_ad_ticket(
  p_user_id uuid,
  p_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_ticket_id uuid;
begin
  select t.id, t.status
    into v_ticket_id, v_status
  from public.chat_rewarded_ad_tickets t
  where t.user_id = p_user_id
    and t.token_hash = p_token_hash
  for update;

  if v_ticket_id is null then
    return false;
  end if;

  -- Idempotent retries: if the first unlock succeeded but its HTTP response was
  -- lost, the same one-use ticket still reports success to the same user.
  if v_status = 'impression' then
    return true;
  end if;

  if v_status <> 'pending' then
    return false;
  end if;

  update public.chat_rewarded_ad_tickets t
  set status = 'impression',
      impression_at = now()
  where t.id = v_ticket_id
    and t.status = 'pending'
    and t.expires_at > now()
    -- The client is allowed to claim only after the ad has actually played long
    -- enough for ExoClick's 5-second skip control to be eligible.
    and t.created_at <= now() - interval '4 seconds'
  returning t.id into v_ticket_id;

  if v_ticket_id is null then
    return false;
  end if;

  insert into public.chat_rewarded_access_state (
    user_id,
    successful_messages_since_ad,
    updated_at
  )
  values (p_user_id, 0, now())
  on conflict (user_id) do update
  set successful_messages_since_ad = 0,
      updated_at = now();

  return true;
end;
$$;

create or replace function public.rewarded_chat_purchase_block(
  p_user_id uuid,
  p_request_id uuid,
  p_amount bigint
)
returns table(charged boolean, balance bigint, already_processed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_balance bigint;
  v_charged boolean;
begin
  if p_amount <= 0 then
    raise exception 'INVALID_EVERCOIN_AMOUNT';
  end if;

  insert into public.chat_rewarded_access_state (
    user_id,
    successful_messages_since_ad,
    updated_at
  )
  values (p_user_id, 0, now())
  on conflict (user_id) do nothing;

  -- Serialize paid bypasses for this user so two browser requests cannot charge
  -- two blocks at the same time.
  select s.successful_messages_since_ad
    into v_count
  from public.chat_rewarded_access_state s
  where s.user_id = p_user_id
  for update;

  if exists (
    select 1
    from public.chat_rewarded_coin_bypasses b
    where b.request_id = p_request_id
      and b.user_id = p_user_id
  ) then
    select w.balance into v_balance
    from public.evercoin_wallets w
    where w.user_id = p_user_id;
    return query select true, coalesce(v_balance, 0), true;
    return;
  end if;

  -- Stale overlay: the user is already unlocked, so do not charge anything.
  if coalesce(v_count, 0) < 19 then
    select w.balance into v_balance
    from public.evercoin_wallets w
    where w.user_id = p_user_id;
    return query select true, coalesce(v_balance, 0), true;
    return;
  end if;

  select c.charged, c.balance
    into v_charged, v_balance
  from public.charge_evercoin(
    p_user_id,
    p_amount,
    'rewarded_chat_19_message_pass',
    'rewarded_chat:' || p_request_id::text
  ) c;

  if not coalesce(v_charged, false) then
    return query select false, coalesce(v_balance, 0), false;
    return;
  end if;

  insert into public.chat_rewarded_coin_bypasses (
    request_id,
    user_id,
    evercoin_amount
  )
  values (p_request_id, p_user_id, p_amount);

  update public.chat_rewarded_access_state
  set successful_messages_since_ad = 0,
      updated_at = now()
  where user_id = p_user_id;

  return query select true, coalesce(v_balance, 0), false;
end;
$$;

revoke all on function public.rewarded_chat_get_state(uuid) from public, anon, authenticated;
revoke all on function public.rewarded_chat_record_success(uuid) from public, anon, authenticated;
revoke all on function public.rewarded_chat_consume_ad_ticket(uuid, text) from public, anon, authenticated;
revoke all on function public.rewarded_chat_purchase_block(uuid, uuid, bigint) from public, anon, authenticated;

grant execute on function public.rewarded_chat_get_state(uuid) to service_role;
grant execute on function public.rewarded_chat_record_success(uuid) to service_role;
grant execute on function public.rewarded_chat_consume_ad_ticket(uuid, text) to service_role;
grant execute on function public.rewarded_chat_purchase_block(uuid, uuid, bigint) to service_role;
