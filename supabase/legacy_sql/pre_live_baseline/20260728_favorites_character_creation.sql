begin;

create extension if not exists pgcrypto;

alter table public.characters
  add column if not exists image_storage_bucket text,
  add column if not exists image_storage_path text,
  add column if not exists creator_id uuid references auth.users(id) on delete set null,
  add column if not exists creator_username text,
  add column if not exists favorite_count bigint not null default 0,
  add column if not exists display_order integer not null default 0,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists characters_creator_id_idx
  on public.characters (creator_id);

create index if not exists characters_public_creation_order_idx
  on public.characters (
    category,
    is_public,
    visibility,
    display_order,
    created_at desc
  );

create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id text not null references public.characters(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, character_id)
);

alter table public.favorites enable row level security;

drop policy if exists favorites_own_all
  on public.favorites;

create policy favorites_own_all
on public.favorites
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'character-images',
  'character-images',
  true,
  5242880,
  array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.enforce_user_character_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

drop trigger if exists characters_enforce_user_limit
  on public.characters;

create trigger characters_enforce_user_limit
before insert
on public.characters
for each row
execute function public.enforce_user_character_limit();

grant select, insert, update, delete
on public.favorites
to service_role;

grant select, insert, update, delete
on public.characters
to service_role;

commit;
