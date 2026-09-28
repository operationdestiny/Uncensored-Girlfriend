begin;

create table if not exists public.character_translations (
  character_id text not null references public.characters(id) on delete cascade,
  language text not null check (language in ('ES', 'FR', 'DE', 'JA', 'KO')),
  source_hash text not null,
  status text not null default 'ready'
    check (status in ('translating', 'ready', 'failed')),
  content jsonb,
  lease_until timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (character_id, language)
);

create index if not exists character_translations_status_lease_idx
  on public.character_translations (status, lease_until);

alter table public.character_translations enable row level security;

revoke all on public.character_translations
from public, anon, authenticated;

grant all on public.character_translations
to service_role;

create or replace function public.claim_character_translations(
  p_language text,
  p_items jsonb
)
returns table (
  character_id text,
  claimed boolean,
  content jsonb
)
language plpgsql
security definer
set search_path = public
as $$
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
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_character_id := nullif(trim(v_item ->> 'character_id'), '');
    v_source_hash := nullif(trim(v_item ->> 'source_hash'), '');

    if v_character_id is null or v_source_hash is null then
      continue;
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(
        'character-translation:' || v_character_id || ':' || p_language,
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
    from public.character_translations t
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
    on conflict (character_id, language) do update
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
$$;

revoke all on function public.claim_character_translations(text, jsonb)
from public, anon, authenticated;

grant execute on function public.claim_character_translations(text, jsonb)
to service_role;

commit;
