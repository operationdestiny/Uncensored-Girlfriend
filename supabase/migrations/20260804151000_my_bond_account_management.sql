-- EverBond self-service account deletion.
-- Run this once in Supabase SQL Editor before enabling the Delete account button.

create or replace function public.delete_everbond_account_data(
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $function$
declare
  table_record record;
  column_record record;
  predicate_parts text[];
  predicate_sql text;
  pass_number integer;
  owned_character_predicate text := '';
begin
  if target_user_id is null then
    raise exception 'target_user_id is required';
  end if;

  create temporary table if not exists
    _everbond_delete_character_ids (
      id uuid primary key
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
         select id from public.characters
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
         select id from public.characters
         where creator_user_id::text = $1::text
         on conflict do nothing'
      using target_user_id;
    end if;
  end if;

  -- Messages must be removed before their conversations where an older
  -- installation does not yet have an ON DELETE CASCADE constraint.
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
              select id::text
              from pg_temp._everbond_delete_character_ids
            )
       )'
    using target_user_id;
  end if;

  -- Repeated passes allow child rows to be removed before parent rows even
  -- when different EverBond installations have different migration ages.
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
          'retired_official_characters'
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
             select id::text
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
                  select id::text
                  from pg_temp._everbond_delete_character_ids
                )
           )'
        );
      end if;

      if coalesce(array_length(predicate_parts, 1), 0) > 0 then
        predicate_sql := array_to_string(
          predicate_parts,
          ' or '
        );

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
            select id::text
            from pg_temp._everbond_delete_character_ids
          )'
    using target_user_id;
  end if;

  if to_regclass('public.characters') is not null then
    execute
      'delete from public.characters
       where id in (
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

revoke all on function
  public.delete_everbond_account_data(uuid)
  from public;

revoke all on function
  public.delete_everbond_account_data(uuid)
  from anon;

revoke all on function
  public.delete_everbond_account_data(uuid)
  from authenticated;

grant execute on function
  public.delete_everbond_account_data(uuid)
  to service_role;
