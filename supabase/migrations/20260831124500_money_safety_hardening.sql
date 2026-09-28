begin;

-- ============================================================================
-- MONEY SAFETY HARDENING
-- 1) Reserve chat provider cost as soon as a free/included text turn is
--    reserved, so a provider attempt that later fails can never be treated as
--    cost-free by Safe to Withdraw.
-- 2) Future EverShop gift purchases carry no artificial AI-provider cost at
--    purchase time; the actual AI response is accounted when the gift is sent
--    through the normal text-chat cost reconciliation.
-- 3) Image provider fallback is raised to the 2K-safe amount so an unexpected
--    WAVESPEED_IMAGE_RESOLUTION=2k setting cannot overstate withdrawable profit.
-- Voice accounting is deliberately untouched.
-- ============================================================================

create or replace function public.platform_account_chat_reservation_fallback()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rate public.platform_feature_cost_rates%rowtype;
  v_event_key text;
  v_reason text;
  v_feature text;
begin
  if new.status <> 'reserved' then
    return new;
  end if;

  if new.source = 'trial' then
    v_event_key := 'trial-chat:' || new.request_id::text;
    v_reason := 'trial_chat_message';
    v_feature := 'Free-trial chat message';
  elsif new.source = 'evercoin_five_included' then
    v_event_key := 'five-chat:' || new.request_id::text;
    v_reason := 'chat_message';
    v_feature := 'Chat message included in five-message meter';
  else
    return new;
  end if;

  select *
  into v_rate
  from public.platform_feature_cost_rates
  where reason = 'chat_message';

  if found and v_rate.cost_usd > 0 then
    insert into public.platform_provider_cost_events (
      event_key,
      user_id,
      reason,
      reference_id,
      provider,
      feature,
      cost_usd,
      metadata
    )
    values (
      v_event_key,
      new.user_id,
      v_reason,
      new.request_id::text,
      v_rate.provider,
      v_feature,
      v_rate.cost_usd,
      jsonb_build_object(
        'source', new.source,
        'accounting_state', 'reservation_fallback_before_provider_attempt'
      )
    )
    on conflict (event_key) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.platform_account_chat_reservation_fallback()
from public, anon, authenticated;
grant execute on function public.platform_account_chat_reservation_fallback()
to service_role;

drop trigger if exists platform_account_chat_reservation_fallback_trigger
on public.message_credit_usage;

create trigger platform_account_chat_reservation_fallback_trigger
after insert on public.message_credit_usage
for each row
execute function public.platform_account_chat_reservation_fallback();


-- Gift purchase itself makes no AI/provider request. The gift's eventual
-- character reaction is a normal text-chat turn and is provider-cost reconciled
-- there. Keep historical gift reserves untouched; make future purchases exact.
update public.platform_feature_cost_rates
set
  provider = 'none',
  feature = 'EverShop gift purchase (no provider call)',
  cost_usd = 0,
  notes = 'No provider request occurs when a gift is purchased. The actual Gemma + Ever Memory cost is accounted when the gift is sent through text chat.',
  updated_at = clock_timestamp()
where reason = 'evershop_gift_purchase';

create or replace function public.platform_account_zero_cost_gift_purchase()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.amount < 0 and new.reason = 'evershop_gift_purchase' then
    insert into public.platform_provider_cost_events (
      event_key,
      evercoin_transaction_id,
      user_id,
      reason,
      reference_id,
      provider,
      feature,
      cost_usd,
      reversed_usd,
      metadata,
      created_at,
      updated_at
    )
    values (
      'evercoin:' || new.id::text,
      new.id,
      new.user_id,
      new.reason,
      new.reference_id,
      'none',
      'EverShop gift purchase (no provider call)',
      0,
      0,
      jsonb_build_object(
        'accounting_state', 'no_provider_call_at_purchase',
        'ai_reaction_accounted_by', 'text_chat_when_gift_is_sent'
      ),
      new.created_at,
      clock_timestamp()
    )
    on conflict (event_key) do update set
      provider = excluded.provider,
      feature = excluded.feature,
      cost_usd = 0,
      reversed_usd = 0,
      metadata = excluded.metadata,
      updated_at = clock_timestamp();
  end if;

  return new;
end;
$$;

revoke all on function public.platform_account_zero_cost_gift_purchase()
from public, anon, authenticated;
grant execute on function public.platform_account_zero_cost_gift_purchase()
to service_role;

drop trigger if exists zz_platform_account_zero_cost_gift_purchase_trigger
on public.evercoin_transactions;

create trigger zz_platform_account_zero_cost_gift_purchase_trigger
after insert on public.evercoin_transactions
for each row
execute function public.platform_account_zero_cost_gift_purchase();


-- The runtime defaults to 1K ($0.045), but it can be switched to 2K by the
-- WAVESPEED_IMAGE_RESOLUTION environment variable. Protect at the 2K amount
-- until image generation is reconciled per request.
update public.platform_feature_cost_rates
set
  provider = 'wavespeed',
  feature = 'Image generation safety reserve',
  cost_usd = 0.09000000,
  notes = 'Fail-safe Seedream V5.0 Pro Edit reserve covering 2K. Runtime defaults to 1K; this higher fallback prevents a 2K environment override from inflating Safe to Withdraw.',
  updated_at = clock_timestamp()
where reason = 'character_image_generation';

commit;
