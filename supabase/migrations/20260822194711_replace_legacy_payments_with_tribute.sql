-- Tribute Shop API becomes EverBond's only live EverCoin payment provider.
-- Historical payment-order rows are retained for audit/history, but any
-- unfinished legacy orders are retired before their runtime integrations are removed.

update public.evercoin_payment_orders
set
  status = 'cancelled',
  provider_state = 'RETIRED_BY_TRIBUTE',
  updated_at = clock_timestamp()
where provider in ('direct_bank', 'payram', 'btcpay')
  and status = 'pending';

-- Remove direct-bank-only reservation rules and indexes.
alter table public.evercoin_payment_orders
  drop constraint if exists evercoin_payment_orders_custom_amount_check;

drop index if exists public.evercoin_payment_orders_bank_pending_idx;
drop index if exists public.evercoin_payment_orders_direct_bank_pending_amount_idx;
drop index if exists public.evercoin_payment_orders_custom_bank_pending_amount_key;

-- Keep historical provider values valid while enabling Tribute for all new orders.
alter table public.evercoin_payment_orders
  drop constraint if exists evercoin_payment_orders_provider_check;

alter table public.evercoin_payment_orders
  add constraint evercoin_payment_orders_provider_check
  check (provider in ('payram', 'btcpay', 'direct_bank', 'tribute'));

-- Refunded Tribute orders remain visible as orders while the existing
-- reverse_evercoin_purchase ledger handles the actual wallet/debt reversal.
alter table public.evercoin_payment_orders
  drop constraint if exists evercoin_payment_orders_status_check;

alter table public.evercoin_payment_orders
  add constraint evercoin_payment_orders_status_check
  check (status in ('pending', 'paid', 'expired', 'failed', 'cancelled', 'refunded'));

-- Bank-amount reservation metadata is no longer part of the payment model.
alter table public.evercoin_payment_orders
  drop column if exists requested_amount_minor,
  drop column if exists settled_transaction_id;

-- Remove direct-bank reservation/settlement functions.
drop function if exists public.reserve_custom_evercoin_bank_order(uuid, bigint);
drop function if exists public.finalize_custom_bank_posted_match(uuid, text, text, bigint, text);

-- Plaid was used only to monitor EverBond's receiving bank account.
-- Tribute now owns checkout/payment confirmation, so these tables are obsolete.
drop table if exists public.plaid_incoming_transactions;
drop table if exists public.plaid_bank_connections;

-- This owner-only table existed solely to protect the Plaid connection screen.
drop table if exists public.everbond_admin_users;

comment on table public.evercoin_payment_orders is
  'Provider-independent EverCoin checkout orders. Tribute Shop API is the only active checkout provider; historical legacy-provider rows are retained for audit/history.';
