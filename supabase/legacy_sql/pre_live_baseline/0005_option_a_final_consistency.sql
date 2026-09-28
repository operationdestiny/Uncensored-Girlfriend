-- EverBond Option A final consistency migration.
-- IMPORTANT: run before importing production characters or creating real user data.
-- This migration intentionally rebuilds character-dependent tables around text character IDs.

begin;

create extension if not exists pgcrypto;

-- Drop character-dependent tables from the pre-production scaffold.
drop table if exists public.image_unlocks cascade;
drop table if exists public.character_reports cascade;
drop table if exists public.favorites cascade;
drop table if exists public.ever_memory cascade;
drop table if exists public.relationship_states cascade;
drop table if exists public.messages cascade;
drop table if exists public.conversations cascade;
drop table if exists public.characters cascade;

create table public.characters (
  id text primary key,
  slug text not null unique,
  name text not null,
  section text not null,
  category text not null,
  role text not null,
  relationship_pace text,
  tags text[] not null default '{}',
  title text not null,
  opening_scenario text not null,
  first_message text not null,
  relationship_context text not null,
  ai_profile jsonb not null default '{}'::jsonb,
  feature_flags jsonb not null default '{}'::jsonb,
  generated_seo jsonb not null default '{}'::jsonb,
  image_file text not null,
  image_url text not null,
  visibility text not null default 'public' check (visibility in ('public','unlisted','private')),
  is_public boolean not null default true,
  official boolean not null default false,
  creator_id uuid references auth.users(id) on delete set null,
  creator_username text,
  view_count bigint not null default 0,
  favorite_count bigint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index characters_section_idx on public.characters(section);
create index characters_category_idx on public.characters(category);
create index characters_role_idx on public.characters(role);
create index characters_active_public_idx on public.characters(is_active, is_public);
create index characters_tags_gin_idx on public.characters using gin(tags);
create index characters_name_search_idx on public.characters using gin(to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(title,'') || ' ' || coalesce(role,'')));

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id text not null references public.characters(id) on delete cascade,
  title text,
  memory_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, character_id)
);
create index conversations_user_updated_idx on public.conversations(user_id, updated_at desc);
create index conversations_character_idx on public.conversations(character_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','character','system','gift')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  input_tokens integer,
  output_tokens integer,
  model_id text,
  created_at timestamptz not null default now()
);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at);

create table public.ever_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id text not null references public.characters(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  memory_type text not null check (memory_type in ('fact','preference','routine','inside_joke','promise','event','conflict','repair','relationship_shift','open_thread')),
  content text not null,
  importance integer not null default 50 check (importance between 0 and 100),
  source_message_id uuid references public.messages(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ever_memory_lookup_idx on public.ever_memory(user_id, character_id, importance desc, updated_at desc);
create unique index ever_memory_dedupe_idx on public.ever_memory(user_id, character_id, memory_type, md5(lower(trim(content))));

create table public.relationship_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id text not null references public.characters(id) on delete cascade,
  stage text not null default 'new',
  trust integer not null default 0,
  affection integer not null default 0,
  comfort integer not null default 0,
  conflict integer not null default 0,
  summary text not null default '',
  emotional_state text not null default '',
  open_threads text[] not null default '{}',
  important_promises text[] not null default '{}',
  important_events text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, character_id)
);

create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id text not null references public.characters(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, character_id)
);

create table public.character_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  character_id text not null references public.characters(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.image_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id text not null references public.characters(id) on delete cascade,
  slot_key text not null,
  image_url text,
  provider text,
  provider_job_id text,
  created_at timestamptz not null default now(),
  unique(user_id, character_id, slot_key)
);

-- RLS
alter table public.characters enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.ever_memory enable row level security;
alter table public.relationship_states enable row level security;
alter table public.favorites enable row level security;
alter table public.character_reports enable row level security;
alter table public.image_unlocks enable row level security;

create policy characters_public_read on public.characters
for select using (is_active = true and is_public = true and visibility = 'public');

create policy conversations_own_all on public.conversations
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy messages_own_read on public.messages
for select using (exists (
  select 1 from public.conversations c
  where c.id = conversation_id and c.user_id = auth.uid()
));
create policy messages_own_insert on public.messages
for insert with check (exists (
  select 1 from public.conversations c
  where c.id = conversation_id and c.user_id = auth.uid()
));

create policy ever_memory_own_all on public.ever_memory
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy relationship_states_own_all on public.relationship_states
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy favorites_own_all on public.favorites
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy reports_own_read on public.character_reports
for select using (auth.uid() = reporter_id);
create policy reports_own_insert on public.character_reports
for insert with check (auth.uid() = reporter_id);
create policy image_unlocks_own_all on public.image_unlocks
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

commit;
