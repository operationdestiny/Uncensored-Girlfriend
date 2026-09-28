-- Run this only after successfully running:
-- supabase/migrations/20260803013000_finalize_media_pricing_and_video_recovery.sql
-- in the Supabase SQL Editor.

insert into supabase_migrations.schema_migrations (
  version,
  name,
  statements
)
values (
  '20260803013000',
  'finalize_media_pricing_and_video_recovery',
  array[]::text[]
)
on conflict (version) do update
set name = excluded.name;
