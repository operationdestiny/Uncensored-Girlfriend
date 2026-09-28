begin;

-- Existing user-created public companions become private, link-accessible
-- companions. They are not deleted and their existing chat URLs remain valid.
update public.characters
set
  visibility = 'unlisted',
  is_public = false,
  section = case
    when section is null or section = 'Public Creations'
      then 'My Companions'
    else section
  end,
  generated_seo =
    coalesce(generated_seo, '{}'::jsonb) ||
    jsonb_build_object('indexable', false),
  quality_control =
    coalesce(quality_control, '{}'::jsonb) ||
    jsonb_build_object('public_listing_disabled', true),
  updated_at = now()
where creator_id is not null
  and coalesce(official, false) = false
  and (
    visibility = 'public'
    or is_public = true
  );

-- Enforce the rule at the database boundary as well as in the API. No future
-- user-created companion can be inserted or updated into a public listing.
create or replace function public.enforce_private_user_characters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.creator_id is not null and coalesce(new.official, false) = false then
    if new.visibility = 'public' then
      new.visibility := 'unlisted';
    elsif new.visibility is null or new.visibility not in ('private', 'unlisted') then
      new.visibility := 'private';
    end if;

    new.is_public := false;

    if new.section is null or new.section = 'Public Creations' then
      new.section := 'My Companions';
    end if;

    new.generated_seo :=
      coalesce(new.generated_seo, '{}'::jsonb) ||
      jsonb_build_object('indexable', false);

    new.quality_control :=
      coalesce(new.quality_control, '{}'::jsonb) ||
      jsonb_build_object('public_listing_disabled', true);
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_private_user_characters_trigger
on public.characters;

create trigger enforce_private_user_characters_trigger
before insert or update of
  creator_id,
  official,
  visibility,
  is_public,
  section,
  generated_seo,
  quality_control
on public.characters
for each row
execute function public.enforce_private_user_characters();

notify pgrst, 'reload schema';

commit;
