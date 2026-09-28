import { NextResponse } from "next/server";
import { z } from "zod";
import { getPartnerSession } from "@/lib/partner-engine";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ ageConfirmed: z.literal(true), agreementAccepted: z.literal(true) }).strict();

export async function POST(request: Request) {
  const session = await getPartnerSession(request);
  if (!session) return NextResponse.json({ error: "PARTNER_SESSION_REQUIRED" }, { status: 401 });
  if (["suspended", "terminated"].includes(session.status)) {
    return NextResponse.json({ error: "PARTNER_UNAVAILABLE" }, { status: 403 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "AGREEMENT_REQUIRED" }, { status: 400 });

  const supabase = getSupabaseServiceClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("partners")
    .update({
      status: "active",
      activated_at: now,
      agreement_accepted_at: now,
      age_confirmed_at: now,
      updated_at: now
    })
    .eq("id", session.partnerId)
    .in("status", ["invited", "active"]);
  if (error) return NextResponse.json({ error: "ACTIVATION_FAILED" }, { status: 500 });

  await supabase.from("partner_payout_accounts").upsert(
    { partner_id: session.partnerId, provider: "dropp", onboarding_status: "not_started", payout_enabled: false },
    { onConflict: "partner_id", ignoreDuplicates: true }
  );

  return NextResponse.json({ ok: true, status: "active", activatedAt: now });
}
