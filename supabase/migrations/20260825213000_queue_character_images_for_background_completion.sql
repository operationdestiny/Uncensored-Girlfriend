alter table public.character_image_requests
  add column if not exists provider_model text,
  add column if not exists provider_queue_id text,
  add column if not exists provider_download_url text;

create index if not exists character_image_requests_processing_queue_idx
  on public.character_image_requests (status, created_at)
  where status = 'processing' and provider_queue_id is not null;
