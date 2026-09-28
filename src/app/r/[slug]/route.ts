import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  createReferralCookieValue,
  normalizeCampaign,
  PARTNER_REFERRAL_COOKIE,
  readCookie,
  sanitizePartnerDestination,
  setReferralCookie,
  verifyReferralCookieValue
} from "@/lib/partner-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Context) {
  const { slug } = await params;
  const code = slug.trim().toLowerCase();
  const supabase = getSupabaseServiceClient();

  const { data: link, error } = await supabase
    .from("partner_links")
    .select("id,partner_id,destination_path,is_active,campaign_key")
    .eq("code", code)
    .maybeSingle();

  const fallback = new URL("/", request.url);
  if (error || !link || !link.is_active) return NextResponse.redirect(fallback, 302);

  const { data: partner } = await supabase
    .from("partners")
    .select("id,status,source_platform")
    .eq("id", link.partner_id)
    .maybeSingle();
  if (!partner || !["invited", "active"].includes(partner.status)) {
    return NextResponse.redirect(fallback, 302);
  }

  const url = new URL(request.url);
  const destination = sanitizePartnerDestination(url.searchParams.get("to"), link.destination_path || "/");
  const campaign = normalizeCampaign(url.searchParams.get("c")) ?? link.campaign_key ?? null;
  const source = normalizeCampaign(url.searchParams.get("src")) ?? partner.source_platform ?? null;
  const clickedAt = new Date().toISOString();

  // Click analytics are intentionally minimal: no customer name/email/chat/private data.
  await supabase.from("partner_clicks").insert({
    partner_id: partner.id,
    link_id: link.id,
    campaign_key: campaign,
    source_platform: source,
    occurred_at: clickedAt
  });

  const redirect = NextResponse.redirect(new URL(destination, request.url), 302);
  // First qualifying partner wins. A later referral click can be counted for analytics,
  // but it cannot overwrite an already-valid 30-day pre-signup attribution cookie.
  const existing = verifyReferralCookieValue(readCookie(request, PARTNER_REFERRAL_COOKIE));
  if (!existing) {
    setReferralCookie(
      redirect,
      createReferralCookieValue({ partnerId: partner.id, linkId: link.id, clickedAt })
    );
  }
  return redirect;
}
