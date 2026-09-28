import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  clearReferralCookie,
  PARTNER_REFERRAL_COOKIE,
  readCookie,
  verifyReferralCookieValue
} from "@/lib/partner-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ ok: false, error: "SIGNUP_REQUIRED" }, { status: 401 });

  const cookie = verifyReferralCookieValue(readCookie(request, PARTNER_REFERRAL_COOKIE));
  if (!cookie) return NextResponse.json({ ok: true, claimed: false, reason: "NO_VALID_REFERRAL" });

  const clickedAt = Date.parse(cookie.clickedAt);
  const createdAt = Date.parse(user.created_at);
  // A long-established account cannot be retroactively claimed by a later referral click.
  if (!Number.isFinite(createdAt) || createdAt < clickedAt - 60 * 1000) {
    const response = NextResponse.json({ ok: true, claimed: false, reason: "EXISTING_ACCOUNT" });
    clearReferralCookie(response);
    return response;
  }

  const supabase = getSupabaseServiceClient();

  // Block the obvious self-referral case without tying partner dashboards to customer
  // accounts: outreach partners already have a contact email on their private record.
  const { data: partner } = await supabase
    .from("partners")
    .select("contact_email")
    .eq("id", cookie.partnerId)
    .maybeSingle();
  const partnerEmail = partner?.contact_email?.trim().toLowerCase() ?? "";
  const customerEmail = user.email?.trim().toLowerCase() ?? "";
  if (partnerEmail && customerEmail && partnerEmail === customerEmail) {
    const response = NextResponse.json({ ok: true, claimed: false, reason: "SELF_REFERRAL" });
    clearReferralCookie(response);
    return response;
  }

  const { data, error } = await supabase.rpc("partner_claim_attribution", {
    p_user_id: user.id,
    p_partner_id: cookie.partnerId,
    p_link_id: cookie.linkId,
    p_clicked_at: cookie.clickedAt,
    p_source: "referral_cookie"
  });
  if (error) {
    console.error("Partner attribution claim failed", error);
    return NextResponse.json({ ok: false, error: "ATTRIBUTION_FAILED" }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true, claimed: Boolean(data) });
  clearReferralCookie(response);
  return response;
}
