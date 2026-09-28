-- Reserve provider cost as soon as an owned gift is committed to an AI send.
create or replace function public.platform_account_gift_chat_reservation()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_rate public.platform_feature_cost_rates%rowtype;
begin
  if new.status <> 'processing' then
    return new;
  end if;

  select * into v_rate
  from public.platform_feature_cost_rates
  where reason='chat_message';

  if found and v_rate.cost_usd > 0 then
    insert into public.platform_provider_cost_events(
      event_key,user_id,reason,reference_id,provider,feature,cost_usd,reversed_usd,metadata,created_at,updated_at
    ) values (
      'gift-chat:'||new.request_id::text,
      new.user_id,
      'gift_chat_message',
      new.request_id::text,
      v_rate.provider,
      'Gift reaction text chat',
      v_rate.cost_usd,
      0,
      jsonb_build_object('source','gift','accounting_state','reservation_fallback_before_provider_attempt'),
      new.created_at,
      clock_timestamp()
    )
    on conflict(event_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists platform_account_gift_chat_reservation_trigger on public.gift_send_requests;
create trigger platform_account_gift_chat_reservation_trigger
after insert on public.gift_send_requests
for each row execute function public.platform_account_gift_chat_reservation();

-- Keep the established chat reconciler intact for ordinary text chat, and wrap it
-- with a gift-aware path for requests that intentionally do not consume chat credits.
do $$
begin
  if to_regprocedure('public.platform_reconcile_chat_cost_base(uuid,integer,integer,text,integer,integer,text)') is null then
    alter function public.platform_reconcile_chat_cost(uuid,integer,integer,text,integer,integer,text)
      rename to platform_reconcile_chat_cost_base;
  end if;
end
$$;

create or replace function public.platform_reconcile_chat_cost(
  p_request_id uuid,
  p_visible_input_tokens integer default null,
  p_visible_output_tokens integer default null,
  p_visible_model text default null,
  p_memory_input_tokens integer default null,
  p_memory_output_tokens integer default null,
  p_memory_model text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_gift public.gift_send_requests%rowtype;
  v_rate public.platform_feature_cost_rates%rowtype;
  v_event public.platform_provider_cost_events%rowtype;
  v_metadata jsonb := '{}'::jsonb;
  v_visible_cost numeric(18,8);
  v_memory_cost numeric(18,8);
  v_total_cost numeric(18,8);
  v_has_visible boolean := false;
  v_has_memory boolean := false;
  v_visible_model text;
  v_memory_model text;
begin
  if exists(select 1 from public.message_credit_usage u where u.request_id=p_request_id) then
    return public.platform_reconcile_chat_cost_base(
      p_request_id,
      p_visible_input_tokens,p_visible_output_tokens,p_visible_model,
      p_memory_input_tokens,p_memory_output_tokens,p_memory_model
    );
  end if;

  if p_request_id is null then
    return jsonb_build_object('ok',false,'error','REQUEST_ID_REQUIRED');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('chat-finance:'||p_request_id::text,0));

  select g.* into v_gift
  from public.gift_send_requests g
  where g.request_id=p_request_id
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'error','CHAT_USAGE_NOT_FOUND');
  end if;

  select * into v_rate
  from public.platform_feature_cost_rates
  where reason='chat_message';
  if not found then
    return jsonb_build_object('ok',false,'error','CHAT_RATE_NOT_FOUND');
  end if;

  insert into public.platform_provider_cost_events(
    event_key,user_id,reason,reference_id,provider,feature,cost_usd,reversed_usd,metadata
  ) values (
    'gift-chat:'||p_request_id::text,
    v_gift.user_id,
    'gift_chat_message',
    p_request_id::text,
    v_rate.provider,
    'Gift reaction text chat',
    v_rate.cost_usd,
    0,
    jsonb_build_object('source','gift','accounting_state','reservation_fallback_before_provider_attempt')
  ) on conflict(event_key) do nothing;

  select * into v_event
  from public.platform_provider_cost_events e
  where e.event_key='gift-chat:'||p_request_id::text
  for update;

  if v_event.id is null then
    return jsonb_build_object('ok',false,'error','CHAT_PROVIDER_COST_EVENT_NOT_FOUND','source','gift');
  end if;

  v_metadata:=coalesce(v_event.metadata,'{}'::jsonb);

  if p_visible_input_tokens is not null and p_visible_output_tokens is not null then
    v_visible_model:=coalesce(nullif(trim(p_visible_model),''),'gemma-4-uncensored');
    if v_visible_model='gemma-4-uncensored' then
      v_visible_cost:=greatest(p_visible_input_tokens,0)::numeric*0.16300000/1000000::numeric
        + greatest(p_visible_output_tokens,0)::numeric*0.50000000/1000000::numeric;
    else
      v_visible_cost:=greatest(p_visible_input_tokens,0)::numeric*0.50000000/1000000::numeric
        + greatest(p_visible_output_tokens,0)::numeric*2.00000000/1000000::numeric;
    end if;
    v_visible_cost:=round(v_visible_cost,8);
    v_has_visible:=true;
    v_metadata:=v_metadata||jsonb_build_object(
      'visible_model',v_visible_model,
      'visible_input_tokens',greatest(p_visible_input_tokens,0),
      'visible_output_tokens',greatest(p_visible_output_tokens,0),
      'visible_actual_usd',v_visible_cost
    );
  elsif v_metadata ? 'visible_actual_usd' then
    v_visible_cost:=(v_metadata->>'visible_actual_usd')::numeric;
    v_has_visible:=true;
  end if;

  if p_memory_input_tokens is not null and p_memory_output_tokens is not null then
    v_memory_model:=coalesce(nullif(trim(p_memory_model),''),'gemma-4-uncensored');
    if v_memory_model='gemma-4-uncensored' then
      v_memory_cost:=greatest(p_memory_input_tokens,0)::numeric*0.16300000/1000000::numeric
        + greatest(p_memory_output_tokens,0)::numeric*0.50000000/1000000::numeric;
    else
      v_memory_cost:=greatest(p_memory_input_tokens,0)::numeric*0.50000000/1000000::numeric
        + greatest(p_memory_output_tokens,0)::numeric*2.00000000/1000000::numeric;
    end if;
    v_memory_cost:=round(v_memory_cost,8);
    v_has_memory:=true;
    v_metadata:=v_metadata||jsonb_build_object(
      'memory_model',v_memory_model,
      'memory_input_tokens',greatest(p_memory_input_tokens,0),
      'memory_output_tokens',greatest(p_memory_output_tokens,0),
      'memory_actual_usd',v_memory_cost
    );
  elsif v_metadata ? 'memory_actual_usd' then
    v_memory_cost:=(v_metadata->>'memory_actual_usd')::numeric;
    v_has_memory:=true;
  end if;

  if v_has_visible and v_has_memory then
    v_total_cost:=round(v_visible_cost+v_memory_cost,8);
    v_metadata:=v_metadata||jsonb_build_object(
      'accounting_state','actual_token_cost_reconciled',
      'actual_total_usd',v_total_cost,
      'reconciled_at',clock_timestamp()
    );
  else
    v_total_cost:=greatest(v_event.cost_usd,coalesce(v_visible_cost,0)+coalesce(v_memory_cost,0),v_rate.cost_usd);
    v_metadata:=v_metadata||jsonb_build_object('accounting_state','fallback_waiting_for_both_token_counts');
  end if;

  update public.platform_provider_cost_events e
  set provider='venice',cost_usd=v_total_cost,reversed_usd=least(e.reversed_usd,v_total_cost),metadata=v_metadata,updated_at=clock_timestamp()
  where e.id=v_event.id;

  return jsonb_build_object(
    'ok',true,'source','gift','eventId',v_event.id,'costUsd',v_total_cost,
    'visibleActual',v_has_visible,'memoryActual',v_has_memory
  );
end;
$$;

revoke all on function public.platform_reconcile_chat_cost(uuid,integer,integer,text,integer,integer,text)
  from public,anon,authenticated;
grant execute on function public.platform_reconcile_chat_cost(uuid,integer,integer,text,integer,integer,text)
  to service_role;
revoke all on function public.platform_reconcile_chat_cost_base(uuid,integer,integer,text,integer,integer,text)
  from public,anon,authenticated;
grant execute on function public.platform_reconcile_chat_cost_base(uuid,integer,integer,text,integer,integer,text)
  to service_role;

-- Wrap finance health so a completed gift AI turn without cost accounting fails closed.
do $$
begin
  if to_regprocedure('public.platform_finance_health_base()') is null then
    alter function public.platform_finance_health() rename to platform_finance_health_base;
  end if;
end
$$;

create or replace function public.platform_finance_health()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_base jsonb;
  v_enforce timestamptz;
  v_missing bigint:=0;
  v_blocking bigint:=0;
begin
  v_base:=public.platform_finance_health_base();
  v_enforce:=coalesce((v_base->>'enforceFrom')::timestamptz,'2026-08-24 02:07:00+00'::timestamptz);

  select count(*)::bigint into v_missing
  from public.gift_send_requests g
  left join public.platform_provider_cost_events e
    on e.event_key='gift-chat:'||g.request_id::text
  where g.status='completed'
    and coalesce(g.completed_at,g.updated_at,g.created_at)>=v_enforce
    and e.id is null;

  v_blocking:=coalesce((v_base->>'blockingIssues')::bigint,0)+v_missing;

  return v_base||jsonb_build_object(
    'healthy',coalesce((v_base->>'healthy')::boolean,false) and v_missing=0,
    'blockingIssues',v_blocking,
    'giftChatsMissingProviderCost',v_missing
  );
end;
$$;

revoke all on function public.platform_finance_health() from public,anon,authenticated;
grant execute on function public.platform_finance_health() to service_role;
revoke all on function public.platform_finance_health_base() from public,anon,authenticated;
grant execute on function public.platform_finance_health_base() to service_role;
