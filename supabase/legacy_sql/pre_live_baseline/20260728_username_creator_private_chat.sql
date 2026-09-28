begin;

alter table public.profiles
  add column if not exists username text;

alter table public.characters
  add column if not exists creator_username text;

-- Give every existing account a stable private-safe default username when needed.
update public.profiles
set username = lower(
  case
    when username is null
      or username !~ '^[A-Za-z0-9_]{3,30}$'
    then 'member_' || substr(replace(user_id::text, '-', ''), 1, 8)
    else username
  end
);

-- Resolve any case-insensitive duplicates before adding the unique index.
with ranked as (
  select
    user_id,
    username,
    row_number() over (
      partition by lower(username)
      order by user_id
    ) as duplicate_number
  from public.profiles
  where username is not null
)
update public.profiles p
set username =
  left(lower(p.username), 21)
  || '_'
  || substr(replace(p.user_id::text, '-', ''), 1, 8)
from ranked r
where p.user_id = r.user_id
  and r.duplicate_number > 1;

update public.profiles
set username = lower(username)
where username is not null;

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;

alter table public.profiles
  drop constraint if exists profiles_username_format_check;

alter table public.profiles
  add constraint profiles_username_format_check
  check (username ~ '^[a-z0-9_]{3,30}$');

create or replace function public.set_character_creator_username()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

drop trigger if exists characters_set_creator_username
  on public.characters;

create trigger characters_set_creator_username
before insert or update of creator_id
on public.characters
for each row
execute function public.set_character_creator_username();

create or replace function public.sync_creator_username_after_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.characters
  set
    creator_username = new.username,
    updated_at = now()
  where creator_id = new.user_id;

  return new;
end;
$$;

drop trigger if exists profiles_sync_creator_username
  on public.profiles;

create trigger profiles_sync_creator_username
after insert or update of username
on public.profiles
for each row
execute function public.sync_creator_username_after_profile_change();

update public.characters c
set creator_username = p.username
from public.profiles p
where c.creator_id = p.user_id
  and c.creator_username is distinct from p.username;

alter table public.characters enable row level security;

drop policy if exists characters_owner_read
  on public.characters;

create policy characters_owner_read
on public.characters
for select
using (creator_id = auth.uid());

commit;
