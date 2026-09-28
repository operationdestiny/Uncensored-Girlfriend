begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Gift inventory and idempotent EverShop purchases
-- ---------------------------------------------------------------------------

create table if not exists public.user_gift_inventory (
  user_id uuid not null references auth.users(id) on delete cascade,
  gift_id integer not null check (gift_id between 1 and 200),
  quantity integer not null default 0 check (quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, gift_id)
);

create index if not exists user_gift_inventory_user_updated_idx
  on public.user_gift_inventory (user_id, updated_at desc);

create table if not exists public.evershop_purchase_requests (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  gift_id integer not null check (gift_id between 1 and 200),
  quantity integer not null default 1 check (quantity > 0),
  evercoin_spent bigint not null check (evercoin_spent > 0),
  created_at timestamptz not null default now()
);

create index if not exists evershop_purchase_requests_user_created_idx
  on public.evershop_purchase_requests (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Idempotent gift sending. Inventory is reserved before the AI call and
-- restored exactly once if the turn fails.
-- ---------------------------------------------------------------------------

create table if not exists public.gift_send_requests (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id text not null references public.characters(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  gift_id integer not null check (gift_id between 1 and 200),
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  inventory_refunded boolean not null default false,
  user_text text,
  reply text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists gift_send_requests_user_created_idx
  on public.gift_send_requests (user_id, created_at desc);

create index if not exists gift_send_requests_conversation_idx
  on public.gift_send_requests (conversation_id, created_at desc);

-- Gift metadata lets chat history render the item while the AI/memory layer can
-- explicitly exclude the gift from Ever Memory.
alter table public.messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists messages_metadata_gin_idx
  on public.messages using gin (metadata);

-- ---------------------------------------------------------------------------
-- RLS: users may read only their own purchases, inventory, and sends. All
-- mutations are server-only through service-role RPC calls.
-- ---------------------------------------------------------------------------

alter table public.user_gift_inventory enable row level security;
alter table public.evershop_purchase_requests enable row level security;
alter table public.gift_send_requests enable row level security;

drop policy if exists user_gift_inventory_owner_read
  on public.user_gift_inventory;
create policy user_gift_inventory_owner_read
on public.user_gift_inventory
for select
using (auth.uid() = user_id);

drop policy if exists evershop_purchase_requests_owner_read
  on public.evershop_purchase_requests;
create policy evershop_purchase_requests_owner_read
on public.evershop_purchase_requests
for select
using (auth.uid() = user_id);

drop policy if exists gift_send_requests_owner_read
  on public.gift_send_requests;
create policy gift_send_requests_owner_read
on public.gift_send_requests
for select
using (auth.uid() = user_id);

revoke insert, update, delete on public.user_gift_inventory
  from anon, authenticated;
revoke insert, update, delete on public.evershop_purchase_requests
  from anon, authenticated;
revoke insert, update, delete on public.gift_send_requests
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Purchase one catalog gift with EverCoin and add it to inventory atomically.
-- The application supplies the catalog-validated price. Only service_role may
-- execute this function.
-- ---------------------------------------------------------------------------

create or replace function public.purchase_evershop_gift(
  p_user_id uuid,
  p_request_id uuid,
  p_gift_id integer,
  p_price bigint
)
returns table (
  purchase_status text,
  balance bigint,
  debt bigint,
  inventory_quantity integer,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.evershop_purchase_requests%rowtype;
  v_balance bigint;
  v_debt bigint;
  v_quantity integer;
begin
  if p_gift_id < 1 or p_gift_id > 200 or p_price <= 0 then
    raise exception 'INVALID_EVERSHOP_PURCHASE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('evershop-purchase:' || p_request_id::text, 0)
  );

  select *
  into v_existing
  from public.evershop_purchase_requests as r
  where r.request_id = p_request_id;

  if found then
    if v_existing.user_id <> p_user_id
      or v_existing.gift_id <> p_gift_id
      or v_existing.evercoin_spent <> p_price
    then
      return query
      select 'conflict'::text, 0::bigint, 0::bigint, 0::integer,
        'REQUEST_CONFLICT'::text;
      return;
    end if;

    select coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_balance, v_debt
    from public.evercoin_wallets as w
    where w.user_id = p_user_id;

    select coalesce(i.quantity, 0)
    into v_quantity
    from public.user_gift_inventory as i
    where i.user_id = p_user_id
      and i.gift_id = p_gift_id;

    return query
    select 'completed'::text, coalesce(v_balance, 0), coalesce(v_debt, 0),
      coalesce(v_quantity, 0), null::text;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('evercoin-user:' || p_user_id::text, 0)
  );

  insert into public.evercoin_wallets (user_id, balance, debt)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select w.balance, w.debt
  into v_balance, v_debt
  from public.evercoin_wallets as w
  where w.user_id = p_user_id
  for update;

  if v_debt > 0 then
    return query
    select 'rejected'::text, v_balance, v_debt, 0::integer,
      'EVERCOIN_DEBT'::text;
    return;
  end if;

  if v_balance < p_price then
    return query
    select 'rejected'::text, v_balance, v_debt, 0::integer,
      'INSUFFICIENT_EVERCOIN'::text;
    return;
  end if;

  update public.evercoin_wallets as w
  set
    balance = w.balance - p_price,
    updated_at = clock_timestamp()
  where w.user_id = p_user_id
  returning w.balance into v_balance;

  insert into public.evercoin_transactions (
    user_id,
    amount,
    reason,
    reference_id
  )
  values (
    p_user_id,
    -p_price,
    'evershop_gift_purchase',
    p_request_id::text
  );

  insert into public.user_gift_inventory (
    user_id,
    gift_id,
    quantity,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    p_gift_id,
    1,
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict on constraint user_gift_inventory_pkey
  do update
  set
    quantity = public.user_gift_inventory.quantity + 1,
    updated_at = excluded.updated_at
  returning quantity into v_quantity;

  insert into public.evershop_purchase_requests (
    request_id,
    user_id,
    gift_id,
    quantity,
    evercoin_spent
  )
  values (
    p_request_id,
    p_user_id,
    p_gift_id,
    1,
    p_price
  );

  return query
  select 'completed'::text, v_balance, v_debt, v_quantity, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reserve one owned gift for a chat turn.
-- ---------------------------------------------------------------------------

create or replace function public.begin_gift_send(
  p_user_id uuid,
  p_request_id uuid,
  p_character_id text,
  p_gift_id integer,
  p_user_text text default null
)
returns table (
  send_status text,
  inventory_quantity integer,
  existing_reply text,
  existing_conversation_id uuid,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.gift_send_requests%rowtype;
  v_quantity integer;
begin
  if p_gift_id < 1 or p_gift_id > 200 then
    raise exception 'INVALID_GIFT_ID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('gift-send:' || p_request_id::text, 0)
  );

  select *
  into v_existing
  from public.gift_send_requests as r
  where r.request_id = p_request_id;

  if found then
    if v_existing.user_id <> p_user_id
      or v_existing.character_id <> p_character_id
      or v_existing.gift_id <> p_gift_id
    then
      return query
      select 'conflict'::text, 0::integer, null::text, null::uuid,
        'REQUEST_CONFLICT'::text;
      return;
    end if;

    select coalesce(i.quantity, 0)
    into v_quantity
    from public.user_gift_inventory as i
    where i.user_id = p_user_id
      and i.gift_id = p_gift_id;

    if v_existing.status = 'completed' then
      return query
      select 'completed'::text, coalesce(v_quantity, 0),
        v_existing.reply, v_existing.conversation_id, null::text;
      return;
    end if;

    if v_existing.status = 'processing' then
      return query
      select 'in_progress'::text, coalesce(v_quantity, 0),
        null::text, v_existing.conversation_id, null::text;
      return;
    end if;

    return query
    select 'failed'::text, coalesce(v_quantity, 0), null::text,
      v_existing.conversation_id,
      coalesce(v_existing.error_code, 'GIFT_SEND_FAILED')::text;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'gift-inventory:' || p_user_id::text || ':' || p_gift_id::text,
      0
    )
  );

  select i.quantity
  into v_quantity
  from public.user_gift_inventory as i
  where i.user_id = p_user_id
    and i.gift_id = p_gift_id
  for update;

  if not found or v_quantity < 1 then
    return query
    select 'rejected'::text, coalesce(v_quantity, 0), null::text,
      null::uuid, 'GIFT_NOT_OWNED'::text;
    return;
  end if;

  update public.user_gift_inventory as i
  set
    quantity = i.quantity - 1,
    updated_at = clock_timestamp()
  where i.user_id = p_user_id
    and i.gift_id = p_gift_id
  returning i.quantity into v_quantity;

  insert into public.gift_send_requests (
    request_id,
    user_id,
    character_id,
    gift_id,
    status,
    user_text
  )
  values (
    p_request_id,
    p_user_id,
    p_character_id,
    p_gift_id,
    'processing',
    nullif(trim(coalesce(p_user_text, '')), '')
  );

  return query
  select 'claimed'::text, v_quantity, null::text, null::uuid, null::text;
end;
$$;

create or replace function public.complete_gift_send(
  p_user_id uuid,
  p_request_id uuid,
  p_conversation_id uuid,
  p_reply text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.gift_send_requests as r
  set
    status = 'completed',
    conversation_id = p_conversation_id,
    reply = p_reply,
    error_code = null,
    completed_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where r.request_id = p_request_id
    and r.user_id = p_user_id
    and r.status = 'processing';

  if found then
    return true;
  end if;

  return exists (
    select 1
    from public.gift_send_requests as r
    where r.request_id = p_request_id
      and r.user_id = p_user_id
      and r.status = 'completed'
  );
end;
$$;

create or replace function public.fail_gift_send(
  p_user_id uuid,
  p_request_id uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.gift_send_requests%rowtype;
begin
  select *
  into v_request
  from public.gift_send_requests as r
  where r.request_id = p_request_id
    and r.user_id = p_user_id
  for update;

  if not found then
    return false;
  end if;

  if v_request.status = 'completed' then
    return true;
  end if;

  if v_request.status = 'processing' and not v_request.inventory_refunded then
    insert into public.user_gift_inventory (
      user_id,
      gift_id,
      quantity,
      created_at,
      updated_at
    )
    values (
      p_user_id,
      v_request.gift_id,
      1,
      clock_timestamp(),
      clock_timestamp()
    )
    on conflict on constraint user_gift_inventory_pkey
    do update
    set
      quantity = public.user_gift_inventory.quantity + 1,
      updated_at = excluded.updated_at;
  end if;

  update public.gift_send_requests as r
  set
    status = 'failed',
    inventory_refunded = true,
    error_code = left(coalesce(p_error_code, 'GIFT_SEND_FAILED'), 120),
    updated_at = clock_timestamp()
  where r.request_id = p_request_id
    and r.user_id = p_user_id;

  return true;
end;
$$;

revoke all on function public.purchase_evershop_gift(uuid, uuid, integer, bigint)
  from public, anon, authenticated;
revoke all on function public.begin_gift_send(uuid, uuid, text, integer, text)
  from public, anon, authenticated;
revoke all on function public.complete_gift_send(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.fail_gift_send(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.purchase_evershop_gift(uuid, uuid, integer, bigint)
  to service_role;
grant execute on function public.begin_gift_send(uuid, uuid, text, integer, text)
  to service_role;
grant execute on function public.complete_gift_send(uuid, uuid, uuid, text)
  to service_role;
grant execute on function public.fail_gift_send(uuid, uuid, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
