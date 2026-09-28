"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

type FinanceState = { current_commission_usd: number | string; negative_carry_usd: number | string };
type PayoutAccount = { provider: string; onboarding_status: string; payout_enabled: boolean };
type Partner = {
  id: string; slug: string; public_name: string; partner_type: string; source_platform: string | null;
  contact_handle: string | null; contact_email: string | null; status: string; activated_at: string | null;
  first_eligible_earning_at: string | null; created_at: string;
  partner_finance_state?: FinanceState[] | FinanceState | null;
  partner_payout_accounts?: PayoutAccount[] | PayoutAccount | null;
};
type Payout = {
  id: string; partner_id: string; amount_minor: number | string; recipient_amount_minor: number | string | null;
  provider_fee_minor: number | string; status: string; provider: string; provider_payout_id: string | null;
  payout_reference: string; requested_at: string; processing_at: string | null; paid_at: string | null;
  failed_at: string | null; failure_code: string | null; failure_message: string | null;
};
type ProviderStatus = {
  configured: boolean; reason: string | null; environment: string; sourceMode: "wallet" | "bank";
  sourceAccountConfigured: boolean; depositOptions: string[]; payoutFeeMinor: number;
};
type Created = { shareUrl: string; dashboardUrl: string; privateInviteUrl: string; partner: { id: string; slug: string; public_name: string } };
type PartnerPayload = { partners?: Partner[]; payouts?: Payout[]; payoutProvider?: ProviderStatus; webhookUrl?: string; error?: string };

const box: CSSProperties = { background: "#171217", border: "1px solid rgba(255,255,255,.08)", borderRadius: 18, padding: 18 };
const input: CSSProperties = { background: "#0d0a0c", border: "1px solid #3a2b33", borderRadius: 10, padding: 11, color: "white", width: "100%" };
const smallButton: CSSProperties = { border: "1px solid #483541", background: "#21171d", color: "white", borderRadius: 8, padding: "8px 10px", cursor: "pointer" };

function single<T>(value: T[] | T | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}
function moneyMinor(value: number | string | null | undefined) { return `$${(Number(value || 0) / 100).toFixed(2)}`; }
function payoutLabel(payout: Payout) {
  if (payout.status === "paid") return "Paid";
  if (payout.status === "processing") {
    if (payout.failure_code === "CHECKBOOK_SUBMISSION_UNKNOWN") return "Processing — confirmation needed";
    if (payout.failure_code === "CHECKBOOK_FAILED_NONTERMINAL") return "Checkbook action needed — funds remain protected";
    return "Processing at Checkbook";
  }
  if (payout.status === "reserved") {
    if (payout.failure_code === "CHECKBOOK_FUNDING_REQUIRED") return "Waiting for Checkbook wallet funding";
    if (payout.failure_code === "CHECKBOOK_CONFIGURATION_REQUIRED") return "Waiting for Checkbook configuration";
    return "Queued for automatic submission";
  }
  if (payout.status === "failed") return "Failed / returned";
  return payout.status;
}

export default function PartnerManagerPage() {
  const { session, authReady } = useAuth();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [created, setCreated] = useState<Created | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [manualRefs, setManualRefs] = useState<Record<string, string>>({});

  const partnerNames = useMemo(() => new Map(partners.map((p) => [p.id, p.public_name])), [partners]);
  const pendingPayouts = payouts.filter((p) => p.status === "reserved" || p.status === "processing");

  const api = useCallback(async (path: string, init?: RequestInit) => {
    if (!session?.access_token) throw new Error("Owner sign-in required");
    return fetch(path, {
      ...init,
      headers: { ...(init?.headers || {}), Authorization: `Bearer ${session.access_token}` },
      cache: "no-store"
    });
  }, [session?.access_token]);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    const response = await api("/api/admin/partners");
    const payload = (await response.json().catch(() => ({}))) as PartnerPayload;
    if (!response.ok) { setMessage(payload.error || "Could not load partners."); return; }
    setPartners(payload.partners ?? []);
    setPayouts(payload.payouts ?? []);
    setProvider(payload.payoutProvider ?? null);
    setWebhookUrl(payload.webhookUrl ?? "");
    setEmails((current) => {
      const next = { ...current };
      for (const partner of payload.partners ?? []) if (next[partner.id] === undefined) next[partner.id] = partner.contact_email ?? "";
      return next;
    });
  }, [api, session?.access_token]);

  useEffect(() => { if (authReady) void load(); }, [authReady, load]);

  async function create() {
    if (!name.trim()) return;
    setWorking(true); setMessage(null); setCreated(null);
    try {
      const response = await api("/api/admin/partners", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicName: name, contactHandle: handle || undefined, contactEmail: email || undefined, sourcePlatform: platform || undefined, preferredSlug: handle || name })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage(payload.error || "Could not create partner"); return; }
      setCreated(payload); setName(""); setHandle(""); setEmail("");
      setMessage("Partner, referral link, Checkbook-ready payout profile and secure dashboard invitation created.");
      await load();
    } finally { setWorking(false); }
  }

  async function patch(body: Record<string, unknown>, success: string) {
    setWorking(true); setMessage(null);
    try {
      const response = await api("/api/admin/partners", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? success : (payload.error || payload.reason || "Partner update failed."));
      if (response.ok) await load();
      return response.ok;
    } finally { setWorking(false); }
  }

  async function sendPitch(partnerId: string) {
    setWorking(true); setMessage(null);
    try {
      const response = await api("/api/admin/partners/outreach", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ partnerId }) });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? "Partner pitch sent with the prepared referral link and private dashboard invite." : (payload.error || "Outreach could not be sent."));
    } finally { setWorking(false); }
  }

  async function reconcile() {
    setWorking(true);
    try {
      const response = await api("/api/admin/partners/summary", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reconcile_all" }) });
      setMessage(response.ok ? "All partner economics reconciled against current Uncensored Girlfriend finance records." : "Reconciliation failed.");
      await load();
    } finally { setWorking(false); }
  }

  if (!authReady) return null;
  return <main style={{ minHeight: "100vh", background: "#0a0709", color: "white", padding: "42px 18px 80px" }}><div style={{ maxWidth: 1160, margin: "0 auto" }}>
    <Link href="/money" style={{ color: "#ff7eb7" }}>← Money</Link>
    <h1 style={{ fontSize: 42, marginBottom: 6 }}>Partner Manager</h1>
    <p style={{ color: "#baaab2", maxWidth: 900 }}>Partner commissions remain protected by Safe-to-Pay. Checkbook now handles normal cashouts automatically after the payout funds are available; affiliates never give Uncensored Girlfriend raw bank or card details.</p>

    <section style={{ ...box, marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
        <div><h2 style={{ marginTop: 0 }}>Checkbook payout automation</h2><div style={{ color: provider?.configured ? "#9ce6ba" : "#ffb5c5", fontWeight: 800 }}>{provider?.configured ? "Configured" : `Action required${provider?.reason ? `: ${provider.reason}` : ""}`}</div></div>
        <div style={{ textAlign: "right", color: "#baaab2", fontSize: 13 }}>
          <div>Source: {provider?.sourceMode === "wallet" ? "Prefunded Checkbook wallet (you control funding)" : "Linked bank"}</div>
          <div>Methods: {(provider?.depositOptions ?? ["BANK"]).join(", ")}</div>
          <div>Configured affiliate payout fee: {moneyMinor(provider?.payoutFeeMinor ?? 0)}</div>
        </div>
      </div>
      {webhookUrl && <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.07)", color: "#baaab2", fontSize: 13 }}>Checkbook Webhook URL: <code style={{ color: "white" }}>{webhookUrl}</code></div>}
    </section>

    <section style={{ ...box, marginTop: 14 }}><h2>Create / prepare a partner</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
        <input style={input} placeholder="Public name" value={name} onChange={(e) => setName(e.target.value)} />
        <input style={input} placeholder="@handle" value={handle} onChange={(e) => setHandle(e.target.value)} />
        <input style={input} placeholder="payout@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select style={input} value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="youtube">YouTube</option><option value="pinterest">Pinterest</option><option value="seo">SEO / Blog</option><option value="review">AI Review</option><option value="discord">Discord / Community</option><option value="other">Other</option></select>
      </div>
      <button disabled={working || !name.trim()} onClick={create} style={{ marginTop: 12, border: 0, borderRadius: 11, padding: "12px 16px", background: "#ff559f", color: "white", fontWeight: 850 }}>Create everything</button>
    </section>

    {message && <div style={{ ...box, marginTop: 12, color: message.toLowerCase().includes("failed") || message.toLowerCase().includes("could not") || message.toLowerCase().includes("required") ? "#ffb5c5" : "#b7f2d0" }}>{message}</div>}
    {created && <section style={{ ...box, marginTop: 12 }}><h3 style={{ marginTop: 0 }}>Ready to send</h3>{[["Share link", created.shareUrl], ["Dashboard after claim", created.dashboardUrl], ["Private one-time dashboard invite", created.privateInviteUrl]].map(([label, value]) => <div key={label} style={{ display: "grid", gridTemplateColumns: "210px minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "8px 0" }}><strong>{label}</strong><code style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{value}</code><button onClick={() => void navigator.clipboard.writeText(value)} style={smallButton}>Copy</button></div>)}</section>}

    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, gap: 12 }}><h2>Partners</h2><button disabled={working} onClick={reconcile} style={smallButton}>Reconcile all economics</button></div>
    <div style={{ display: "grid", gap: 10 }}>{partners.map((partner) => {
      const finance = single(partner.partner_finance_state);
      const account = single(partner.partner_payout_accounts);
      const ready = Boolean(partner.contact_email) && account?.provider === "checkbook" && account?.payout_enabled;
      return <div key={partner.id} style={box}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(180px,1.2fr) .6fr .55fr .55fr auto", gap: 12, alignItems: "center" }}>
          <div><strong>{partner.public_name}</strong><div style={{ fontSize: 12, color: "#aa98a2" }}>/r/{partner.slug} · {partner.contact_handle || partner.contact_email || "no public contact"}</div></div>
          <span>{partner.source_platform || "other"}</span><span>{partner.status}</span><strong>${Number(finance?.current_commission_usd ?? 0).toFixed(2)}</strong>
          <button disabled={working || !partner.contact_email} onClick={() => sendPitch(partner.id)} style={smallButton}>Send pitch</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto auto", gap: 10, alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.07)" }}>
          <input style={input} type="email" placeholder="Payout email" value={emails[partner.id] ?? ""} onChange={(e) => setEmails((v) => ({ ...v, [partner.id]: e.target.value }))} />
          <button disabled={working || !(emails[partner.id] ?? "").trim() || (emails[partner.id] ?? "").trim() === (partner.contact_email ?? "")} onClick={() => patch({ action: "set_contact_email", partnerId: partner.id, contactEmail: emails[partner.id].trim() }, `${partner.public_name}'s payout email is updated.`)} style={smallButton}>Update payout email</button>
          <span style={{ fontSize: 12, color: ready ? "#9ce6ba" : "#c7aeb9" }}>{ready ? "Checkbook cashout ready" : "Payout email required"}</span>
        </div>
      </div>;
    })}</div>

    <h2 style={{ marginTop: 34 }}>Automatic payout queue</h2>
    <p style={{ color: "#baaab2" }}>Reserved amounts are already protected from owner withdrawals. Wallet-funding shortages remain reserved and the webhook/15-minute retry worker sends them automatically after you fund the Checkbook wallet.</p>
    <div style={{ display: "grid", gap: 10 }}>{pendingPayouts.length === 0 ? <div style={box}>No reserved or processing partner payouts.</div> : pendingPayouts.map((payout) => <div key={payout.id} style={{ ...box, display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto minmax(220px,.9fr) auto auto", gap: 10, alignItems: "center" }}>
      <div><strong>{partnerNames.get(payout.partner_id) || "Partner"}</strong><div style={{ fontSize: 12, color: "#aa98a2" }}>{payoutLabel(payout)} · {new Date(payout.requested_at).toLocaleString()}</div>{payout.failure_message && <div style={{ fontSize: 12, color: "#c7aeb9", marginTop: 4 }}>{payout.failure_message}</div>}</div>
      <div style={{ textAlign: "right" }}><strong>{moneyMinor(payout.amount_minor)}</strong>{payout.recipient_amount_minor != null && Number(payout.recipient_amount_minor) !== Number(payout.amount_minor) && <div style={{ fontSize: 11, color: "#aa98a2" }}>{moneyMinor(payout.recipient_amount_minor)} to recipient</div>}</div>
      <div style={{ fontSize: 12, color: "#baaab2" }}>{payout.provider_payout_id ? `Checkbook ID: ${payout.provider_payout_id}` : (payout.failure_code || "Awaiting submission")}</div>
      <button disabled={working || Boolean(payout.provider_payout_id)} onClick={() => patch({ action: "retry_payout", payoutId: payout.id }, "Payout retry completed; the queue is refreshed.")} style={smallButton}>Retry now</button>
      <button disabled={working || payout.status !== "reserved" || Boolean(payout.provider_payout_id)} onClick={() => patch({ action: "cancel_payout", payoutId: payout.id, reason: "Cancelled by finance admin before Checkbook submission" }, "Reserved payout cancelled; the amount is available again if still earned.")} style={{ ...smallButton, color: "#ffb5c5" }}>Cancel</button>
    </div>)}</div>

    <details style={{ ...box, marginTop: 22 }}><summary style={{ cursor: "pointer", fontWeight: 800 }}>Emergency manual settlement only</summary><p style={{ color: "#baaab2" }}>Normal payouts should never use this. Use it only if you personally paid a RESERVED payout outside Checkbook before it was ever submitted to Checkbook and need the Uncensored Girlfriend ledger to reflect the real settlement.</p>{pendingPayouts.filter((payout) => payout.status === "reserved" && !payout.provider_payout_id).map((payout) => <div key={`manual-${payout.id}`} style={{ display: "grid", gridTemplateColumns: "1fr minmax(220px,1fr) auto", gap: 10, alignItems: "center", marginTop: 10 }}><span>{partnerNames.get(payout.partner_id) || "Partner"} · {moneyMinor(payout.amount_minor)}</span><input style={input} placeholder="Real external payment reference" value={manualRefs[payout.id] ?? ""} onChange={(e) => setManualRefs((v) => ({ ...v, [payout.id]: e.target.value }))}/><button disabled={working || (manualRefs[payout.id] ?? "").trim().length < 3} onClick={() => patch({ action: "mark_payout_paid", payoutId: payout.id, providerPayoutId: manualRefs[payout.id].trim() }, "Emergency manual payout recorded in the ledger.")} style={smallButton}>Record paid</button></div>)}</details>
  </div></main>;
}
