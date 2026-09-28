"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Coins,
  Landmark,
  LoaderCircle,
  PhoneCall,
  RefreshCw,
  ShieldCheck,
  Users,
  WalletCards
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType
} from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/components/auth/AuthProvider";
import { SectionHeader } from "@/components/ui/SectionHeader";

type FinanceNumbers = {
  grossSalesUsd?: number;
  droppNetProceedsUsd?: number;
  processorFeesUsd?: number;
  unreconciledGrossUsd?: number;
  outstandingEc?: number;
  unreconciledEc?: number;
  unusedEcReserveUsd?: number;
  cashReleasedByUsageUsd?: number;
  providerCostsUsd?: number;
  ownerWithdrawalsUsd?: number;
  earnedProfitUsd?: number;
  safeToWithdrawUsd?: number;
  economicSafeToWithdrawUsd?: number;
  droppPayoutsReceivedUsd?: number;
  bankCashAfterProtectionUsd?: number;
  paidChatMessagesRemaining?: number;
  chatBlockProviderReserveUsd?: number;
  chatProviderRateUsd?: number;
  profitAwaitingPayoutUsd?: number;
  refundedGrossUsd?: number;
  financeHealthy?: boolean;
  partnerCommissionEntitlementUsd?: number;
  partnerLockedOrPaidUsd?: number;
  partnerProtectedCostUsd?: number;
  partnerPlatformProtectionReserveUsd?: number;
  partnerUnpaidLiabilityUsd?: number;
};

type FinanceHealth = {
  healthy?: boolean;
  blockingIssues?: number;
  voiceMinutesMissingReserve?: number;
  pricedSpendMissingProviderCost?: number;
  trialChatsMissingProviderCost?: number;
  includedChatsMissingProviderCost?: number;
  unknownSpendTransactions?: number;
  paidDroppOrdersMissingCashLot?: number;
  unreconciledCashLots?: number;
};

type VoiceStatus = {
  billedMinutes?: number;
  reconciledCalls?: number;
  callsOnSafetyReserve?: number;
  activeCalls?: number;
  endedCallsAwaitingActual?: number;
  retellActualUsd?: number;
  veniceSafetyReserveUsd?: number;
  reconciledVoiceCostUsd?: number;
  protectedVoiceCostUsd?: number;
  lastReconciledAt?: string | null;
};

type PartnerSummary = {
  partners?: {
    invited?: number;
    active?: number;
    generatingEarnings?: number;
  };
  traffic?: {
    clicks?: number;
    signups?: number;
    buyers?: number;
  };
  commissions?: {
    currentEntitlementUsd?: number;
    availableUsd?: number;
    processingUsd?: number;
    paidUsd?: number;
    lockedOrPaidUsd?: number;
    protectedPartnerCostUsd?: number;
    everbondRetainedContributionUsd?: number;
  };
};

type FinancePayload = {
  finance?: {
    current?: FinanceNumbers;
    period?: FinanceNumbers;
  };
  health?: FinanceHealth;
  voice?: VoiceStatus;
  partners?: PartnerSummary;
  rates?: Array<{
    reason: string;
    provider: string;
    feature: string;
    cost_usd: number | string;
    notes?: string | null;
  }>;
  recentPayouts?: Array<{
    id: string;
    provider: "dropp" | string;
    payout_reference: string;
    amount_minor: number | string;
    received_at: string;
    note?: string | null;
  }>;
  recentWithdrawals?: Array<{
    id: string;
    amount_minor: number | string;
    created_at: string;
    note?: string | null;
  }>;
  generatedAt?: string;
  error?: string;
};

type RangeKey = "today" | "week" | "month" | "year" | "all";

const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  week: "Last 7 days",
  month: "This month",
  year: "This year",
  all: "All time"
};

function rangeFrom(key: RangeKey) {
  const now = new Date();
  if (key === "all") return null;
  if (key === "today") {
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).toISOString();
  }
  if (key === "week") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (key === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
  return new Date(now.getFullYear(), 0, 1).toISOString();
}

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(parsed) ? parsed : 0);
}

function whole(value: unknown) {
  const parsed = Number(value ?? 0);
  return new Intl.NumberFormat("en-US").format(
    Number.isFinite(parsed) ? Math.trunc(parsed) : 0
  );
}

function dateTime(value: string | null | undefined) {
  if (!value) return "Not yet";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Not yet";
  return parsed.toLocaleString();
}


export default function MoneyPage() {
  return (
    <AppShell>
      <MoneyContent />
    </AppShell>
  );
}

function MoneyContent() {
  const { session, authReady, openAuthModal } = useAuth();
  const [range, setRange] = useState<RangeKey>("week");
  const [payload, setPayload] = useState<FinancePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [withdrawal, setWithdrawal] = useState("");
  const [withdrawalBusy, setWithdrawalBusy] = useState(false);

  const [payout, setPayout] = useState("");
  const [payoutReference, setPayoutReference] = useState("");
  const [payoutBusy, setPayoutBusy] = useState(false);

  const current = payload?.finance?.current ?? {};
  const period = payload?.finance?.period ?? {};
  const health = payload?.health ?? {};
  const voice = payload?.voice ?? {};
  const partner = payload?.partners ?? {};
  const healthy = health.healthy === true && current.financeHealthy !== false;

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ to: new Date().toISOString() });
      const from = rangeFrom(range);
      if (from) params.set("from", from);

      const response = await fetch(`/api/admin/finance?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store"
      });
      const next = (await response.json().catch(() => ({}))) as FinancePayload;

      if (!response.ok) {
        throw new Error(
          next.error === "FINANCE_ADMIN_REQUIRED"
            ? "This page is restricted to the finance admin account."
            : "Could not load the money dashboard."
        );
      }

      setPayload(next);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load finance data."
      );
    } finally {
      setLoading(false);
    }
  }, [range, session?.access_token]);

  useEffect(() => {
    if (!authReady || !session?.access_token) return;
    void load();
  }, [authReady, session?.access_token, load]);

  useEffect(() => {
    if (!session?.access_token) return;

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);

    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [session?.access_token, load]);

  const safeMinor = useMemo(
    () =>
      Math.max(
        Math.floor(Number(current.safeToWithdrawUsd ?? 0) * 100),
        0
      ),
    [current.safeToWithdrawUsd]
  );

  async function recordPayout() {
    if (!session?.access_token || payoutBusy) return;
    const amount = Number(payout);
    const amountMinor = Math.round(amount * 100);
    const label = "DROPP";

    if (!Number.isFinite(amount) || amount <= 0) {
      setError(`Enter the exact ${label} payout that actually reached the business bank account.`);
      return;
    }

    if (payoutReference.trim().length < 3) {
      setError(
        `Enter the unique ${label} or bank reference so the payout cannot be recorded twice.`
      );
      return;
    }

    setPayoutBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/finance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: "record_processor_payout",
          provider: "dropp",
          amountMinor,
          payoutReference: payoutReference.trim(),
          note: `${label} payout received in business bank account`
        })
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result?.error === "PAYOUT_ALREADY_RECORDED"
            ? `That ${label} payout reference has already been recorded.`
            : `Could not record the ${label} payout.`
        );
      }

      setPayout("");
      setPayoutReference("");
      setNotice(
        `${label} payout recorded. Safe to withdraw has been recalculated.`
      );
      await load();
    } catch (payoutError) {
      setError(
        payoutError instanceof Error
          ? payoutError.message
          : "Could not record the payout."
      );
    } finally {
      setPayoutBusy(false);
    }
  }

  async function recordWithdrawal() {
    if (!session?.access_token || withdrawalBusy) return;
    const amount = Number(withdrawal);
    const amountMinor = Math.round(amount * 100);

    if (!Number.isFinite(amount) || amount <= 0 || amountMinor > safeMinor) {
      setError(`Enter an amount no greater than ${money(safeMinor / 100)}.`);
      return;
    }

    setWithdrawalBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/finance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: "record_withdrawal",
          amountMinor,
          note: "Owner withdrawal/distribution"
        })
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result?.error === "WITHDRAWAL_EXCEEDS_SAFE_PROFIT"
            ? "That amount is above the current safe-to-withdraw balance."
            : "Could not record the withdrawal."
        );
      }

      setWithdrawal("");
      setNotice(
        "Owner transfer recorded. It is permanently removed from future safe profit."
      );
      await load();
    } catch (withdrawError) {
      setError(
        withdrawError instanceof Error
          ? withdrawError.message
          : "Could not record the withdrawal."
      );
    } finally {
      setWithdrawalBusy(false);
    }
  }

  if (authReady && !session?.access_token) {
    return (
      <main className="px-4 py-10 md:px-6">
        <SectionHeader
          eyebrow="Money"
          title="Uncensored Girlfriend Money"
          description="Private owner-only revenue, KissCoins reserve, provider-cost and affiliate dashboard."
        />
        <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[0.035] p-8 text-center">
          <p className="text-bond-muted">
            Log in with the finance admin account to view this page.
          </p>
          <button
            type="button"
            onClick={openAuthModal}
            className="bond-pink-button mt-6 rounded-xl px-6 py-3 font-bold"
          >
            Log in
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="px-4 py-10 md:px-6">
      <SectionHeader
        eyebrow="Money"
        title="Uncensored Girlfriend Money"
        description="Owner-safe cash, KissCoins reserves, KissCoins text chat, affiliate obligations, provider costs and withdrawals."
      />

      <section className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(RANGE_LABELS) as RangeKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRange(key)}
                className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
                  range === key
                    ? "border-bond-rose bg-bond-rose/15 text-bond-rose"
                    : "border-white/10 bg-white/[0.035] text-bond-muted hover:border-bond-rose/40"
                }`}
              >
                {RANGE_LABELS[key]}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || !session?.access_token}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold disabled:opacity-50"
          >
            {loading ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            Refresh
          </button>
        </div>

        {!healthy && payload && (
          <div className="mb-6 rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-red-100">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle size={19} /> Accounting safety lock is active
            </div>
            <p className="mt-2 text-sm leading-6 text-red-100/80">
              Safe to withdraw is forced to $0 while a required provider,
              KissCoins, provider-cost or affiliate accounting check is unhealthy.
            </p>
          </div>
        )}

        {healthy && payload && (
          <div className="mb-6 flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            <CheckCircle2 size={18} />
            Accounting checks passed. Safe to withdraw is bank-capped and
            affiliate/provider obligations are protected first.
          </div>
        )}

        {notice && (
          <div className="mb-6 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {notice}
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="eb-neon-card rounded-[2rem] border border-bond-rose/35 bg-bond-rose/10 p-7 lg:col-span-2">
            <div className="flex items-center gap-3 text-bond-rose">
              <ShieldCheck size={25} />
              <p className="font-bold uppercase tracking-[0.16em]">
                Safe to withdraw now
              </p>
            </div>
            <p className="mt-4 font-display text-5xl font-bold text-white md:text-6xl">
              {money(current.safeToWithdrawUsd)}
            </p>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-bond-muted">
              This is the owner number to use. It is capped by cash actually
              received, earned platform contribution, unused KissCoins reserves,
              AI/provider costs, unused paid-chat obligations, affiliate obligations and prior owner
              withdrawals. If any fail-closed accounting check breaks, this
              becomes $0.
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-7">
            <div className="flex items-center gap-3 text-bond-rose">
              <WalletCards size={22} />
              <p className="font-bold">Keep protected for unused EC</p>
            </div>
            <p className="mt-4 font-display text-4xl font-bold text-white">
              {money(current.unusedEcReserveUsd)}
            </p>
            <p className="mt-2 text-sm text-bond-muted">
              Cash backing {whole(current.outstandingEc)} purchased KissCoins
              users still hold.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={Landmark}
            label="DROPP payouts received"
            value={money(current.droppPayoutsReceivedUsd)}
          />
          <Metric
            icon={Coins}
            label="Cash released by EC usage"
            value={money(current.cashReleasedByUsageUsd)}
          />
          <Metric
            label="Economic safe before bank cap"
            value={money(current.economicSafeToWithdrawUsd)}
          />
          <Metric
            label="Bank cash after protection"
            value={money(current.bankCashAfterProtectionUsd)}
          />
          <Metric
            label="Profit awaiting bank payout"
            value={money(current.profitAwaitingPayoutUsd)}
          />
          <Metric
            icon={ShieldCheck}
            label="Paid chat provider reserve"
            value={money(current.chatBlockProviderReserveUsd)}
          />
          <Metric
            icon={Banknote}
            label="Provider costs protected"
            value={money(current.providerCostsUsd)}
          />
          <Metric
            label="Owner withdrawals recorded"
            value={money(current.ownerWithdrawalsUsd)}
          />
        </div>

        <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 md:p-8">
          <h2 className="font-display text-2xl font-bold text-white">KissCoins text chat</h2>
          <p className="mt-2 text-sm leading-6 text-bond-muted">
            The first 20 messages are free per account. After that, 3 EC buys 19 messages automatically when the next block is needed. Unused messages carry forward. Gifts use their separate inventory price.
          </p>
          <p className="mt-3 text-sm leading-6 text-bond-muted">
            Chat purchases use the KissCoins transaction ledger. AI replies and Memory retain provider cost reserves and actual token reconciliation. Purchased KissCoins is not all profit: unused balances, paid-but-unused chat messages, provider costs and partner obligations remain protected below.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Metric label="Paid messages still owed" value={whole(current.paidChatMessagesRemaining)} compact />
            <Metric label="Reserve for those messages" value={money(current.chatBlockProviderReserveUsd)} compact />
            <Metric label="Per-message safety rate" value={money(current.chatProviderRateUsd)} compact />
          </div>
        </div>

        <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-bond-rose">
                <Users size={22} />
                <h2 className="font-display text-2xl font-bold text-white">
                  Affiliate / Partner protection
                </h2>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-bond-muted">
                Partner commissions are reconciled against attributed users,
                paid-KissCoins cash release, provider costs and the active
                partner terms. Partner amounts are protected before owner
                profit becomes withdrawable.
              </p>
            </div>
            <Link
              href="/money/partners"
              className="rounded-xl border border-bond-rose/40 bg-bond-rose/10 px-4 py-2 text-sm font-bold text-bond-rose"
            >
              Open Partner Manager
            </Link>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Active partners"
              value={whole(partner.partners?.active)}
              compact
            />
            <Metric
              label="Referral clicks"
              value={whole(partner.traffic?.clicks)}
              compact
            />
            <Metric
              label="Referral signups"
              value={whole(partner.traffic?.signups)}
              compact
            />
            <Metric
              label="Referral buyers"
              value={whole(partner.traffic?.buyers)}
              compact
            />
            <Metric
              label="Commission entitlement"
              value={money(current.partnerCommissionEntitlementUsd)}
              compact
            />
            <Metric
              label="Unpaid partner liability"
              value={money(current.partnerUnpaidLiabilityUsd)}
              compact
            />
            <Metric
              label="Locked or paid partner cash"
              value={money(current.partnerLockedOrPaidUsd)}
              compact
            />
            <Metric
              label="Partner platform reserve"
              value={money(current.partnerPlatformProtectionReserveUsd)}
              compact
            />
          </div>
        </div>

        <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold">
                Voice accounting
              </h2>
              <p className="mt-2 text-sm text-bond-muted">
                Started call minutes stay reserved until the finished call can
                reconcile to Retell's actual cost plus the Venice custom-LLM
                protection.
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-bond-muted">
              Last Retell reconciliation: {dateTime(voice.lastReconciledAt)}
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric
              icon={PhoneCall}
              label="Billed call minutes"
              value={whole(voice.billedMinutes)}
              compact
            />
            <Metric
              label="Actual Retell cost"
              value={money(voice.retellActualUsd)}
              compact
            />
            <Metric
              label="Venice call reserve"
              value={money(voice.veniceSafetyReserveUsd)}
              compact
            />
            <Metric
              label="Protected voice cost"
              value={money(voice.protectedVoiceCostUsd)}
              compact
            />
          </div>
        </div>

        <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 md:p-8">
          <h2 className="font-display text-2xl font-bold">
            {RANGE_LABELS[range]}
          </h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Metric
              label="Gross KissCoins sales"
              value={money(period.grossSalesUsd)}
              compact
            />
            <Metric
              label="DROPP net"
              value={money(period.droppNetProceedsUsd)}
              compact
            />
            <Metric
              label="DROPP payouts"
              value={money(period.droppPayoutsReceivedUsd)}
              compact
            />
            <Metric
              label="Provider costs"
              value={money(period.providerCostsUsd)}
              compact
            />
            <Metric
              label="Period contribution before current reserves"
              value={money(period.earnedProfitUsd)}
              compact
            />
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 md:p-8">
            <h2 className="font-display text-2xl font-bold">
              Record DROPP payout received
            </h2>
            <p className="mt-2 text-sm leading-6 text-bond-muted">
              Record a DROPP payout only after the money actually reaches the
              business bank account. The unique DROPP/bank reference prevents
              the same deposit from being counted twice.
            </p>

            <div className="mt-5 flex items-center rounded-xl border border-white/10 bg-black/20 px-4">
              <span className="text-bond-muted">$</span>
              <input
                value={payout}
                onChange={(event) =>
                  setPayout(event.target.value.replace(/[^0-9.]/g, ""))
                }
                inputMode="decimal"
                placeholder="0.00"
                className="min-w-0 flex-1 bg-transparent px-2 py-3 text-white outline-none"
              />
            </div>

            <input
              value={payoutReference}
              onChange={(event) => setPayoutReference(event.target.value)}
              placeholder="DROPP / bank payout reference"
              className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none"
            />

            <button
              type="button"
              onClick={() => void recordPayout()}
              disabled={
                payoutBusy ||
                !payout.trim() ||
                payoutReference.trim().length < 3
              }
              className="bond-pink-button mt-4 w-full rounded-xl px-5 py-3 font-bold disabled:opacity-50"
            >
              {payoutBusy ? "Saving…" : "Record payout received"}
            </button>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 md:p-8">
            <h2 className="font-display text-2xl font-bold">
              Record owner transfer
            </h2>
            <p className="mt-2 text-sm leading-6 text-bond-muted">
              After you move profit from the business account to yourself,
              record the same amount here. The database rechecks the safe
              balance atomically and rejects anything above it.
            </p>

            <div className="mt-5 flex gap-3">
              <div className="flex flex-1 items-center rounded-xl border border-white/10 bg-black/20 px-4">
                <span className="text-bond-muted">$</span>
                <input
                  value={withdrawal}
                  onChange={(event) =>
                    setWithdrawal(
                      event.target.value.replace(/[^0-9.]/g, "")
                    )
                  }
                  inputMode="decimal"
                  placeholder="0.00"
                  className="min-w-0 flex-1 bg-transparent px-2 py-3 text-white outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => void recordWithdrawal()}
                disabled={withdrawalBusy || safeMinor <= 0}
                className="bond-pink-button rounded-xl px-5 py-3 font-bold disabled:opacity-50"
              >
                {withdrawalBusy ? "Saving…" : "Record"}
              </button>
            </div>

            <p className="mt-3 text-xs text-bond-muted">
              Current maximum: {money(safeMinor / 100)}. This records an owner
              withdrawal/distribution; it does not initiate a bank transfer or
              determine tax treatment.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <ActivityCard
            title="Recent DROPP payouts received"
            empty="No DROPP bank payouts recorded yet."
            rows={(payload?.recentPayouts ?? []).map((row) => ({
              id: row.id,
              amount: money(Number(row.amount_minor) / 100),
              date: dateTime(row.received_at),
              detail: `DROPP · ${row.payout_reference}`
            }))}
          />
          <ActivityCard
            title="Recent owner transfers recorded"
            empty="No owner transfers recorded yet."
            rows={(payload?.recentWithdrawals ?? []).map((row) => ({
              id: row.id,
              amount: money(Number(row.amount_minor) / 100),
              date: dateTime(row.created_at),
              detail: row.note || "Owner withdrawal/distribution"
            }))}
          />
        </div>

        <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.025] p-6">
          <h2 className="font-display text-xl font-bold">
            Accounting safeguards
          </h2>
          <div className="mt-4 grid gap-3 text-sm text-bond-muted md:grid-cols-2">
            <p>• Purchased but unused KissCoins stays reserved in cash.</p>
            <p>• Provider costs are protected before owner profit.</p>
            <p>• Chat revenue remains subject to provider costs and cash reserves.</p>
            <p>• Only recorded bank payouts increase the cash cap.</p>
            <p>• Paid-but-unused chat messages keep a conservative provider-cost reserve.</p>
            <p>• Affiliate/partner liabilities are protected before owner profit.</p>
            <p>• Voice calls remain reserved until actual costs reconcile.</p>
            <p>• Owner transfers are atomically capped and cannot be double-spent.</p>
          </div>

          <p className="mt-5 text-xs leading-5 text-bond-muted">
            Keep separate reserves for taxes and business expenses that are not
            represented in Uncensored Girlfriend's tracked provider/accounting ledgers.
          </p>
          <p className="mt-3 text-xs text-bond-muted">
            Updated: {dateTime(payload?.generatedAt)}
          </p>
        </div>
      </section>
    </main>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  compact = false
}: {
  icon?: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.035] ${
        compact ? "p-4" : "p-5"
      }`}
    >
      <div className="flex items-center gap-2 text-sm text-bond-muted">
        {Icon ? <Icon size={17} className="text-bond-rose" /> : null}
        <span>{label}</span>
      </div>
      <p
        className={`mt-2 font-display font-bold text-white ${
          compact ? "text-2xl" : "text-3xl"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ActivityCard({
  title,
  empty,
  rows
}: {
  title: string;
  empty: string;
  rows: Array<{
    id: string;
    amount: string;
    date: string;
    detail: string;
  }>;
}) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 md:p-8">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      {rows.length ? (
        <div className="mt-4 divide-y divide-white/10">
          {rows.slice(0, 8).map((row) => (
            <div
              key={row.id}
              className="flex items-start justify-between gap-4 py-3 first:pt-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-white">{row.detail}</p>
                <p className="mt-1 text-xs text-bond-muted">{row.date}</p>
              </div>
              <p className="shrink-0 font-bold text-white">{row.amount}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-bond-muted">{empty}</p>
      )}
    </div>
  );
}
