create or replace function public.deviantart_claim_next_characters(p_limit integer default 1)
returns table(id text, slug text, name text, image_url text, display_order integer, stash_item_id bigint)
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
      and c.section in ('EverBond Girls', 'Anime & Fantasy')
      and (
        d.character_id is null
        or (
          d.status = 'error'
          and d.attempts < 3
          and d.updated_at < now() - interval '6 hours'
        )
      )
    order by
      case c.section when 'EverBond Girls' then 0 when 'Anime & Fantasy' then 1 else 2 end,
      case when d.character_id is null then 0 else 1 end,
      c.display_order asc,
      c.id asc
    limit greatest(1, least(coalesce(p_limit, 1), 1))
    for update of c skip locked
  ),
  claimed as (
    insert into public.deviantart_publish_state (character_id,status,attempts,claimed_at,updated_at)
    select candidates.id, 'processing', 1, now(), now()
    from candidates
    on conflict (character_id) do update
      set status='processing',
          attempts=public.deviantart_publish_state.attempts + 1,
          last_error=null,
          claimed_at=now(),
          updated_at=now()
      where public.deviantart_publish_state.status='error'
        and public.deviantart_publish_state.attempts < 3
        and public.deviantart_publish_state.updated_at < now() - interval '6 hours'
    returning character_id, stash_item_id
  )
  select c.id,c.slug,c.name,c.image_url,c.display_order,claimed.stash_item_id
  from public.characters c
  join claimed on claimed.character_id=c.id
  order by c.display_order asc,c.id asc;
$function$;

revoke all on function public.deviantart_claim_next_characters(integer) from public;
grant execute on function public.deviantart_claim_next_characters(integer) to service_role;
