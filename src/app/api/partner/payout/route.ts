import { NextResponse } from "next/server";
import { z } from "zod";
import { getCheckbookStatus } from "@/lib/checkbook";
import { getPartnerSession } from "@/lib/partner-engine";
import { submitCheckbookPayout } from "@/lib/partner-payouts";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({ amountMinor: z.number().int().positive().optional() }).strict();

export async function POST(request: Request) {
  const session = await getPartnerSession(request);
  if (!session) return NextResponse.json({ error: "PARTNER_SESSION_REQUIRED" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_PAYOUT" }, { status: 400 });

  const supabase = getSupabaseServiceClient();
  const [dashboardResult, partnerResult] = await Promise.all([
    supabase.rpc("partner_dashboard_summary", { p_partner_id: session.partnerId }),
    supabase
      .from("partners")
      .select("public_name,contact_email,status")
      .eq("id", session.partnerId)
      .maybeSingle()
  ]);
  if (dashboardResult.error || partnerResult.error) {
    console.error("Partner payout preflight failed", dashboardResult.error ?? partnerResult.error);
    return NextResponse.json({ error: "PAYOUT_PREFLIGHT_FAILED" }, { status: 500 });
  }

  const partner = partnerResult.data;
  const summary = dashboardResult.data as {
    earnings?: { availableUsd?: number };
    terms?: { payoutMinimumMinor?: number };
  } | null;
  const availableMinor = Math.floor(Number(summary?.earnings?.availableUsd ?? 0) * 100 + 1e-8);
  const minimumMinor = Number(summary?.terms?.payoutMinimumMinor ?? 500);
  const amountMinor = parsed.data.amountMinor ?? availableMinor;

  if (!partner || partner.status !== "active") {
    return NextResponse.json({ error: "PARTNER_NOT_ACTIVE" }, { status: 409 });
  }
  if (!partner.contact_email?.trim()) {
    return NextResponse.json({ error: "PARTNER_EMAIL_REQUIRED" }, { status: 409 });
  }
  if (amountMinor <= 0) return NextResponse.json({ error: "NOTHING_AVAILABLE" }, { status: 409 });
  if (amountMinor < minimumMinor) {
    return NextResponse.json({ error: "PAYOUT_BELOW_MINIMUM", minimumMinor }, { status: 409 });
  }
  if (amountMinor > availableMinor) {
    return NextResponse.json({ error: "PAYOUT_EXCEEDS_AVAILABLE", availableMinor }, { status: 409 });
  }
  const checkbook = getCheckbookStatus();
  if (amountMinor <= checkbook.payoutFeeMinor) {
    return NextResponse.json({ error: "PAYOUT_BELOW_PROVIDER_FEE", providerFeeMinor: checkbook.payoutFeeMinor }, { status: 409 });
  }

  const { data: reservation, error: reserveError } = await supabase.rpc("partner_request_payout", {
    p_partner_id: session.partnerId,
    p_amount_minor: amountMinor
  });
  if (reserveError) {
    console.error("Partner payout reserve failed", reserveError);
    return NextResponse.json({ error: "PAYOUT_RESERVE_FAILED" }, { status: 500 });
  }

  const reserve = reservation as {
    ok?: boolean;
    error?: string;
    payoutId?: string;
    payoutReference?: string;
    amountMinor?: number;
    minimumMinor?: number;
    availableMinor?: number;
  };
  if (!reserve?.ok || !reserve.payoutId) {
    return NextResponse.json(reserve ?? { error: "PAYOUT_NOT_AVAILABLE" }, { status: 409 });
  }

  const result = await submitCheckbookPayout(reserve.payoutId);
  return NextResponse.json(
    {
      ok: true,
      payoutId: reserve.payoutId,
      provider: "checkbook",
      status: result.status,
      fundingRequired: Boolean(result.fundingRequired),
      queued: result.status === "reserved",
      reason: result.reason ?? null
    },
    { status: result.status === "reserved" ? 202 : 200 }
  );
}
