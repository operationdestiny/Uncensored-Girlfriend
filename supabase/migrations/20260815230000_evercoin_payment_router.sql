create table if not exists public.evercoin_payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rail text not null check (rail in ('card', 'crypto')),
  provider text not null check (provider in ('payram', 'btcpay')),
  pack_code text not null,
  coins bigint not null check (coins > 0),
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null default 'USD',
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'failed', 'cancelled')),
  provider_reference text,
  checkout_url text,
  provider_state text,
  external_transaction_id text,
  error_code text,
  expires_at timestamptz,
  last_checked_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists evercoin_payment_orders_provider_reference_key
  on public.evercoin_payment_orders(provider, provider_reference)
  where provider_reference is not null;

create unique index if not exists evercoin_payment_orders_external_transaction_key
  on public.evercoin_payment_orders(external_transaction_id)
  where external_transaction_id is not null;

create index if not exists evercoin_payment_orders_user_created_idx
  on public.evercoin_payment_orders(user_id, created_at desc);

create index if not exists evercoin_payment_orders_pending_idx
  on public.evercoin_payment_orders(provider, status, created_at)
  where status = 'pending';

alter table public.evercoin_payment_orders enable row level security;

revoke all on table public.evercoin_payment_orders from anon, authenticated;
grant all on table public.evercoin_payment_orders to service_role;

comment on table public.evercoin_payment_orders is
  'Provider-independent EverCoin checkout orders. Server/service-role only; fulfillment still uses credit_evercoin_purchase for idempotent wallet crediting.';

drop policy if exists "No direct client access" on public.evercoin_payment_orders;
create policy "No direct client access"
on public.evercoin_payment_orders
for all
to anon, authenticated
using (false)
with check (false);
