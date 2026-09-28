-- EverBond V108 base schema.
-- Supabase is the source of truth for auth, characters, chat, subscriptions mirror, and Ever Memory.

create extension if not exists pgcrypto;

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  seed_id text unique,
  slug text unique not null,
  name text not null,
  archetype text not null,
  category text,
  section text,
  image_file text,
  image_url text,
  tagline text not null,
  description text not null,
  opening_message text not null,
  tags text[] default '{}',
  relationship_pace text,
  relationship_context text,
  ai_profile jsonb default '{}'::jsonb,
  generated_seo jsonb default '{}'::jsonb,
  feature_flags jsonb default '{}'::jsonb,
  character_card jsonb not null default '{}'::jsonb,
  is_seed boolean default false,
  visibility text default 'public' check (visibility in ('public', 'private')),
  is_public boolean default true,
  view_count integer default 0,
  creator_username text,
  official boolean default false,
  voice_gender text default 'neutral',
  creator_user_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists characters_seed_id_idx on public.characters(seed_id);
create index if not exists characters_slug_idx on public.characters(slug);
create index if not exists characters_category_idx on public.characters(category);
create index if not exists characters_section_idx on public.characters(section);
create index if not exists characters_role_idx on public.characters(archetype);
create index if not exists characters_is_public_idx on public.characters(is_public);
create index if not exists characters_tags_gin_idx on public.characters using gin(tags);

create table if not exists public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  anon_id text unique not null,
  ip_hash text,
  user_agent_hash text,
  free_message_count integer default 0,
  created_at timestamptz default now(),
  last_seen_at timestamptz default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  guest_session_id uuid references public.guest_sessions(id),
  user_id uuid,
  character_id uuid references public.characters(id),
  memory_state jsonb default '{
    "story_summary": "",
    "user_facts": [],
    "relationship_state": "New bond",
    "emotional_state": "",
    "open_threads": [],
    "important_promises": [],
    "important_events": []
  }',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'character', 'system')),
  content text not null,
  input_tokens integer default 0,
  output_tokens integer default 0,
  model_id text,
  created_at timestamptz default now()
);

create table if not exists public.profiles (
  user_id uuid primary key,
  email text,
  username text unique,
  plan text default 'free',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  paddle_customer_id text,
  paddle_subscription_id text unique,
  plan text check (plan in ('standard', 'premium', 'elite')),
  status text not null,
  monthly_message_limit integer not null,
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.ever_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  character_id uuid references public.characters(id) on delete cascade,
  memory_type text not null check (memory_type in ('fact','routine','promise','inside_joke','emotional_event','relationship_shift','preference','open_thread')),
  content text not null,
  importance integer default 3 check (importance between 1 and 5),
  source_message_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.relationship_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  character_id uuid references public.characters(id) on delete cascade,
  stage text default 'New bond',
  trust integer default 0,
  affection integer default 0,
  comfort integer default 0,
  conflict integer default 0,
  summary text default '',
  open_threads text[] default '{}',
  updated_at timestamptz default now(),
  unique(user_id, character_id)
);

create table if not exists public.image_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  character_id uuid references public.characters(id) on delete cascade,
  slot integer not null check (slot between 1 and 10),
  image_url text,
  prompt text,
  provider text,
  created_at timestamptz default now(),
  unique(user_id, character_id, slot)
);

create table if not exists public.character_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  character_id uuid references public.characters(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_id, character_id)
);

create table if not exists public.character_reports (
  id uuid primary key default gen_random_uuid(),
  character_id uuid references public.characters(id) on delete cascade,
  reporter_user_id uuid,
  reason text not null,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.character_share_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  character_id uuid references public.characters(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists public.admin_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

insert into public.admin_settings (key, value)
values
  ('billing_provider', '"paddle"'),
  ('chats_enabled', 'true'),
  ('free_trial_enabled', 'true'),
  ('character_creation_enabled', 'true'),
  ('subscriptions_enabled', 'true'),
  ('active_model_id', '"everbond-model-not-configured"'),
  ('ai_provider_locked', 'false'),
  ('image_provider_locked', 'false'),
  ('tts_provider_locked', 'false'),
  ('voice_call_provider_locked', 'false')
on conflict (key) do update set value = excluded.value, updated_at = now();
