-- Exact account lookup used only by EverBond's server-side
-- forgot-password endpoint. The browser never receives database access.

create or replace function public.everbond_account_email_exists(
  candidate_email text
)
returns boolean
language sql
stable
security definer
set search_path = auth, public, pg_temp
as $function$
  select exists (
    select 1
    from auth.users
    where lower(email) = lower(trim(candidate_email))
      and deleted_at is null
  );
$function$;

revoke all on function
  public.everbond_account_email_exists(text)
  from public;

revoke all on function
  public.everbond_account_email_exists(text)
  from anon;

revoke all on function
  public.everbond_account_email_exists(text)
  from authenticated;

grant execute on function
  public.everbond_account_email_exists(text)
  to service_role;
