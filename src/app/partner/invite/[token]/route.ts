import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  createPartnerSession,
  hashToken,
  setPartnerSessionCookie
} from "@/lib/partner-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

export async function GET(request: Request, { params }: Context) {
  const { token } = await params;
  if (!token || token.length < 20 || token.length > 200) {
    return NextResponse.redirect(new URL("/partners?invite=invalid", request.url), 302);
  }

  const supabase = getSupabaseServiceClient();
  const now = new Date().toISOString();
  const { data: invite } = await supabase
    .from("partner_invites")
    .select("id,partner_id,expires_at,claimed_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (!invite || invite.claimed_at || invite.expires_at <= now) {
    return NextResponse.redirect(new URL("/partners?invite=expired", request.url), 302);
  }

  // Claim the one-time token. The conditional update makes concurrent re-use fail closed.
  const { data: claimed, error: claimError } = await supabase
    .from("partner_invites")
    .update({ claimed_at: now })
    .eq("id", invite.id)
    .is("claimed_at", null)
    .select("id")
    .maybeSingle();
  if (claimError || !claimed) {
    return NextResponse.redirect(new URL("/partners?invite=expired", request.url), 302);
  }

  const { data: partner } = await supabase
    .from("partners")
    .select("id,slug,status")
    .eq("id", invite.partner_id)
    .maybeSingle();
  if (!partner || ["terminated", "suspended"].includes(partner.status)) {
    return NextResponse.redirect(new URL("/partners?invite=unavailable", request.url), 302);
  }

  try {
    const session = await createPartnerSession(partner.id);
    const response = NextResponse.redirect(new URL(`/partner/${partner.slug}`, request.url), 302);
    setPartnerSessionCookie(response, session.token);
    return response;
  } catch (error) {
    console.error("Unable to create partner session", error);
    return NextResponse.redirect(new URL("/partners?invite=error", request.url), 302);
  }
}
