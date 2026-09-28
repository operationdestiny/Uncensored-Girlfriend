begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- EverCoin wallet hardening
-- ---------------------------------------------------------------------------

alter table public.evercoin_wallets
  add column if not exists debt bigint not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'evercoin_wallets_debt_check'
      and conrelid = 'public.evercoin_wallets'::regclass
  ) then
    alter table public.evercoin_wallets
      add constraint evercoin_wallets_debt_check check (debt >= 0);
  end if;
end;
$$;

create table if not exists public.evercoin_purchases (
  paddle_transaction_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  price_id text not null,
  pack_code text not null,
  coins_granted bigint not null check (coins_granted > 0),
  coins_reversed bigint not null default 0 check (coins_reversed >= 0),
  transaction_total_minor bigint,
  currency_code text,
  status text not null default 'credited'
    check (status in ('credited', 'partially_reversed', 'reversed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists evercoin_purchases_user_created_idx
  on public.evercoin_purchases (user_id, created_at desc);

create table if not exists public.evercoin_adjustments (
  adjustment_id text primary key,
  paddle_transaction_id text not null
    references public.evercoin_purchases(paddle_transaction_id)
    on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  status text not null,
  coins_reversed bigint not null default 0 check (coins_reversed >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.evercoin_debt_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null check (amount <> 0),
  reason text not null,
  reference_id text,
  created_at timestamptz not null default now()
);

create index if not exists evercoin_debt_events_user_created_idx
  on public.evercoin_debt_events (user_id, created_at desc);

-- The earliest gallery migration did not include this table. Keep the
-- hardening migration compatible whether the foundation update was run or not.
create table if not exists public.voice_call_minutes (
  user_id uuid not null references auth.users(id) on delete cascade,
  call_id uuid not null,
  character_id text not null references public.characters(id) on delete cascade,
  minute_index integer not null check (minute_index >= 1),
  evercoin_charge bigint not null default 0 check (evercoin_charge >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, call_id, minute_index)
);

create index if not exists voice_call_minutes_user_created_idx
  on public.voice_call_minutes (user_id, created_at desc);

-- Older installations may have the gallery charge column without its check.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'character_gallery_images_evercoin_charge_check'
      and conrelid = 'public.character_gallery_images'::regclass
  ) then
    alter table public.character_gallery_images
      add constraint character_gallery_images_evercoin_charge_check
      check (evercoin_charge >= 0);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Server-authoritative voice calls
-- ---------------------------------------------------------------------------

create table if not exists public.voice_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id text not null references public.characters(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'ended')),
  started_at timestamptz not null default now(),
  paid_through timestamptz not null,
  last_activity_at timestamptz not null default now(),
  max_ends_at timestamptz not null,
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists voice_calls_one_active_per_user_idx
  on public.voice_calls (user_id)
  where status = 'active';

create index if not exists voice_calls_user_created_idx
  on public.voice_calls (user_id, created_at desc);

create table if not exists public.voice_call_turns (
  request_id uuid primary key,
  call_id uuid not null references public.voice_calls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id text not null references public.characters(id) on delete cascade,
  conversation_id uuid,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  transcript text,
  reply text,
  audio_storage_path text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists voice_call_turns_call_created_idx
  on public.voice_call_turns (call_id, created_at desc);

create index if not exists voice_call_turns_user_created_idx
  on public.voice_call_turns (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Idempotent image requests
-- ---------------------------------------------------------------------------

create table if not exists public.character_image_requests (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id text not null references public.characters(id) on delete cascade,
  prompt text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  image_id uuid references public.character_gallery_images(id) on delete set null,
  evercoin_charge bigint not null default 0 check (evercoin_charge >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists character_image_one_processing_idx
  on public.character_image_requests (user_id, character_id)
  where status = 'processing';

create index if not exists character_image_requests_user_created_idx
  on public.character_image_requests (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Private temporary voice audio bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'voice-call-audio',
  'voice-call-audio',
  false,
  5242880,
  array['audio/ogg', 'audio/opus', 'application/ogg']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.evercoin_purchases enable row level security;
alter table public.evercoin_adjustments enable row level security;
alter table public.evercoin_debt_events enable row level security;
alter table public.voice_call_minutes enable row level security;
alter table public.voice_calls enable row level security;
alter table public.voice_call_turns enable row level security;
alter table public.character_image_requests enable row level security;

drop policy if exists evercoin_purchases_owner_read
  on public.evercoin_purchases;
create policy evercoin_purchases_owner_read
on public.evercoin_purchases
for select
using (auth.uid() = user_id);

drop policy if exists evercoin_adjustments_owner_read
  on public.evercoin_adjustments;
create policy evercoin_adjustments_owner_read
on public.evercoin_adjustments
for select
using (auth.uid() = user_id);

drop policy if exists evercoin_debt_events_owner_read
  on public.evercoin_debt_events;
create policy evercoin_debt_events_owner_read
on public.evercoin_debt_events
for select
using (auth.uid() = user_id);

drop policy if exists voice_call_minutes_owner_read
  on public.voice_call_minutes;
create policy voice_call_minutes_owner_read
on public.voice_call_minutes
for select
using (auth.uid() = user_id);

drop policy if exists voice_calls_owner_read
  on public.voice_calls;
create policy voice_calls_owner_read
on public.voice_calls
for select
using (auth.uid() = user_id);

drop policy if exists voice_call_turns_owner_read
  on public.voice_call_turns;
create policy voice_call_turns_owner_read
on public.voice_call_turns
for select
using (auth.uid() = user_id);

drop policy if exists character_image_requests_owner_read
  on public.character_image_requests;
create policy character_image_requests_owner_read
on public.character_image_requests
for select
using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Debt-aware generic EverCoin charge. Existing server callers keep working.
-- ---------------------------------------------------------------------------

create or replace function public.charge_evercoin(
  p_user_id uuid,
  p_amount bigint,
  p_reason text,
  p_reference_id text default null
)
returns table (
  charged boolean,
  balance bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_debt bigint;
begin
  if p_amount < 0 then
    raise exception 'INVALID_EVERCOIN_AMOUNT';
  end if;

  insert into public.evercoin_wallets (user_id, balance, debt)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select w.balance, w.debt
  into v_balance, v_debt
  from public.evercoin_wallets w
  where w.user_id = p_user_id
  for update;

  if v_debt > 0 or v_balance < p_amount then
    return query select false, v_balance;
    return;
  end if;

  update public.evercoin_wallets w
  set
    balance = w.balance - p_amount,
    updated_at = now()
  where w.user_id = p_user_id
  returning w.balance into v_balance;

  if p_amount > 0 then
    insert into public.evercoin_transactions (
      user_id,
      amount,
      reason,
      reference_id
    )
    values (
      p_user_id,
      -p_amount,
      p_reason,
      p_reference_id
    );
  end if;

  return query select true, v_balance;
end;
$$;

create or replace function public.refund_evercoin(
  p_user_id uuid,
  p_amount bigint,
  p_reason text,
  p_reference_id text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_debt bigint;
  v_to_debt bigint;
  v_to_balance bigint;
begin
  if p_amount <= 0 then
    select coalesce(balance, 0)
    into v_balance
    from public.evercoin_wallets
    where user_id = p_user_id;
    return coalesce(v_balance, 0);
  end if;

  insert into public.evercoin_wallets (user_id, balance, debt)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select balance, debt
  into v_balance, v_debt
  from public.evercoin_wallets
  where user_id = p_user_id
  for update;

  v_to_debt := least(v_debt, p_amount);
  v_to_balance := p_amount - v_to_debt;

  update public.evercoin_wallets
  set
    debt = debt - v_to_debt,
    balance = balance + v_to_balance,
    updated_at = clock_timestamp()
  where user_id = p_user_id
  returning balance, debt into v_balance, v_debt;

  insert into public.evercoin_transactions (
    user_id,
    amount,
    reason,
    reference_id
  )
  values (
    p_user_id,
    p_amount,
    p_reason,
    p_reference_id
  );

  if v_to_debt > 0 then
    insert into public.evercoin_debt_events (
      user_id,
      amount,
      reason,
      reference_id
    )
    values (
      p_user_id,
      -v_to_debt,
      'evercoin_refund_debt_payment',
      p_reference_id
    );
  end if;

  return v_balance;
end;
$$;

-- ---------------------------------------------------------------------------
-- Voice call functions
-- ---------------------------------------------------------------------------

create or replace function public.start_voice_call(
  p_user_id uuid,
  p_character_id text,
  p_amount bigint,
  p_max_minutes integer
)
returns table (
  started boolean,
  call_id uuid,
  balance bigint,
  debt bigint,
  started_at timestamptz,
  paid_through timestamptz,
  max_ends_at timestamptz,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_call_id uuid := gen_random_uuid();
  v_balance bigint;
  v_debt bigint;
  v_max_minutes integer := greatest(1, least(coalesce(p_max_minutes, 60), 60));
begin
  if p_amount < 0 then
    raise exception 'INVALID_VOICE_CALL_CHARGE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('voice-user:' || p_user_id::text, 0)
  );

  insert into public.evercoin_wallets (user_id, balance, debt)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select w.balance, w.debt
  into v_balance, v_debt
  from public.evercoin_wallets w
  where w.user_id = p_user_id
  for update;

  if v_debt > 0 then
    return query
    select false, null::uuid, v_balance, v_debt,
      null::timestamptz, null::timestamptz, null::timestamptz,
      'EVERCOIN_DEBT'::text;
    return;
  end if;

  if v_balance < p_amount then
    return query
    select false, null::uuid, v_balance, v_debt,
      null::timestamptz, null::timestamptz, null::timestamptz,
      'INSUFFICIENT_EVERCOIN'::text;
    return;
  end if;

  update public.voice_calls
  set
    status = 'ended',
    ended_at = coalesce(ended_at, v_now),
    end_reason = coalesce(end_reason, 'replaced_by_new_call'),
    updated_at = v_now
  where user_id = p_user_id
    and status = 'active';

  update public.evercoin_wallets w
  set
    balance = w.balance - p_amount,
    updated_at = v_now
  where w.user_id = p_user_id
  returning w.balance into v_balance;

  insert into public.voice_calls (
    id,
    user_id,
    character_id,
    status,
    started_at,
    paid_through,
    last_activity_at,
    max_ends_at,
    created_at,
    updated_at
  )
  values (
    v_call_id,
    p_user_id,
    p_character_id,
    'active',
    v_now,
    v_now + interval '1 minute',
    v_now,
    v_now + make_interval(mins => v_max_minutes),
    v_now,
    v_now
  );

  insert into public.voice_call_minutes (
    user_id,
    call_id,
    character_id,
    minute_index,
    evercoin_charge,
    created_at
  )
  values (
    p_user_id,
    v_call_id,
    p_character_id,
    1,
    p_amount,
    v_now
  )
  on conflict (user_id, call_id, minute_index) do nothing;

  if p_amount > 0 then
    insert into public.evercoin_transactions (
      user_id,
      amount,
      reason,
      reference_id,
      created_at
    )
    values (
      p_user_id,
      -p_amount,
      'voice_call_minute',
      v_call_id::text || ':1',
      v_now
    );
  end if;

  return query
  select true, v_call_id, v_balance, v_debt,
    v_now,
    v_now + interval '1 minute',
    v_now + make_interval(mins => v_max_minutes),
    null::text;
end;
$$;

create or replace function public.prepare_voice_call_turn(
  p_user_id uuid,
  p_call_id uuid,
  p_character_id text,
  p_amount bigint,
  p_max_minutes integer,
  p_idle_timeout_seconds integer
)
returns table (
  allowed boolean,
  balance bigint,
  debt bigint,
  current_minute integer,
  newly_charged bigint,
  started_at timestamptz,
  max_ends_at timestamptz,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_call public.voice_calls%rowtype;
  v_balance bigint;
  v_debt bigint;
  v_current_minute integer;
  v_last_charged integer;
  v_missing integer;
  v_total bigint;
  v_max_minutes integer := greatest(1, least(coalesce(p_max_minutes, 60), 60));
  v_idle_seconds integer := greatest(30, least(coalesce(p_idle_timeout_seconds, 90), 90));
begin
  if p_amount < 0 then
    raise exception 'INVALID_VOICE_CALL_CHARGE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('voice-call:' || p_call_id::text, 0)
  );

  select *
  into v_call
  from public.voice_calls
  where id = p_call_id
    and user_id = p_user_id
    and character_id = p_character_id
  for update;

  if not found then
    return query
    select false, 0::bigint, 0::bigint, 0, 0::bigint,
      null::timestamptz, null::timestamptz, 'CALL_NOT_FOUND'::text;
    return;
  end if;

  if v_call.status <> 'active' then
    select coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_balance, v_debt
    from public.evercoin_wallets w
    where w.user_id = p_user_id;

    return query
    select false, coalesce(v_balance, 0), coalesce(v_debt, 0), 0, 0::bigint,
      v_call.started_at, v_call.max_ends_at, 'CALL_ENDED'::text;
    return;
  end if;

  if v_now >= v_call.max_ends_at
     or v_now >= v_call.started_at + make_interval(mins => v_max_minutes) then
    update public.voice_calls
    set status = 'ended', ended_at = v_now,
        end_reason = 'maximum_length', updated_at = v_now
    where id = p_call_id;

    return query
    select false, 0::bigint, 0::bigint, v_max_minutes, 0::bigint,
      v_call.started_at, v_call.max_ends_at, 'CALL_LIMIT_REACHED'::text;
    return;
  end if;

  if v_now > v_call.last_activity_at + make_interval(secs => v_idle_seconds) then
    update public.voice_calls
    set status = 'ended', ended_at = v_now,
        end_reason = 'idle_timeout', updated_at = v_now
    where id = p_call_id;

    return query
    select false, 0::bigint, 0::bigint, 0, 0::bigint,
      v_call.started_at, v_call.max_ends_at, 'CALL_IDLE_TIMEOUT'::text;
    return;
  end if;

  v_current_minute := floor(
    extract(epoch from (v_now - v_call.started_at)) / 60
  )::integer + 1;
  v_current_minute := greatest(1, least(v_current_minute, v_max_minutes));

  select coalesce(max(v.minute_index), 0)
  into v_last_charged
  from public.voice_call_minutes v
  where v.user_id = p_user_id
    and v.call_id = p_call_id;

  v_missing := greatest(v_current_minute - v_last_charged, 0);
  v_total := v_missing::bigint * p_amount;

  insert into public.evercoin_wallets (user_id, balance, debt)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select w.balance, w.debt
  into v_balance, v_debt
  from public.evercoin_wallets w
  where w.user_id = p_user_id
  for update;

  if v_debt > 0 then
    update public.voice_calls
    set status = 'ended', ended_at = v_now,
        end_reason = 'evercoin_debt', updated_at = v_now
    where id = p_call_id;

    return query
    select false, v_balance, v_debt, v_current_minute, 0::bigint,
      v_call.started_at, v_call.max_ends_at, 'EVERCOIN_DEBT'::text;
    return;
  end if;

  if v_balance < v_total then
    update public.voice_calls
    set status = 'ended', ended_at = v_now,
        end_reason = 'insufficient_evercoin', updated_at = v_now
    where id = p_call_id;

    return query
    select false, v_balance, v_debt, v_current_minute, 0::bigint,
      v_call.started_at, v_call.max_ends_at, 'INSUFFICIENT_EVERCOIN'::text;
    return;
  end if;

  if v_total > 0 then
    update public.evercoin_wallets w
    set balance = w.balance - v_total, updated_at = v_now
    where w.user_id = p_user_id
    returning w.balance into v_balance;
  end if;

  if v_missing > 0 then
    insert into public.voice_call_minutes (
      user_id,
      call_id,
      character_id,
      minute_index,
      evercoin_charge,
      created_at
    )
    select
      p_user_id,
      p_call_id,
      p_character_id,
      minute_number,
      p_amount,
      v_now
    from generate_series(v_last_charged + 1, v_current_minute) minute_number
    on conflict (user_id, call_id, minute_index) do nothing;

    if v_total > 0 then
      insert into public.evercoin_transactions (
        user_id,
        amount,
        reason,
        reference_id,
        created_at
      )
      values (
        p_user_id,
        -v_total,
        'voice_call_minutes',
        p_call_id::text || ':' || (v_last_charged + 1)::text || '-' || v_current_minute::text,
        v_now
      );
    end if;
  end if;

  update public.voice_calls
  set
    paid_through = greatest(
      paid_through,
      started_at + make_interval(mins => v_current_minute)
    ),
    last_activity_at = v_now,
    updated_at = v_now
  where id = p_call_id;

  return query
  select true, v_balance, v_debt, v_current_minute, v_total,
    v_call.started_at, v_call.max_ends_at, null::text;
end;
$$;

create or replace function public.claim_voice_call_turn(
  p_user_id uuid,
  p_call_id uuid,
  p_character_id text,
  p_request_id uuid,
  p_max_turns_per_minute integer
)
returns table (
  claim_status text,
  existing_transcript text,
  existing_reply text,
  existing_audio_path text,
  existing_conversation_id uuid,
  existing_input_tokens integer,
  existing_output_tokens integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.voice_call_turns%rowtype;
  v_count integer;
  v_limit integer := greatest(1, least(coalesce(p_max_turns_per_minute, 4), 4));
begin
  perform pg_advisory_xact_lock(
    hashtextextended('voice-turn:' || p_call_id::text, 0)
  );

  select * into v_existing
  from public.voice_call_turns
  where request_id = p_request_id
    and user_id = p_user_id
    and call_id = p_call_id;

  if found then
    return query
    select v_existing.status,
      v_existing.transcript,
      v_existing.reply,
      v_existing.audio_storage_path,
      v_existing.conversation_id,
      v_existing.input_tokens,
      v_existing.output_tokens,
      0;
    return;
  end if;

  if not exists (
    select 1
    from public.voice_calls
    where id = p_call_id
      and user_id = p_user_id
      and character_id = p_character_id
      and status = 'active'
  ) then
    return query
    select 'invalid_call'::text, null::text, null::text, null::text,
      null::uuid, 0, 0, 0;
    return;
  end if;

  update public.voice_call_turns
  set
    status = 'failed',
    error_code = 'STALE_PROCESSING_TURN',
    completed_at = clock_timestamp()
  where call_id = p_call_id
    and user_id = p_user_id
    and status = 'processing'
    and created_at < clock_timestamp() - interval '2 minutes';

  if exists (
    select 1
    from public.voice_call_turns
    where call_id = p_call_id
      and user_id = p_user_id
      and status = 'processing'
  ) then
    return query
    select 'busy'::text, null::text, null::text, null::text,
      null::uuid, 0, 0, 1;
    return;
  end if;

  select count(*)
  into v_count
  from public.voice_call_turns
  where call_id = p_call_id
    and user_id = p_user_id
    and created_at > clock_timestamp() - interval '60 seconds';

  if v_count >= v_limit then
    return query
    select 'rate_limited'::text, null::text, null::text, null::text,
      null::uuid, 0, 0, 15;
    return;
  end if;

  insert into public.voice_call_turns (
    request_id,
    call_id,
    user_id,
    character_id,
    status
  )
  values (
    p_request_id,
    p_call_id,
    p_user_id,
    p_character_id,
    'processing'
  );

  return query
  select 'claimed'::text, null::text, null::text, null::text,
    null::uuid, 0, 0, 0;
end;
$$;

create or replace function public.complete_voice_call_turn(
  p_user_id uuid,
  p_call_id uuid,
  p_request_id uuid,
  p_conversation_id uuid,
  p_transcript text,
  p_reply text,
  p_audio_storage_path text,
  p_input_tokens integer,
  p_output_tokens integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
  v_now timestamptz := clock_timestamp();
begin
  update public.voice_call_turns
  set
    status = 'completed',
    conversation_id = p_conversation_id,
    transcript = p_transcript,
    reply = p_reply,
    audio_storage_path = p_audio_storage_path,
    input_tokens = greatest(coalesce(p_input_tokens, 0), 0),
    output_tokens = greatest(coalesce(p_output_tokens, 0), 0),
    error_code = null,
    completed_at = v_now
  where request_id = p_request_id
    and call_id = p_call_id
    and user_id = p_user_id
    and status = 'processing';

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    return false;
  end if;

  insert into public.messages (
    conversation_id,
    role,
    content,
    input_tokens,
    output_tokens,
    created_at
  )
  values
    (
      p_conversation_id,
      'user',
      p_transcript,
      0,
      0,
      v_now
    ),
    (
      p_conversation_id,
      'character',
      p_reply,
      greatest(coalesce(p_input_tokens, 0), 0),
      greatest(coalesce(p_output_tokens, 0), 0),
      v_now + interval '1 millisecond'
    );

  update public.conversations
  set updated_at = v_now
  where id = p_conversation_id
    and user_id = p_user_id;

  update public.voice_calls
  set last_activity_at = v_now, updated_at = v_now
  where id = p_call_id
    and user_id = p_user_id
    and status = 'active';

  return true;
end;
$$;

create or replace function public.fail_voice_call_turn(
  p_user_id uuid,
  p_call_id uuid,
  p_request_id uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.voice_call_turns
  set
    status = 'failed',
    error_code = left(coalesce(p_error_code, 'VOICE_TURN_FAILED'), 200),
    completed_at = clock_timestamp()
  where request_id = p_request_id
    and call_id = p_call_id
    and user_id = p_user_id
    and status = 'processing';

  return found;
end;
$$;

create or replace function public.end_voice_call(
  p_user_id uuid,
  p_call_id uuid,
  p_reason text default 'user_hangup'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.voice_calls
  set
    status = 'ended',
    ended_at = coalesce(ended_at, clock_timestamp()),
    end_reason = coalesce(end_reason, left(coalesce(p_reason, 'user_hangup'), 100)),
    updated_at = clock_timestamp()
  where id = p_call_id
    and user_id = p_user_id
    and status = 'active';

  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Idempotent image request functions
-- ---------------------------------------------------------------------------

create or replace function public.start_character_image_request(
  p_user_id uuid,
  p_request_id uuid,
  p_character_id text,
  p_prompt text,
  p_amount bigint,
  p_gallery_limit integer
)
returns table (
  request_status text,
  balance bigint,
  debt bigint,
  image_id uuid,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.character_image_requests%rowtype;
  v_balance bigint;
  v_debt bigint;
  v_count integer;
  v_stale_request uuid;
  v_limit integer := greatest(1, least(coalesce(p_gallery_limit, 5), 5));
begin
  if p_amount < 0 then
    raise exception 'INVALID_IMAGE_CHARGE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'image:' || p_user_id::text || ':' || p_character_id || ':' || p_request_id::text,
      0
    )
  );

  select * into v_existing
  from public.character_image_requests
  where request_id = p_request_id
    and user_id = p_user_id;

  if found then
    select coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_balance, v_debt
    from public.evercoin_wallets w
    where w.user_id = p_user_id;

    return query
    select v_existing.status, coalesce(v_balance, 0), coalesce(v_debt, 0),
      v_existing.image_id, v_existing.error_code;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('image-character:' || p_user_id::text || ':' || p_character_id, 0)
  );

  select request_id
  into v_stale_request
  from public.character_image_requests
  where user_id = p_user_id
    and character_id = p_character_id
    and status = 'processing'
    and created_at < clock_timestamp() - interval '5 minutes'
  order by created_at
  limit 1;

  if found then
    perform public.fail_character_image_request(
      p_user_id,
      v_stale_request,
      'STALE_IMAGE_REQUEST'
    );
  end if;

  if exists (
    select 1
    from public.character_image_requests
    where user_id = p_user_id
      and character_id = p_character_id
      and status = 'processing'
  ) then
    return query
    select 'busy'::text, 0::bigint, 0::bigint, null::uuid,
      'IMAGE_REQUEST_IN_PROGRESS'::text;
    return;
  end if;

  select count(*)
  into v_count
  from public.character_gallery_images
  where user_id = p_user_id
    and character_id = p_character_id;

  if v_count >= v_limit then
    return query
    select 'limit_reached'::text, 0::bigint, 0::bigint, null::uuid,
      'IMAGE_LIMIT_REACHED'::text;
    return;
  end if;

  insert into public.evercoin_wallets (user_id, balance, debt)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select w.balance, w.debt
  into v_balance, v_debt
  from public.evercoin_wallets w
  where w.user_id = p_user_id
  for update;

  if v_debt > 0 then
    return query
    select 'insufficient'::text, v_balance, v_debt, null::uuid,
      'EVERCOIN_DEBT'::text;
    return;
  end if;

  if v_balance < p_amount then
    return query
    select 'insufficient'::text, v_balance, v_debt, null::uuid,
      'INSUFFICIENT_EVERCOIN'::text;
    return;
  end if;

  update public.evercoin_wallets w
  set balance = w.balance - p_amount, updated_at = clock_timestamp()
  where w.user_id = p_user_id
  returning w.balance into v_balance;

  insert into public.character_image_requests (
    request_id,
    user_id,
    character_id,
    prompt,
    status,
    evercoin_charge
  )
  values (
    p_request_id,
    p_user_id,
    p_character_id,
    p_prompt,
    'processing',
    p_amount
  );

  if p_amount > 0 then
    insert into public.evercoin_transactions (
      user_id,
      amount,
      reason,
      reference_id
    )
    values (
      p_user_id,
      -p_amount,
      'character_image_generation',
      p_request_id::text
    );
  end if;

  return query
  select 'claimed'::text, v_balance, v_debt, null::uuid, null::text;
end;
$$;

create or replace function public.complete_character_image_request(
  p_user_id uuid,
  p_request_id uuid,
  p_image_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.character_image_requests
  set
    status = 'completed',
    image_id = p_image_id,
    error_code = null,
    updated_at = clock_timestamp()
  where request_id = p_request_id
    and user_id = p_user_id
    and status = 'processing';

  return found;
end;
$$;

create or replace function public.fail_character_image_request(
  p_user_id uuid,
  p_request_id uuid,
  p_error_code text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge bigint;
  v_balance bigint;
  v_debt bigint;
  v_to_debt bigint;
  v_to_balance bigint;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('image-refund:' || p_request_id::text, 0)
  );

  select evercoin_charge
  into v_charge
  from public.character_image_requests
  where request_id = p_request_id
    and user_id = p_user_id
    and status = 'processing'
  for update;

  if not found then
    select coalesce(balance, 0)
    into v_balance
    from public.evercoin_wallets
    where user_id = p_user_id;
    return coalesce(v_balance, 0);
  end if;

  update public.character_image_requests
  set
    status = 'failed',
    error_code = left(coalesce(p_error_code, 'IMAGE_GENERATION_FAILED'), 200),
    updated_at = clock_timestamp()
  where request_id = p_request_id
    and user_id = p_user_id;

  insert into public.evercoin_wallets (user_id, balance, debt)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select balance, debt
  into v_balance, v_debt
  from public.evercoin_wallets
  where user_id = p_user_id
  for update;

  v_to_debt := least(v_debt, v_charge);
  v_to_balance := v_charge - v_to_debt;

  update public.evercoin_wallets
  set
    debt = debt - v_to_debt,
    balance = balance + v_to_balance,
    updated_at = clock_timestamp()
  where user_id = p_user_id
  returning balance, debt into v_balance, v_debt;

  if v_charge > 0 then
    insert into public.evercoin_transactions (
      user_id,
      amount,
      reason,
      reference_id
    )
    values (
      p_user_id,
      v_charge,
      'character_image_generation_failed',
      p_request_id::text
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
      p_user_id,
      -v_to_debt,
      'character_image_refund_debt_payment',
      p_request_id::text
    );
  end if;

  return coalesce(v_balance, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Paddle EverCoin purchase functions
-- ---------------------------------------------------------------------------

create or replace function public.credit_evercoin_purchase(
  p_user_id uuid,
  p_transaction_id text,
  p_price_id text,
  p_pack_code text,
  p_coins bigint,
  p_total_minor bigint,
  p_currency_code text
)
returns table (
  credited boolean,
  balance bigint,
  debt bigint,
  coins_applied_to_debt bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_debt bigint;
  v_to_debt bigint;
  v_to_balance bigint;
begin
  if p_coins <= 0 then
    raise exception 'INVALID_EVERCOIN_PURCHASE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('paddle-coin:' || p_transaction_id, 0)
  );

  if exists (
    select 1 from public.evercoin_purchases
    where paddle_transaction_id = p_transaction_id
  ) then
    select coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_balance, v_debt
    from public.evercoin_wallets w
    where w.user_id = p_user_id;

    return query
    select false, coalesce(v_balance, 0), coalesce(v_debt, 0), 0::bigint;
    return;
  end if;

  insert into public.evercoin_wallets (user_id, balance, debt)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select w.balance, w.debt
  into v_balance, v_debt
  from public.evercoin_wallets w
  where w.user_id = p_user_id
  for update;

  v_to_debt := least(v_debt, p_coins);
  v_to_balance := p_coins - v_to_debt;

  update public.evercoin_wallets w
  set
    debt = w.debt - v_to_debt,
    balance = w.balance + v_to_balance,
    updated_at = clock_timestamp()
  where w.user_id = p_user_id
  returning w.balance, w.debt into v_balance, v_debt;

  insert into public.evercoin_purchases (
    paddle_transaction_id,
    user_id,
    price_id,
    pack_code,
    coins_granted,
    transaction_total_minor,
    currency_code,
    status
  )
  values (
    p_transaction_id,
    p_user_id,
    p_price_id,
    p_pack_code,
    p_coins,
    p_total_minor,
    p_currency_code,
    'credited'
  );

  insert into public.evercoin_transactions (
    user_id,
    amount,
    reason,
    reference_id
  )
  values (
    p_user_id,
    p_coins,
    'evercoin_purchase',
    p_transaction_id
  );

  if v_to_debt > 0 then
    insert into public.evercoin_debt_events (
      user_id,
      amount,
      reason,
      reference_id
    )
    values (
      p_user_id,
      -v_to_debt,
      'evercoin_purchase_debt_payment',
      p_transaction_id
    );
  end if;

  return query select true, v_balance, v_debt, v_to_debt;
end;
$$;

create or replace function public.reverse_evercoin_purchase(
  p_transaction_id text,
  p_adjustment_id text,
  p_action text,
  p_status text,
  p_coins bigint
)
returns table (
  reversed boolean,
  user_id uuid,
  balance bigint,
  debt bigint,
  coins_reversed bigint
)
language plpgsql
security definer
set search_path = public
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
  on conflict (user_id) do nothing;

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

-- ---------------------------------------------------------------------------
-- One-time message bundles and an atomic text-chat credit gate
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists subscription_status text not null default 'free';
alter table public.profiles
  add column if not exists trial_status text not null default 'not_started';
alter table public.profiles
  add column if not exists trial_messages_used integer not null default 0;
alter table public.profiles
  add column if not exists trial_message_limit integer not null default 20;
alter table public.profiles
  add column if not exists trial_started_at timestamptz;
alter table public.profiles
  add column if not exists trial_ended_at timestamptz;

create table if not exists public.message_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  debt bigint not null default 0 check (debt >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null,
  reason text not null,
  reference_id text,
  created_at timestamptz not null default now()
);

create index if not exists message_transactions_user_created_idx
  on public.message_transactions (user_id, created_at desc);

create table if not exists public.message_credit_usage (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('trial', 'purchased')),
  status text not null default 'reserved'
    check (status in ('reserved', 'completed', 'refunded')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  refunded_at timestamptz
);

create index if not exists message_credit_usage_user_created_idx
  on public.message_credit_usage (user_id, created_at desc);

create table if not exists public.message_purchases (
  paddle_transaction_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  price_id text not null,
  bundle_code text not null,
  messages_granted bigint not null check (messages_granted > 0),
  messages_reversed bigint not null default 0 check (messages_reversed >= 0),
  transaction_total_minor bigint,
  currency_code text,
  status text not null default 'credited'
    check (status in ('credited', 'partially_reversed', 'reversed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists message_purchases_user_created_idx
  on public.message_purchases (user_id, created_at desc);

create table if not exists public.message_adjustments (
  adjustment_id text primary key,
  paddle_transaction_id text not null
    references public.message_purchases(paddle_transaction_id)
    on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  status text not null,
  messages_reversed bigint not null default 0 check (messages_reversed >= 0),
  created_at timestamptz not null default now()
);

alter table public.message_wallets enable row level security;
alter table public.message_transactions enable row level security;
alter table public.message_credit_usage enable row level security;
alter table public.message_purchases enable row level security;
alter table public.message_adjustments enable row level security;

drop policy if exists message_wallet_owner_read on public.message_wallets;
create policy message_wallet_owner_read
on public.message_wallets for select
using (auth.uid() = user_id);

drop policy if exists message_transactions_owner_read on public.message_transactions;
create policy message_transactions_owner_read
on public.message_transactions for select
using (auth.uid() = user_id);

drop policy if exists message_credit_usage_owner_read on public.message_credit_usage;
create policy message_credit_usage_owner_read
on public.message_credit_usage for select
using (auth.uid() = user_id);

drop policy if exists message_purchases_owner_read on public.message_purchases;
create policy message_purchases_owner_read
on public.message_purchases for select
using (auth.uid() = user_id);

drop policy if exists message_adjustments_owner_read on public.message_adjustments;
create policy message_adjustments_owner_read
on public.message_adjustments for select
using (auth.uid() = user_id);

create or replace function public.reserve_chat_message(
  p_user_id uuid,
  p_request_id uuid
)
returns table (
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
set search_path = public
as $$
declare
  v_usage public.message_credit_usage%rowtype;
  v_trial_used integer;
  v_trial_limit integer;
  v_balance bigint;
  v_debt bigint;
  v_source text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('chat-credit:' || p_user_id::text, 0)
  );

  select * into v_usage
  from public.message_credit_usage
  where request_id = p_request_id
    and user_id = p_user_id;

  if found and v_usage.status in ('reserved', 'completed') then
    select trial_messages_used, trial_message_limit
    into v_trial_used, v_trial_limit
    from public.profiles
    where user_id = p_user_id;

    select coalesce(balance, 0), coalesce(debt, 0)
    into v_balance, v_debt
    from public.message_wallets
    where user_id = p_user_id;

    return query
    select true, v_usage.source,
      greatest(coalesce(v_trial_limit, 20) - coalesce(v_trial_used, 0), 0),
      coalesce(v_balance, 0), coalesce(v_debt, 0), true, null::text;
    return;
  end if;

  if found and v_usage.status = 'refunded' then
    select trial_messages_used, trial_message_limit
    into v_trial_used, v_trial_limit
    from public.profiles
    where user_id = p_user_id;

    select coalesce(balance, 0), coalesce(debt, 0)
    into v_balance, v_debt
    from public.message_wallets
    where user_id = p_user_id;

    return query
    select false, v_usage.source,
      greatest(coalesce(v_trial_limit, 20) - coalesce(v_trial_used, 0), 0),
      coalesce(v_balance, 0), coalesce(v_debt, 0), true,
      'REQUEST_ALREADY_REFUNDED'::text;
    return;
  end if;

  insert into public.profiles (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select trial_messages_used, trial_message_limit
  into v_trial_used, v_trial_limit
  from public.profiles
  where user_id = p_user_id
  for update;

  v_trial_used := greatest(coalesce(v_trial_used, 0), 0);
  v_trial_limit := greatest(coalesce(v_trial_limit, 20), 0);

  if v_trial_used < v_trial_limit then
    v_source := 'trial';

    update public.profiles
    set
      trial_messages_used = v_trial_used + 1,
      trial_status = case
        when v_trial_used + 1 >= v_trial_limit then 'ended'
        else 'active'
      end,
      trial_started_at = coalesce(trial_started_at, clock_timestamp()),
      trial_ended_at = case
        when v_trial_used + 1 >= v_trial_limit then clock_timestamp()
        else null
      end,
      updated_at = clock_timestamp()
    where user_id = p_user_id;
  else
    insert into public.message_wallets (user_id, balance, debt)
    values (p_user_id, 0, 0)
    on conflict (user_id) do nothing;

    select balance, debt
    into v_balance, v_debt
    from public.message_wallets
    where user_id = p_user_id
    for update;

    if v_debt > 0 then
      return query
      select false, null::text, 0, v_balance, v_debt, false,
        'MESSAGE_DEBT'::text;
      return;
    end if;

    if v_balance < 1 then
      return query
      select false, null::text, 0, v_balance, v_debt, false,
        'NO_MESSAGE_CREDITS'::text;
      return;
    end if;

    v_source := 'purchased';
    update public.message_wallets
    set balance = balance - 1, updated_at = clock_timestamp()
    where user_id = p_user_id
    returning balance, debt into v_balance, v_debt;

    insert into public.message_transactions (
      user_id, amount, reason, reference_id
    )
    values (
      p_user_id, -1, 'chat_message', p_request_id::text
    );
  end if;

  insert into public.message_credit_usage (
    request_id, user_id, source, status
  )
  values (
    p_request_id, p_user_id, v_source, 'reserved'
  );

  if v_source = 'trial' then
    select coalesce(balance, 0), coalesce(debt, 0)
    into v_balance, v_debt
    from public.message_wallets
    where user_id = p_user_id;
  end if;

  return query
  select true, v_source,
    greatest(v_trial_limit - case when v_source = 'trial' then v_trial_used + 1 else v_trial_used end, 0),
    coalesce(v_balance, 0), coalesce(v_debt, 0), false, null::text;
end;
$$;

create or replace function public.complete_chat_message_credit(
  p_user_id uuid,
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.message_credit_usage
  set status = 'completed', completed_at = clock_timestamp()
  where request_id = p_request_id
    and user_id = p_user_id
    and status = 'reserved';

  get diagnostics v_updated = row_count;
  return v_updated = 1 or exists (
    select 1 from public.message_credit_usage
    where request_id = p_request_id
      and user_id = p_user_id
      and status = 'completed'
  );
end;
$$;

create or replace function public.refund_chat_message_credit(
  p_user_id uuid,
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage public.message_credit_usage%rowtype;
  v_balance bigint;
  v_debt bigint;
  v_to_debt bigint;
  v_to_balance bigint;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('chat-credit:' || p_user_id::text, 0)
  );

  select * into v_usage
  from public.message_credit_usage
  where request_id = p_request_id
    and user_id = p_user_id
    and status = 'reserved'
  for update;

  if not found then
    return false;
  end if;

  update public.message_credit_usage
  set status = 'refunded', refunded_at = clock_timestamp()
  where request_id = p_request_id
    and user_id = p_user_id;

  if v_usage.source = 'trial' then
    update public.profiles
    set
      trial_messages_used = greatest(trial_messages_used - 1, 0),
      trial_status = case
        when greatest(trial_messages_used - 1, 0) = 0 then 'not_started'
        else 'active'
      end,
      trial_ended_at = null,
      updated_at = clock_timestamp()
    where user_id = p_user_id;
    return true;
  end if;

  insert into public.message_wallets (user_id, balance, debt)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select balance, debt
  into v_balance, v_debt
  from public.message_wallets
  where user_id = p_user_id
  for update;

  v_to_debt := least(v_debt, 1);
  v_to_balance := 1 - v_to_debt;

  update public.message_wallets
  set
    debt = debt - v_to_debt,
    balance = balance + v_to_balance,
    updated_at = clock_timestamp()
  where user_id = p_user_id;

  insert into public.message_transactions (
    user_id, amount, reason, reference_id
  )
  values (
    p_user_id, 1, 'chat_message_failed', p_request_id::text
  );

  return true;
end;
$$;

create or replace function public.credit_message_purchase(
  p_user_id uuid,
  p_transaction_id text,
  p_price_id text,
  p_bundle_code text,
  p_messages bigint,
  p_total_minor bigint,
  p_currency_code text
)
returns table (
  credited boolean,
  balance bigint,
  debt bigint,
  messages_applied_to_debt bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_debt bigint;
  v_to_debt bigint;
  v_to_balance bigint;
begin
  if p_messages <= 0 then
    raise exception 'INVALID_MESSAGE_PURCHASE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('paddle-message:' || p_transaction_id, 0)
  );

  if exists (
    select 1 from public.message_purchases
    where paddle_transaction_id = p_transaction_id
  ) then
    select coalesce(balance, 0), coalesce(debt, 0)
    into v_balance, v_debt
    from public.message_wallets
    where user_id = p_user_id;

    return query
    select false, coalesce(v_balance, 0), coalesce(v_debt, 0), 0::bigint;
    return;
  end if;

  insert into public.message_wallets (user_id, balance, debt)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select balance, debt
  into v_balance, v_debt
  from public.message_wallets
  where user_id = p_user_id
  for update;

  v_to_debt := least(v_debt, p_messages);
  v_to_balance := p_messages - v_to_debt;

  update public.message_wallets
  set
    debt = debt - v_to_debt,
    balance = balance + v_to_balance,
    updated_at = clock_timestamp()
  where user_id = p_user_id
  returning balance, debt into v_balance, v_debt;

  insert into public.message_purchases (
    paddle_transaction_id,
    user_id,
    price_id,
    bundle_code,
    messages_granted,
    transaction_total_minor,
    currency_code,
    status
  )
  values (
    p_transaction_id,
    p_user_id,
    p_price_id,
    p_bundle_code,
    p_messages,
    p_total_minor,
    p_currency_code,
    'credited'
  );

  insert into public.message_transactions (
    user_id, amount, reason, reference_id
  )
  values (
    p_user_id, p_messages, 'message_bundle_purchase', p_transaction_id
  );

  return query select true, v_balance, v_debt, v_to_debt;
end;
$$;

create or replace function public.reverse_message_purchase(
  p_transaction_id text,
  p_adjustment_id text,
  p_action text,
  p_status text,
  p_messages bigint
)
returns table (
  reversed boolean,
  user_id uuid,
  balance bigint,
  debt bigint,
  messages_reversed bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.message_purchases%rowtype;
  v_balance bigint;
  v_debt bigint;
  v_remaining bigint;
  v_requested bigint;
  v_from_balance bigint;
  v_to_debt bigint;
  v_existing_user_id uuid;
begin
  if p_messages <= 0 then
    raise exception 'INVALID_MESSAGE_REVERSAL';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('paddle-message-adjustment:' || p_adjustment_id, 0)
  );

  if exists (
    select 1 from public.message_adjustments
    where adjustment_id = p_adjustment_id
  ) then
    select p.user_id, coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_existing_user_id, v_balance, v_debt
    from public.message_purchases p
    left join public.message_wallets w on w.user_id = p.user_id
    where p.paddle_transaction_id = p_transaction_id;

    return query
    select false, v_existing_user_id, coalesce(v_balance, 0),
      coalesce(v_debt, 0), 0::bigint;
    return;
  end if;

  select * into v_purchase
  from public.message_purchases
  where paddle_transaction_id = p_transaction_id
  for update;

  if not found then
    return query
    select false, null::uuid, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  v_remaining := greatest(
    v_purchase.messages_granted - v_purchase.messages_reversed,
    0
  );
  v_requested := least(p_messages, v_remaining);

  insert into public.message_wallets (user_id, balance, debt)
  values (v_purchase.user_id, 0, 0)
  on conflict (user_id) do nothing;

  select balance, debt
  into v_balance, v_debt
  from public.message_wallets
  where user_id = v_purchase.user_id
  for update;

  v_from_balance := least(v_balance, v_requested);
  v_to_debt := v_requested - v_from_balance;

  update public.message_wallets
  set
    balance = balance - v_from_balance,
    debt = debt + v_to_debt,
    updated_at = clock_timestamp()
  where user_id = v_purchase.user_id
  returning balance, debt into v_balance, v_debt;

  update public.message_purchases
  set
    messages_reversed = messages_reversed + v_requested,
    status = case
      when messages_reversed + v_requested >= messages_granted then 'reversed'
      else 'partially_reversed'
    end,
    updated_at = clock_timestamp()
  where paddle_transaction_id = p_transaction_id;

  insert into public.message_adjustments (
    adjustment_id,
    paddle_transaction_id,
    user_id,
    action,
    status,
    messages_reversed
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
    insert into public.message_transactions (
      user_id, amount, reason, reference_id
    )
    values (
      v_purchase.user_id,
      -v_from_balance,
      'message_bundle_reversal',
      p_adjustment_id
    );
  end if;

  return query
  select true, v_purchase.user_id, v_balance, v_debt, v_requested;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: all mutations remain server-only.
-- ---------------------------------------------------------------------------

grant select on public.evercoin_purchases to authenticated;
grant select on public.evercoin_adjustments to authenticated;
grant select on public.evercoin_debt_events to authenticated;
grant select on public.voice_call_minutes to authenticated;
grant select on public.voice_calls to authenticated;
grant select on public.voice_call_turns to authenticated;
grant select on public.character_image_requests to authenticated;
grant select on public.message_wallets to authenticated;
grant select on public.message_transactions to authenticated;
grant select on public.message_credit_usage to authenticated;
grant select on public.message_purchases to authenticated;
grant select on public.message_adjustments to authenticated;

-- Gallery data is changed only through authenticated server routes. This closes
-- the old direct-write path that could otherwise point a private row at another
-- user's guessed storage object.
revoke insert, update, delete on public.character_gallery_images
from authenticated;
revoke insert, update, delete on public.user_character_preferences
from authenticated;
grant select on public.character_gallery_images to authenticated;
grant select on public.user_character_preferences to authenticated;

grant all on public.evercoin_purchases to service_role;
grant all on public.evercoin_adjustments to service_role;
grant all on public.evercoin_debt_events to service_role;
grant all on public.voice_call_minutes to service_role;
grant all on public.voice_calls to service_role;
grant all on public.voice_call_turns to service_role;
grant all on public.character_image_requests to service_role;
grant all on public.message_wallets to service_role;
grant all on public.message_transactions to service_role;
grant all on public.message_credit_usage to service_role;
grant all on public.message_purchases to service_role;
grant all on public.message_adjustments to service_role;

revoke all on function public.charge_evercoin(uuid, bigint, text, text)
from public, anon, authenticated;
revoke all on function public.refund_evercoin(uuid, bigint, text, text)
from public, anon, authenticated;
revoke all on function public.start_voice_call(uuid, text, bigint, integer)
from public, anon, authenticated;
revoke all on function public.prepare_voice_call_turn(uuid, uuid, text, bigint, integer, integer)
from public, anon, authenticated;
revoke all on function public.claim_voice_call_turn(uuid, uuid, text, uuid, integer)
from public, anon, authenticated;
revoke all on function public.complete_voice_call_turn(uuid, uuid, uuid, uuid, text, text, text, integer, integer)
from public, anon, authenticated;
revoke all on function public.fail_voice_call_turn(uuid, uuid, uuid, text)
from public, anon, authenticated;
revoke all on function public.end_voice_call(uuid, uuid, text)
from public, anon, authenticated;
revoke all on function public.start_character_image_request(uuid, uuid, text, text, bigint, integer)
from public, anon, authenticated;
revoke all on function public.complete_character_image_request(uuid, uuid, uuid)
from public, anon, authenticated;
revoke all on function public.fail_character_image_request(uuid, uuid, text)
from public, anon, authenticated;
revoke all on function public.credit_evercoin_purchase(uuid, text, text, text, bigint, bigint, text)
from public, anon, authenticated;
revoke all on function public.reverse_evercoin_purchase(text, text, text, text, bigint)
from public, anon, authenticated;
revoke all on function public.reserve_chat_message(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.complete_chat_message_credit(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.refund_chat_message_credit(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.credit_message_purchase(uuid, text, text, text, bigint, bigint, text)
from public, anon, authenticated;
revoke all on function public.reverse_message_purchase(text, text, text, text, bigint)
from public, anon, authenticated;

grant execute on function public.charge_evercoin(uuid, bigint, text, text)
to service_role;
grant execute on function public.refund_evercoin(uuid, bigint, text, text)
to service_role;
grant execute on function public.start_voice_call(uuid, text, bigint, integer)
to service_role;
grant execute on function public.prepare_voice_call_turn(uuid, uuid, text, bigint, integer, integer)
to service_role;
grant execute on function public.claim_voice_call_turn(uuid, uuid, text, uuid, integer)
to service_role;
grant execute on function public.complete_voice_call_turn(uuid, uuid, uuid, uuid, text, text, text, integer, integer)
to service_role;
grant execute on function public.fail_voice_call_turn(uuid, uuid, uuid, text)
to service_role;
grant execute on function public.end_voice_call(uuid, uuid, text)
to service_role;
grant execute on function public.start_character_image_request(uuid, uuid, text, text, bigint, integer)
to service_role;
grant execute on function public.complete_character_image_request(uuid, uuid, uuid)
to service_role;
grant execute on function public.fail_character_image_request(uuid, uuid, text)
to service_role;
grant execute on function public.credit_evercoin_purchase(uuid, text, text, text, bigint, bigint, text)
to service_role;
grant execute on function public.reverse_evercoin_purchase(text, text, text, text, bigint)
to service_role;
grant execute on function public.reserve_chat_message(uuid, uuid)
to service_role;
grant execute on function public.complete_chat_message_credit(uuid, uuid)
to service_role;
grant execute on function public.refund_chat_message_credit(uuid, uuid)
to service_role;
grant execute on function public.credit_message_purchase(uuid, text, text, text, bigint, bigint, text)
to service_role;
grant execute on function public.reverse_message_purchase(text, text, text, text, bigint)
to service_role;

commit;
