-- EverBond partner DROPP automatic creator onboarding.
--
-- A newly created DROPP Agency creator is legitimately still "pending" until the
-- recipient completes whatever identity/banking steps DROPP requires. EverBond should
-- nevertheless be allowed to reserve an already-earned Safe-to-Pay cashout once a real
-- DROPP creator profile ID exists. The actual transfer remains manual/fail-closed until
-- DROPP exposes a verified payout API, so pending onboarding never causes money to move.

begin;

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
  v_account public.partner_payout_accounts%rowtype;
  v_id uuid;
  v_ref text;
begin
  perform pg_advisory_xact_lock(hashtextextended('partner-payout-pool',0));
  -- Payout capacity is global. Reconcile every partner first so an earlier
  -- partner with stale entitlement cannot be skipped by the FIFO bank-cash gate.
  perform public.partner_reconcile_all();

  select * into v_partner from public.partners where id=p_partner_id for update;
  if not found then return jsonb_build_object('ok',false,'error','PARTNER_NOT_FOUND'); end if;
  if v_partner.status<>'active' or v_partner.agreement_accepted_at is null or v_partner.age_confirmed_at is null then
    return jsonb_build_object('ok',false,'error','PARTNERSHIP_NOT_ACTIVE');
  end if;
  select * into v_terms from public.partner_terms_versions where id=v_partner.terms_version_id;
  if p_amount_minor < v_terms.payout_minimum_minor then
    return jsonb_build_object('ok',false,'error','PAYOUT_BELOW_MINIMUM','minimumMinor',v_terms.payout_minimum_minor);
  end if;

  -- Creator creation/invitation is now automatic. A returned provider_creator_id is
  -- enough to reserve the partner's earned cash while DROPP onboarding is pending.
  -- Restricted/disabled accounts remain blocked. The separate server payout adapter
  -- still requires true readiness before any future automatic money movement.
  select * into v_account from public.partner_payout_accounts where partner_id=p_partner_id;
  if not found or v_account.provider_creator_id is null or length(trim(v_account.provider_creator_id))=0 then
    return jsonb_build_object('ok',false,'error','PAYOUT_ONBOARDING_REQUIRED');
  end if;
  if v_account.onboarding_status in ('restricted','disabled') then
    return jsonb_build_object('ok',false,'error','PAYOUT_ONBOARDING_REQUIRED','onboardingStatus',v_account.onboarding_status);
  end if;

  select available_usd into v_available from public.partner_safe_to_pay_snapshot() where partner_id=p_partner_id;
  v_available := coalesce(v_available,0);
  if p_amount_minor > floor(v_available*100.0) then
    return jsonb_build_object('ok',false,'error','PAYOUT_EXCEEDS_AVAILABLE','availableMinor',floor(v_available*100.0));
  end if;

  v_ref := 'partner-'||p_partner_id::text||'-'||gen_random_uuid()::text;
  insert into public.partner_payouts(partner_id,amount_minor,status,provider,payout_reference)
  values(p_partner_id,p_amount_minor,'reserved','dropp',v_ref)
  returning id into v_id;

  return jsonb_build_object('ok',true,'payoutId',v_id,'payoutReference',v_ref,'amountMinor',p_amount_minor);
end;
$$;

revoke execute on function public.partner_request_payout(uuid,integer) from public,anon,authenticated;
grant execute on function public.partner_request_payout(uuid,integer) to service_role;

commit;
