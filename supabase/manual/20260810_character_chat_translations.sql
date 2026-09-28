begin;

create table if not exists public.character_chat_translations (
  character_id text not null
    references public.characters(id)
    on delete cascade,
  language text not null
    check (language in ('ES', 'FR', 'DE', 'JA', 'KO')),
  source_hash text not null,
  opening_scenario text not null,
  first_message text not null,
  translator text not null default 'facebook/m2m100_418M',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (character_id, language)
);

create index if not exists character_chat_translations_language_idx
  on public.character_chat_translations (language);

alter table public.character_chat_translations enable row level security;

revoke all on public.character_chat_translations
from public, anon, authenticated;

grant select, insert, update, delete
on public.character_chat_translations
to service_role;

commit;
