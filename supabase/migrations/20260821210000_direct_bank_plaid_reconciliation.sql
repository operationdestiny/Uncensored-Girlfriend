alter table public.evercoin_payment_orders
  drop constraint if exists evercoin_payment_orders_rail_check;

alter table public.evercoin_payment_orders
  add constraint evercoin_payment_orders_rail_check
  check (rail in ('card', 'crypto', 'bank'));

alter table public.evercoin_payment_orders
  drop constraint if exists evercoin_payment_orders_provider_check;

alter table public.evercoin_payment_orders
  add constraint evercoin_payment_orders_provider_check
  check (provider in ('payram', 'btcpay', 'direct_bank'));

create index if not exists evercoin_payment_orders_bank_pending_idx
  on public.evercoin_payment_orders(provider, amount_minor, created_at)
  where rail = 'bank' and status = 'pending';

create table if not exists public.everbond_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner')),
  created_at timestamptz not null default now()
);

alter table public.everbond_admin_users enable row level security;
revoke all on table public.everbond_admin_users from anon, authenticated;
grant all on table public.everbond_admin_users to service_role;

drop policy if exists "No direct client access" on public.everbond_admin_users;
create policy "No direct client access"
on public.everbond_admin_users
for all
to anon, authenticated
using (false)
with check (false);

create table if not exists public.plaid_bank_connections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null unique,
  access_token_encrypted text not null,
  institution_id text,
  institution_name text,
  account_id text,
  account_name text,
  account_mask text,
  sync_cursor text,
  status text not null default 'setup'
    check (status in ('setup', 'active', 'relink_required', 'disconnected')),
  last_refresh_requested_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plaid_bank_connections_status_idx
  on public.plaid_bank_connections(status, updated_at desc);

alter table public.plaid_bank_connections enable row level security;
revoke all on table public.plaid_bank_connections from anon, authenticated;
grant all on table public.plaid_bank_connections to service_role;

drop policy if exists "No direct client access" on public.plaid_bank_connections;
create policy "No direct client access"
on public.plaid_bank_connections
for all
to anon, authenticated
using (false)
with check (false);

create table if not exists public.plaid_incoming_transactions (
  transaction_id text primary key,
  item_id text not null,
  account_id text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text,
  transaction_date date,
  transaction_datetime timestamptz,
  pending boolean not null default false,
  reference_text text,
  payer text,
  payment_method text,
  raw_name text,
  matched_order_id uuid unique references public.evercoin_payment_orders(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists plaid_incoming_transactions_match_idx
  on public.plaid_incoming_transactions(account_id, amount_minor, pending, transaction_datetime desc);

alter table public.plaid_incoming_transactions enable row level security;
revoke all on table public.plaid_incoming_transactions from anon, authenticated;
grant all on table public.plaid_incoming_transactions to service_role;

drop policy if exists "No direct client access" on public.plaid_incoming_transactions;
create policy "No direct client access"
on public.plaid_incoming_transactions
for all
to anon, authenticated
using (false)
with check (false);

comment on table public.plaid_bank_connections is
  'Encrypted Plaid access to EverBond own receiving bank account. Plaid is used only for read-only reconciliation.';

comment on table public.plaid_incoming_transactions is
  'Read-only cache of incoming Plaid transactions used to reconcile direct-bank EverCoin orders.';
