-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP EXTENSION pg_net;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE UPDATE ON SEQUENCES FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE UPDATE ON SEQUENCES FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;

CREATE FUNCTION public.begin_chat_request (
  p_user_id      uuid,
  p_request_id   uuid,
  p_character_id text
)
  RETURNS TABLE (
    request_status           text,
    existing_reply           text,
    existing_conversation_id uuid,
    existing_input_tokens    integer,
    existing_output_tokens   integer,
    existing_provider        text,
    existing_model           text,
    retry_after_seconds      integer
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  existing_request public.chat_requests%rowtype;
  recent_request_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  update public.chat_requests
  set
    status = 'failed',
    error_code = 'STALE_REQUEST',
    updated_at = now()
  where user_id = p_user_id
    and status = 'pending'
    and created_at < now() - interval '2 minutes';

  select *
  into existing_request
  from public.chat_requests
  where user_id = p_user_id
    and request_id = p_request_id;

  if found then
    if existing_request.status = 'completed' then
      return query
      select
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
      return query
      select
        'in_progress'::text,
        null::text,
        null::uuid,
        null::integer,
        null::integer,
        null::text,
        null::text,
        5::integer;
      return;
    end if;

    return query
    select
      'failed'::text,
      null::text,
      null::uuid,
      null::integer,
      null::integer,
      null::text,
      null::text,
      null::integer;
    return;
  end if;

  select count(*)
  into recent_request_count
  from public.chat_requests
  where user_id = p_user_id
    and created_at >= now() - interval '1 minute';

  if recent_request_count >= 20 then
    return query
    select
      'rate_limited'::text,
      null::text,
      null::uuid,
      null::integer,
      null::integer,
      null::text,
      null::text,
      60::integer;
    return;
  end if;

  if exists (
    select 1
    from public.chat_requests
    where user_id = p_user_id
      and status = 'pending'
  ) then
    return query
    select
      'busy'::text,
      null::text,
      null::uuid,
      null::integer,
      null::integer,
      null::text,
      null::text,
      5::integer;
    return;
  end if;

  insert into public.chat_requests (
    user_id,
    request_id,
    character_id,
    status
  )
  values (
    p_user_id,
    p_request_id,
    p_character_id,
    'pending'
  );

  return query
  select
    'claimed'::text,
    null::text,
    null::uuid,
    null::integer,
    null::integer,
    null::text,
    null::text,
    null::integer;
end;
$function$;

REVOKE ALL ON FUNCTION public.begin_chat_request(uuid, uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.begin_chat_request(uuid, uuid, text) TO service_role;

CREATE FUNCTION public.begin_gift_send (
  p_user_id      uuid,
  p_request_id   uuid,
  p_character_id text,
  p_gift_id      integer,
  p_user_text    text    DEFAULT NULL::text
)
  RETURNS TABLE (
    send_status              text,
    inventory_quantity       integer,
    existing_reply           text,
    existing_conversation_id uuid,
    error_code               text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_existing public.gift_send_requests%rowtype;
  v_quantity integer;
begin
  if p_gift_id < 1 or p_gift_id > 200 then
    raise exception 'INVALID_GIFT_ID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('gift-send:' || p_request_id::text, 0)
  );

  select *
  into v_existing
  from public.gift_send_requests as r
  where r.request_id = p_request_id;

  if found then
    if v_existing.user_id <> p_user_id
      or v_existing.character_id <> p_character_id
      or v_existing.gift_id <> p_gift_id
    then
      return query
      select 'conflict'::text, 0::integer, null::text, null::uuid,
        'REQUEST_CONFLICT'::text;
      return;
    end if;

    select coalesce(i.quantity, 0)
    into v_quantity
    from public.user_gift_inventory as i
    where i.user_id = p_user_id
      and i.gift_id = p_gift_id;

    if v_existing.status = 'completed' then
      return query
      select 'completed'::text, coalesce(v_quantity, 0),
        v_existing.reply, v_existing.conversation_id, null::text;
      return;
    end if;

    if v_existing.status = 'processing' then
      return query
      select 'in_progress'::text, coalesce(v_quantity, 0),
        null::text, v_existing.conversation_id, null::text;
      return;
    end if;

    return query
    select 'failed'::text, coalesce(v_quantity, 0), null::text,
      v_existing.conversation_id,
      coalesce(v_existing.error_code, 'GIFT_SEND_FAILED')::text;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'gift-inventory:' || p_user_id::text || ':' || p_gift_id::text,
      0
    )
  );

  select i.quantity
  into v_quantity
  from public.user_gift_inventory as i
  where i.user_id = p_user_id
    and i.gift_id = p_gift_id
  for update;

  if not found or v_quantity < 1 then
    return query
    select 'rejected'::text, coalesce(v_quantity, 0), null::text,
      null::uuid, 'GIFT_NOT_OWNED'::text;
    return;
  end if;

  update public.user_gift_inventory as i
  set
    quantity = i.quantity - 1,
    updated_at = clock_timestamp()
  where i.user_id = p_user_id
    and i.gift_id = p_gift_id
  returning i.quantity into v_quantity;

  insert into public.gift_send_requests (
    request_id,
    user_id,
    character_id,
    gift_id,
    status,
    user_text
  )
  values (
    p_request_id,
    p_user_id,
    p_character_id,
    p_gift_id,
    'processing',
    nullif(trim(coalesce(p_user_text, '')), '')
  );

  return query
  select 'claimed'::text, v_quantity, null::text, null::uuid, null::text;
end;
$function$;

REVOKE ALL ON FUNCTION public.begin_gift_send(uuid, uuid, text, integer, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.begin_gift_send(uuid, uuid, text, integer, text) TO service_role;

CREATE FUNCTION public.charge_evercoin (
  p_user_id      uuid,
  p_amount       bigint,
  p_reason       text,
  p_reference_id text   DEFAULT NULL::text
)
  RETURNS TABLE (
    charged boolean,
    balance bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.charge_evercoin(uuid, bigint, text, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.charge_evercoin(uuid, bigint, text, text) TO service_role;

CREATE FUNCTION public.charge_voice_call_minute (
  p_user_id      uuid,
  p_call_id      uuid,
  p_character_id text,
  p_minute_index integer,
  p_amount       bigint
)
  RETURNS TABLE (
    charged         boolean,
    balance         bigint,
    already_charged boolean
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  current_balance bigint;
  minute_exists boolean;
begin
  if p_amount < 0 or p_minute_index < 1 then
    raise exception 'INVALID_VOICE_CALL_CHARGE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'voice:' ||
      p_user_id::text ||
      ':' ||
      p_call_id::text ||
      ':' ||
      p_minute_index::text,
      0
    )
  );

  select exists (
    select 1
    from public.voice_call_minutes v
    where v.user_id = p_user_id
      and v.call_id = p_call_id
      and v.minute_index = p_minute_index
  )
  into minute_exists;

  insert into public.evercoin_wallets (
    user_id,
    balance
  )
  values (
    p_user_id,
    0
  )
  on conflict (user_id) do nothing;

  select w.balance
  into current_balance
  from public.evercoin_wallets w
  where w.user_id = p_user_id
  for update;

  if minute_exists then
    return query
    select true, current_balance, true;
    return;
  end if;

  if current_balance < p_amount then
    return query
    select false, current_balance, false;
    return;
  end if;

  update public.evercoin_wallets w
  set
    balance = w.balance - p_amount,
    updated_at = now()
  where w.user_id = p_user_id
  returning w.balance
  into current_balance;

  insert into public.voice_call_minutes (
    user_id,
    call_id,
    character_id,
    minute_index,
    evercoin_charge
  )
  values (
    p_user_id,
    p_call_id,
    p_character_id,
    p_minute_index,
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
      'voice_call_minute',
      p_call_id::text || ':' || p_minute_index::text
    );
  end if;

  return query
  select true, current_balance, false;
end;
$function$;

REVOKE ALL ON FUNCTION public.charge_voice_call_minute(uuid, uuid, text, integer, bigint) FROM PUBLIC;

GRANT ALL ON FUNCTION public.charge_voice_call_minute(uuid, uuid, text, integer, bigint) TO service_role;

CREATE FUNCTION public.claim_character_translations (
  p_language text,
  p_items    jsonb
)
  RETURNS TABLE (
    character_id text,
    claimed      boolean,
    content      jsonb
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_item jsonb;
  v_character_id text;
  v_source_hash text;
  v_existing_hash text;
  v_existing_status text;
  v_existing_content jsonb;
  v_existing_lease timestamptz;
  v_found boolean;
begin
  if p_language not in ('ES', 'FR', 'DE', 'JA', 'KO') then
    raise exception 'INVALID_TRANSLATION_LANGUAGE';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_TRANSLATION_ITEMS';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(
      coalesce(p_items, '[]'::jsonb)
    )
  loop
    v_character_id :=
      nullif(trim(v_item ->> 'character_id'), '');

    v_source_hash :=
      nullif(trim(v_item ->> 'source_hash'), '');

    if v_character_id is null or v_source_hash is null then
      continue;
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(
        'character-translation:' ||
        v_character_id ||
        ':' ||
        p_language,
        0
      )
    );

    select
      t.source_hash,
      t.status,
      t.content,
      t.lease_until
    into
      v_existing_hash,
      v_existing_status,
      v_existing_content,
      v_existing_lease
    from public.character_translations as t
    where t.character_id = v_character_id
      and t.language = p_language;

    v_found := found;

    if
      v_found
      and v_existing_hash = v_source_hash
      and v_existing_status = 'ready'
      and v_existing_content is not null
    then
      character_id := v_character_id;
      claimed := false;
      content := v_existing_content;
      return next;
      continue;
    end if;

    if
      v_found
      and v_existing_hash = v_source_hash
      and v_existing_status = 'translating'
      and v_existing_lease is not null
      and v_existing_lease > now()
    then
      character_id := v_character_id;
      claimed := false;
      content := null;
      return next;
      continue;
    end if;

    if
      v_found
      and v_existing_hash = v_source_hash
      and v_existing_status = 'failed'
      and v_existing_lease is not null
      and v_existing_lease > now()
    then
      character_id := v_character_id;
      claimed := false;
      content := null;
      return next;
      continue;
    end if;

    insert into public.character_translations (
      character_id,
      language,
      source_hash,
      status,
      content,
      lease_until,
      error_message,
      updated_at
    )
    values (
      v_character_id,
      p_language,
      v_source_hash,
      'translating',
      null,
      now() + interval '3 minutes',
      null,
      now()
    )
    on conflict on constraint character_translations_pkey
    do update
    set
      source_hash = excluded.source_hash,
      status = excluded.status,
      content = null,
      lease_until = excluded.lease_until,
      error_message = null,
      updated_at = excluded.updated_at;

    character_id := v_character_id;
    claimed := true;
    content := null;
    return next;
  end loop;
end;
$function$;

REVOKE ALL ON FUNCTION public.claim_character_translations(text, jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.claim_character_translations(text, jsonb) TO service_role;

CREATE FUNCTION public.claim_voice_call_turn (
  p_user_id              uuid,
  p_call_id              uuid,
  p_character_id         text,
  p_request_id           uuid,
  p_max_turns_per_minute integer
)
  RETURNS TABLE (
    claim_status             text,
    existing_transcript      text,
    existing_reply           text,
    existing_audio_path      text,
    existing_conversation_id uuid,
    existing_input_tokens    integer,
    existing_output_tokens   integer,
    retry_after_seconds      integer
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.claim_voice_call_turn(uuid, uuid, text, uuid, integer) FROM PUBLIC;

GRANT ALL ON FUNCTION public.claim_voice_call_turn(uuid, uuid, text, uuid, integer) TO service_role;

CREATE FUNCTION public.complete_character_image_request (
  p_user_id    uuid,
  p_request_id uuid,
  p_image_id   uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.complete_character_image_request(uuid, uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.complete_character_image_request(uuid, uuid, uuid) TO service_role;

CREATE FUNCTION public.complete_chat_message_credit (
  p_user_id    uuid,
  p_request_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_updated integer;
begin
  update public.message_credit_usage as u
  set
    status = 'completed',
    completed_at = clock_timestamp()
  where u.request_id = p_request_id
    and u.user_id = p_user_id
    and u.status = 'reserved';

  get diagnostics v_updated = row_count;

  return v_updated = 1 or exists (
    select 1
    from public.message_credit_usage as u
    where u.request_id = p_request_id
      and u.user_id = p_user_id
      and u.status = 'completed'
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.complete_chat_message_credit(uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.complete_chat_message_credit(uuid, uuid) TO service_role;

CREATE FUNCTION public.complete_chat_request (
  p_user_id         uuid,
  p_request_id      uuid,
  p_conversation_id uuid,
  p_reply           text,
  p_input_tokens    integer,
  p_output_tokens   integer,
  p_provider        text,
  p_model           text,
  p_language        text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  updated_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if exists (
    select 1
    from public.chat_requests
    where user_id = p_user_id
      and request_id = p_request_id
      and status = 'completed'
  ) then
    return true;
  end if;

  if not exists (
    select 1
    from public.conversations
    where id = p_conversation_id
      and user_id = p_user_id
  ) then
    return false;
  end if;

  update public.chat_requests
  set
    conversation_id = p_conversation_id,
    status = 'completed',
    reply = p_reply,
    input_tokens = p_input_tokens,
    output_tokens = p_output_tokens,
    provider = p_provider,
    model = p_model,
    language = p_language,
    error_code = null,
    updated_at = now(),
    completed_at = now()
  where user_id = p_user_id
    and request_id = p_request_id
    and status = 'pending';

  get diagnostics updated_count = row_count;

  if updated_count <> 1 then
    return false;
  end if;

  insert into public.messages (
    conversation_id,
    role,
    content,
    input_tokens,
    output_tokens,
    model_id
  )
  values (
    p_conversation_id,
    'character',
    p_reply,
    p_input_tokens,
    p_output_tokens,
    p_model
  );

  return true;
end;
$function$;

REVOKE ALL ON FUNCTION public.complete_chat_request(uuid, uuid, uuid, text, integer, integer, text, text, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.complete_chat_request(uuid, uuid, uuid, text, integer, integer, text, text, text) TO service_role;

CREATE FUNCTION public.complete_gift_send (
  p_user_id         uuid,
  p_request_id      uuid,
  p_conversation_id uuid,
  p_reply           text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  update public.gift_send_requests as r
  set
    status = 'completed',
    conversation_id = p_conversation_id,
    reply = p_reply,
    error_code = null,
    completed_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where r.request_id = p_request_id
    and r.user_id = p_user_id
    and r.status = 'processing';

  if found then
    return true;
  end if;

  return exists (
    select 1
    from public.gift_send_requests as r
    where r.request_id = p_request_id
      and r.user_id = p_user_id
      and r.status = 'completed'
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.complete_gift_send(uuid, uuid, uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.complete_gift_send(uuid, uuid, uuid, text) TO service_role;

CREATE FUNCTION public.complete_voice_call_turn (
  p_user_id            uuid,
  p_call_id            uuid,
  p_request_id         uuid,
  p_conversation_id    uuid,
  p_transcript         text,
  p_reply              text,
  p_audio_storage_path text,
  p_input_tokens       integer,
  p_output_tokens      integer
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.complete_voice_call_turn(uuid, uuid, uuid, uuid, text, text, text, integer, integer) FROM PUBLIC;

GRANT ALL ON FUNCTION public.complete_voice_call_turn(uuid, uuid, uuid, uuid, text, text, text, integer, integer) TO service_role;

CREATE FUNCTION public.credit_evercoin_purchase (
  p_user_id        uuid,
  p_transaction_id text,
  p_price_id       text,
  p_pack_code      text,
  p_coins          bigint,
  p_total_minor    bigint,
  p_currency_code  text
)
  RETURNS TABLE (
    credited              boolean,
    balance               bigint,
    debt                  bigint,
    coins_applied_to_debt bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.credit_evercoin_purchase(uuid, text, text, text, bigint, bigint, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.credit_evercoin_purchase(uuid, text, text, text, bigint, bigint, text) TO service_role;

CREATE FUNCTION public.credit_message_purchase (
  p_user_id        uuid,
  p_transaction_id text,
  p_price_id       text,
  p_bundle_code    text,
  p_messages       bigint,
  p_total_minor    bigint,
  p_currency_code  text
)
  RETURNS TABLE (
    credited                 boolean,
    balance                  bigint,
    debt                     bigint,
    messages_applied_to_debt bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
    select 1
    from public.message_purchases as p
    where p.paddle_transaction_id = p_transaction_id
  ) then
    select coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_balance, v_debt
    from public.evercoin_wallets as w
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
  from public.evercoin_wallets as w
  where w.user_id = p_user_id
  for update;

  v_to_debt := least(v_debt, p_messages);
  v_to_balance := p_messages - v_to_debt;

  update public.evercoin_wallets as w
  set
    debt = w.debt - v_to_debt,
    balance = w.balance + v_to_balance,
    updated_at = clock_timestamp()
  where w.user_id = p_user_id
  returning w.balance, w.debt into v_balance, v_debt;

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

  insert into public.evercoin_transactions (
    user_id,
    amount,
    reason,
    reference_id
  )
  values (
    p_user_id,
    p_messages,
    'legacy_message_bundle_converted_to_evercoin',
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
      'legacy_message_bundle_paid_evercoin_debt',
      p_transaction_id
    );
  end if;

  return query
  select true, v_balance, v_debt, v_to_debt;
end;
$function$;

REVOKE ALL ON FUNCTION public.credit_message_purchase(uuid, text, text, text, bigint, bigint, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.credit_message_purchase(uuid, text, text, text, bigint, bigint, text) TO service_role;

CREATE FUNCTION public.end_voice_call (
  p_user_id uuid,
  p_call_id uuid,
  p_reason  text DEFAULT 'user_hangup'::text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.end_voice_call(uuid, uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.end_voice_call(uuid, uuid, text) TO service_role;

CREATE FUNCTION public.enforce_character_gallery_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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

  if image_count >= 5 then
    raise exception 'IMAGE_LIMIT_REACHED'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

CREATE FUNCTION public.enforce_ever_memory_content_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  new.content := left(btrim(new.content), 500);

  if new.content = '' then
    raise exception 'EverMemory content cannot be empty.';
  end if;

  return new;
end;
$function$;

CREATE FUNCTION public.enforce_private_user_characters()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if new.creator_id is not null and coalesce(new.official, false) = false then
    if new.visibility = 'public' then
      new.visibility := 'unlisted';
    elsif new.visibility is null or new.visibility not in ('private', 'unlisted') then
      new.visibility := 'private';
    end if;

    new.is_public := false;

    if new.section is null or new.section = 'Public Creations' then
      new.section := 'My Companions';
    end if;

    new.generated_seo :=
      coalesce(new.generated_seo, '{}'::jsonb) ||
      jsonb_build_object('indexable', false);

    new.quality_control :=
      coalesce(new.quality_control, '{}'::jsonb) ||
      jsonb_build_object('public_listing_disabled', true);
  end if;

  return new;
end;
$function$;

CREATE FUNCTION public.enforce_relationship_memory_limits()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  new.summary := left(
    btrim(coalesce(new.summary, '')),
    1200
  );

  new.emotional_state := left(
    btrim(coalesce(new.emotional_state, '')),
    300
  );

  new.open_threads := public.limit_memory_text_array(
    new.open_threads,
    12,
    300
  );

  new.important_promises := public.limit_memory_text_array(
    new.important_promises,
    12,
    300
  );

  new.important_events := public.limit_memory_text_array(
    new.important_events,
    20,
    300
  );

  return new;
end;
$function$;

CREATE FUNCTION public.enforce_user_character_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  existing_count integer;
begin
  if new.creator_id is null then
    return new;
  end if;

  select count(*)
  into existing_count
  from public.characters
  where creator_id = new.creator_id;

  if existing_count >= 100 then
    raise exception 'CHARACTER_LIMIT_REACHED'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

CREATE FUNCTION public.fail_character_image_request (
  p_user_id    uuid,
  p_request_id uuid,
  p_error_code text
)
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.fail_character_image_request(uuid, uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.fail_character_image_request(uuid, uuid, text) TO service_role;

CREATE FUNCTION public.fail_chat_request (
  p_user_id    uuid,
  p_request_id uuid,
  p_error_code text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  updated_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  update public.chat_requests
  set
    status = 'failed',
    error_code = left(coalesce(p_error_code, 'CHAT_FAILED'), 120),
    updated_at = now()
  where user_id = p_user_id
    and request_id = p_request_id
    and status = 'pending';

  get diagnostics updated_count = row_count;

  return updated_count = 1;
end;
$function$;

REVOKE ALL ON FUNCTION public.fail_chat_request(uuid, uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.fail_chat_request(uuid, uuid, text) TO service_role;

CREATE FUNCTION public.fail_gift_send (
  p_user_id    uuid,
  p_request_id uuid,
  p_error_code text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_request public.gift_send_requests%rowtype;
begin
  select *
  into v_request
  from public.gift_send_requests as r
  where r.request_id = p_request_id
    and r.user_id = p_user_id
  for update;

  if not found then
    return false;
  end if;

  if v_request.status = 'completed' then
    return true;
  end if;

  if v_request.status = 'processing' and not v_request.inventory_refunded then
    insert into public.user_gift_inventory (
      user_id,
      gift_id,
      quantity,
      created_at,
      updated_at
    )
    values (
      p_user_id,
      v_request.gift_id,
      1,
      clock_timestamp(),
      clock_timestamp()
    )
    on conflict on constraint user_gift_inventory_pkey
    do update
    set
      quantity = public.user_gift_inventory.quantity + 1,
      updated_at = excluded.updated_at;
  end if;

  update public.gift_send_requests as r
  set
    status = 'failed',
    inventory_refunded = true,
    error_code = left(coalesce(p_error_code, 'GIFT_SEND_FAILED'), 120),
    updated_at = clock_timestamp()
  where r.request_id = p_request_id
    and r.user_id = p_user_id;

  return true;
end;
$function$;

REVOKE ALL ON FUNCTION public.fail_gift_send(uuid, uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.fail_gift_send(uuid, uuid, text) TO service_role;

CREATE FUNCTION public.fail_voice_call_turn (
  p_user_id    uuid,
  p_call_id    uuid,
  p_request_id uuid,
  p_error_code text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.fail_voice_call_turn(uuid, uuid, uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.fail_voice_call_turn(uuid, uuid, uuid, text) TO service_role;

CREATE FUNCTION public.limit_memory_text_array (
  p_values         text[],
  p_max_items      integer,
  p_max_characters integer
)
  RETURNS text[]
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  select coalesce(
    array_agg(
      left(btrim(item_value), greatest(p_max_characters, 0))
      order by item_position
    ),
    '{}'::text[]
  )
  from (
    select
      item_value,
      item_position
    from unnest(coalesce(p_values, '{}'::text[]))
      with ordinality as items(item_value, item_position)
    where btrim(item_value) <> ''
    order by item_position
    limit greatest(p_max_items, 0)
  ) limited_items;
$function$;

CREATE FUNCTION public.prepare_voice_call_turn (
  p_user_id              uuid,
  p_call_id              uuid,
  p_character_id         text,
  p_amount               bigint,
  p_max_minutes          integer,
  p_idle_timeout_seconds integer
)
  RETURNS TABLE (
    allowed        boolean,
    balance        bigint,
    debt           bigint,
    current_minute integer,
    newly_charged  bigint,
    started_at     timestamp with time zone,
    max_ends_at    timestamp with time zone,
    error_code     text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.prepare_voice_call_turn(uuid, uuid, text, bigint, integer, integer) FROM PUBLIC;

GRANT ALL ON FUNCTION public.prepare_voice_call_turn(uuid, uuid, text, bigint, integer, integer) TO service_role;

CREATE FUNCTION public.purchase_evershop_gift (
  p_user_id    uuid,
  p_request_id uuid,
  p_gift_id    integer,
  p_price      bigint
)
  RETURNS TABLE (
    purchase_status    text,
    balance            bigint,
    debt               bigint,
    inventory_quantity integer,
    error_code         text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_existing public.evershop_purchase_requests%rowtype;
  v_balance bigint;
  v_debt bigint;
  v_quantity integer;
begin
  if p_gift_id < 1 or p_gift_id > 200 or p_price <= 0 then
    raise exception 'INVALID_EVERSHOP_PURCHASE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('evershop-purchase:' || p_request_id::text, 0)
  );

  select *
  into v_existing
  from public.evershop_purchase_requests as r
  where r.request_id = p_request_id;

  if found then
    if v_existing.user_id <> p_user_id
      or v_existing.gift_id <> p_gift_id
      or v_existing.evercoin_spent <> p_price
    then
      return query
      select 'conflict'::text, 0::bigint, 0::bigint, 0::integer,
        'REQUEST_CONFLICT'::text;
      return;
    end if;

    select coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_balance, v_debt
    from public.evercoin_wallets as w
    where w.user_id = p_user_id;

    select coalesce(i.quantity, 0)
    into v_quantity
    from public.user_gift_inventory as i
    where i.user_id = p_user_id
      and i.gift_id = p_gift_id;

    return query
    select 'completed'::text, coalesce(v_balance, 0), coalesce(v_debt, 0),
      coalesce(v_quantity, 0), null::text;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('evercoin-user:' || p_user_id::text, 0)
  );

  insert into public.evercoin_wallets (user_id, balance, debt)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select w.balance, w.debt
  into v_balance, v_debt
  from public.evercoin_wallets as w
  where w.user_id = p_user_id
  for update;

  if v_debt > 0 then
    return query
    select 'rejected'::text, v_balance, v_debt, 0::integer,
      'EVERCOIN_DEBT'::text;
    return;
  end if;

  if v_balance < p_price then
    return query
    select 'rejected'::text, v_balance, v_debt, 0::integer,
      'INSUFFICIENT_EVERCOIN'::text;
    return;
  end if;

  update public.evercoin_wallets as w
  set
    balance = w.balance - p_price,
    updated_at = clock_timestamp()
  where w.user_id = p_user_id
  returning w.balance into v_balance;

  insert into public.evercoin_transactions (
    user_id,
    amount,
    reason,
    reference_id
  )
  values (
    p_user_id,
    -p_price,
    'evershop_gift_purchase',
    p_request_id::text
  );

  insert into public.user_gift_inventory (
    user_id,
    gift_id,
    quantity,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    p_gift_id,
    1,
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict on constraint user_gift_inventory_pkey
  do update
  set
    quantity = public.user_gift_inventory.quantity + 1,
    updated_at = excluded.updated_at
  returning quantity into v_quantity;

  insert into public.evershop_purchase_requests (
    request_id,
    user_id,
    gift_id,
    quantity,
    evercoin_spent
  )
  values (
    p_request_id,
    p_user_id,
    p_gift_id,
    1,
    p_price
  );

  return query
  select 'completed'::text, v_balance, v_debt, v_quantity, null::text;
end;
$function$;

REVOKE ALL ON FUNCTION public.purchase_evershop_gift(uuid, uuid, integer, bigint) FROM PUBLIC;

GRANT ALL ON FUNCTION public.purchase_evershop_gift(uuid, uuid, integer, bigint) TO service_role;

CREATE FUNCTION public.refund_chat_message_credit (
  p_user_id    uuid,
  p_request_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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

  select u.*
  into v_usage
  from public.message_credit_usage as u
  where u.request_id = p_request_id
    and u.user_id = p_user_id
    and u.status = 'reserved'
  for update;

  if not found then
    return false;
  end if;

  update public.message_credit_usage as u
  set
    status = 'refunded',
    refunded_at = clock_timestamp()
  where u.request_id = p_request_id
    and u.user_id = p_user_id;

  if v_usage.source = 'trial' then
    update public.profiles as p
    set
      trial_messages_used = greatest(p.trial_messages_used - 1, 0),
      trial_status = case
        when greatest(p.trial_messages_used - 1, 0) = 0 then 'not_started'
        else 'active'
      end,
      trial_ended_at = null,
      updated_at = clock_timestamp()
    where p.user_id = p_user_id;
    return true;
  end if;

  insert into public.evercoin_wallets (user_id, balance, debt)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select w.balance, w.debt
  into v_balance, v_debt
  from public.evercoin_wallets as w
  where w.user_id = p_user_id
  for update;

  v_to_debt := least(v_debt, 1);
  v_to_balance := 1 - v_to_debt;

  update public.evercoin_wallets as w
  set
    debt = w.debt - v_to_debt,
    balance = w.balance + v_to_balance,
    updated_at = clock_timestamp()
  where w.user_id = p_user_id;

  insert into public.evercoin_transactions (
    user_id,
    amount,
    reason,
    reference_id
  )
  values (
    p_user_id,
    1,
    'chat_message_failed',
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
      'chat_message_refund_debt_payment',
      p_request_id::text
    );
  end if;

  return true;
end;
$function$;

REVOKE ALL ON FUNCTION public.refund_chat_message_credit(uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.refund_chat_message_credit(uuid, uuid) TO service_role;

CREATE FUNCTION public.refund_evercoin (
  p_user_id      uuid,
  p_amount       bigint,
  p_reason       text,
  p_reference_id text   DEFAULT NULL::text
)
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.refund_evercoin(uuid, bigint, text, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.refund_evercoin(uuid, bigint, text, text) TO service_role;

CREATE FUNCTION public.reserve_chat_message (
  p_user_id    uuid,
  p_request_id uuid
)
  RETURNS TABLE (
    allowed             boolean,
    credit_source       text,
    trial_remaining     integer,
    purchased_remaining bigint,
    debt                bigint,
    already_reserved    boolean,
    error_code          text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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

  select u.*
  into v_usage
  from public.message_credit_usage as u
  where u.request_id = p_request_id
    and u.user_id = p_user_id;

  if found and v_usage.status in ('reserved', 'completed') then
    select p.trial_messages_used, p.trial_message_limit
    into v_trial_used, v_trial_limit
    from public.profiles as p
    where p.user_id = p_user_id;

    select coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_balance, v_debt
    from public.evercoin_wallets as w
    where w.user_id = p_user_id;

    return query
    select
      true,
      v_usage.source,
      greatest(coalesce(v_trial_limit, 20) - coalesce(v_trial_used, 0), 0),
      coalesce(v_balance, 0),
      coalesce(v_debt, 0),
      true,
      null::text;
    return;
  end if;

  if found and v_usage.status = 'refunded' then
    select p.trial_messages_used, p.trial_message_limit
    into v_trial_used, v_trial_limit
    from public.profiles as p
    where p.user_id = p_user_id;

    select coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_balance, v_debt
    from public.evercoin_wallets as w
    where w.user_id = p_user_id;

    return query
    select
      false,
      v_usage.source,
      greatest(coalesce(v_trial_limit, 20) - coalesce(v_trial_used, 0), 0),
      coalesce(v_balance, 0),
      coalesce(v_debt, 0),
      true,
      'REQUEST_ALREADY_REFUNDED'::text;
    return;
  end if;

  insert into public.profiles (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select p.trial_messages_used, p.trial_message_limit
  into v_trial_used, v_trial_limit
  from public.profiles as p
  where p.user_id = p_user_id
  for update;

  v_trial_used := greatest(coalesce(v_trial_used, 0), 0);
  v_trial_limit := greatest(coalesce(v_trial_limit, 20), 0);

  if v_trial_used < v_trial_limit then
    v_source := 'trial';

    update public.profiles as p
    set
      trial_messages_used = v_trial_used + 1,
      trial_status = case
        when v_trial_used + 1 >= v_trial_limit then 'ended'
        else 'active'
      end,
      trial_started_at = coalesce(p.trial_started_at, clock_timestamp()),
      trial_ended_at = case
        when v_trial_used + 1 >= v_trial_limit then clock_timestamp()
        else null
      end,
      updated_at = clock_timestamp()
    where p.user_id = p_user_id;
  else
    insert into public.evercoin_wallets (user_id, balance, debt)
    values (p_user_id, 0, 0)
    on conflict (user_id) do nothing;

    select w.balance, w.debt
    into v_balance, v_debt
    from public.evercoin_wallets as w
    where w.user_id = p_user_id
    for update;

    if v_debt > 0 then
      return query
      select
        false,
        null::text,
        0,
        v_balance,
        v_debt,
        false,
        'EVERCOIN_DEBT'::text;
      return;
    end if;

    if v_balance < 1 then
      return query
      select
        false,
        null::text,
        0,
        v_balance,
        v_debt,
        false,
        'INSUFFICIENT_EVERCOIN'::text;
      return;
    end if;

    v_source := 'evercoin';

    update public.evercoin_wallets as w
    set
      balance = w.balance - 1,
      updated_at = clock_timestamp()
    where w.user_id = p_user_id
    returning w.balance, w.debt into v_balance, v_debt;

    insert into public.evercoin_transactions (
      user_id,
      amount,
      reason,
      reference_id
    )
    values (
      p_user_id,
      -1,
      'chat_message',
      p_request_id::text
    );
  end if;

  insert into public.message_credit_usage (
    request_id,
    user_id,
    source,
    status
  )
  values (
    p_request_id,
    p_user_id,
    v_source,
    'reserved'
  );

  if v_source = 'trial' then
    select coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_balance, v_debt
    from public.evercoin_wallets as w
    where w.user_id = p_user_id;
  end if;

  return query
  select
    true,
    v_source,
    greatest(
      v_trial_limit - case
        when v_source = 'trial' then v_trial_used + 1
        else v_trial_used
      end,
      0
    ),
    coalesce(v_balance, 0),
    coalesce(v_debt, 0),
    false,
    null::text;
end;
$function$;

REVOKE ALL ON FUNCTION public.reserve_chat_message(uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.reserve_chat_message(uuid, uuid) TO service_role;

CREATE FUNCTION public.reverse_evercoin_purchase (
  p_transaction_id text,
  p_adjustment_id  text,
  p_action         text,
  p_status         text,
  p_coins          bigint
)
  RETURNS TABLE (
    reversed       boolean,
    user_id        uuid,
    balance        bigint,
    debt           bigint,
    coins_reversed bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.reverse_evercoin_purchase(text, text, text, text, bigint) FROM PUBLIC;

GRANT ALL ON FUNCTION public.reverse_evercoin_purchase(text, text, text, text, bigint) TO service_role;

CREATE FUNCTION public.reverse_message_purchase (
  p_transaction_id text,
  p_adjustment_id  text,
  p_action         text,
  p_status         text,
  p_messages       bigint
)
  RETURNS TABLE (
    reversed          boolean,
    user_id           uuid,
    balance           bigint,
    debt              bigint,
    messages_reversed bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
    select 1
    from public.message_adjustments as a
    where a.adjustment_id = p_adjustment_id
  ) then
    select p.user_id, coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_existing_user_id, v_balance, v_debt
    from public.message_purchases as p
    left join public.evercoin_wallets as w
      on w.user_id = p.user_id
    where p.paddle_transaction_id = p_transaction_id;

    return query
    select
      false,
      v_existing_user_id,
      coalesce(v_balance, 0),
      coalesce(v_debt, 0),
      0::bigint;
    return;
  end if;

  select p.*
  into v_purchase
  from public.message_purchases as p
  where p.paddle_transaction_id = p_transaction_id
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

  insert into public.evercoin_wallets (user_id, balance, debt)
  values (v_purchase.user_id, 0, 0)
  on conflict (user_id) do nothing;

  select w.balance, w.debt
  into v_balance, v_debt
  from public.evercoin_wallets as w
  where w.user_id = v_purchase.user_id
  for update;

  v_from_balance := least(v_balance, v_requested);
  v_to_debt := v_requested - v_from_balance;

  update public.evercoin_wallets as w
  set
    balance = w.balance - v_from_balance,
    debt = w.debt + v_to_debt,
    updated_at = clock_timestamp()
  where w.user_id = v_purchase.user_id
  returning w.balance, w.debt into v_balance, v_debt;

  update public.message_purchases as p
  set
    messages_reversed = p.messages_reversed + v_requested,
    status = case
      when p.messages_reversed + v_requested >= p.messages_granted
        then 'reversed'
      else 'partially_reversed'
    end,
    updated_at = clock_timestamp()
  where p.paddle_transaction_id = p_transaction_id;

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
    insert into public.evercoin_transactions (
      user_id,
      amount,
      reason,
      reference_id
    )
    values (
      v_purchase.user_id,
      -v_from_balance,
      'legacy_message_bundle_reversal',
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
      'legacy_message_bundle_reversal_debt',
      p_adjustment_id
    );
  end if;

  return query
  select true, v_purchase.user_id, v_balance, v_debt, v_requested;
end;
$function$;

REVOKE ALL ON FUNCTION public.reverse_message_purchase(text, text, text, text, bigint) FROM PUBLIC;

GRANT ALL ON FUNCTION public.reverse_message_purchase(text, text, text, text, bigint) TO service_role;

CREATE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE FUNCTION public.set_character_creator_username()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if new.creator_id is null then
    new.creator_username := null;
    return new;
  end if;

  select p.username
  into new.creator_username
  from public.profiles p
  where p.user_id = new.creator_id;

  if new.creator_username is null then
    new.creator_username :=
      'member_' || substr(replace(new.creator_id::text, '-', ''), 1, 8);

    insert into public.profiles (user_id, username)
    values (new.creator_id, new.creator_username)
    on conflict (user_id) do update
    set username = coalesce(profiles.username, excluded.username);
  end if;

  return new;
end;
$function$;

CREATE FUNCTION public.start_character_image_request (
  p_user_id       uuid,
  p_request_id    uuid,
  p_character_id  text,
  p_prompt        text,
  p_amount        bigint,
  p_gallery_limit integer
)
  RETURNS TABLE (
    request_status text,
    balance        bigint,
    debt           bigint,
    image_id       uuid,
    error_code     text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.start_character_image_request(uuid, uuid, text, text, bigint, integer) FROM PUBLIC;

GRANT ALL ON FUNCTION public.start_character_image_request(uuid, uuid, text, text, bigint, integer) TO service_role;

CREATE FUNCTION public.start_voice_call (
  p_user_id      uuid,
  p_character_id text,
  p_amount       bigint,
  p_max_minutes  integer
)
  RETURNS TABLE (
    started      boolean,
    call_id      uuid,
    balance      bigint,
    debt         bigint,
    started_at   timestamp with time zone,
    paid_through timestamp with time zone,
    max_ends_at  timestamp with time zone,
    error_code   text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.start_voice_call(uuid, text, bigint, integer) FROM PUBLIC;

GRANT ALL ON FUNCTION public.start_voice_call(uuid, text, bigint, integer) TO service_role;

CREATE FUNCTION public.sync_creator_username_after_profile_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  update public.characters
  set
    creator_username = new.username,
    updated_at = now()
  where creator_id = new.user_id;

  return new;
end;
$function$;

CREATE FUNCTION public.trim_ever_memory_to_50()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  delete from public.ever_memory
  where id in (
    select id
    from (
      select
        id,
        row_number() over (
          order by
            importance desc nulls last,
            updated_at desc nulls last,
            id desc
        ) as memory_rank
      from public.ever_memory
      where user_id = new.user_id
        and character_id = new.character_id
    ) ranked_memories
    where memory_rank > 50
  );

  return new;
end;
$function$;

CREATE FUNCTION public.trim_ever_memory_to_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      new.user_id::text || ':' || new.character_id::text,
      0
    )
  );

  delete from public.ever_memory memory_row
  using (
    select id
    from public.ever_memory
    where user_id = new.user_id
      and character_id = new.character_id
    order by
      importance desc,
      updated_at desc,
      created_at desc,
      id desc
    offset 50
  ) excess_memory
  where memory_row.id = excess_memory.id;

  return null;
end;
$function$;

CREATE TABLE public.character_gallery_images (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id         uuid                     NOT NULL,
  character_id    text                     NOT NULL,
  storage_path    text                     NOT NULL,
  prompt          text                     NOT NULL,
  provider        text                     DEFAULT 'venice'::text NOT NULL,
  model           text                     NOT NULL,
  evercoin_charge bigint                   DEFAULT 0 NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.character_gallery_images
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.character_gallery_images
  ADD CONSTRAINT character_gallery_images_evercoin_charge_check CHECK (evercoin_charge >= 0);

ALTER TABLE public.character_gallery_images
  ADD CONSTRAINT character_gallery_images_pkey PRIMARY KEY (id);

ALTER TABLE public.character_gallery_images
  ADD CONSTRAINT character_gallery_images_storage_path_key UNIQUE (storage_path);

ALTER TABLE public.character_gallery_images
  ADD CONSTRAINT character_gallery_images_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.character_gallery_images TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.character_gallery_images TO authenticated;

GRANT ALL ON public.character_gallery_images TO service_role;

CREATE INDEX character_gallery_owner_character_idx ON public.character_gallery_images (user_id, character_id, created_at DESC);

CREATE TRIGGER character_gallery_limit_trigger
  BEFORE INSERT ON public.character_gallery_images
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_character_gallery_limit();

CREATE POLICY character_gallery_owner_all ON public.character_gallery_images
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE TABLE public.character_image_requests (
  request_id      uuid                     NOT NULL,
  user_id         uuid                     NOT NULL,
  character_id    text                     NOT NULL,
  prompt          text                     NOT NULL,
  status          text                     DEFAULT 'processing'::text NOT NULL,
  image_id        uuid,
  evercoin_charge bigint                   DEFAULT 0 NOT NULL,
  error_code      text,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.character_image_requests
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.character_image_requests
  ADD CONSTRAINT character_image_requests_evercoin_charge_check CHECK (evercoin_charge >= 0);

ALTER TABLE public.character_image_requests
  ADD CONSTRAINT character_image_requests_image_id_fkey FOREIGN KEY (image_id) REFERENCES public.character_gallery_images(id) ON DELETE SET NULL;

ALTER TABLE public.character_image_requests
  ADD CONSTRAINT character_image_requests_pkey PRIMARY KEY (request_id);

ALTER TABLE public.character_image_requests
  ADD CONSTRAINT character_image_requests_status_check CHECK (status = ANY (ARRAY['processing'::text, 'completed'::text, 'failed'::text]));

ALTER TABLE public.character_image_requests
  ADD CONSTRAINT character_image_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.character_image_requests TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.character_image_requests TO authenticated;

GRANT ALL ON public.character_image_requests TO service_role;

CREATE UNIQUE INDEX character_image_one_processing_idx ON public.character_image_requests (user_id, character_id)
  WHERE status = 'processing'::text;

CREATE INDEX character_image_requests_user_created_idx ON public.character_image_requests (user_id, created_at DESC);

CREATE POLICY character_image_requests_owner_read ON public.character_image_requests
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE TABLE public.character_reports (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  reporter_id  uuid,
  character_id text                     NOT NULL,
  reason       text                     NOT NULL,
  details      text,
  status       text                     DEFAULT 'open'::text NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  resolved_at  timestamp with time zone
);

ALTER TABLE public.character_reports
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.character_reports
  ADD CONSTRAINT character_reports_pkey PRIMARY KEY (id);

ALTER TABLE public.character_reports
  ADD CONSTRAINT character_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.character_reports
  ADD CONSTRAINT character_reports_status_check CHECK (status = ANY (ARRAY['open'::text, 'reviewing'::text, 'resolved'::text, 'dismissed'::text]));

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.character_reports TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.character_reports TO authenticated;

GRANT ALL ON public.character_reports TO service_role;

CREATE POLICY reports_own_insert ON public.character_reports
  FOR INSERT
  WITH CHECK ((auth.uid() = reporter_id));

CREATE POLICY reports_own_read ON public.character_reports
  FOR SELECT
  USING ((auth.uid() = reporter_id));

CREATE TABLE public.character_translations (
  character_id  text                     NOT NULL,
  language      text                     NOT NULL,
  source_hash   text                     NOT NULL,
  status        text                     DEFAULT 'ready'::text NOT NULL,
  content       jsonb,
  lease_until   timestamp with time zone,
  error_message text,
  created_at    timestamp with time zone DEFAULT now() NOT NULL,
  updated_at    timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.character_translations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.character_translations
  ADD CONSTRAINT character_translations_language_check CHECK (language = ANY (ARRAY['ES'::text, 'FR'::text, 'DE'::text, 'JA'::text, 'KO'::text]));

ALTER TABLE public.character_translations
  ADD CONSTRAINT character_translations_pkey PRIMARY KEY (character_id, LANGUAGE);

ALTER TABLE public.character_translations
  ADD CONSTRAINT character_translations_status_check CHECK (status = ANY (ARRAY['translating'::text, 'ready'::text, 'failed'::text]));

GRANT ALL ON public.character_translations TO service_role;

CREATE INDEX character_translations_status_lease_idx ON public.character_translations (status, lease_until);

CREATE TABLE public.characters (
  id                   text                     NOT NULL,
  slug                 text                     NOT NULL,
  name                 text                     NOT NULL,
  section              text                     NOT NULL,
  category             text                     NOT NULL,
  role                 text                     NOT NULL,
  relationship_pace    text,
  tags                 text[]                   DEFAULT '{}'::text[] NOT NULL,
  title                text                     NOT NULL,
  opening_scenario     text                     NOT NULL,
  first_message        text                     NOT NULL,
  relationship_context text                     NOT NULL,
  ai_profile           jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  feature_flags        jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  generated_seo        jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  quality_control      jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  image_file           text                     NOT NULL,
  image_storage_bucket text                     DEFAULT 'character-assets'::text NOT NULL,
  image_storage_path   text                     NOT NULL,
  image_url            text                     NOT NULL,
  display_order        integer                  DEFAULT 0 NOT NULL,
  visibility           text                     DEFAULT 'public'::text NOT NULL,
  is_public            boolean                  DEFAULT true NOT NULL,
  official             boolean                  DEFAULT false NOT NULL,
  creator_id           uuid,
  creator_username     text,
  view_count           bigint                   DEFAULT 0 NOT NULL,
  favorite_count       bigint                   DEFAULT 0 NOT NULL,
  is_active            boolean                  DEFAULT true NOT NULL,
  created_at           timestamp with time zone DEFAULT now() NOT NULL,
  updated_at           timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.characters
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.characters
  ADD CONSTRAINT characters_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.characters
  ADD CONSTRAINT characters_pkey PRIMARY KEY (id);

ALTER TABLE public.character_gallery_images
  ADD CONSTRAINT character_gallery_images_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;

ALTER TABLE public.character_image_requests
  ADD CONSTRAINT character_image_requests_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;

ALTER TABLE public.character_reports
  ADD CONSTRAINT character_reports_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;

ALTER TABLE public.character_translations
  ADD CONSTRAINT character_translations_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;

ALTER TABLE public.characters
  ADD CONSTRAINT characters_slug_key UNIQUE (slug);

ALTER TABLE public.characters
  ADD CONSTRAINT characters_visibility_check CHECK (visibility = ANY (ARRAY['public'::text, 'unlisted'::text, 'private'::text]));

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.characters TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.characters TO authenticated;

GRANT ALL ON public.characters TO service_role;

CREATE INDEX characters_public_creation_order_idx ON public.characters (category, is_public, visibility, display_order, created_at DESC);

CREATE INDEX characters_name_search_idx ON public.characters
  USING gin (to_tsvector('simple'::regconfig, (((COALESCE(name, ''::text) || ' '::text) || COALESCE(title, ''::text)) || ' '::text) || COALESCE(ROLE, ''::text)));

CREATE INDEX characters_quality_control_gin_idx ON public.characters USING gin (quality_control);

CREATE INDEX characters_generated_seo_gin_idx ON public.characters USING gin (generated_seo);

CREATE INDEX characters_ai_profile_gin_idx ON public.characters USING gin (ai_profile);

CREATE INDEX characters_tags_gin_idx ON public.characters USING gin (tags);

CREATE INDEX characters_active_public_idx ON public.characters (is_active, is_public);

CREATE INDEX characters_role_idx ON public.characters (ROLE);

CREATE INDEX characters_public_display_order_idx ON public.characters (is_active, is_public, visibility, category, display_order);

CREATE INDEX characters_category_display_order_idx ON public.characters (category, display_order);

CREATE INDEX characters_category_idx ON public.characters (category);

CREATE INDEX characters_section_idx ON public.characters (section);

CREATE INDEX characters_creator_id_idx ON public.characters (creator_id);

CREATE TRIGGER characters_enforce_user_limit
  BEFORE INSERT ON public.characters
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_user_character_limit();

CREATE TRIGGER characters_set_creator_username
  BEFORE INSERT OR UPDATE OF creator_id ON public.characters
  FOR EACH ROW
  EXECUTE FUNCTION public.set_character_creator_username();

CREATE TRIGGER enforce_private_user_characters_trigger
  BEFORE INSERT OR UPDATE OF creator_id, official, visibility, is_public, section, generated_seo, quality_control ON public.characters
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_private_user_characters();

CREATE POLICY characters_owner_read ON public.characters
  FOR SELECT
  USING ((creator_id = auth.uid()));

CREATE POLICY characters_public_read ON public.characters
  FOR SELECT
  USING (((is_active = true) AND (is_public = true) AND (visibility = 'public'::text)));

CREATE TABLE public.chat_requests (
  user_id         uuid                     NOT NULL,
  request_id      uuid                     NOT NULL,
  character_id    text                     NOT NULL,
  conversation_id uuid,
  status          text                     DEFAULT 'pending'::text NOT NULL,
  reply           text,
  input_tokens    integer,
  output_tokens   integer,
  provider        text,
  model           text,
  language        text,
  error_code      text,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL,
  completed_at    timestamp with time zone
);

ALTER TABLE public.chat_requests
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_requests
  ADD CONSTRAINT chat_requests_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;

ALTER TABLE public.chat_requests
  ADD CONSTRAINT chat_requests_pkey PRIMARY KEY (user_id, request_id);

ALTER TABLE public.chat_requests
  ADD CONSTRAINT chat_requests_status_check CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text]));

ALTER TABLE public.chat_requests
  ADD CONSTRAINT chat_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.chat_requests TO service_role;

CREATE INDEX chat_requests_user_created_idx ON public.chat_requests (user_id, created_at DESC);

CREATE UNIQUE INDEX chat_requests_one_pending_per_user_idx ON public.chat_requests (user_id)
  WHERE status = 'pending'::text;

CREATE TABLE public.conversations (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id      uuid                     NOT NULL,
  character_id text                     NOT NULL,
  title        text,
  memory_state jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.conversations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);

ALTER TABLE public.chat_requests
  ADD CONSTRAINT chat_requests_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_user_id_character_id_key UNIQUE (user_id, character_id);

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.conversations TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.conversations TO authenticated;

GRANT ALL ON public.conversations TO service_role;

CREATE INDEX conversations_user_updated_idx ON public.conversations (user_id, updated_at DESC);

CREATE INDEX conversations_character_idx ON public.conversations (character_id);

CREATE POLICY conversations_own_all ON public.conversations
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE TABLE public.ever_memory (
  id                uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id           uuid                     NOT NULL,
  character_id      text                     NOT NULL,
  conversation_id   uuid,
  memory_type       text                     NOT NULL,
  content           text                     NOT NULL,
  importance        integer                  DEFAULT 50 NOT NULL,
  source_message_id uuid,
  metadata          jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  created_at        timestamp with time zone DEFAULT now() NOT NULL,
  updated_at        timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.ever_memory
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ever_memory
  ADD CONSTRAINT ever_memory_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;

ALTER TABLE public.ever_memory
  ADD CONSTRAINT ever_memory_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

ALTER TABLE public.ever_memory
  ADD CONSTRAINT ever_memory_importance_check CHECK (importance >= 0 AND importance <= 100);

ALTER TABLE public.ever_memory
  ADD CONSTRAINT ever_memory_memory_type_check
    CHECK
    (memory_type = ANY (ARRAY['fact'::text, 'preference'::text, 'routine'::text, 'inside_joke'::text, 'promise'::text, 'event'::text, 'conflict'::text, 'repair'::text,
    'relationship_shift'::text, 'open_thread'::text]));

ALTER TABLE public.ever_memory
  ADD CONSTRAINT ever_memory_pkey PRIMARY KEY (id);

ALTER TABLE public.ever_memory
  ADD CONSTRAINT ever_memory_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.ever_memory TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.ever_memory TO authenticated;

GRANT ALL ON public.ever_memory TO service_role;

CREATE UNIQUE INDEX ever_memory_dedupe_idx ON public.ever_memory (user_id, character_id, memory_type, md5(lower(TRIM(BOTH FROM content))));

CREATE INDEX ever_memory_lookup_idx ON public.ever_memory (user_id, character_id, importance DESC, updated_at DESC);

CREATE TRIGGER ever_memory_content_limit_trigger
  BEFORE INSERT OR UPDATE OF content ON public.ever_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ever_memory_content_limit();

CREATE TRIGGER ever_memory_row_limit_trigger
  AFTER INSERT OR UPDATE ON public.ever_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.trim_ever_memory_to_limit();

CREATE TRIGGER trim_ever_memory_after_write
  AFTER INSERT OR UPDATE OF importance, updated_at ON public.ever_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.trim_ever_memory_to_50();

CREATE POLICY ever_memory_own_all ON public.ever_memory
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE TABLE public.evercoin_adjustments (
  adjustment_id         text                     NOT NULL,
  paddle_transaction_id text                     NOT NULL,
  user_id               uuid                     NOT NULL,
  action                text                     NOT NULL,
  status                text                     NOT NULL,
  coins_reversed        bigint                   DEFAULT 0 NOT NULL,
  created_at            timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.evercoin_adjustments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.evercoin_adjustments
  ADD CONSTRAINT evercoin_adjustments_coins_reversed_check CHECK (coins_reversed >= 0);

ALTER TABLE public.evercoin_adjustments
  ADD CONSTRAINT evercoin_adjustments_pkey PRIMARY KEY (adjustment_id);

ALTER TABLE public.evercoin_adjustments
  ADD CONSTRAINT evercoin_adjustments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.evercoin_adjustments TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.evercoin_adjustments TO authenticated;

GRANT ALL ON public.evercoin_adjustments TO service_role;

CREATE POLICY evercoin_adjustments_owner_read ON public.evercoin_adjustments
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE TABLE public.evercoin_debt_events (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id      uuid                     NOT NULL,
  amount       bigint                   NOT NULL,
  reason       text                     NOT NULL,
  reference_id text,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.evercoin_debt_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.evercoin_debt_events
  ADD CONSTRAINT evercoin_debt_events_amount_check CHECK (amount <> 0);

ALTER TABLE public.evercoin_debt_events
  ADD CONSTRAINT evercoin_debt_events_pkey PRIMARY KEY (id);

ALTER TABLE public.evercoin_debt_events
  ADD CONSTRAINT evercoin_debt_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.evercoin_debt_events TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.evercoin_debt_events TO authenticated;

GRANT ALL ON public.evercoin_debt_events TO service_role;

CREATE INDEX evercoin_debt_events_user_created_idx ON public.evercoin_debt_events (user_id, created_at DESC);

CREATE POLICY evercoin_debt_events_owner_read ON public.evercoin_debt_events
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE TABLE public.evercoin_purchases (
  paddle_transaction_id   text                     NOT NULL,
  user_id                 uuid                     NOT NULL,
  price_id                text                     NOT NULL,
  pack_code               text                     NOT NULL,
  coins_granted           bigint                   NOT NULL,
  coins_reversed          bigint                   DEFAULT 0 NOT NULL,
  transaction_total_minor bigint,
  currency_code           text,
  status                  text                     DEFAULT 'credited'::text NOT NULL,
  created_at              timestamp with time zone DEFAULT now() NOT NULL,
  updated_at              timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.evercoin_purchases
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.evercoin_purchases
  ADD CONSTRAINT evercoin_purchases_coins_granted_check CHECK (coins_granted > 0);

ALTER TABLE public.evercoin_purchases
  ADD CONSTRAINT evercoin_purchases_coins_reversed_check CHECK (coins_reversed >= 0);

ALTER TABLE public.evercoin_purchases
  ADD CONSTRAINT evercoin_purchases_pkey PRIMARY KEY (paddle_transaction_id);

ALTER TABLE public.evercoin_adjustments
  ADD CONSTRAINT evercoin_adjustments_paddle_transaction_id_fkey FOREIGN KEY (paddle_transaction_id) REFERENCES public.evercoin_purchases(paddle_transaction_id) ON DELETE CASCADE;

ALTER TABLE public.evercoin_purchases
  ADD CONSTRAINT evercoin_purchases_status_check CHECK (status = ANY (ARRAY['credited'::text, 'partially_reversed'::text, 'reversed'::text]));

ALTER TABLE public.evercoin_purchases
  ADD CONSTRAINT evercoin_purchases_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.evercoin_purchases TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.evercoin_purchases TO authenticated;

GRANT ALL ON public.evercoin_purchases TO service_role;

CREATE INDEX evercoin_purchases_user_created_idx ON public.evercoin_purchases (user_id, created_at DESC);

CREATE POLICY evercoin_purchases_owner_read ON public.evercoin_purchases
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE TABLE public.evercoin_transactions (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id      uuid                     NOT NULL,
  amount       bigint                   NOT NULL,
  reason       text                     NOT NULL,
  reference_id text,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.evercoin_transactions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.evercoin_transactions
  ADD CONSTRAINT evercoin_transactions_pkey PRIMARY KEY (id);

ALTER TABLE public.evercoin_transactions
  ADD CONSTRAINT evercoin_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.evercoin_transactions TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.evercoin_transactions TO authenticated;

GRANT ALL ON public.evercoin_transactions TO service_role;

CREATE INDEX evercoin_transactions_user_created_idx ON public.evercoin_transactions (user_id, created_at DESC);

CREATE POLICY evercoin_transactions_owner_read ON public.evercoin_transactions
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE TABLE public.evercoin_wallets (
  user_id    uuid                     NOT NULL,
  balance    bigint                   DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  debt       bigint                   DEFAULT 0 NOT NULL
);

ALTER TABLE public.evercoin_wallets
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.evercoin_wallets
  ADD CONSTRAINT evercoin_wallets_balance_check CHECK (balance >= 0);

ALTER TABLE public.evercoin_wallets
  ADD CONSTRAINT evercoin_wallets_debt_check CHECK (debt >= 0);

ALTER TABLE public.evercoin_wallets
  ADD CONSTRAINT evercoin_wallets_pkey PRIMARY KEY (user_id);

ALTER TABLE public.evercoin_wallets
  ADD CONSTRAINT evercoin_wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.evercoin_wallets TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.evercoin_wallets TO authenticated;

GRANT ALL ON public.evercoin_wallets TO service_role;

CREATE POLICY evercoin_wallet_owner_read ON public.evercoin_wallets
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE TABLE public.evershop_purchase_requests (
  request_id     uuid                     NOT NULL,
  user_id        uuid                     NOT NULL,
  gift_id        integer                  NOT NULL,
  quantity       integer                  DEFAULT 1 NOT NULL,
  evercoin_spent bigint                   NOT NULL,
  created_at     timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.evershop_purchase_requests
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.evershop_purchase_requests
  ADD CONSTRAINT evershop_purchase_requests_evercoin_spent_check CHECK (evercoin_spent > 0);

ALTER TABLE public.evershop_purchase_requests
  ADD CONSTRAINT evershop_purchase_requests_gift_id_check CHECK (gift_id >= 1 AND gift_id <= 200);

ALTER TABLE public.evershop_purchase_requests
  ADD CONSTRAINT evershop_purchase_requests_pkey PRIMARY KEY (request_id);

ALTER TABLE public.evershop_purchase_requests
  ADD CONSTRAINT evershop_purchase_requests_quantity_check CHECK (quantity > 0);

ALTER TABLE public.evershop_purchase_requests
  ADD CONSTRAINT evershop_purchase_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.evershop_purchase_requests TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.evershop_purchase_requests TO authenticated;

GRANT ALL ON public.evershop_purchase_requests TO service_role;

CREATE INDEX evershop_purchase_requests_user_created_idx ON public.evershop_purchase_requests (user_id, created_at DESC);

CREATE POLICY evershop_purchase_requests_owner_read ON public.evershop_purchase_requests
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE TABLE public.favorites (
  user_id      uuid                     NOT NULL,
  character_id text                     NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.favorites
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.favorites
  ADD CONSTRAINT favorites_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;

ALTER TABLE public.favorites
  ADD CONSTRAINT favorites_pkey PRIMARY KEY (user_id, character_id);

ALTER TABLE public.favorites
  ADD CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.favorites TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.favorites TO authenticated;

GRANT ALL ON public.favorites TO service_role;

CREATE POLICY favorites_own_all ON public.favorites
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE TABLE public.gift_send_requests (
  request_id         uuid                     NOT NULL,
  user_id            uuid                     NOT NULL,
  character_id       text                     NOT NULL,
  conversation_id    uuid,
  gift_id            integer                  NOT NULL,
  status             text                     DEFAULT 'processing'::text NOT NULL,
  inventory_refunded boolean                  DEFAULT false NOT NULL,
  user_text          text,
  reply              text,
  error_code         text,
  created_at         timestamp with time zone DEFAULT now() NOT NULL,
  updated_at         timestamp with time zone DEFAULT now() NOT NULL,
  completed_at       timestamp with time zone
);

ALTER TABLE public.gift_send_requests
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.gift_send_requests
  ADD CONSTRAINT gift_send_requests_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;

ALTER TABLE public.gift_send_requests
  ADD CONSTRAINT gift_send_requests_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;

ALTER TABLE public.gift_send_requests
  ADD CONSTRAINT gift_send_requests_gift_id_check CHECK (gift_id >= 1 AND gift_id <= 200);

ALTER TABLE public.gift_send_requests
  ADD CONSTRAINT gift_send_requests_pkey PRIMARY KEY (request_id);

ALTER TABLE public.gift_send_requests
  ADD CONSTRAINT gift_send_requests_status_check CHECK (status = ANY (ARRAY['processing'::text, 'completed'::text, 'failed'::text]));

ALTER TABLE public.gift_send_requests
  ADD CONSTRAINT gift_send_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.gift_send_requests TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.gift_send_requests TO authenticated;

GRANT ALL ON public.gift_send_requests TO service_role;

CREATE INDEX gift_send_requests_user_created_idx ON public.gift_send_requests (user_id, created_at DESC);

CREATE INDEX gift_send_requests_conversation_idx ON public.gift_send_requests (conversation_id, created_at DESC);

CREATE POLICY gift_send_requests_owner_read ON public.gift_send_requests
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE TABLE public.image_unlocks (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id         uuid                     NOT NULL,
  character_id    text                     NOT NULL,
  slot_key        text                     NOT NULL,
  image_bucket    text                     DEFAULT 'character-assets'::text,
  image_path      text,
  image_url       text,
  provider        text,
  provider_job_id text,
  evercoin_charge integer,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.image_unlocks
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.image_unlocks
  ADD CONSTRAINT image_unlocks_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;

ALTER TABLE public.image_unlocks
  ADD CONSTRAINT image_unlocks_pkey PRIMARY KEY (id);

ALTER TABLE public.image_unlocks
  ADD CONSTRAINT image_unlocks_user_id_character_id_slot_key_key UNIQUE (user_id, character_id, slot_key);

ALTER TABLE public.image_unlocks
  ADD CONSTRAINT image_unlocks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.image_unlocks TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.image_unlocks TO authenticated;

GRANT ALL ON public.image_unlocks TO service_role;

CREATE POLICY image_unlocks_own_all ON public.image_unlocks
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE TABLE public.message_adjustments (
  adjustment_id         text                     NOT NULL,
  paddle_transaction_id text                     NOT NULL,
  user_id               uuid                     NOT NULL,
  action                text                     NOT NULL,
  status                text                     NOT NULL,
  messages_reversed     bigint                   DEFAULT 0 NOT NULL,
  created_at            timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.message_adjustments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.message_adjustments
  ADD CONSTRAINT message_adjustments_messages_reversed_check CHECK (messages_reversed >= 0);

ALTER TABLE public.message_adjustments
  ADD CONSTRAINT message_adjustments_pkey PRIMARY KEY (adjustment_id);

ALTER TABLE public.message_adjustments
  ADD CONSTRAINT message_adjustments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.message_adjustments TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.message_adjustments TO authenticated;

GRANT ALL ON public.message_adjustments TO service_role;

CREATE POLICY message_adjustments_owner_read ON public.message_adjustments
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE TABLE public.message_credit_usage (
  request_id   uuid                     NOT NULL,
  user_id      uuid                     NOT NULL,
  source       text                     NOT NULL,
  status       text                     DEFAULT 'reserved'::text NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  refunded_at  timestamp with time zone
);

ALTER TABLE public.message_credit_usage
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.message_credit_usage
  ADD CONSTRAINT message_credit_usage_pkey PRIMARY KEY (request_id);

ALTER TABLE public.message_credit_usage
  ADD CONSTRAINT message_credit_usage_source_check CHECK (source = ANY (ARRAY['trial'::text, 'purchased'::text, 'evercoin'::text]));

ALTER TABLE public.message_credit_usage
  ADD CONSTRAINT message_credit_usage_status_check CHECK (status = ANY (ARRAY['reserved'::text, 'completed'::text, 'refunded'::text]));

ALTER TABLE public.message_credit_usage
  ADD CONSTRAINT message_credit_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.message_credit_usage TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.message_credit_usage TO authenticated;

GRANT ALL ON public.message_credit_usage TO service_role;

CREATE INDEX message_credit_usage_user_created_idx ON public.message_credit_usage (user_id, created_at DESC);

CREATE POLICY message_credit_usage_owner_read ON public.message_credit_usage
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE TABLE public.message_purchases (
  paddle_transaction_id   text                     NOT NULL,
  user_id                 uuid                     NOT NULL,
  price_id                text                     NOT NULL,
  bundle_code             text                     NOT NULL,
  messages_granted        bigint                   NOT NULL,
  messages_reversed       bigint                   DEFAULT 0 NOT NULL,
  transaction_total_minor bigint,
  currency_code           text,
  status                  text                     DEFAULT 'credited'::text NOT NULL,
  created_at              timestamp with time zone DEFAULT now() NOT NULL,
  updated_at              timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.message_purchases
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.message_purchases
  ADD CONSTRAINT message_purchases_messages_granted_check CHECK (messages_granted > 0);

ALTER TABLE public.message_purchases
  ADD CONSTRAINT message_purchases_messages_reversed_check CHECK (messages_reversed >= 0);

ALTER TABLE public.message_purchases
  ADD CONSTRAINT message_purchases_pkey PRIMARY KEY (paddle_transaction_id);

ALTER TABLE public.message_adjustments
  ADD CONSTRAINT message_adjustments_paddle_transaction_id_fkey FOREIGN KEY (paddle_transaction_id) REFERENCES public.message_purchases(paddle_transaction_id) ON DELETE CASCADE;

ALTER TABLE public.message_purchases
  ADD CONSTRAINT message_purchases_status_check CHECK (status = ANY (ARRAY['credited'::text, 'partially_reversed'::text, 'reversed'::text]));

ALTER TABLE public.message_purchases
  ADD CONSTRAINT message_purchases_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.message_purchases TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.message_purchases TO authenticated;

GRANT ALL ON public.message_purchases TO service_role;

CREATE INDEX message_purchases_user_created_idx ON public.message_purchases (user_id, created_at DESC);

CREATE POLICY message_purchases_owner_read ON public.message_purchases
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE TABLE public.message_to_evercoin_migrations (
  user_id                  uuid                     NOT NULL,
  message_balance_migrated bigint                   DEFAULT 0 NOT NULL,
  message_debt_migrated    bigint                   DEFAULT 0 NOT NULL,
  migrated_at              timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.message_to_evercoin_migrations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.message_to_evercoin_migrations
  ADD CONSTRAINT message_to_evercoin_migrations_pkey PRIMARY KEY (user_id);

ALTER TABLE public.message_to_evercoin_migrations
  ADD CONSTRAINT message_to_evercoin_migrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.message_to_evercoin_migrations TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.message_to_evercoin_migrations TO authenticated;

GRANT ALL ON public.message_to_evercoin_migrations TO service_role;

CREATE POLICY message_to_evercoin_migrations_owner_read ON public.message_to_evercoin_migrations
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE TABLE public.message_transactions (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id      uuid                     NOT NULL,
  amount       bigint                   NOT NULL,
  reason       text                     NOT NULL,
  reference_id text,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.message_transactions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.message_transactions
  ADD CONSTRAINT message_transactions_pkey PRIMARY KEY (id);

ALTER TABLE public.message_transactions
  ADD CONSTRAINT message_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.message_transactions TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.message_transactions TO authenticated;

GRANT ALL ON public.message_transactions TO service_role;

CREATE INDEX message_transactions_user_created_idx ON public.message_transactions (user_id, created_at DESC);

CREATE POLICY message_transactions_owner_read ON public.message_transactions
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE TABLE public.message_wallets (
  user_id    uuid                     NOT NULL,
  balance    bigint                   DEFAULT 0 NOT NULL,
  debt       bigint                   DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.message_wallets
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.message_wallets
  ADD CONSTRAINT message_wallets_balance_check CHECK (balance >= 0);

ALTER TABLE public.message_wallets
  ADD CONSTRAINT message_wallets_debt_check CHECK (debt >= 0);

ALTER TABLE public.message_wallets
  ADD CONSTRAINT message_wallets_pkey PRIMARY KEY (user_id);

ALTER TABLE public.message_wallets
  ADD CONSTRAINT message_wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.message_wallets TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.message_wallets TO authenticated;

GRANT ALL ON public.message_wallets TO service_role;

CREATE POLICY message_wallet_owner_read ON public.message_wallets
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE TABLE public.messages (
  id                    uuid                     DEFAULT gen_random_uuid() NOT NULL,
  conversation_id       uuid                     NOT NULL,
  role                  text                     NOT NULL,
  content               text                     NOT NULL,
  metadata              jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  input_tokens          integer,
  output_tokens         integer,
  model_id              text,
  voice_audio_bucket    text,
  voice_audio_path      text,
  voice_audio_url       text,
  voice_tts_model       text,
  voice_tts_voice       text,
  voice_tts_language    text,
  voice_evercoin_charge integer,
  created_at            timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.messages
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

ALTER TABLE public.ever_memory
  ADD CONSTRAINT ever_memory_source_message_id_fkey FOREIGN KEY (source_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_role_check CHECK (role = ANY (ARRAY['user'::text, 'character'::text, 'system'::text, 'gift'::text]));

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.messages TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.messages TO authenticated;

GRANT ALL ON public.messages TO service_role;

CREATE INDEX messages_conversation_created_idx ON public.messages (conversation_id, created_at);

CREATE INDEX messages_metadata_gin_idx ON public.messages USING gin (metadata);

CREATE POLICY messages_own_insert ON public.messages
  FOR INSERT
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = messages.conversation_id) AND (c.user_id = auth.uid())))));

CREATE POLICY messages_own_read ON public.messages
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = messages.conversation_id) AND (c.user_id = auth.uid())))));

CREATE TABLE public.profiles (
  user_id                     uuid                     NOT NULL,
  email                       text,
  subscription_status         text                     DEFAULT 'free'::text NOT NULL,
  trial_status                text                     DEFAULT 'not_started'::text NOT NULL,
  trial_messages_used         integer                  DEFAULT 0 NOT NULL,
  trial_message_limit         integer                  DEFAULT 20 NOT NULL,
  trial_started_at            timestamp with time zone,
  trial_ended_at              timestamp with time zone,
  free_private_character_used boolean                  DEFAULT false NOT NULL,
  created_at                  timestamp with time zone DEFAULT now() NOT NULL,
  updated_at                  timestamp with time zone DEFAULT now() NOT NULL,
  username                    text
);

ALTER TABLE public.profiles
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pkey PRIMARY KEY (user_id);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_status_check
    CHECK (subscription_status = ANY (ARRAY['free'::text, 'standard'::text, 'premium'::text, 'elite'::text, 'past_due'::text, 'canceled'::text]));

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_trial_status_check CHECK (trial_status = ANY (ARRAY['not_started'::text, 'active'::text, 'ended'::text]));

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format_check CHECK (username ~ '^[a-z0-9_]{3,30}$'::text);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.profiles TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;

CREATE INDEX profiles_trial_status_idx ON public.profiles (trial_status);

CREATE INDEX profiles_subscription_status_idx ON public.profiles (subscription_status);

CREATE UNIQUE INDEX profiles_username_lower_unique ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

CREATE TRIGGER profiles_sync_creator_username
  AFTER INSERT OR UPDATE OF username ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_creator_username_after_profile_change();

CREATE TABLE public.relationship_states (
  id                 uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id            uuid                     NOT NULL,
  character_id       text                     NOT NULL,
  stage              text                     DEFAULT 'new'::text NOT NULL,
  trust              integer                  DEFAULT 0 NOT NULL,
  affection          integer                  DEFAULT 0 NOT NULL,
  comfort            integer                  DEFAULT 0 NOT NULL,
  conflict           integer                  DEFAULT 0 NOT NULL,
  summary            text                     DEFAULT ''::text NOT NULL,
  emotional_state    text                     DEFAULT ''::text NOT NULL,
  open_threads       text[]                   DEFAULT '{}'::text[] NOT NULL,
  important_promises text[]                   DEFAULT '{}'::text[] NOT NULL,
  important_events   text[]                   DEFAULT '{}'::text[] NOT NULL,
  metadata           jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  created_at         timestamp with time zone DEFAULT now() NOT NULL,
  updated_at         timestamp with time zone DEFAULT now() NOT NULL,
  user_name          text,
  user_gender        text,
  user_core_identity text
);

ALTER TABLE public.relationship_states
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.relationship_states
  ADD CONSTRAINT relationship_states_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;

ALTER TABLE public.relationship_states
  ADD CONSTRAINT relationship_states_pkey PRIMARY KEY (id);

ALTER TABLE public.relationship_states
  ADD CONSTRAINT relationship_states_user_id_character_id_key UNIQUE (user_id, character_id);

ALTER TABLE public.relationship_states
  ADD CONSTRAINT relationship_states_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.relationship_states TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.relationship_states TO authenticated;

GRANT ALL ON public.relationship_states TO service_role;

CREATE TRIGGER relationship_memory_limits_trigger
  BEFORE INSERT OR UPDATE OF summary, emotional_state, open_threads, important_promises, important_events ON public.relationship_states
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_relationship_memory_limits();

CREATE POLICY relationship_states_own_all ON public.relationship_states
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE TABLE public.trial_devices (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id       uuid,
  device_token  text                     NOT NULL,
  trial_claimed boolean                  DEFAULT false NOT NULL,
  first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
  last_seen_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.trial_devices
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.trial_devices
  ADD CONSTRAINT trial_devices_device_token_key UNIQUE (device_token);

ALTER TABLE public.trial_devices
  ADD CONSTRAINT trial_devices_pkey PRIMARY KEY (id);

ALTER TABLE public.trial_devices
  ADD CONSTRAINT trial_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.trial_devices TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.trial_devices TO authenticated;

GRANT ALL ON public.trial_devices TO service_role;

CREATE INDEX trial_devices_user_id_idx ON public.trial_devices (user_id);

CREATE TABLE public.user_character_preferences (
  user_id                   uuid                     NOT NULL,
  character_id              text                     NOT NULL,
  selected_gallery_image_id uuid,
  updated_at                timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.user_character_preferences
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_character_preferences
  ADD CONSTRAINT user_character_preferences_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;

ALTER TABLE public.user_character_preferences
  ADD CONSTRAINT user_character_preferences_pkey PRIMARY KEY (user_id, character_id);

ALTER TABLE public.user_character_preferences
  ADD CONSTRAINT user_character_preferences_selected_gallery_image_id_fkey FOREIGN KEY (selected_gallery_image_id) REFERENCES public.character_gallery_images(id) ON DELETE SET NULL;

ALTER TABLE public.user_character_preferences
  ADD CONSTRAINT user_character_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.user_character_preferences TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.user_character_preferences TO authenticated;

GRANT ALL ON public.user_character_preferences TO service_role;

CREATE POLICY user_character_preferences_owner_all ON public.user_character_preferences
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE TABLE public.user_gift_inventory (
  user_id    uuid                     NOT NULL,
  gift_id    integer                  NOT NULL,
  quantity   integer                  DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.user_gift_inventory
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_gift_inventory
  ADD CONSTRAINT user_gift_inventory_gift_id_check CHECK (gift_id >= 1 AND gift_id <= 200);

ALTER TABLE public.user_gift_inventory
  ADD CONSTRAINT user_gift_inventory_pkey PRIMARY KEY (user_id, gift_id);

ALTER TABLE public.user_gift_inventory
  ADD CONSTRAINT user_gift_inventory_quantity_check CHECK (quantity >= 0);

ALTER TABLE public.user_gift_inventory
  ADD CONSTRAINT user_gift_inventory_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.user_gift_inventory TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.user_gift_inventory TO authenticated;

GRANT ALL ON public.user_gift_inventory TO service_role;

CREATE INDEX user_gift_inventory_user_updated_idx ON public.user_gift_inventory (user_id, updated_at DESC);

CREATE POLICY user_gift_inventory_owner_read ON public.user_gift_inventory
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE TABLE public.voice_call_minutes (
  user_id         uuid                     NOT NULL,
  call_id         uuid                     NOT NULL,
  character_id    text                     NOT NULL,
  minute_index    integer                  NOT NULL,
  evercoin_charge bigint                   DEFAULT 0 NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.voice_call_minutes
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.voice_call_minutes
  ADD CONSTRAINT voice_call_minutes_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;

ALTER TABLE public.voice_call_minutes
  ADD CONSTRAINT voice_call_minutes_evercoin_charge_check CHECK (evercoin_charge >= 0);

ALTER TABLE public.voice_call_minutes
  ADD CONSTRAINT voice_call_minutes_minute_index_check CHECK (minute_index >= 1);

ALTER TABLE public.voice_call_minutes
  ADD CONSTRAINT voice_call_minutes_pkey PRIMARY KEY (user_id, call_id, minute_index);

ALTER TABLE public.voice_call_minutes
  ADD CONSTRAINT voice_call_minutes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.voice_call_minutes TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.voice_call_minutes TO authenticated;

GRANT ALL ON public.voice_call_minutes TO service_role;

CREATE INDEX voice_call_minutes_user_created_idx ON public.voice_call_minutes (user_id, created_at DESC);

CREATE POLICY voice_call_minutes_owner_read ON public.voice_call_minutes
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE TABLE public.voice_call_turns (
  request_id         uuid                     NOT NULL,
  call_id            uuid                     NOT NULL,
  user_id            uuid                     NOT NULL,
  character_id       text                     NOT NULL,
  conversation_id    uuid,
  status             text                     DEFAULT 'processing'::text NOT NULL,
  transcript         text,
  reply              text,
  audio_storage_path text,
  input_tokens       integer                  DEFAULT 0 NOT NULL,
  output_tokens      integer                  DEFAULT 0 NOT NULL,
  error_code         text,
  created_at         timestamp with time zone DEFAULT now() NOT NULL,
  completed_at       timestamp with time zone
);

ALTER TABLE public.voice_call_turns
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.voice_call_turns
  ADD CONSTRAINT voice_call_turns_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;

ALTER TABLE public.voice_call_turns
  ADD CONSTRAINT voice_call_turns_input_tokens_check CHECK (input_tokens >= 0);

ALTER TABLE public.voice_call_turns
  ADD CONSTRAINT voice_call_turns_output_tokens_check CHECK (output_tokens >= 0);

ALTER TABLE public.voice_call_turns
  ADD CONSTRAINT voice_call_turns_pkey PRIMARY KEY (request_id);

ALTER TABLE public.voice_call_turns
  ADD CONSTRAINT voice_call_turns_status_check CHECK (status = ANY (ARRAY['processing'::text, 'completed'::text, 'failed'::text]));

ALTER TABLE public.voice_call_turns
  ADD CONSTRAINT voice_call_turns_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.voice_call_turns TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.voice_call_turns TO authenticated;

GRANT ALL ON public.voice_call_turns TO service_role;

CREATE INDEX voice_call_turns_call_created_idx ON public.voice_call_turns (call_id, created_at DESC);

CREATE INDEX voice_call_turns_user_created_idx ON public.voice_call_turns (user_id, created_at DESC);

CREATE POLICY voice_call_turns_owner_read ON public.voice_call_turns
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE TABLE public.voice_calls (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id          uuid                     NOT NULL,
  character_id     text                     NOT NULL,
  status           text                     DEFAULT 'active'::text NOT NULL,
  started_at       timestamp with time zone DEFAULT now() NOT NULL,
  paid_through     timestamp with time zone NOT NULL,
  last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
  max_ends_at      timestamp with time zone NOT NULL,
  ended_at         timestamp with time zone,
  end_reason       text,
  created_at       timestamp with time zone DEFAULT now() NOT NULL,
  updated_at       timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.voice_calls
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.voice_calls
  ADD CONSTRAINT voice_calls_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;

ALTER TABLE public.voice_calls
  ADD CONSTRAINT voice_calls_pkey PRIMARY KEY (id);

ALTER TABLE public.voice_call_turns
  ADD CONSTRAINT voice_call_turns_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.voice_calls(id) ON DELETE CASCADE;

ALTER TABLE public.voice_calls
  ADD CONSTRAINT voice_calls_status_check CHECK (status = ANY (ARRAY['active'::text, 'ended'::text]));

ALTER TABLE public.voice_calls
  ADD CONSTRAINT voice_calls_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.voice_calls TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.voice_calls TO authenticated;

GRANT ALL ON public.voice_calls TO service_role;

CREATE INDEX voice_calls_user_created_idx ON public.voice_calls (user_id, created_at DESC);

CREATE UNIQUE INDEX voice_calls_one_active_per_user_idx ON public.voice_calls (user_id)
  WHERE status = 'active'::text;

CREATE POLICY voice_calls_owner_read ON public.voice_calls
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();
