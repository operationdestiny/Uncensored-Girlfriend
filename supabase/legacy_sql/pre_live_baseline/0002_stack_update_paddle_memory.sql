-- EverBond V108 stack update: Supabase/Auth/Ever Memory + Paddle Billing.

alter table public.characters add column if not exists seed_id text unique;
alter table public.characters add column if not exists relationship_pace text;
alter table public.characters add column if not exists ai_profile jsonb default '{}'::jsonb;
alter table public.characters add column if not exists generated_seo jsonb default '{}'::jsonb;
alter table public.characters add column if not exists feature_flags jsonb default '{}'::jsonb;

alter table public.subscriptions add column if not exists paddle_customer_id text;
alter table public.subscriptions add column if not exists paddle_subscription_id text unique;
alter table public.subscriptions add column if not exists updated_at timestamptz default now();

create table if not exists public.profiles (
  user_id uuid primary key,
  email text,
  username text unique,
  plan text default 'free',
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

insert into public.admin_settings (key, value)
values
  ('billing_provider', '"paddle"'),
  ('ai_provider_locked', 'false'),
  ('image_provider_locked', 'false'),
  ('tts_provider_locked', 'false'),
  ('voice_call_provider_locked', 'false')
on conflict (key) do update set value = excluded.value, updated_at = now();
