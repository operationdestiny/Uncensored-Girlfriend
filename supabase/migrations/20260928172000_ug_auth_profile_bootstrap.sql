-- Independent Uncensored Girlfriend Auth bootstrap.
-- Existing one-free-trial-per-email enforcement remains authoritative.
-- Only new Auth users are used; no old-company user data is imported.
create or replace function public.ug_sync_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, nullif(lower(btrim(new.email)), ''))
  on conflict (user_id) do update
    set email = excluded.email,
        updated_at = now()
    where public.profiles.email is distinct from excluded.email;
  return new;
end;
$$;

revoke all on function public.ug_sync_auth_profile()
  from public, anon, authenticated;

drop trigger if exists ug_sync_auth_profile on auth.users;

create trigger ug_sync_auth_profile
after insert or update of email on auth.users
for each row execute function public.ug_sync_auth_profile();
