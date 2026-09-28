create or replace function public.finalize_retell_voice_call(
  p_user_id uuid,
  p_call_id uuid,
  p_reason text,
  p_transcript jsonb
)
returns table (
  finalized boolean,
  conversation_id uuid,
  character_id text,
  character_slug text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_call public.voice_calls%rowtype;
  v_existing public.voice_call_turns%rowtype;
  v_conversation_id uuid;
  v_character_slug text;
  v_transcript jsonb := case
    when jsonb_typeof(coalesce(p_transcript, '[]'::jsonb)) = 'array'
      then coalesce(p_transcript, '[]'::jsonb)
    else '[]'::jsonb
  end;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('retell-finalize:' || p_call_id::text, 0)
  );

  select vc.*
  into v_call
  from public.voice_calls as vc
  where vc.id = p_call_id
    and vc.user_id = p_user_id
  for update;

  if not found then
    return query
    select false, null::uuid, null::text, null::text;
    return;
  end if;

  select c.slug
  into v_character_slug
  from public.characters as c
  where c.id = v_call.character_id;

  select t.*
  into v_existing
  from public.voice_call_turns as t
  where t.request_id = p_call_id
    and t.call_id = p_call_id
    and t.user_id = p_user_id
  for update;

  if found and v_existing.status = 'completed' then
    update public.voice_calls as vc
    set
      status = 'ended',
      ended_at = coalesce(vc.ended_at, v_now),
      end_reason = coalesce(
        vc.end_reason,
        left(coalesce(nullif(trim(p_reason), ''), 'call_ended'), 100)
      ),
      updated_at = v_now
    where vc.id = p_call_id;

    return query
    select false, v_existing.conversation_id, v_call.character_id, v_character_slug;
    return;
  end if;

  select c.id
  into v_conversation_id
  from public.conversations as c
  where c.user_id = p_user_id
    and c.character_id = v_call.character_id
  order by c.updated_at desc
  limit 1;

  if v_conversation_id is null then
    insert into public.conversations (
      user_id,
      character_id,
      updated_at
    )
    values (
      p_user_id,
      v_call.character_id,
      v_now
    )
    returning id into v_conversation_id;
  end if;

  if v_existing.request_id is null then
    insert into public.voice_call_turns (
      request_id,
      call_id,
      user_id,
      character_id,
      conversation_id,
      status,
      transcript,
      reply,
      audio_storage_path,
      input_tokens,
      output_tokens,
      error_code,
      created_at,
      completed_at
    )
    values (
      p_call_id,
      p_call_id,
      p_user_id,
      v_call.character_id,
      v_conversation_id,
      'completed',
      v_transcript::text,
      null,
      null,
      0,
      0,
      null,
      v_now,
      v_now
    );
  else
    update public.voice_call_turns as t
    set
      conversation_id = v_conversation_id,
      status = 'completed',
      transcript = v_transcript::text,
      reply = null,
      audio_storage_path = null,
      input_tokens = 0,
      output_tokens = 0,
      error_code = null,
      completed_at = v_now
    where t.request_id = p_call_id
      and t.call_id = p_call_id
      and t.user_id = p_user_id;
  end if;

  update public.conversations as c
  set updated_at = v_now
  where c.id = v_conversation_id
    and c.user_id = p_user_id;

  update public.voice_calls as vc
  set
    status = 'ended',
    ended_at = coalesce(vc.ended_at, v_now),
    end_reason = coalesce(
      vc.end_reason,
      left(coalesce(nullif(trim(p_reason), ''), 'call_ended'), 100)
    ),
    updated_at = v_now
  where vc.id = p_call_id;

  return query
  select true, v_conversation_id, v_call.character_id, v_character_slug;
end;
$$;

revoke all on function public.finalize_retell_voice_call(uuid, uuid, text, jsonb) from public;
grant execute on function public.finalize_retell_voice_call(uuid, uuid, text, jsonb) to service_role;
