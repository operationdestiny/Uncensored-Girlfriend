-- EverBond pre-import migration: Option A character IDs + paginated runtime + memory/billing support.
-- IMPORTANT: Run before importing production characters. This migration resets character-dependent tables.

begin;

-- Remove character-dependent tables created by earlier scaffolds.
drop table if exists public.image_unlocks cascade;
drop table if exists public.relationship_states cascade;
drop table if exists public.ever_memory cascade;
drop table if exists public.messages cascade;
drop table if exists public.conversations cascade;
drop table if exists public.character_favorites cascade;
drop table if exists public.character_reports cascade;
drop table if exists public.character_share_events cascade;
drop table if exists public.characters cascade;

create table public.characters (
  id text primary key,
  slug text unique not null,
  name text not null,
  section text not null,
  category text not null,
  role text not null,
  relationship_pace text,
  tags text[] not null default '{}',
  title text not null,
  opening_scenario text not null,
  first_message text not null,
  relationship_context text not null default '',
  ai_profile jsonb not null default '{}'::jsonb,
  feature_flags jsonb not null default '{}'::jsonb,
  generated_seo jsonb not null default '{}'::jsonb,
  image_file text not null,
  image_url text not null,
  visibility text not null default 'public' check (visibility in ('public','private','unlisted')),
  is_public boolean not null default true,
  official boolean not null default true,
  creator_user_id uuid,
  creator_username text,
  view_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index characters_section_idx on public.characters(section);
create index characters_category_idx on public.characters(category);
create index characters_role_idx on public.characters(role);
create index characters_public_idx on public.characters(is_public, id);
create index characters_tags_gin_idx on public.characters using gin(tags);
create index characters_name_search_idx on public.characters using gin(to_tsvector('simple', name || ' ' || title || ' ' || opening_scenario));

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  guest_session_id uuid references public.guest_sessions(id) on delete set null,
  user_id uuid,
  character_id text not null references public.characters(id) on delete cascade,
  memory_state jsonb not null default '{
    "story_summary": "",
    "user_facts": [],
    "relationship_state": "New bond",
    "emotional_state": "",
    "open_threads": [],
    "important_promises": [],
    "important_events": []
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_user_character_idx on public.conversations(user_id, character_id, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','character','system','gift')),
  content text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  model_id text,
  created_at timestamptz not null default now()
);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at);

create table public.ever_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  character_id text not null references public.characters(id) on delete cascade,
  memory_type text not null check (memory_type in ('fact','routine','promise','inside_joke','emotional_event','relationship_shift','preference','open_thread')),
  content text not null,
  importance integer not null default 3 check (importance between 1 and 5),
  source_message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ever_memory_lookup_idx on public.ever_memory(user_id, character_id, importance desc, updated_at desc);

create table public.relationship_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  character_id text not null references public.characters(id) on delete cascade,
  stage text not null default 'New bond',
  trust integer not null default 0,
  affection integer not null default 0,
  comfort integer not null default 0,
  conflict integer not null default 0,
  summary text not null default '',
  emotional_state text not null default '',
  open_threads text[] not null default '{}',
  important_promises text[] not null default '{}',
  important_events text[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique(user_id, character_id)
);

create table public.character_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  character_id text not null references public.characters(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, character_id)
);

create table public.character_reports (
  id uuid primary key default gen_random_uuid(),
  character_id text not null references public.characters(id) on delete cascade,
  reporter_user_id uuid,
  reason text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.character_share_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  character_id text not null references public.characters(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.image_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  character_id text not null references public.characters(id) on delete cascade,
  slot integer not null check (slot between 1 and 10),
  image_url text,
  prompt text,
  provider text,
  created_at timestamptz not null default now(),
  unique(user_id, character_id, slot)
);

create table if not exists public.paddle_events (
  event_id text primary key,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

-- RLS: public catalog; private user data is isolated.
alter table public.characters enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.ever_memory enable row level security;
alter table public.relationship_states enable row level security;
alter table public.character_favorites enable row level security;
alter table public.image_unlocks enable row level security;

create policy characters_public_read on public.characters for select using (is_public = true);
create policy conversations_owner_all on public.conversations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy messages_owner_all on public.messages for all using (
  exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid())
) with check (
  exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid())
);
create policy ever_memory_owner_all on public.ever_memory for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy relationship_states_owner_all on public.relationship_states for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy favorites_owner_all on public.character_favorites for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy image_unlocks_owner_all on public.image_unlocks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

commit;
