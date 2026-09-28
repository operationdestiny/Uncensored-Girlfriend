# EverBond Checkbook affiliate payouts

Base repository commit used for this patch: `29f8231bfc87cff9b4ec2615146bad7b639e143e`.

This patch changes only the **affiliate/partner payout rail** from DROPP Agency to Checkbook.io. It does not change customer EverCoin checkout through DROPP.

## Production flow

1. Affiliate earnings are calculated exactly as before.
2. Cash Out calls `partner_request_payout`, which reconciles all partners and reserves only bank-backed Safe-to-Pay money.
3. The reservation is immediately protected from owner withdrawals.
4. EverBond creates a Checkbook digital payout using a durable Checkbook idempotency key.
5. Checkbook emails the affiliate a secure deposit/claim experience. EverBond never stores their raw bank/card details.
6. Signed Checkbook webhooks move the EverBond payout through processing/paid/failed states.
7. If the Checkbook wallet is short on funds, the payout stays RESERVED. It is never released into owner profit.
8. When the wallet receives funds, Checkbook sends a `PREFUND_ACCOUNT` webhook and EverBond automatically retries the queue. A Vercel cron retries the safe queue every 15 minutes as a fallback.
9. `/money` and `/money/partners` continue protecting partner obligations because the existing finance functions are provider-neutral and count reserved/processing/paid partner payouts. The main `/money` Safe-to-Withdraw formula therefore does not need a Checkbook-specific rewrite; DROPP references there remain the customer EverCoin revenue/payout rail, not the affiliate payout rail.

## Required Vercel environment variables

Set these for Production (and Preview if you test there):

```text
CHECKBOOK_ENV=production
CHECKBOOK_PUBLISHABLE_KEY=<production publishable key generated in Checkbook Settings -> Developer>
CHECKBOOK_SECRET_KEY=<production secret key generated with that key>
CHECKBOOK_WEBHOOK_KEY=<Checkbook webhook signing key>
CHECKBOOK_SOURCE_MODE=wallet
CHECKBOOK_SOURCE_ACCOUNT_ID=<the Checkbook wallet ID you manually fund>
CHECKBOOK_DEPOSIT_OPTIONS=BANK
CHECKBOOK_PAYOUT_FEE_MINOR=100
```

`CHECKBOOK_PAYOUT_FEE_MINOR=100` means the affiliate bears a $1.00 payout cost: a $100.00 cashout creates a $99.00 recipient payment while the full $100.00 remains the protected partner cash cost. **Set this to the exact fee on your Checkbook account before live payouts.** Checkbook's public pricing is "starting at $1", so your exact contracted fee should control this value.

### Alternative direct-bank mode

If you decide you want Checkbook to pull payouts directly from the verified business bank instead of manually prefunding a wallet:

```text
CHECKBOOK_SOURCE_MODE=bank
```

In bank mode, `CHECKBOOK_SOURCE_ACCOUNT_ID` may be omitted to use Checkbook's default verified source account. Keep `CHECKBOOK_DEPOSIT_OPTIONS=BANK`.

For the owner's stated manual-control model, use `wallet` mode.

## Checkbook dashboard setup

Before live payouts, confirm the production Checkbook business profile is **VERIFIED**. Checkbook does not allow an unverified sender to create live payments.

From the Developer screen shown in the EverBond setup:

1. Settings -> Developer -> create a **production** API key (for example, name it `everbond-production`). The Client ID shown on the page is not one of the three server secrets used by this integration.
2. Save the publishable and secret key immediately. Checkbook does not provide a way to retrieve the secret later.
3. Copy the webhook signing key. Checkbook documents that generating an API key can temporarily expose the webhook key if it is currently masked.
4. In the Webhook URL field enter:

```text
https://everbond.ai/api/webhooks/checkbook
```

5. No Callback URL is required for this server-to-server digital payout flow.
6. For manual funding control, create/use a Checkbook wallet, record its wallet ID as `CHECKBOOK_SOURCE_ACCOUNT_ID`, and fund that wallet from the EverBond business bank when you choose. If your account does not expose wallet/enhanced-wallet capability, Checkbook may need to enable it; the code can instead use `CHECKBOOK_SOURCE_MODE=bank`, but that lets Checkbook pull from the verified linked bank rather than preserving your manual-funding control.

## Supabase

Run this migration once in the production Supabase SQL Editor before the new API is allowed to take live cashouts:

```text
supabase/migrations/20260913013000_checkbook_partner_payout_automation.sql
```

The migration:

- adds Checkbook payout metadata/idempotency/fee fields;
- changes only partner-payout defaults to Checkbook;
- converts old unsent RESERVED DROPP affiliate payouts into the Checkbook queue;
- leaves historical paid/failed DROPP affiliate rows intact;
- removes the DROPP creator-account requirement from `partner_request_payout`;
- keeps the Safe-to-Pay lock and global FIFO cash protection;
- adds a service-role-only atomic Checkbook submission-claim RPC.

## Existing environment variable

The new retry cron uses the same `CRON_SECRET` convention already used by EverBond's existing partner-discovery cron. If `CRON_SECRET` is already set, do not create another one.

## Payout methods

Launch with:

```text
CHECKBOOK_DEPOSIT_OPTIONS=BANK
```

The integration is prepared to pass additional Checkbook-supported methods, but do **not** enable `CARD`/international push-to-card until the account has that rail enabled and the exact fee handling is confirmed. Instant rails require a Checkbook wallet source according to Checkbook's current docs.

## Failure safety

- Wallet not funded -> payout remains `reserved`, code `CHECKBOOK_FUNDING_REQUIRED`.
- Provider/API config missing -> payout remains `reserved`, code `CHECKBOOK_CONFIGURATION_REQUIRED`.
- Ambiguous network result -> payout remains locked as `processing` and safely retries with the same idempotency key inside Checkbook's 24-hour window.
- After the safe retry window, an ambiguous payout stops automatic resubmission rather than risking a duplicate transfer.
- A signed `PAID` webhook marks paid automatically.
- Checkbook documents `FAILED` as non-terminal, so EverBond keeps that payout locked for review instead of risking a duplicate payment.
- Only terminal `VOID`, `EXPIRED`, or `REFUNDED` webhooks release the payout so the earned commission can become payable again.
- Webhook event timestamps prevent an older retried event from rolling a newer payout state backward.
- `/money/partners` retains an emergency manual-settlement control, collapsed by default, only for a RESERVED payout that has never received a Checkbook payment ID.
