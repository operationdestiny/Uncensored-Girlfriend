-- EverBond Pinterest automatic publisher.
-- Run this file ONCE in Supabase SQL Editor before enabling the Pinterest cron.
-- It creates Pinterest-only state/token objects and does not change EverCoin,
-- chat, payments, finance, character content, Tumblr, or DeviantArt data.

begin;

create table if not exists public.pinterest_publish_state (
  character_id text primary key references public.characters(id) on delete cascade,
  status text not null check (status in ('processing', 'published', 'error')),
  pinterest_pin_id text,
  attempts integer not null default 0,
  last_error text,
  claimed_at timestamptz,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists pinterest_publish_state_status_idx
  on public.pinterest_publish_state(status, updated_at desc);

create table if not exists public.pinterest_oauth_tokens (
  singleton_key text primary key check (singleton_key = 'primary'),
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  refresh_token_expires_at timestamptz,
  scope text,
  updated_at timestamptz not null default now()
);

alter table public.pinterest_publish_state enable row level security;
alter table public.pinterest_oauth_tokens enable row level security;

revoke all on table public.pinterest_publish_state
  from public, anon, authenticated;
revoke all on table public.pinterest_oauth_tokens
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.pinterest_publish_state to service_role;
grant select, insert, update, delete
  on table public.pinterest_oauth_tokens to service_role;

create or replace function public.pinterest_claim_next_characters(
  p_limit integer default 1
)
returns table (
  id text,
  slug text,
  name text,
  image_url text,
  display_order integer
)
language sql
security definer
set search_path = public
as $function$
  with candidates as (
    select c.id
    from public.characters c
    left join public.pinterest_publish_state p
      on p.character_id = c.id
    where c.is_active = true
      and c.is_public = true
      and c.visibility = 'public'
      and c.official = true
      and c.section in ('EverBond Girls', 'Anime & Fantasy')
      and nullif(trim(c.image_url), '') is not null
      and (
        p.character_id is null
        or (
          p.status = 'error'
          and p.attempts < 3
          and p.updated_at < now() - interval '6 hours'
        )
      )
    order by
      case c.section
        when 'EverBond Girls' then 0
        when 'Anime & Fantasy' then 1
        else 2
      end,
      case when p.character_id is null then 0 else 1 end,
      c.display_order asc nulls last,
      c.id asc
    limit 1
    for update of c skip locked
  ),
  claimed as (
    insert into public.pinterest_publish_state as pps (
      character_id,
      status,
      attempts,
      last_error,
      claimed_at,
      updated_at
    )
    select
      candidates.id,
      'processing',
      1,
      null,
      now(),
      now()
    from candidates
    on conflict (character_id) do update
      set status = 'processing',
          attempts = pps.attempts + 1,
          last_error = null,
          claimed_at = now(),
          updated_at = now()
      where pps.status = 'error'
        and pps.attempts < 3
        and pps.updated_at < now() - interval '6 hours'
    returning character_id
  )
  select
    c.id,
    c.slug,
    c.name,
    c.image_url,
    c.display_order
  from public.characters c
  join claimed on claimed.character_id = c.id
  order by c.display_order asc nulls last, c.id asc;
$function$;

revoke all on function public.pinterest_claim_next_characters(integer)
  from public, anon, authenticated;
grant execute on function public.pinterest_claim_next_characters(integer)
  to service_role;

commit;
