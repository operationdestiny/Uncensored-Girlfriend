-- EverBond Tumblr queue tracking.
-- Safe for the live site: adds only Tumblr-specific objects and does not modify
-- character rows, conversations, payments, chat, or any user-facing table data.

begin;

create table if not exists public.tumblr_publish_state (
  character_id text primary key references public.characters(id) on delete cascade,
  status text not null check (status in ('processing', 'queued', 'error')),
  tumblr_post_id text,
  attempts integer not null default 0,
  last_error text,
  claimed_at timestamptz,
  queued_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.tumblr_publish_state
  add column if not exists claimed_at timestamptz;

alter table public.tumblr_publish_state
  drop constraint if exists tumblr_publish_state_status_check;

alter table public.tumblr_publish_state
  add constraint tumblr_publish_state_status_check
  check (status in ('processing', 'queued', 'error'));

create index if not exists tumblr_publish_state_status_idx
  on public.tumblr_publish_state(status, updated_at desc);

alter table public.tumblr_publish_state enable row level security;

-- No anon/authenticated policies are created. Only the server-side service role
-- can read or write this table.

grant select, insert, update, delete on public.tumblr_publish_state to service_role;

create or replace function public.tumblr_claim_next_characters(p_limit integer default 10)
returns table (
  id text,
  slug text,
  name text,
  section text,
  role text,
  tags text[],
  title text,
  image_url text,
  display_order integer
)
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select c.id
    from public.characters c
    left join public.tumblr_publish_state t on t.character_id = c.id
    where c.is_active = true
      and c.is_public = true
      and c.visibility = 'public'
      and c.official = true
      and (
        t.character_id is null
        or (
          t.status = 'error'
          and t.attempts < 3
          and t.updated_at < now() - interval '6 hours'
        )
      )
    order by
      case when t.character_id is null then 0 else 1 end,
      c.display_order asc,
      c.section asc,
      c.id asc
    limit greatest(1, least(coalesce(p_limit, 10), 10))
    for update of c skip locked
  ),
  claimed as (
    insert into public.tumblr_publish_state (
      character_id,
      status,
      attempts,
      claimed_at,
      updated_at
    )
    select
      candidates.id,
      'processing',
      1,
      now(),
      now()
    from candidates
    on conflict (character_id) do update
      set status = 'processing',
          attempts = public.tumblr_publish_state.attempts + 1,
          last_error = null,
          claimed_at = now(),
          updated_at = now()
      where public.tumblr_publish_state.status = 'error'
        and public.tumblr_publish_state.attempts < 3
        and public.tumblr_publish_state.updated_at < now() - interval '6 hours'
    returning character_id
  )
  select
    c.id,
    c.slug,
    c.name,
    c.section,
    c.role,
    c.tags,
    c.title,
    c.image_url,
    c.display_order
  from public.characters c
  join claimed on claimed.character_id = c.id
  order by c.display_order asc, c.section asc, c.id asc;
$$;

revoke all on function public.tumblr_claim_next_characters(integer) from public, anon, authenticated;
grant execute on function public.tumblr_claim_next_characters(integer) to service_role;

commit;
