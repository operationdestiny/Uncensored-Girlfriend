create table if not exists public.character_voice_assignments (
  character_id text not null references public.characters(id) on delete cascade,
  locale text not null,
  voice_id text not null,
  voice_name text,
  provider text not null default 'elevenlabs',
  gender text,
  accent text,
  age text,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (character_id, locale)
);

create index if not exists character_voice_assignments_voice_idx
  on public.character_voice_assignments (voice_id);

alter table public.character_voice_assignments enable row level security;

revoke all on table public.character_voice_assignments from public;
revoke all on table public.character_voice_assignments from anon;
revoke all on table public.character_voice_assignments from authenticated;
grant all on table public.character_voice_assignments to service_role;
