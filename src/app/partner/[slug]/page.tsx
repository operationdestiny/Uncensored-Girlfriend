"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./PartnerDashboard.module.css";

type DashboardPayload = {
  summary: {
    partner: { slug: string; publicName: string; status: string; firstEligibleEarningAt: string | null };
    terms: { currentRateBps: number; currentDay: number; payoutMinimumMinor: number; platformProtectionBps: number };
    performance: { clicks: number; signups: number; buyers: number; evercoinPurchased: number; paidEcConsumed: number };
    economics: { cashReleasedUsd: number; serviceCostsUsd: number; platformProtectionUsd: number; eligibleProfitUsd: number; negativeCarryUsd: number; currentCommissionUsd: number };
    earnings: { positiveEarnedUsd: number; adjustmentsUsd: number; currentEntitlementUsd: number; availableUsd: number; lockedOrPaidUsd: number; paidUsd: number; pendingUsd: number };
    payoutAccount?: { onboarding_status?: string; payout_enabled?: boolean; provider?: string };
    campaigns?: Array<{ campaign: string; clicks: number; signups: number }>;
  };
  links: Array<{ id: string; code: string; campaign_key: string | null; destination_path: string; is_active: boolean }>;
  payouts: Array<{
    id: string;
    amount_minor: number;
    recipient_amount_minor: number | null;
    provider_fee_minor: number;
    status: string;
    provider: string;
    requested_at: string;
    processing_at: string | null;
    paid_at: string | null;
    failure_code: string | null;
  }>;
  payoutEmail: string | null;
  payoutRail: {
    provider: string;
    configured: boolean;
    reason?: string | null;
    sourceMode?: "wallet" | "bank";
    depositOptions?: string[];
    payoutFeeMinor?: number;
  };
};

function money(value: number | undefined) {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function payoutStatus(status: string, failureCode: string | null) {
  if (status === "paid") return "Paid";
  if (status === "processing") {
    if (failureCode === "CHECKBOOK_SUBMISSION_UNKNOWN") return "Processing — confirmation pending";
    if (failureCode === "CHECKBOOK_FAILED_NONTERMINAL") return "Deposit issue — payout remains protected while Checkbook resolves it";
    return "Sent — claim/deposit in progress";
  }
  if (status === "reserved") {
    if (failureCode === "CHECKBOOK_FUNDING_REQUIRED") return "Queued — waiting for payout funding";
    if (failureCode === "PARTNER_EMAIL_REQUIRED") return "Queued — payout email required";
    return "Queued for automatic payout";
  }
  if (status === "failed") return "Returned / needs a new cashout";
  if (status === "cancelled") return "Cancelled";
  return status;
}

export default function PartnerDashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [campaign, setCampaign] = useState("");
  const [destination, setDestination] = useState("/");
  const [accessEmail, setAccessEmail] = useState("");
  const [accessSent, setAccessSent] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/partner/dashboard?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      if (!response.ok) { setData(null); return; }
      setData(await response.json());
    } finally { setLoading(false); }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!slug) return;
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load, slug]);

  const shareUrl = useMemo(() => {
    if (!data?.links?.[0]) return "";
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return `${origin}/r/${data.links[0].code}`;
  }, [data]);

  async function activate() {
    setWorking(true); setMessage(null);
    const response = await fetch("/api/partner/activate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ageConfirmed: true, agreementAccepted: true }) });
    setWorking(false);
    if (!response.ok) { setMessage("Activation could not be completed."); return; }
    setMessage("Your partnership is active. Your earning clock begins only when your first eligible earning is created.");
    await load();
  }

  async function cashOut() {
    if (!data) return;
    setWorking(true); setMessage(null);
    const amountMinor = Math.floor(data.summary.earnings.availableUsd * 100 + 1e-8);
    const response = await fetch("/api/partner/payout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amountMinor }) });
    const payload = await response.json().catch(() => ({}));
    setWorking(false);
    if (!response.ok) {
      if (payload.error === "PARTNER_EMAIL_REQUIRED") setMessage("A payout email is required before you can cash out. Contact EverBond so we can update your partner email.");
      else if (payload.error === "PAYOUT_BELOW_MINIMUM") setMessage("Your available amount is still below the cashout minimum.");
      else setMessage("That withdrawal is not available yet. Your earnings remain protected.");
      return;
    }
    if (payload.fundingRequired === true) {
      setMessage("Your cashout is reserved safely. It will be sent automatically as soon as the EverBond payout wallet is funded.");
    } else if (payload.status === "reserved") {
      setMessage("Your cashout is reserved safely and queued for automatic payout.");
    } else if (payload.status === "paid") {
      setMessage("Your payout has been sent.");
    } else {
      setMessage("Your payout has been submitted. Checkbook will email you a secure link to choose or confirm your deposit method.");
    }
    await load();
  }

  async function requestAccess() {
    if (!accessEmail.trim()) return;
    const response = await fetch("/api/partner/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, email: accessEmail }) });
    if (response.ok) setAccessSent(true);
  }

  async function createCampaign() {
    if (!campaign.trim()) return;
    setWorking(true); setMessage(null);
    const response = await fetch("/api/partner/links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaign, destinationPath: destination }) });
    setWorking(false);
    if (!response.ok) { setMessage("Campaign link could not be created."); return; }
    setCampaign(""); setMessage("Campaign link created."); await load();
  }

  if (loading && !data) return <main className={styles.page}><div className={styles.empty}>Loading your EverBond Partner dashboard…</div></main>;
  if (!data) return <main className={styles.page}><div className={styles.empty}><h1>Private partner dashboard</h1><p>This dashboard needs a secure partner session. If EverBond has your business email, you can send yourself a fresh one-time access link without creating an account.</p>{accessSent?<p className={styles.success}>If that email matches this partner, a secure access link has been sent.</p>:<div style={{maxWidth:420,margin:"18px auto",display:"flex",gap:8}}><input className={styles.input} type="email" placeholder="Your partner email" value={accessEmail} onChange={e=>setAccessEmail(e.target.value)}/><button className={styles.button} onClick={requestAccess}>Send access link</button></div>}<Link href="/partners">About the Partner Program</Link></div></main>;

  const s = data.summary;
  const min = s.terms.payoutMinimumMinor / 100;
  const configuredFee = Number(data.payoutRail.payoutFeeMinor ?? 0) / 100;
  const canCashOut = Boolean(data.payoutEmail) && s.partner.status === "active" && s.earnings.availableUsd + 0.0001 >= min && s.earnings.availableUsd * 100 > Number(data.payoutRail.payoutFeeMinor ?? 0);
  const day = s.terms.currentDay;
  const phaseText = !s.partner.firstEligibleEarningAt ? "Your 100% clock has not started yet." : day <= 30 ? `Day ${day} of your 100% period.` : day <= 180 ? `Day ${day}. You keep 80% through day 180.` : "Your 50% lifetime rate is active.";

  return <main className={styles.page}><div className={styles.shell}>
    <div className={styles.top}><div><div className={styles.eyebrow}>EverBond Partner</div><h1 className={styles.title}>{s.partner.publicName}</h1><div className={styles.muted}>{phaseText}</div></div><div className={styles.badge}>{s.partner.status.toUpperCase()}</div></div>

    {s.partner.status === "invited" && <section className={styles.activate}><h2>Your partnership is already waiting for you.</h2><p className={styles.muted}>Your referral link works now. Activate once to accept the Partner Agreement and confirm you are 18 or older. No bank or card information is collected by EverBond to begin.</p><p className={styles.agreement}>By activating, I confirm I am 18+ and agree to the <Link href="/partners/agreement" target="_blank">EverBond Partner Agreement</Link>.</p><button className={styles.button} disabled={working} onClick={activate}>Activate my partnership</button></section>}

    {message && <div className={message.toLowerCase().includes("could not") || message.toLowerCase().includes("required") ? styles.error : styles.success}>{message}</div>}

    <div className={styles.heroGrid}>
      <section className={styles.card}><div className={styles.eyebrow}>Your current share</div><div className={styles.rate}>{s.terms.currentRateBps / 100}%</div><p className={styles.muted}>100% days 1–30 · 80% days 31–180 · 50% lifetime. Your clock starts with your first eligible earning.</p><div className={styles.linkBox}><span className={styles.linkText}>{shareUrl}</span><button className={`${styles.button} ${styles.secondary}`} onClick={() => void navigator.clipboard.writeText(shareUrl)}>Copy</button></div></section>
      <section className={styles.card}><div className={styles.eyebrow}>Available to cash out</div><div className={styles.available}>{money(s.earnings.availableUsd)}</div><button className={styles.button} disabled={working || !canCashOut} onClick={cashOut}>Cash out {money(s.earnings.availableUsd)}</button><p className={styles.tiny}>EverBond minimum: {money(min)}. {configuredFee > 0 ? `Current payout fee: ${money(configuredFee)}; it is deducted from the cashout amount.` : "No payout fee is currently deducted."} Availability is based on Safe-to-Pay—not an arbitrary waiting period.</p>{data.payoutEmail ? <p className={styles.tiny}>Secure payout notices go to {data.payoutEmail}. EverBond never asks you to send us bank or card numbers.</p> : <p className={styles.tiny}>A payout email must be added before cashout.</p>}</section>
    </div>

    <div className={styles.grid4}>
      <div className={styles.metric}><div className={styles.metricLabel}>Pending</div><div className={styles.metricValue}>{money(s.earnings.pendingUsd)}</div></div>
      <div className={styles.metric}><div className={styles.metricLabel}>Current entitlement</div><div className={styles.metricValue}>{money(s.earnings.currentEntitlementUsd)}</div></div>
      <div className={styles.metric}><div className={styles.metricLabel}>Lifetime settled</div><div className={styles.metricValue}>{money(s.earnings.paidUsd)}</div></div>
      <div className={styles.metric}><div className={styles.metricLabel}>Adjustments</div><div className={styles.metricValue}>{money(s.earnings.adjustmentsUsd)}</div></div>
    </div>

    <div className={styles.twoCol}>
      <section className={styles.card}><h2 className={styles.sectionTitle}>Performance</h2><div className={styles.rows}>
        <div className={styles.row}><span>Link clicks</span><strong>{s.performance.clicks.toLocaleString()}</strong></div>
        <div className={styles.row}><span>EverBond signups</span><strong>{s.performance.signups.toLocaleString()}</strong></div>
        <div className={styles.row}><span>Paying referrals</span><strong>{s.performance.buyers.toLocaleString()}</strong></div>
        <div className={styles.row}><span>KissCoins purchased</span><strong>{Number(s.performance.evercoinPurchased).toLocaleString()} EC</strong></div>
        <div className={styles.row}><span>Paid EC consumed</span><strong>{Number(s.performance.paidEcConsumed).toLocaleString()} EC</strong></div>
      </div></section>
      <section className={styles.card}><h2 className={styles.sectionTitle}>Transparent economics</h2><div className={styles.rows}>
        <div className={styles.row}><span>Cash released by paid EC use</span><strong>{money(s.economics.cashReleasedUsd)}</strong></div>
        <div className={styles.row}><span>Service-delivery costs</span><strong>-{money(s.economics.serviceCostsUsd)}</strong></div>
        <div className={styles.row}><span>EverBond protection</span><strong>-{money(s.economics.platformProtectionUsd)}</strong></div>
        <div className={styles.row}><span>Eligible Partner Profit</span><strong className={styles.positive}>{money(s.economics.eligibleProfitUsd)}</strong></div>
        {s.economics.negativeCarryUsd > 0 && <div className={styles.row}><span>Cost carry to recover</span><strong className={styles.warning}>{money(s.economics.negativeCarryUsd)}</strong></div>}
      </div></section>
    </div>

    <section className={styles.card} style={{marginTop:16}}><h2 className={styles.sectionTitle}>Create campaign links</h2><p className={styles.muted}>Use separate links for different videos, profiles or channels while keeping the same lifetime partner account.</p><div className={styles.campaignForm}><input className={styles.input} placeholder="tiktok-video-4" value={campaign} onChange={e=>setCampaign(e.target.value)}/><input className={styles.input} placeholder="/" value={destination} onChange={e=>setDestination(e.target.value)}/><button className={styles.button} disabled={working || !campaign.trim()} onClick={createCampaign}>Create link</button></div><div className={styles.rows} style={{marginTop:12}}>{data.links.map(link=>{const url=typeof window==='undefined'?'':`${window.location.origin}/r/${link.code}`;return <div className={styles.row} key={link.id}><span>{link.campaign_key || "Default"}</span><span className={styles.linkText}>{url}</span><button className={`${styles.button} ${styles.secondary}`} onClick={()=>void navigator.clipboard.writeText(url)}>Copy</button></div>})}</div></section>

    <div className={styles.twoCol}>
      <section className={styles.card}><h2 className={styles.sectionTitle}>Payouts</h2><p className={styles.muted}>Cashouts are sent through Checkbook. Checkbook emails you a secure claim/deposit experience, so EverBond does not store your bank account or debit-card details.</p>{data.payouts.length===0?<p className={styles.tiny}>No payouts yet.</p>:<div className={styles.rows}>{data.payouts.map(p=>{const gross=Number(p.amount_minor)/100;const received=Number(p.recipient_amount_minor ?? p.amount_minor)/100;return <div className={styles.row} key={p.id}><span>{new Date(p.requested_at).toLocaleDateString()}</span><span>{payoutStatus(p.status,p.failure_code)}</span><strong>{money(gross)}{received!==gross?` → ${money(received)} after fee`:""}</strong></div>})}</div>}</section>
      <section className={styles.card}><h2 className={styles.sectionTitle}>Disclosure</h2><p className={styles.muted}>When promoting EverBond, clearly disclose that you can earn a commission. A simple version:</p><div className={styles.linkBox}><span className={styles.linkText}>I earn a commission if you join and purchase through my EverBond link.</span><button className={`${styles.button} ${styles.secondary}`} onClick={()=>void navigator.clipboard.writeText("I earn a commission if you join and purchase through my EverBond link.")}>Copy</button></div></section>
    </div>
  </div></main>;
}
