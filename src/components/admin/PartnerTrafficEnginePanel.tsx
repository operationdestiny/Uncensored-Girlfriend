"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

type Summary = {
  partners?: { invited?: number; active?: number; generatingEarnings?: number };
  traffic?: { clicks?: number; signups?: number; buyers?: number };
  sales?: { referredGrossUsd?: number; referredDroppNetUsd?: number; outstandingEc?: number; cashReleasedUsd?: number; serviceCostsUsd?: number; platformProtectionUsd?: number; eligiblePartnerProfitUsd?: number };
  commissions?: { currentEntitlementUsd?: number; availableUsd?: number; processingUsd?: number; paidUsd?: number; lockedOrPaidUsd?: number; protectedPartnerCostUsd?: number; overpaymentCarryUsd?: number; everbondRetainedContributionUsd?: number };
  topPartners?: Array<{ slug: string; publicName: string; sourcePlatform?: string; commission_usd?: number; signups?: number }>;
  channels?: Array<{ channel: string; clicks: number; signups: number }>;
};

const usd = (value: number | undefined) => `$${Number(value ?? 0).toFixed(2)}`;
const n = (value: number | undefined) => Number(value ?? 0).toLocaleString();

export function PartnerTrafficEnginePanel() {
  const { session, authReady } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const response = await fetch("/api/admin/partners/summary", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store"
      });
      if (response.status === 403 || response.status === 401) return;
      if (!response.ok) throw new Error("Partner summary unavailable");
      const payload = await response.json();
      setSummary(payload.summary ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Partner summary unavailable");
    }
  }, [session?.access_token]);

  useEffect(() => { if (authReady) void load(); }, [authReady, load]);
  useEffect(() => {
    if (!session?.access_token) return;
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load, session?.access_token]);

  if (!summary && !error) return null;
  if (error && !summary) return <section style={{maxWidth:1180,margin:"18px auto 70px",padding:"0 18px",color:"#ff9aaa"}}>{error}</section>;
  if (!summary) return null;

  const card: CSSProperties = {background:"#171217",border:"1px solid rgba(255,255,255,.08)",borderRadius:18,padding:18};
  const label: CSSProperties = {fontSize:12,color:"#a99aa2",textTransform:"uppercase",letterSpacing:".08em"};
  const value: CSSProperties = {fontSize:25,fontWeight:850,marginTop:6,color:"#fff"};

  return <section style={{maxWidth:1180,margin:"24px auto 80px",padding:"0 18px",color:"#fff"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"end",flexWrap:"wrap",marginBottom:16}}><div><div style={{fontSize:12,fontWeight:900,color:"#ff72af",letterSpacing:".16em",textTransform:"uppercase"}}>EverBond Traffic Engine</div><h2 style={{fontSize:32,margin:"7px 0 0"}}>Partner Growth Engine</h2></div><Link href="/money/partners" style={{background:"#ff559f",color:"white",fontWeight:850,padding:"11px 15px",borderRadius:12,textDecoration:"none"}}>Open Partner Manager</Link></div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
      {[["Invited",n(summary.partners?.invited)],["Active",n(summary.partners?.active)],["Earning",n(summary.partners?.generatingEarnings)],["Clicks",n(summary.traffic?.clicks)],["Signups",n(summary.traffic?.signups)],["Buyers",n(summary.traffic?.buyers)]].map(([l,v])=><div key={l} style={card}><div style={label}>{l}</div><div style={value}>{v}</div></div>)}
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10,marginTop:10}}>
      {[["Referred gross",usd(summary.sales?.referredGrossUsd)],["Dropp net",usd(summary.sales?.referredDroppNetUsd)],["Cash released",usd(summary.sales?.cashReleasedUsd)],["Service costs",usd(summary.sales?.serviceCostsUsd)],["5% protection",usd(summary.sales?.platformProtectionUsd)],["Eligible Partner Profit",usd(summary.sales?.eligiblePartnerProfitUsd)],["Partner entitlement",usd(summary.commissions?.currentEntitlementUsd)],["Available to partners",usd(summary.commissions?.availableUsd)],["Partner paid",usd(summary.commissions?.paidUsd)],["Protected partner cost",usd(summary.commissions?.protectedPartnerCostUsd)],["EverBond retained",usd(summary.commissions?.everbondRetainedContributionUsd)],["Outstanding referred EC",`${n(summary.sales?.outstandingEc)} EC`]].map(([l,v])=><div key={l} style={card}><div style={label}>{l}</div><div style={value}>{v}</div></div>)}
    </div>

    {Number(summary.commissions?.overpaymentCarryUsd ?? 0) > 0 && <div style={{...card,marginTop:10,borderColor:"rgba(255,190,100,.3)",color:"#ffd290"}}>Future-earnings offset currently protecting EverBond: <strong>{usd(summary.commissions?.overpaymentCarryUsd)}</strong></div>}

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:12,marginTop:12}}>
      <div style={card}><h3 style={{marginTop:0}}>Top partners</h3>{(summary.topPartners ?? []).slice(0,8).map((p)=><div key={p.slug} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.06)"}}><span>{p.publicName || p.slug}<small style={{color:"#a99aa2",marginLeft:8}}>{p.sourcePlatform || "other"}</small></span><strong>{usd(p.commission_usd)} · {n(p.signups)} signups</strong></div>)}</div>
      <div style={card}><h3 style={{marginTop:0}}>Channels</h3>{(summary.channels ?? []).slice(0,8).map((c)=><div key={c.channel} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.06)"}}><span>{c.channel}</span><strong>{n(c.clicks)} clicks · {n(c.signups)} signups</strong></div>)}</div>
    </div>
  </section>;
}
