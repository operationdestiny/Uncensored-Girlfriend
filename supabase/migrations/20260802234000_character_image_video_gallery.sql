-- EverBond private image + video gallery expansion.
--
-- Images: 7 stored per user/character, Seedream V5 Pro Edit at the app layer.
-- Videos: 5 stored per user/character, async Venice queue tracking, deletion,
-- and debt-aware EverCoin charging/refunds.

begin;

set check_function_bodies = false;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Image gallery: increase the hard database and request limits from 5 to 7.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_character_gallery_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  image_count integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      'gallery:' || new.user_id::text || ':' || new.character_id,
      0
    )
  );

  select count(*)
  into image_count
  from public.character_gallery_images
  where user_id = new.user_id
    and character_id = new.character_id;

  if image_count >= 7 then
    raise exception 'IMAGE_LIMIT_REACHED'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

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
  v_limit integer := greatest(1, least(coalesce(p_gallery_limit, 7), 7));
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

-- ---------------------------------------------------------------------------
-- Private stored videos and async request state.
-- ---------------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'character-videos',
  'character-videos',
  false,
  104857600,
  array['video/mp4']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.character_gallery_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id text not null references public.characters(id) on delete cascade,
  storage_path text not null unique,
  prompt text not null,
  duration_seconds integer not null check (duration_seconds in (8, 10, 12)),
  provider text not null default 'venice',
  model text not null,
  evercoin_charge bigint not null default 0 check (evercoin_charge >= 0),
  created_at timestamptz not null default now()
);

create index if not exists character_gallery_videos_owner_character_idx
  on public.character_gallery_videos (
    user_id,
    character_id,
    created_at desc
  );

create table if not exists public.character_video_requests (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id text not null references public.characters(id) on delete cascade,
  prompt text not null,
  duration_seconds integer not null check (duration_seconds in (8, 10, 12)),
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  video_id uuid references public.character_gallery_videos(id) on delete set null,
  evercoin_charge bigint not null check (evercoin_charge > 0),
  provider_model text not null,
  provider_queue_id text,
  provider_download_url text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists character_video_one_processing_idx
  on public.character_video_requests (user_id, character_id)
  where status = 'processing';

create unique index if not exists character_video_provider_queue_idx
  on public.character_video_requests (provider_model, provider_queue_id)
  where provider_queue_id is not null;

create index if not exists character_video_requests_owner_created_idx
  on public.character_video_requests (user_id, character_id, created_at desc);

alter table public.character_gallery_videos enable row level security;
alter table public.character_video_requests enable row level security;

drop policy if exists character_gallery_videos_owner_read
  on public.character_gallery_videos;
create policy character_gallery_videos_owner_read
on public.character_gallery_videos
for select
using (auth.uid() = user_id);

drop policy if exists character_video_requests_owner_read
  on public.character_video_requests;
create policy character_video_requests_owner_read
on public.character_video_requests
for select
using (auth.uid() = user_id);

create or replace function public.enforce_character_video_gallery_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  video_count integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      'video-gallery:' || new.user_id::text || ':' || new.character_id,
      0
    )
  );

  if exists (
    select 1
    from public.character_gallery_videos
    where id = new.id
      and user_id = new.user_id
      and character_id = new.character_id
  ) then
    return new;
  end if;

  select count(*)
  into video_count
  from public.character_gallery_videos
  where user_id = new.user_id
    and character_id = new.character_id;

  if video_count >= 5 then
    raise exception 'VIDEO_LIMIT_REACHED'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists character_video_gallery_limit_trigger
  on public.character_gallery_videos;
create trigger character_video_gallery_limit_trigger
before insert
on public.character_gallery_videos
for each row
execute function public.enforce_character_video_gallery_limit();

-- ---------------------------------------------------------------------------
-- Atomic, idempotent EverCoin reservation for a queued video.
-- ---------------------------------------------------------------------------

create or replace function public.start_character_video_request(
  p_user_id uuid,
  p_request_id uuid,
  p_character_id text,
  p_prompt text,
  p_duration_seconds integer,
  p_amount bigint,
  p_gallery_limit integer,
  p_provider_model text
)
returns table (
  request_status text,
  balance bigint,
  debt bigint,
  video_id uuid,
  provider_queue_id text,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.character_video_requests%rowtype;
  v_balance bigint;
  v_debt bigint;
  v_count integer;
  v_stale_request uuid;
  v_limit integer := greatest(1, least(coalesce(p_gallery_limit, 5), 5));
begin
  if p_amount <= 0 then
    raise exception 'INVALID_VIDEO_CHARGE';
  end if;

  if p_duration_seconds not in (8, 10, 12) then
    raise exception 'INVALID_VIDEO_DURATION';
  end if;

  if nullif(trim(coalesce(p_provider_model, '')), '') is null then
    raise exception 'INVALID_VIDEO_MODEL';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'video-request:' || p_user_id::text || ':' || p_request_id::text,
      0
    )
  );

  select *
  into v_existing
  from public.character_video_requests
  where request_id = p_request_id
    and user_id = p_user_id;

  if found then
    select coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_balance, v_debt
    from public.evercoin_wallets w
    where w.user_id = p_user_id;

    return query
    select
      v_existing.status,
      coalesce(v_balance, 0),
      coalesce(v_debt, 0),
      v_existing.video_id,
      v_existing.provider_queue_id,
      v_existing.error_code;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'video-character:' || p_user_id::text || ':' || p_character_id,
      0
    )
  );

  select request_id
  into v_stale_request
  from public.character_video_requests
  where user_id = p_user_id
    and character_id = p_character_id
    and status = 'processing'
    and created_at < clock_timestamp() - interval '60 minutes'
  order by created_at
  limit 1;

  if found then
    perform public.fail_character_video_request(
      p_user_id,
      v_stale_request,
      'STALE_VIDEO_REQUEST'
    );
  end if;

  if exists (
    select 1
    from public.character_video_requests
    where user_id = p_user_id
      and character_id = p_character_id
      and status = 'processing'
  ) then
    return query
    select 'busy'::text, 0::bigint, 0::bigint, null::uuid, null::text,
      'VIDEO_REQUEST_IN_PROGRESS'::text;
    return;
  end if;

  select count(*)
  into v_count
  from public.character_gallery_videos
  where user_id = p_user_id
    and character_id = p_character_id;

  if v_count >= v_limit then
    return query
    select 'limit_reached'::text, 0::bigint, 0::bigint, null::uuid, null::text,
      'VIDEO_LIMIT_REACHED'::text;
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
    select 'insufficient'::text, v_balance, v_debt, null::uuid, null::text,
      'EVERCOIN_DEBT'::text;
    return;
  end if;

  if v_balance < p_amount then
    return query
    select 'insufficient'::text, v_balance, v_debt, null::uuid, null::text,
      'INSUFFICIENT_EVERCOIN'::text;
    return;
  end if;

  update public.evercoin_wallets w
  set
    balance = w.balance - p_amount,
    updated_at = clock_timestamp()
  where w.user_id = p_user_id
  returning w.balance into v_balance;

  insert into public.character_video_requests (
    request_id,
    user_id,
    character_id,
    prompt,
    duration_seconds,
    status,
    evercoin_charge,
    provider_model
  )
  values (
    p_request_id,
    p_user_id,
    p_character_id,
    p_prompt,
    p_duration_seconds,
    'processing',
    p_amount,
    trim(p_provider_model)
  );

  insert into public.evercoin_transactions (
    user_id,
    amount,
    reason,
    reference_id
  )
  values (
    p_user_id,
    -p_amount,
    'character_video_generation',
    p_request_id::text
  );

  return query
  select 'claimed'::text, v_balance, v_debt, null::uuid, null::text, null::text;
end;
$$;

create or replace function public.set_character_video_queue(
  p_user_id uuid,
  p_request_id uuid,
  p_provider_model text,
  p_provider_queue_id text,
  p_provider_download_url text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(coalesce(p_provider_queue_id, '')), '') is null then
    raise exception 'INVALID_VIDEO_QUEUE_ID';
  end if;

  update public.character_video_requests
  set
    provider_model = trim(p_provider_model),
    provider_queue_id = trim(p_provider_queue_id),
    provider_download_url = nullif(trim(coalesce(p_provider_download_url, '')), ''),
    updated_at = clock_timestamp()
  where request_id = p_request_id
    and user_id = p_user_id
    and status = 'processing'
    and (
      provider_queue_id is null
      or provider_queue_id = trim(p_provider_queue_id)
    );

  return found;
end;
$$;

create or replace function public.complete_character_video_request(
  p_user_id uuid,
  p_request_id uuid,
  p_video_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.character_video_requests
  set
    status = 'completed',
    video_id = p_video_id,
    error_code = null,
    updated_at = clock_timestamp()
  where request_id = p_request_id
    and user_id = p_user_id
    and status = 'processing';

  return found or exists (
    select 1
    from public.character_video_requests
    where request_id = p_request_id
      and user_id = p_user_id
      and status = 'completed'
      and video_id = p_video_id
  );
end;
$$;

create or replace function public.fail_character_video_request(
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
    hashtextextended('video-refund:' || p_request_id::text, 0)
  );

  select evercoin_charge
  into v_charge
  from public.character_video_requests
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

  update public.character_video_requests
  set
    status = 'failed',
    error_code = left(coalesce(p_error_code, 'VIDEO_GENERATION_FAILED'), 200),
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

  insert into public.evercoin_transactions (
    user_id,
    amount,
    reason,
    reference_id
  )
  values (
    p_user_id,
    v_charge,
    'character_video_generation_failed',
    p_request_id::text
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
      'character_video_refund_debt_payment',
      p_request_id::text
    );
  end if;

  return coalesce(v_balance, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: clients may read their own rows through RLS. All mutations and
-- billing transitions stay server-only through the service role/RPC layer.
-- ---------------------------------------------------------------------------

revoke insert, update, delete on public.character_gallery_videos
  from anon, authenticated;
revoke insert, update, delete on public.character_video_requests
  from anon, authenticated;

grant select on public.character_gallery_videos to authenticated;
grant select on public.character_video_requests to authenticated;
grant all on public.character_gallery_videos to service_role;
grant all on public.character_video_requests to service_role;

revoke all on function public.start_character_video_request(
  uuid, uuid, text, text, integer, bigint, integer, text
) from public, anon, authenticated;
revoke all on function public.set_character_video_queue(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
revoke all on function public.complete_character_video_request(
  uuid, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.fail_character_video_request(
  uuid, uuid, text
) from public, anon, authenticated;

grant execute on function public.start_character_video_request(
  uuid, uuid, text, text, integer, bigint, integer, text
) to service_role;
grant execute on function public.set_character_video_queue(
  uuid, uuid, text, text, text
) to service_role;
grant execute on function public.complete_character_video_request(
  uuid, uuid, uuid
) to service_role;
grant execute on function public.fail_character_video_request(
  uuid, uuid, text
) to service_role;

notify pgrst, 'reload schema';

commit;
