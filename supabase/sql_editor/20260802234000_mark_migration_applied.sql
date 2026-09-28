-- Run this only after successfully running:
-- supabase/migrations/20260802234000_character_image_video_gallery.sql
-- in the Supabase SQL Editor.
--
-- This records the manually executed migration so `migration list` continues
-- to show GitHub and the live Supabase project as aligned.

insert into supabase_migrations.schema_migrations (
  version,
  name,
  statements
)
values (
  '20260802234000',
  'character_image_video_gallery',
  array[]::text[]
)
on conflict (version) do update
set name = excluded.name;
