import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { hashToken } from "@/lib/partner-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

export async function GET(request: Request, { params }: Context) {
  const { token } = await params;
  const supabase = getSupabaseServiceClient();
  if (!token || token.length < 20) return new NextResponse("Invalid unsubscribe link.", { status: 400 });
  const { data } = await supabase
    .from("partner_outreach_unsubscribe_tokens")
    .select("id,contact_email,used_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!data) return new NextResponse("This unsubscribe link is no longer valid.", { status: 404 });
  const email = data.contact_email.trim().toLowerCase();
  await supabase.from("partner_outreach_suppressions").upsert({ contact_email: email, reason: "unsubscribe" });
  await supabase.from("partner_outreach_unsubscribe_tokens").update({ used_at: new Date().toISOString() }).eq("id", data.id);
  return new NextResponse("You have been unsubscribed from EverBond partner outreach.", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" }
  });
}
