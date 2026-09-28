-- EverBond V108 real character import readiness.
-- Keeps stable seed IDs from the JSON while preserving the existing UUID primary key.

alter table public.characters add column if not exists seed_id text unique;
alter table public.characters add column if not exists image_file text;
alter table public.characters add column if not exists section text;
alter table public.characters add column if not exists relationship_pace text;
alter table public.characters add column if not exists relationship_context text;
alter table public.characters add column if not exists ai_profile jsonb default '{}'::jsonb;
alter table public.characters add column if not exists generated_seo jsonb default '{}'::jsonb;
alter table public.characters add column if not exists feature_flags jsonb default '{}'::jsonb;
alter table public.characters add column if not exists updated_at timestamptz default now();

alter table if exists public.subscriptions drop column if exists stripe_customer_id;
alter table if exists public.subscriptions drop column if exists stripe_subscription_id;

create index if not exists characters_seed_id_idx on public.characters(seed_id);
create index if not exists characters_slug_idx on public.characters(slug);
create index if not exists characters_category_idx on public.characters(category);
create index if not exists characters_section_idx on public.characters(section);
create index if not exists characters_role_idx on public.characters(archetype);
create index if not exists characters_is_public_idx on public.characters(is_public);
create index if not exists characters_tags_gin_idx on public.characters using gin(tags);
