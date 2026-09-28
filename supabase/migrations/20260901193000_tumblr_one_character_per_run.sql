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
      and c.section in ('EverBond Girls', 'Anime & Fantasy')
      and (
        t.character_id is null
        or (
          t.status = 'error'
          and t.attempts < 3
          and t.updated_at < now() - interval '6 hours'
        )
      )
    order by
      case c.section
        when 'EverBond Girls' then 0
        when 'Anime & Fantasy' then 1
        else 2
      end,
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

revoke all on function public.tumblr_claim_next_characters(integer) from public, anon, authenticated;
grant execute on function public.tumblr_claim_next_characters(integer) to service_role;
