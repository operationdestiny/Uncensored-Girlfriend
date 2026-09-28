import { NextResponse } from "next/server";
import { getCheckbookStatus } from "@/lib/checkbook";
import { getPartnerSession } from "@/lib/partner-engine";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getPartnerSession(request);
  if (!session) return NextResponse.json({ error: "PARTNER_SESSION_REQUIRED" }, { status: 401 });

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug")?.trim().toLowerCase();
  if (slug && slug !== session.slug) return NextResponse.json({ error: "PARTNER_MISMATCH" }, { status: 403 });

  const supabase = getSupabaseServiceClient();
  const [{ data: summary, error }, { data: links }, { data: payouts }, { data: partner }] = await Promise.all([
    supabase.rpc("partner_dashboard_summary", { p_partner_id: session.partnerId }),
    supabase
      .from("partner_links")
      .select("id,code,campaign_key,destination_path,is_active,created_at")
      .eq("partner_id", session.partnerId)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("partner_payouts")
      .select("id,amount_minor,recipient_amount_minor,provider_fee_minor,status,provider,provider_payout_id,payout_reference,requested_at,processing_at,paid_at,failed_at,failure_code,failure_message,provider_metadata")
      .eq("partner_id", session.partnerId)
      .order("requested_at", { ascending: false })
      .limit(20),
    supabase
      .from("partners")
      .select("contact_email")
      .eq("id", session.partnerId)
      .maybeSingle()
  ]);
  if (error) {
    console.error("Partner dashboard summary failed", error);
    return NextResponse.json({ error: "PARTNER_DASHBOARD_FAILED" }, { status: 500 });
  }

  return NextResponse.json({
    summary,
    links: links ?? [],
    payouts: payouts ?? [],
    payoutEmail: partner?.contact_email ?? null,
    payoutRail: { provider: "checkbook", ...getCheckbookStatus() }
  });
}
