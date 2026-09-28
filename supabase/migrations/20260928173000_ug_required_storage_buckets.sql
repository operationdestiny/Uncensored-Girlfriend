-- Original, empty storage for the independently owned platform.
-- Never copy assets or objects from another Supabase project.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values
  ('character-assets','character-assets',true,10485760,array['image/jpeg','image/png','image/webp','image/gif']::text[]),
  ('character-gallery','character-gallery',false,10485760,array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do nothing;

-- Only server-side service_role writes either bucket.
-- Public assets intentionally allow unauthenticated downloads; private gallery
-- media is accessed through server-generated short-lived signed URLs.
