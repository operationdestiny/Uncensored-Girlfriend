alter table public.evercoin_payment_orders alter column user_id drop not null;
alter table public.evercoin_payment_orders drop constraint if exists evercoin_payment_orders_user_id_fkey;
alter table public.evercoin_payment_orders add constraint evercoin_payment_orders_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;

alter table public.evercoin_cash_lots alter column user_id drop not null;
alter table public.evercoin_cash_lots drop constraint if exists evercoin_cash_lots_user_id_fkey;
alter table public.evercoin_cash_lots add constraint evercoin_cash_lots_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;

alter table public.evercoin_cash_allocations alter column user_id drop not null;
alter table public.evercoin_cash_allocations drop constraint if exists evercoin_cash_allocations_user_id_fkey;
alter table public.evercoin_cash_allocations add constraint evercoin_cash_allocations_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;

alter table public.evercoin_transactions alter column user_id drop not null;
alter table public.evercoin_transactions drop constraint if exists evercoin_transactions_user_id_fkey;
alter table public.evercoin_transactions add constraint evercoin_transactions_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;

create or replace function public.platform_forfeit_evercoin_on_account_deletion(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_wallet_balance bigint := 0;
  v_wallet_debt bigint := 0;
  v_paid_ec_remaining bigint := 0;
  v_transaction_id uuid;
begin
  if target_user_id is null then
    raise exception 'target_user_id is required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('everbond-account-delete:' || target_user_id::text, 0)
  );

  select coalesce(w.balance, 0), coalesce(w.debt, 0)
  into v_wallet_balance, v_wallet_debt
  from public.evercoin_wallets w
  where w.user_id = target_user_id
  for update;

  select coalesce(sum(l.coins_remaining), 0)::bigint
  into v_paid_ec_remaining
  from public.evercoin_cash_lots l
  where l.user_id = target_user_id
    and l.status = 'active'
    and l.coins_remaining > 0;

  if v_paid_ec_remaining > 0 then
    insert into public.evercoin_transactions (
      user_id,
      amount,
      reason,
      reference_id
    )
    values (
      target_user_id,
      -v_paid_ec_remaining,
      'account_deletion_forfeit',
      'account-delete:' || target_user_id::text
    )
    returning id into v_transaction_id;
  end if;

  update public.evercoin_wallets
  set
    balance = 0,
    debt = 0,
    updated_at = clock_timestamp()
  where user_id = target_user_id;

  return jsonb_build_object(
    'walletBalanceRemoved', v_wallet_balance,
    'walletDebtCleared', v_wallet_debt,
    'purchasedEverCoinForfeited', v_paid_ec_remaining,
    'transactionId', v_transaction_id
  );
end;
$function$;

revoke all on function public.platform_forfeit_evercoin_on_account_deletion(uuid) from public;
revoke all on function public.platform_forfeit_evercoin_on_account_deletion(uuid) from anon;
revoke all on function public.platform_forfeit_evercoin_on_account_deletion(uuid) from authenticated;
grant execute on function public.platform_forfeit_evercoin_on_account_deletion(uuid) to service_role;

create or replace function public.platform_finance_health()
returns jsonb
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
with s as (
  select '2026-08-24 02:07:00+00'::timestamptz enforce_from
),
mv as (
  select count(*)::bigint n
  from public.voice_call_minutes m
  cross join s
  left join public.platform_provider_cost_events e
    on e.event_key = 'voice-minute:' || m.call_id::text || ':' || m.minute_index::text
  where m.created_at >= s.enforce_from
    and e.id is null
),
mp as (
  select count(*)::bigint n
  from public.evercoin_transactions t
  cross join s
  join public.platform_feature_cost_rates r
    on r.reason = t.reason
  left join public.platform_provider_cost_events e
    on e.evercoin_transaction_id = t.id
  where t.created_at >= s.enforce_from
    and t.amount < 0
    and t.reason not in ('voice_call_minute', 'voice_call_minutes')
    and e.id is null
),
mt as (
  select count(*)::bigint n
  from public.message_credit_usage u
  cross join s
  left join public.platform_provider_cost_events e
    on e.event_key = 'trial-chat:' || u.request_id::text
  where u.created_at >= s.enforce_from
    and u.source = 'trial'
    and u.status = 'completed'
    and e.id is null
),
us as (
  select count(*)::bigint n
  from public.evercoin_transactions t
  cross join s
  left join public.platform_feature_cost_rates r
    on r.reason = t.reason
  where t.created_at >= s.enforce_from
    and t.amount < 0
    and r.reason is null
    and t.reason not in (
      'voice_call_minute',
      'voice_call_minutes',
      'voice_call_prorated_adjustment',
      'character_video_generation_fallback_adjustment',
      'account_deletion_forfeit'
    )
),
mdl as (
  select count(*)::bigint n
  from public.evercoin_payment_orders o
  left join public.evercoin_cash_lots l
    on l.payment_order_id = o.id
  where o.provider = 'dropp'
    and o.status = 'paid'
    and l.id is null
),
ul as (
  select count(*)::bigint n
  from public.evercoin_cash_lots
  where status = 'active'
    and net_minor is null
),
b as (
  select mv.n + mp.n + mt.n + us.n + mdl.n n
  from mv cross join mp cross join mt cross join us cross join mdl
)
select jsonb_build_object(
  'healthy', b.n = 0,
  'blockingIssues', b.n,
  'voiceMinutesMissingReserve', mv.n,
  'pricedSpendMissingProviderCost', mp.n,
  'trialChatsMissingProviderCost', mt.n,
  'unknownSpendTransactions', us.n,
  'paidDroppOrdersMissingCashLot', mdl.n,
  'unreconciledCashLots', ul.n,
  'enforceFrom', s.enforce_from
)
from b
cross join mv
cross join mp
cross join mt
cross join us
cross join mdl
cross join ul
cross join s;
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
          'platform_provider_cost_events'
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
