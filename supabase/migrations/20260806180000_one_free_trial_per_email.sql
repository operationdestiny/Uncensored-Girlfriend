-- EverBond: one 20-message free trial per normalized email, permanently.
--
-- This migration intentionally retains only:
--   1. a SHA-256 fingerprint of lower(trim(email)); and
--   2. the UUID of the first Supabase Auth account that claimed that email.
--
-- It does not retain the readable email address or restore any deleted
-- account data. No device, IP, browser, payment, or other abuse signal is used.

begin;

create table if not exists public.free_trial_email_registry (
  email_hash text primary key
    check (email_hash ~ '^[0-9a-f]{64}$'),
  first_auth_user_id uuid not null,
  first_seen_at timestamptz not null default clock_timestamp()
);

comment on table public.free_trial_email_registry is
  'Permanent one-free-trial-per-email registry. Stores only a SHA-256 email fingerprint and the first Auth user UUID; it intentionally survives account deletion.';

alter table public.free_trial_email_registry
  enable row level security;

revoke all on table public.free_trial_email_registry
  from public;

revoke all on table public.free_trial_email_registry
  from anon;

revoke all on table public.free_trial_email_registry
  from authenticated;

grant select, insert, update
  on table public.free_trial_email_registry
  to service_role;

create or replace function public.free_trial_email_hash(
  p_email text
)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $function$
  select encode(
    sha256(
      convert_to(
        lower(btrim(p_email)),
        'UTF8'
      )
    ),
    'hex'
  );
$function$;

revoke all on function public.free_trial_email_hash(text)
  from public;

revoke all on function public.free_trial_email_hash(text)
  from anon;

revoke all on function public.free_trial_email_hash(text)
  from authenticated;

grant execute on function public.free_trial_email_hash(text)
  to service_role;

-- Preserve every active account's current trial state by assigning each
-- currently used email to its current Auth user before enforcement begins.
-- DISTINCT ON deterministically chooses the oldest account if duplicate
-- normalized emails somehow already exist.
insert into public.free_trial_email_registry (
  email_hash,
  first_auth_user_id,
  first_seen_at
)
select
  ranked.email_hash,
  ranked.id,
  ranked.first_seen_at
from (
  select distinct on (
    public.free_trial_email_hash(u.email)
  )
    public.free_trial_email_hash(u.email) as email_hash,
    u.id,
    coalesce(u.created_at, clock_timestamp()) as first_seen_at
  from auth.users as u
  where u.email is not null
    and btrim(u.email) <> ''
  order by
    public.free_trial_email_hash(u.email),
    u.created_at asc nulls last,
    u.id asc
) as ranked
on conflict (email_hash) do nothing;

create or replace function public.register_free_trial_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog, pg_temp
as $function$
declare
  v_email_hash text;
  v_first_auth_user_id uuid;
begin
  if new.email is null or btrim(new.email) = '' then
    return new;
  end if;

  v_email_hash := public.free_trial_email_hash(new.email);

  perform pg_advisory_xact_lock(
    hashtextextended(
      'everbond-free-trial-email:' || v_email_hash,
      0
    )
  );

  insert into public.free_trial_email_registry (
    email_hash,
    first_auth_user_id,
    first_seen_at
  )
  values (
    v_email_hash,
    new.id,
    coalesce(new.created_at, clock_timestamp())
  )
  on conflict (email_hash) do nothing;

  select r.first_auth_user_id
  into v_first_auth_user_id
  from public.free_trial_email_registry as r
  where r.email_hash = v_email_hash;

  -- On a recreated account, the profile may already exist (email change)
  -- or may be created shortly afterward (new signup). Update it now when
  -- present; the profile trigger below also enforces the rule on creation.
  if v_first_auth_user_id is distinct from new.id then
    update public.profiles as p
    set
      trial_messages_used = 20,
      trial_message_limit = 20,
      trial_status = 'ended',
      trial_started_at = coalesce(
        p.trial_started_at,
        clock_timestamp()
      ),
      trial_ended_at = coalesce(
        p.trial_ended_at,
        clock_timestamp()
      ),
      updated_at = clock_timestamp()
    where p.user_id = new.id;
  end if;

  return new;
end;
$function$;

revoke all on function public.register_free_trial_email()
  from public;

revoke all on function public.register_free_trial_email()
  from anon;

revoke all on function public.register_free_trial_email()
  from authenticated;

drop trigger if exists
  everbond_register_free_trial_email
  on auth.users;

create trigger everbond_register_free_trial_email
after insert or update of email
on auth.users
for each row
execute function public.register_free_trial_email();

create or replace function public.enforce_one_free_trial_per_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog, pg_temp
as $function$
declare
  v_email text;
  v_email_hash text;
  v_first_auth_user_id uuid;
begin
  select u.email
  into v_email
  from auth.users as u
  where u.id = new.user_id;

  if v_email is null or btrim(v_email) = '' then
    return new;
  end if;

  v_email_hash := public.free_trial_email_hash(v_email);

  perform pg_advisory_xact_lock(
    hashtextextended(
      'everbond-free-trial-email:' || v_email_hash,
      0
    )
  );

  insert into public.free_trial_email_registry (
    email_hash,
    first_auth_user_id
  )
  values (
    v_email_hash,
    new.user_id
  )
  on conflict (email_hash) do nothing;

  select r.first_auth_user_id
  into v_first_auth_user_id
  from public.free_trial_email_registry as r
  where r.email_hash = v_email_hash;

  if v_first_auth_user_id is distinct from new.user_id then
    new.trial_messages_used := 20;
    new.trial_message_limit := 20;
    new.trial_status := 'ended';
    new.trial_started_at := coalesce(
      new.trial_started_at,
      clock_timestamp()
    );
    new.trial_ended_at := coalesce(
      new.trial_ended_at,
      clock_timestamp()
    );
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_one_free_trial_per_email()
  from public;

revoke all on function public.enforce_one_free_trial_per_email()
  from anon;

revoke all on function public.enforce_one_free_trial_per_email()
  from authenticated;

drop trigger if exists
  everbond_enforce_one_free_trial_per_email
  on public.profiles;

create trigger everbond_enforce_one_free_trial_per_email
before insert or update
on public.profiles
for each row
execute function public.enforce_one_free_trial_per_email();

-- Apply the rule immediately to any active account whose normalized email
-- was already claimed by a different Auth user UUID.
update public.profiles as p
set
  trial_messages_used = 20,
  trial_message_limit = 20,
  trial_status = 'ended',
  trial_started_at = coalesce(
    p.trial_started_at,
    clock_timestamp()
  ),
  trial_ended_at = coalesce(
    p.trial_ended_at,
    clock_timestamp()
  ),
  updated_at = clock_timestamp()
from auth.users as u
join public.free_trial_email_registry as r
  on r.email_hash = public.free_trial_email_hash(u.email)
where u.id = p.user_id
  and u.email is not null
  and btrim(u.email) <> ''
  and r.first_auth_user_id is distinct from u.id;

commit;
