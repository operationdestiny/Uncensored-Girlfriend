do $$
declare
  v_oid oid;
  v_definition text;
begin
  select p.oid
  into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'start_character_video_request'
    and pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_request_id uuid, p_character_id text, p_prompt text, p_duration_seconds integer, p_amount bigint, p_gallery_limit integer, p_provider_model text';

  if v_oid is null then
    raise exception 'START_CHARACTER_VIDEO_REQUEST_NOT_FOUND';
  end if;

  v_definition := pg_get_functiondef(v_oid);

  if position('if p_duration_seconds <> 10 then' in v_definition) = 0 then
    raise exception 'EXPECTED_VIDEO_DURATION_GUARD_NOT_FOUND';
  end if;

  v_definition := replace(
    v_definition,
    'if p_duration_seconds <> 10 then',
    'if p_duration_seconds <> 8 then'
  );

  v_definition := replace(
    v_definition,
    '-- Wan 2.7 Reference product is fixed at 10 seconds.',
    '-- Current EverBond video product is fixed at 8 seconds.'
  );

  v_definition := replace(
    v_definition,
    E'    10,\n    ''processing'',',
    E'    p_duration_seconds,\n    ''processing'','
  );

  execute v_definition;
end
$$;

revoke all on function public.start_character_video_request(uuid,uuid,text,text,integer,bigint,integer,text)
  from public, anon, authenticated;
grant execute on function public.start_character_video_request(uuid,uuid,text,text,integer,bigint,integer,text)
  to service_role;
