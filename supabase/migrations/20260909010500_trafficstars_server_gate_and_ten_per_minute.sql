-- EverBond AI final TrafficStars server gate + 10 successful text sends/minute.
-- This migration has already been applied to the production Supabase project.

create or replace function public.begin_chat_request(
  p_user_id uuid,
  p_request_id uuid,
  p_character_id text
)
returns table(
  request_status text,
  existing_reply text,
  existing_conversation_id uuid,
  existing_input_tokens integer,
  existing_output_tokens integer,
  existing_provider text,
  existing_model text,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  existing_request public.chat_requests%rowtype;
  recent_request_count integer;
  recent_completed_count integer;
  oldest_recent_completion timestamptz;
  success_retry integer := 10;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  update public.chat_requests
  set status = 'failed', error_code = 'STALE_REQUEST', updated_at = now()
  where user_id = p_user_id
    and status = 'pending'
    and created_at < now() - interval '2 minutes';

  select * into existing_request
  from public.chat_requests
  where user_id = p_user_id and request_id = p_request_id;

  if found then
    if existing_request.status = 'completed' then
      return query select
        'completed'::text,
        existing_request.reply,
        existing_request.conversation_id,
        existing_request.input_tokens,
        existing_request.output_tokens,
        existing_request.provider,
        existing_request.model,
        null::integer;
      return;
    end if;

    if existing_request.status = 'pending' then
      return query select
        'in_progress'::text, null::text, null::uuid, null::integer, null::integer,
        null::text, null::text, 5::integer;
      return;
    end if;

    return query select
      'failed'::text, null::text, null::uuid, null::integer, null::integer,
      null::text, null::text, null::integer;
    return;
  end if;

  select count(*) into recent_request_count
  from public.chat_requests
  where user_id = p_user_id
    and created_at >= now() - interval '1 minute';

  if recent_request_count >= 20 then
    return query select
      'rate_limited'::text, null::text, null::uuid, null::integer, null::integer,
      null::text, null::text, 60::integer;
    return;
  end if;

  select count(*), min(completed_at)
  into recent_completed_count, oldest_recent_completion
  from public.chat_requests
  where user_id = p_user_id
    and status = 'completed'
    and completed_at >= now() - interval '1 minute';

  if recent_completed_count >= 10 then
    success_retry := greatest(
      ceil(extract(epoch from (oldest_recent_completion + interval '1 minute' - now())))::integer,
      1
    );
    return query select
      'rate_limited'::text, null::text, null::uuid, null::integer, null::integer,
      null::text, null::text, success_retry;
    return;
  end if;

  if exists (
    select 1 from public.chat_requests
    where user_id = p_user_id and status = 'pending'
  ) then
    return query select
      'busy'::text, null::text, null::uuid, null::integer, null::integer,
      null::text, null::text, 5::integer;
    return;
  end if;

  insert into public.chat_requests (user_id, request_id, character_id, status)
  values (p_user_id, p_request_id, p_character_id, 'pending');

  return query select
    'claimed'::text, null::text, null::uuid, null::integer, null::integer,
    null::text, null::text, null::integer;
end;
$function$;

create or replace function public.trafficstars_completed_text_send_count(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select count(*)::bigint
  from public.message_credit_usage u
  where u.user_id = p_user_id
    and u.source = 'ad_supported'
    and u.status = 'completed'
    and not exists (
      select 1
      from public.gift_send_requests g
      where g.user_id = p_user_id
        and g.request_id = u.request_id
    );
$function$;

revoke all on function public.trafficstars_completed_text_send_count(uuid) from public;
revoke execute on function public.trafficstars_completed_text_send_count(uuid) from anon, authenticated;
grant execute on function public.trafficstars_completed_text_send_count(uuid) to service_role;
