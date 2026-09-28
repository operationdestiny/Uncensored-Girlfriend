-- EverBond affiliate payouts: replace DROPP creator onboarding with Checkbook.io.
-- Customer EverCoin payments remain on DROPP; this migration only changes partner payouts.
--
-- Money safety principles preserved:
--   * partner_request_payout still reconciles all partner economics first
--   * only bank-backed Safe-to-Pay commission can be reserved
--   * reserved/processing/paid payouts remain protected from owner withdrawals
--   * a Checkbook funding/configuration failure remains RESERVED (never silently released)
--   * provider IDs remain unique and API submissions use persistent idempotency keys

begin;

alter table public.partner_payout_accounts
  alter column provider set default 'checkbook';

alter table public.partner_payouts
  alter column provider set default 'checkbook';

alter table public.partner_payouts
  add column if not exists idempotency_key text,
  add column if not exists recipient_amount_minor integer,
  add column if not exists provider_fee_minor integer not null default 0,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'partner_payouts_provider_fee_nonnegative'
      and conrelid = 'public.partner_payouts'::regclass
  ) then
    alter table public.partner_payouts
      add constraint partner_payouts_provider_fee_nonnegative
      check (provider_fee_minor >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'partner_payouts_recipient_amount_nonnegative'
      and conrelid = 'public.partner_payouts'::regclass
  ) then
    alter table public.partner_payouts
      add constraint partner_payouts_recipient_amount_nonnegative
      check (recipient_amount_minor is null or recipient_amount_minor >= 0);
  end if;
end $$;

create unique index if not exists partner_payout_idempotency_uidx
  on public.partner_payouts(idempotency_key)
  where idempotency_key is not null;

-- Checkbook pays external recipients by email; no provider creator account is required.
-- Existing partner account rows become informational readiness rows only.
update public.partner_payout_accounts pa
set provider = 'checkbook',
    provider_creator_id = null,
    onboarding_status = case
      when exists (
        select 1 from public.partners p
        where p.id = pa.partner_id
          and p.contact_email is not null
          and length(trim(p.contact_email)) > 0
      ) then 'ready'
      else 'not_started'
    end,
    payout_enabled = exists (
      select 1 from public.partners p
      where p.id = pa.partner_id
        and p.contact_email is not null
        and length(trim(p.contact_email)) > 0
    ),
    provider_metadata = coalesce(pa.provider_metadata,'{}'::jsonb)
      || jsonb_build_object('migratedTo','checkbook','migratedAt',now()),
    updated_at = now();

insert into public.partner_payout_accounts(
  partner_id,provider,provider_creator_id,onboarding_status,payout_enabled,provider_metadata,created_at,updated_at
)
select p.id,'checkbook',null,
  case when p.contact_email is not null and length(trim(p.contact_email))>0 then 'ready' else 'not_started' end,
  (p.contact_email is not null and length(trim(p.contact_email))>0),
  jsonb_build_object('providerPurpose','external-email-payout'),now(),now()
from public.partners p
where not exists (
  select 1 from public.partner_payout_accounts pa where pa.partner_id=p.id
);

-- The old DROPP Agency adapter never sent arbitrary affiliate transfers. Any still-reserved
-- DROPP row without a provider payout ID is therefore safe to migrate into the Checkbook queue.
update public.partner_payouts
set provider = 'checkbook',
    idempotency_key = coalesce(idempotency_key,'everbond-partner-'||id::text),
    failure_code = 'CHECKBOOK_MIGRATED_RESERVED',
    failure_message = 'Migrated from the retired DROPP affiliate payout queue to Checkbook.',
    provider_metadata = coalesce(provider_metadata,'{}'::jsonb)
      || jsonb_build_object('migratedFrom','dropp','migratedAt',now()),
    updated_at = now()
where provider='dropp'
  and status='reserved'
  and provider_payout_id is null;

-- Every Checkbook row gets a durable idempotency key. The key is reused for retries during
-- Checkbook's 24-hour idempotency window.
update public.partner_payouts
set idempotency_key = 'everbond-partner-'||id::text
where provider='checkbook' and idempotency_key is null;

create or replace function public.partner_request_payout(p_partner_id uuid, p_amount_minor integer)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_partner public.partners%rowtype;
  v_terms public.partner_terms_versions%rowtype;
  v_available numeric:=0;
  v_id uuid:=gen_random_uuid();
  v_ref text;
  v_key text;
begin
  perform pg_advisory_xact_lock(hashtextextended('partner-payout-pool',0));
  perform public.partner_reconcile_all();

  select * into v_partner from public.partners where id=p_partner_id for update;
  if not found then return jsonb_build_object('ok',false,'error','PARTNER_NOT_FOUND'); end if;
  if v_partner.status<>'active' or v_partner.agreement_accepted_at is null or v_partner.age_confirmed_at is null then
    return jsonb_build_object('ok',false,'error','PARTNERSHIP_NOT_ACTIVE');
  end if;
  if v_partner.contact_email is null or length(trim(v_partner.contact_email))=0 then
    return jsonb_build_object('ok',false,'error','PARTNER_EMAIL_REQUIRED');
  end if;

  select * into v_terms from public.partner_terms_versions where id=v_partner.terms_version_id;
  if p_amount_minor < v_terms.payout_minimum_minor then
    return jsonb_build_object('ok',false,'error','PAYOUT_BELOW_MINIMUM','minimumMinor',v_terms.payout_minimum_minor);
  end if;

  select available_usd into v_available
  from public.partner_safe_to_pay_snapshot()
  where partner_id=p_partner_id;
  v_available := coalesce(v_available,0);
  if p_amount_minor > floor(v_available*100.0) then
    return jsonb_build_object('ok',false,'error','PAYOUT_EXCEEDS_AVAILABLE','availableMinor',floor(v_available*100.0));
  end if;

  v_ref := 'partner-'||p_partner_id::text||'-'||v_id::text;
  v_key := 'everbond-partner-'||v_id::text;

  insert into public.partner_payouts(
    id,partner_id,amount_minor,status,provider,payout_reference,idempotency_key,provider_metadata
  ) values (
    v_id,p_partner_id,p_amount_minor,'reserved','checkbook',v_ref,v_key,
    jsonb_build_object('requestedProvider','checkbook')
  );

  insert into public.partner_payout_accounts(
    partner_id,provider,provider_creator_id,onboarding_status,payout_enabled,provider_metadata,updated_at
  ) values (
    p_partner_id,'checkbook',null,'ready',true,
    jsonb_build_object('providerPurpose','external-email-payout'),now()
  )
  on conflict(partner_id) do update
  set provider='checkbook', provider_creator_id=null, onboarding_status='ready', payout_enabled=true,
      provider_metadata=coalesce(public.partner_payout_accounts.provider_metadata,'{}'::jsonb)
        || jsonb_build_object('providerPurpose','external-email-payout'),
      updated_at=now();

  return jsonb_build_object(
    'ok',true,'payoutId',v_id,'payoutReference',v_ref,'amountMinor',p_amount_minor,'idempotencyKey',v_key
  );
end;
$$;

-- Claim one payout for an external Checkbook submission. This is deliberately separate from
-- partner_request_payout so the bank-safe reservation commits before any network call.
create or replace function public.partner_claim_checkbook_payout(p_payout_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_payout public.partner_payouts%rowtype;
  v_now timestamptz:=now();
begin
  perform pg_advisory_xact_lock(hashtextextended('partner-checkbook-payout:'||p_payout_id::text,0));
  select * into v_payout from public.partner_payouts where id=p_payout_id for update;

  if not found then return jsonb_build_object('ok',false,'error','PAYOUT_NOT_FOUND'); end if;
  if v_payout.provider<>'checkbook' then return jsonb_build_object('ok',false,'error','PAYOUT_PROVIDER_MISMATCH'); end if;
  if v_payout.provider_payout_id is not null then return jsonb_build_object('ok',false,'error','PAYOUT_ALREADY_SUBMITTED'); end if;

  if v_payout.status='reserved' then
    null;
  elsif v_payout.status='processing' and v_payout.failure_code='CHECKBOOK_SUBMISSION_UNKNOWN' then
    if v_payout.requested_at < v_now-interval '23 hours' then
      return jsonb_build_object('ok',false,'error','PAYOUT_RETRY_WINDOW_EXPIRED');
    end if;
    if v_payout.updated_at > v_now-interval '45 seconds' then
      return jsonb_build_object('ok',false,'error','PAYOUT_RETRY_TOO_SOON');
    end if;
  else
    return jsonb_build_object('ok',false,'error','PAYOUT_NOT_SUBMITTABLE','status',v_payout.status);
  end if;

  update public.partner_payouts
  set status='processing',
      processing_at=coalesce(processing_at,v_now),
      failure_code='CHECKBOOK_SUBMITTING',
      failure_message=null,
      updated_at=v_now
  where id=p_payout_id;

  return jsonb_build_object(
    'ok',true,
    'payoutId',v_payout.id,
    'partnerId',v_payout.partner_id,
    'amountMinor',v_payout.amount_minor,
    'payoutReference',v_payout.payout_reference,
    'idempotencyKey',coalesce(v_payout.idempotency_key,'everbond-partner-'||v_payout.id::text)
  );
end;
$$;

revoke execute on function public.partner_request_payout(uuid,integer) from public,anon,authenticated;
grant execute on function public.partner_request_payout(uuid,integer) to service_role;
revoke execute on function public.partner_claim_checkbook_payout(uuid) from public,anon,authenticated;
grant execute on function public.partner_claim_checkbook_payout(uuid) to service_role;

commit;
