begin;

-- Real-money accounting stays separate from the existing EverCoin ledger.
-- EverCoin remains the virtual-currency source of truth; these tables only
-- account for cash received, cash still backing unused EC, provider costs,
-- and owner withdrawals.

create table if not exists public.evercoin_cash_lots (
  id uuid primary key default gen_random_uuid(),
  payment_order_id uuid not null unique
    references public.evercoin_payment_orders(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  coins_granted bigint not null check (coins_granted > 0),
  coins_remaining bigint not null check (
    coins_remaining >= 0 and coins_remaining <= coins_granted
  ),
  gross_minor bigint not null check (gross_minor >= 0),
  net_minor bigint check (net_minor is null or net_minor >= 0),
  currency_code text not null default 'USD',
  dropp_order_id text not null unique,
  dropp_transaction_id text unique,
  status text not null default 'active'
    check (status in ('active', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists evercoin_cash_lots_user_fifo_idx
  on public.evercoin_cash_lots(user_id, status, created_at, id)
  where status = 'active' and coins_remaining > 0;

create table if not exists public.evercoin_cash_allocations (
  id uuid primary key default gen_random_uuid(),
  evercoin_transaction_id uuid not null
    references public.evercoin_transactions(id) on delete restrict,
  cash_lot_id uuid not null
    references public.evercoin_cash_lots(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  ec_amount bigint not null check (ec_amount > 0),
  ec_reversed bigint not null default 0
    check (ec_reversed >= 0 and ec_reversed <= ec_amount),
  created_at timestamptz not null default now(),
  unique (evercoin_transaction_id, cash_lot_id)
);

create index if not exists evercoin_cash_allocations_user_idx
  on public.evercoin_cash_allocations(user_id, created_at);

create table if not exists public.platform_feature_cost_rates (
  reason text primary key,
  provider text not null,
  feature text not null,
  cost_usd numeric(18,8) not null check (cost_usd >= 0),
  notes text,
  updated_at timestamptz not null default now()
);

-- Conservative management-accounting defaults. The fixed image/video values
-- correspond to the providers/models used by the current EverBond runtime.
-- Chat is intentionally buffered above a typical single short turn, and voice
-- is intentionally reserved at the full 35 EC/minute retail value until a
-- final realtime voice provider cost feed is wired.
insert into public.platform_feature_cost_rates (
  reason, provider, feature, cost_usd, notes
)
values
  (
    'chat_message',
    'venice',
    'Chat message',
    0.00500000,
    'Buffered per paid message; includes room for role-play token usage and memory overhead.'
  ),
  (
    'character_image_generation',
    'wavespeed',
    'Image generation',
    0.09000000,
    'Conservative Seedream V5 Pro Edit reserve; covers 2K. Set to 0.045 if production is confirmed at 1K/1.5K.'
  ),
  (
    'character_video_generation',
    'wavespeed',
    '10s video generation',
    0.26000000,
    'Seedance V1.5 Pro Spicy, 720p, 10 seconds, audio off.'
  ),
  (
    'voice_call_minute',
    'voice',
    'Voice call minute',
    0.35000000,
    'Conservative full-value reserve until final realtime voice provider billing is wired.'
  ),
  (
    'evershop_gift_purchase',
    'venice',
    'Gift interaction',
    0.00500000,
    'Small buffered AI-response reserve for the gift interaction.'
  )
on conflict (reason) do nothing;

create table if not exists public.platform_provider_cost_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  evercoin_transaction_id uuid
    references public.evercoin_transactions(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  reason text not null,
  reference_id text,
  provider text not null,
  feature text not null,
  cost_usd numeric(18,8) not null check (cost_usd >= 0),
  reversed_usd numeric(18,8) not null default 0
    check (reversed_usd >= 0 and reversed_usd <= cost_usd),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_provider_cost_events_created_idx
  on public.platform_provider_cost_events(created_at);

create table if not exists public.platform_owner_withdrawals (
  id uuid primary key default gen_random_uuid(),
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null default 'USD'
    check (currency_code = 'USD'),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists platform_owner_withdrawals_created_idx
  on public.platform_owner_withdrawals(created_at);

-- No browser/client access. The authenticated owner dashboard goes through a
-- server route using the service role after an explicit admin-email check.
alter table public.evercoin_cash_lots enable row level security;
alter table public.evercoin_cash_allocations enable row level security;
alter table public.platform_feature_cost_rates enable row level security;
alter table public.platform_provider_cost_events enable row level security;
alter table public.platform_owner_withdrawals enable row level security;

revoke all on public.evercoin_cash_lots from public, anon, authenticated;
revoke all on public.evercoin_cash_allocations from public, anon, authenticated;
revoke all on public.platform_feature_cost_rates from public, anon, authenticated;
revoke all on public.platform_provider_cost_events from public, anon, authenticated;
revoke all on public.platform_owner_withdrawals from public, anon, authenticated;

grant all on public.evercoin_cash_lots to service_role;
grant all on public.evercoin_cash_allocations to service_role;
grant all on public.platform_feature_cost_rates to service_role;
grant all on public.platform_provider_cost_events to service_role;
grant all on public.platform_owner_withdrawals to service_role;

-- Allocate paid EverCoin spending FIFO against real DROPP cash lots. This is
-- the key separation: EC stays in evercoin_transactions, while this table only
-- says which portion of real sale proceeds has been earned/released by usage.
create or replace function public.platform_account_evercoin_transaction()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_remaining bigint;
  v_take bigint;
  v_lot public.evercoin_cash_lots%rowtype;
  v_rate public.platform_feature_cost_rates%rowtype;
  v_allocation record;
  v_original_amount bigint;
  v_cost_reverse numeric(18,8);
begin
  if new.amount < 0 then
    -- Provider-cost budget event for the feature. Idempotent by transaction id.
    select * into v_rate
    from public.platform_feature_cost_rates
    where reason = new.reason;

    if found and v_rate.cost_usd > 0 then
      insert into public.platform_provider_cost_events (
        event_key,
        evercoin_transaction_id,
        user_id,
        reason,
        reference_id,
        provider,
        feature,
        cost_usd
      )
      values (
        'evercoin:' || new.id::text,
        new.id,
        new.user_id,
        new.reason,
        new.reference_id,
        v_rate.provider,
        v_rate.feature,
        v_rate.cost_usd
      )
      on conflict (event_key) do nothing;
    end if;

    v_remaining := abs(new.amount);

    for v_lot in
      select l.*
      from public.evercoin_cash_lots as l
      where l.user_id = new.user_id
        and l.status = 'active'
        and l.coins_remaining > 0
      order by l.created_at asc, l.id asc
      for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_remaining, v_lot.coins_remaining);

      insert into public.evercoin_cash_allocations (
        evercoin_transaction_id,
        cash_lot_id,
        user_id,
        ec_amount
      )
      values (
        new.id,
        v_lot.id,
        new.user_id,
        v_take
      )
      on conflict (evercoin_transaction_id, cash_lot_id) do nothing;

      update public.evercoin_cash_lots
      set
        coins_remaining = coins_remaining - v_take,
        updated_at = clock_timestamp()
      where id = v_lot.id;

      v_remaining := v_remaining - v_take;
    end loop;

    return new;
  end if;

  -- A failed/refunded feature returns EC. Put the cash obligation back into
  -- the same lots and reverse the matching provider-cost budget proportionally.
  if new.amount > 0
     and new.reference_id is not null
     and (
       new.reason ilike '%failed%'
       or new.reason ilike '%refund%'
       or new.reason ilike '%reversal%'
     )
  then
    v_remaining := new.amount;

    for v_allocation in
      select
        a.id as allocation_id,
        a.cash_lot_id,
        a.ec_amount,
        a.ec_reversed,
        t.id as original_transaction_id,
        t.amount as original_amount
      from public.evercoin_cash_allocations as a
      join public.evercoin_transactions as t
        on t.id = a.evercoin_transaction_id
      where t.user_id = new.user_id
        and t.reference_id = new.reference_id
        and t.amount < 0
        and a.ec_reversed < a.ec_amount
      order by t.created_at desc, a.created_at desc, a.id desc
      for update of a
    loop
      exit when v_remaining <= 0;

      v_take := least(
        v_remaining,
        v_allocation.ec_amount - v_allocation.ec_reversed
      );

      update public.evercoin_cash_allocations
      set ec_reversed = ec_reversed + v_take
      where id = v_allocation.allocation_id;

      update public.evercoin_cash_lots
      set
        coins_remaining = least(coins_granted, coins_remaining + v_take),
        updated_at = clock_timestamp()
      where id = v_allocation.cash_lot_id;

      v_original_amount := abs(v_allocation.original_amount);
      if v_original_amount > 0 then
        update public.platform_provider_cost_events
        set
          reversed_usd = least(
            cost_usd,
            reversed_usd + (
              cost_usd * v_take::numeric / v_original_amount::numeric
            )
          ),
          updated_at = clock_timestamp()
        where evercoin_transaction_id = v_allocation.original_transaction_id;
      end if;

      v_remaining := v_remaining - v_take;
    end loop;
  end if;

  return new;
end;
$$;

revoke all on function public.platform_account_evercoin_transaction() from public;
grant execute on function public.platform_account_evercoin_transaction() to service_role;

drop trigger if exists platform_account_evercoin_transaction_trigger
  on public.evercoin_transactions;
create trigger platform_account_evercoin_transaction_trigger
after insert on public.evercoin_transactions
for each row
execute function public.platform_account_evercoin_transaction();

-- Free-trial chat has no EverCoin debit but still incurs AI cost. Record the
-- configured chat provider budget when a trial message successfully completes.
create or replace function public.platform_account_trial_chat_cost()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rate public.platform_feature_cost_rates%rowtype;
begin
  if new.status = 'completed'
     and new.source = 'trial'
     and old.status is distinct from new.status
  then
    select * into v_rate
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
        'trial-chat:' || new.request_id::text,
        new.user_id,
        'trial_chat_message',
        new.request_id::text,
        v_rate.provider,
        'Free-trial chat message',
        v_rate.cost_usd,
        jsonb_build_object('source', 'trial')
      )
      on conflict (event_key) do nothing;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.platform_account_trial_chat_cost() from public;
grant execute on function public.platform_account_trial_chat_cost() to service_role;

drop trigger if exists platform_account_trial_chat_cost_trigger
  on public.message_credit_usage;
create trigger platform_account_trial_chat_cost_trigger
after update of status on public.message_credit_usage
for each row
execute function public.platform_account_trial_chat_cost();

-- One summary RPC serves today/week/month/year/all ranges plus the lifetime
-- SAFE TO WITHDRAW figure. Values are management-accounting USD amounts.
create or replace function public.platform_finance_summary(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
with
bounds as (
  select
    coalesce(p_from, '-infinity'::timestamptz) as from_at,
    coalesce(p_to, 'infinity'::timestamptz) as to_at
),
active_lots as (
  select l.*
  from public.evercoin_cash_lots l
  where l.status = 'active'
),
period_lots as (
  select l.*
  from active_lots l, bounds b
  where l.created_at >= b.from_at and l.created_at < b.to_at
),
lifetime_release as (
  select coalesce(sum(
    (a.ec_amount - a.ec_reversed)::numeric
    * l.net_minor::numeric
    / l.coins_granted::numeric
    / 100::numeric
  ), 0::numeric) as usd
  from public.evercoin_cash_allocations a
  join active_lots l on l.id = a.cash_lot_id
  where l.net_minor is not null
),
period_release as (
  select coalesce(sum(
    (a.ec_amount - a.ec_reversed)::numeric
    * l.net_minor::numeric
    / l.coins_granted::numeric
    / 100::numeric
  ), 0::numeric) as usd
  from public.evercoin_cash_allocations a
  join active_lots l on l.id = a.cash_lot_id
  cross join bounds b
  where l.net_minor is not null
    and a.created_at >= b.from_at
    and a.created_at < b.to_at
),
lifetime_provider as (
  select coalesce(sum(cost_usd - reversed_usd), 0::numeric) as usd
  from public.platform_provider_cost_events
),
period_provider as (
  select coalesce(sum(e.cost_usd - e.reversed_usd), 0::numeric) as usd
  from public.platform_provider_cost_events e, bounds b
  where e.created_at >= b.from_at and e.created_at < b.to_at
),
lifetime_withdrawals as (
  select coalesce(sum(amount_minor)::numeric / 100::numeric, 0::numeric) as usd
  from public.platform_owner_withdrawals
),
period_withdrawals as (
  select coalesce(sum(w.amount_minor)::numeric / 100::numeric, 0::numeric) as usd
  from public.platform_owner_withdrawals w, bounds b
  where w.created_at >= b.from_at and w.created_at < b.to_at
),
current_lots as (
  select
    coalesce(sum(gross_minor)::numeric / 100::numeric, 0::numeric) as gross_usd,
    coalesce(sum(net_minor) filter (where net_minor is not null)::numeric / 100::numeric, 0::numeric) as net_usd,
    coalesce(sum(gross_minor) filter (where net_minor is null)::numeric / 100::numeric, 0::numeric) as unreconciled_gross_usd,
    coalesce(sum(coins_remaining), 0)::bigint as outstanding_ec,
    coalesce(sum(coins_remaining) filter (where net_minor is null), 0)::bigint as unreconciled_ec,
    coalesce(sum(
      case when net_minor is not null then
        coins_remaining::numeric * net_minor::numeric
        / coins_granted::numeric / 100::numeric
      else 0::numeric end
    ), 0::numeric) as unused_reserve_usd,
    coalesce(sum(
      case when net_minor is not null then
        (gross_minor - net_minor)::numeric / 100::numeric
      else 0::numeric end
    ), 0::numeric) as processor_fees_usd
  from active_lots
),
period_sales as (
  select
    coalesce(sum(gross_minor)::numeric / 100::numeric, 0::numeric) as gross_usd,
    coalesce(sum(net_minor) filter (where net_minor is not null)::numeric / 100::numeric, 0::numeric) as net_usd,
    coalesce(sum(
      case when net_minor is not null then
        (gross_minor - net_minor)::numeric / 100::numeric
      else 0::numeric end
    ), 0::numeric) as fees_usd
  from period_lots
),
refunded as (
  select coalesce(sum(gross_minor)::numeric / 100::numeric, 0::numeric) as gross_usd
  from public.evercoin_cash_lots
  where status = 'refunded'
)
select jsonb_build_object(
  'current', jsonb_build_object(
    'grossSalesUsd', round(c.gross_usd, 2),
    'droppNetProceedsUsd', round(c.net_usd, 2),
    'processorFeesUsd', round(c.processor_fees_usd, 2),
    'unreconciledGrossUsd', round(c.unreconciled_gross_usd, 2),
    'outstandingEc', c.outstanding_ec,
    'unreconciledEc', c.unreconciled_ec,
    'unusedEcReserveUsd', round(c.unused_reserve_usd, 2),
    'cashReleasedByUsageUsd', round(lr.usd, 2),
    'providerCostsUsd', round(lp.usd, 2),
    'ownerWithdrawalsUsd', round(lw.usd, 2),
    'earnedProfitUsd', round(greatest(lr.usd - lp.usd, 0::numeric), 2),
    'safeToWithdrawUsd', round(greatest(lr.usd - lp.usd - lw.usd, 0::numeric), 2),
    'refundedGrossUsd', round(r.gross_usd, 2)
  ),
  'period', jsonb_build_object(
    'grossSalesUsd', round(ps.gross_usd, 2),
    'droppNetProceedsUsd', round(ps.net_usd, 2),
    'processorFeesUsd', round(ps.fees_usd, 2),
    'cashReleasedByUsageUsd', round(pr.usd, 2),
    'providerCostsUsd', round(pp.usd, 2),
    'ownerWithdrawalsUsd', round(pw.usd, 2),
    'earnedProfitUsd', round(pr.usd - pp.usd, 2)
  )
)
from current_lots c
cross join lifetime_release lr
cross join period_release pr
cross join lifetime_provider lp
cross join period_provider pp
cross join lifetime_withdrawals lw
cross join period_withdrawals pw
cross join period_sales ps
cross join refunded r;
$$;

revoke all on function public.platform_finance_summary(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.platform_finance_summary(timestamptz, timestamptz)
  to service_role;

commit;
