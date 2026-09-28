-- EverBond V108 character runtime cleanup.
-- Keeps Paddle Billing as the billing source and removes legacy Stripe mirror columns.

alter table if exists public.subscriptions drop column if exists stripe_customer_id;
alter table if exists public.subscriptions drop column if exists stripe_subscription_id;

alter table public.characters add column if not exists seed_id text unique;
alter table public.characters add column if not exists relationship_pace text;
alter table public.characters add column if not exists ai_profile jsonb default '{}'::jsonb;
alter table public.characters add column if not exists generated_seo jsonb default '{}'::jsonb;
alter table public.characters add column if not exists feature_flags jsonb default '{}'::jsonb;

create index if not exists characters_slug_idx on public.characters(slug);
create index if not exists characters_seed_id_idx on public.characters(seed_id);
create index if not exists characters_category_idx on public.characters(category);
create index if not exists characters_is_public_idx on public.characters(is_public);
