alter table public.platform_voice_call_cost_reconciliations
  add column if not exists id uuid default gen_random_uuid();

update public.platform_voice_call_cost_reconciliations
set id = gen_random_uuid()
where id is null;

alter table public.platform_voice_call_cost_reconciliations
  alter column id set not null;

alter table public.platform_voice_call_cost_reconciliations
  drop constraint if exists platform_voice_call_cost_reconciliations_pkey;

alter table public.platform_voice_call_cost_reconciliations
  add constraint platform_voice_call_cost_reconciliations_pkey primary key (id);

alter table public.platform_voice_call_cost_reconciliations
  alter column billing_call_id drop not null;

alter table public.platform_voice_call_cost_reconciliations
  add constraint platform_voice_call_cost_reconciliations_billing_call_id_key unique (billing_call_id);

alter table public.platform_voice_call_cost_reconciliations
  drop constraint if exists platform_voice_call_cost_reconciliations_billing_call_id_fkey;

alter table public.platform_voice_call_cost_reconciliations
  add constraint platform_voice_call_cost_reconciliations_billing_call_id_fkey
  foreign key (billing_call_id)
  references public.voice_calls(id)
  on delete set null;

create or replace function public.platform_voice_finance_status()
returns jsonb
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
with r as (
  select
    count(*)::bigint reconciled_calls,
    coalesce(sum(billed_minutes),0)::bigint reconciled_billed_minutes,
    coalesce(sum(retell_cost_usd),0::numeric) retell_actual_usd,
    coalesce(sum(venice_reserve_usd),0::numeric) venice_reserve_usd,
    coalesce(sum(total_voice_cost_usd),0::numeric) reconciled_voice_cost_usd,
    max(reconciled_at) last_reconciled_at
  from public.platform_voice_call_cost_reconciliations
),
um as (
  select count(*)::bigint unreconciled_billed_minutes
  from public.voice_call_minutes m
  left join public.platform_voice_call_cost_reconciliations r
    on r.billing_call_id=m.call_id
  where r.billing_call_id is null
),
pv as (
  select coalesce(sum(cost_usd-reversed_usd),0::numeric) protected_voice_cost_usd
  from public.platform_provider_cost_events
  where reason in ('voice_call_safety_minute','voice_call_actual_overage')
),
sc as (
  select count(distinct m.call_id)::bigint calls_on_safety_reserve
  from public.voice_call_minutes m
  left join public.platform_voice_call_cost_reconciliations r
    on r.billing_call_id=m.call_id
  join public.platform_provider_cost_events e
    on e.event_key='voice-minute:'||m.call_id::text||':'||m.minute_index::text
  where r.billing_call_id is null
    and (e.cost_usd-e.reversed_usd)>0
),
a as (
  select count(*)::bigint active_calls
  from public.voice_calls
  where status='active'
),
w as (
  select count(*)::bigint ended_calls_awaiting_actual
  from public.voice_calls v
  left join public.platform_voice_call_cost_reconciliations r
    on r.billing_call_id=v.id
  where v.status='ended'
    and v.retell_call_id is not null
    and r.billing_call_id is null
)
select jsonb_build_object(
  'billedMinutes', r.reconciled_billed_minutes + um.unreconciled_billed_minutes,
  'reconciledCalls', r.reconciled_calls,
  'callsOnSafetyReserve', sc.calls_on_safety_reserve,
  'activeCalls', a.active_calls,
  'endedCallsAwaitingActual', w.ended_calls_awaiting_actual,
  'retellActualUsd', round(r.retell_actual_usd,4),
  'veniceSafetyReserveUsd', round(r.venice_reserve_usd,4),
  'reconciledVoiceCostUsd', round(r.reconciled_voice_cost_usd,4),
  'protectedVoiceCostUsd', round(pv.protected_voice_cost_usd,4),
  'lastReconciledAt', r.last_reconciled_at
)
from r cross join um cross join pv cross join sc cross join a cross join w;
$function$;

create or replace function public.delete_everbond_account_data(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  table_record record;
  column_record record;
  predicate_parts text[];
  predicate_sql text;
  pass_number integer;
begin
  if target_user_id is null then
    raise exception 'target_user_id is required';
  end if;

  perform public.platform_forfeit_evercoin_on_account_deletion(target_user_id);

  update public.platform_voice_call_cost_reconciliations r
  set
    metadata = coalesce(r.metadata, '{}'::jsonb) || jsonb_build_object(
      'deleted_billing_call_id', r.billing_call_id::text,
      'account_deleted_at', clock_timestamp()
    ),
    updated_at = clock_timestamp()
  where r.billing_call_id in (
    select v.id
    from public.voice_calls v
    where v.user_id = target_user_id
  );

  create temporary table if not exists
    _everbond_delete_character_ids (
      id text primary key
    )
  on commit drop;

  truncate table _everbond_delete_character_ids;

  if to_regclass('public.characters') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'characters'
        and column_name = 'creator_id'
    ) then
      execute
        'insert into pg_temp._everbond_delete_character_ids (id)
         select id::text from public.characters
         where creator_id::text = $1::text
         on conflict do nothing'
      using target_user_id;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'characters'
        and column_name = 'creator_user_id'
    ) then
      execute
        'insert into pg_temp._everbond_delete_character_ids (id)
         select id::text from public.characters
         where creator_user_id::text = $1::text
         on conflict do nothing'
      using target_user_id;
    end if;
  end if;

  if
    to_regclass('public.messages') is not null
    and to_regclass('public.conversations') is not null
  then
    execute
      'delete from public.messages
       where conversation_id in (
         select id
         from public.conversations
         where user_id::text = $1::text
            or character_id::text in (
              select id
              from pg_temp._everbond_delete_character_ids
            )
       )'
    using target_user_id;
  end if;

  for pass_number in 1..10 loop
    for table_record in
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
        and table_name not in (
          'characters',
          'profiles',
          'admin_settings',
          'retired_official_characters',
          'evercoin_payment_orders',
          'evercoin_cash_lots',
          'evercoin_cash_allocations',
          'evercoin_transactions',
          'platform_provider_cost_events',
          'platform_voice_call_cost_reconciliations'
        )
      order by table_name
    loop
      predicate_parts := array[]::text[];

      for column_record in
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = table_record.table_name
          and column_name in (
            'user_id',
            'creator_id',
            'creator_user_id',
            'owner_id',
            'reporter_user_id',
            'purchaser_user_id',
            'sender_user_id',
            'recipient_user_id',
            'buyer_user_id'
          )
      loop
        predicate_parts := array_append(
          predicate_parts,
          format('%I::text = $1::text', column_record.column_name)
        );
      end loop;

      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = table_record.table_name
          and column_name = 'character_id'
      ) then
        predicate_parts := array_append(
          predicate_parts,
          'character_id::text in (
             select id
             from pg_temp._everbond_delete_character_ids
           )'
        );
      end if;

      if
        table_record.table_name <> 'conversations'
        and exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = table_record.table_name
            and column_name = 'conversation_id'
        )
        and to_regclass('public.conversations') is not null
      then
        predicate_parts := array_append(
          predicate_parts,
          'conversation_id::text in (
             select id::text
             from public.conversations
             where user_id::text = $1::text
                or character_id::text in (
                  select id
                  from pg_temp._everbond_delete_character_ids
                )
           )'
        );
      end if;

      if coalesce(array_length(predicate_parts, 1), 0) > 0 then
        predicate_sql := array_to_string(predicate_parts, ' or ');

        begin
          execute format(
            'delete from public.%I where %s',
            table_record.table_name,
            predicate_sql
          )
          using target_user_id;
        exception
          when foreign_key_violation then
            null;
        end;
      end if;
    end loop;
  end loop;

  if to_regclass('public.conversations') is not null then
    execute
      'delete from public.conversations
       where user_id::text = $1::text
          or character_id::text in (
            select id
            from pg_temp._everbond_delete_character_ids
          )'
    using target_user_id;
  end if;

  if to_regclass('public.characters') is not null then
    execute
      'delete from public.characters
       where id::text in (
         select id
         from pg_temp._everbond_delete_character_ids
       )';
  end if;

  if to_regclass('public.profiles') is not null then
    execute
      'delete from public.profiles
       where user_id::text = $1::text'
    using target_user_id;
  end if;
end;
$function$;

revoke all on function public.delete_everbond_account_data(uuid) from public;
revoke all on function public.delete_everbond_account_data(uuid) from anon;
revoke all on function public.delete_everbond_account_data(uuid) from authenticated;
grant execute on function public.delete_everbond_account_data(uuid) to service_role;
