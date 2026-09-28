-- Restrict all automatic social publishers to the EverBond Girls section only.
-- Existing published/tracked rows are preserved. This changes future eligibility only.

create or replace function public.tumblr_claim_next_characters(p_limit integer default 1)
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
as $function$
  with candidates as (
    select c.id
    from public.characters c
    left join public.tumblr_publish_state t on t.character_id = c.id
    where c.is_active = true
      and c.is_public = true
      and c.visibility = 'public'
      and c.official = true
      and c.section = 'EverBond Girls'
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
      c.id asc
    limit 1
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
    select candidates.id, 'processing', 1, now(), now()
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
  order by c.display_order asc, c.id asc;
$function$;

revoke all on function public.tumblr_claim_next_characters(integer)
  from public, anon, authenticated;
grant execute on function public.tumblr_claim_next_characters(integer)
  to service_role;

create or replace function public.deviantart_claim_next_characters(p_limit integer default 1)
returns table(
  id text,
  slug text,
  name text,
  image_url text,
  display_order integer,
  stash_item_id bigint
)
language sql
security definer
set search_path = public
as $function$
  with candidates as (
    select c.id
    from public.characters c
    left join public.deviantart_publish_state d on d.character_id = c.id
    where c.is_active = true
      and c.is_public = true
      and c.visibility = 'public'
      and c.official = true
      and c.section = 'EverBond Girls'
      and (
        d.character_id is null
        or (
          d.status = 'error'
          and d.attempts < 3
          and d.updated_at < now() - interval '6 hours'
        )
      )
    order by
      case when d.character_id is null then 0 else 1 end,
      c.display_order asc,
      c.id asc
    limit greatest(1, least(coalesce(p_limit, 1), 1))
    for update of c skip locked
  ),
  claimed as (
    insert into public.deviantart_publish_state (
      character_id,
      status,
      attempts,
      claimed_at,
      updated_at
    )
    select candidates.id, 'processing', 1, now(), now()
    from candidates
    on conflict (character_id) do update
      set status = 'processing',
          attempts = public.deviantart_publish_state.attempts + 1,
          last_error = null,
          claimed_at = now(),
          updated_at = now()
      where public.deviantart_publish_state.status = 'error'
        and public.deviantart_publish_state.attempts < 3
        and public.deviantart_publish_state.updated_at < now() - interval '6 hours'
    returning character_id, stash_item_id
  )
  select
    c.id,
    c.slug,
    c.name,
    c.image_url,
    c.display_order,
    claimed.stash_item_id
  from public.characters c
  join claimed on claimed.character_id = c.id
  order by c.display_order asc, c.id asc;
$function$;

revoke all on function public.deviantart_claim_next_characters(integer)
  from public, anon, authenticated;
grant execute on function public.deviantart_claim_next_characters(integer)
  to service_role;

create or replace function public.pinterest_claim_next_characters(p_limit integer default 1)
returns table(
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
      and c.section = 'EverBond Girls'
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
