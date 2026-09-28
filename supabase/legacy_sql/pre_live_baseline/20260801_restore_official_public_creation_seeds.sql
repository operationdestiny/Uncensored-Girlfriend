-- Restore the original 384 Public Creations seed characters as official
-- EverBond characters under the More for You Discover tab.
--
-- This intentionally changes ONLY listing/ownership flags. It does not rewrite
-- character content, IDs, slugs, images, display_order, translations, memories,
-- conversations, tags, or any other character data.

begin;

update public.characters
set
  official = true,
  visibility = 'public',
  is_public = true,
  is_active = true,
  creator_username = null,
  updated_at = now()
where category = 'public-creations'
  and creator_id is null;

notify pgrst, 'reload schema';

commit;

-- Supabase SQL Editor should return 384 here. The order is still controlled by
-- the untouched display_order column, followed by id, exactly as the site query
-- already does.
select count(*)::integer as restored_official_public_creation_seeds
from public.characters
where category = 'public-creations'
  and creator_id is null
  and official = true
  and visibility = 'public'
  and is_public = true
  and is_active = true;
