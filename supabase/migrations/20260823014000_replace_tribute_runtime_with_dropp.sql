-- DROPP becomes EverBond's only live EverCoin checkout provider.
-- Historical provider values remain valid for audit/migration history.

update public.evercoin_payment_orders
set
  status = 'cancelled',
  provider_state = 'RETIRED_BY_DROPP',
  updated_at = clock_timestamp()
where provider = 'tribute'
  and status = 'pending';

alter table public.evercoin_payment_orders
  drop constraint if exists evercoin_payment_orders_provider_check;

alter table public.evercoin_payment_orders
  add constraint evercoin_payment_orders_provider_check
  check (provider in ('payram', 'btcpay', 'direct_bank', 'tribute', 'dropp'));

alter table public.evercoin_payment_orders
  drop constraint if exists evercoin_payment_orders_status_check;

alter table public.evercoin_payment_orders
  add constraint evercoin_payment_orders_status_check
  check (status in ('pending', 'paid', 'expired', 'failed', 'cancelled', 'refunded'));

create table if not exists public.dropp_webhook_events (
  event_id text primary key,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

alter table public.dropp_webhook_events enable row level security;
revoke all on table public.dropp_webhook_events from anon, authenticated;
grant all on table public.dropp_webhook_events to service_role;

drop policy if exists "No direct client access" on public.dropp_webhook_events;
create policy "No direct client access"
on public.dropp_webhook_events
for all
to anon, authenticated
using (false)
with check (false);

create index if not exists evercoin_payment_orders_dropp_status_idx
  on public.evercoin_payment_orders(status, created_at desc)
  where provider = 'dropp';

comment on table public.evercoin_payment_orders is
  'Provider-independent EverCoin checkout orders. DROPP payment links are the only active checkout provider; historical provider rows remain for audit/history.';

comment on table public.dropp_webhook_events is
  'DROPP webhook event-id ledger used for at-least-once delivery deduplication. Service-role only.';
