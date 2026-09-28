import { NextResponse } from "next/server";
import { z } from "zod";
import { sendResendEmail } from "@/lib/resend-email";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { hashToken, randomToken, requestOrigin } from "@/lib/partner-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ slug: z.string().trim().min(3).max(80), email: z.string().trim().email().max(320) }).strict();
const generic = { ok: true, message: "If that email matches this partner, a secure access link has been sent." };

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(generic);
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.PARTNER_ACCESS_FROM_EMAIL?.trim() || process.env.PARTNER_OUTREACH_FROM_EMAIL?.trim();
  if (!apiKey || !from) return NextResponse.json({ error: "PARTNER_ACCESS_EMAIL_NOT_CONFIGURED" }, { status: 503 });

  const supabase = getSupabaseServiceClient();
  const { data: partner } = await supabase
    .from("partners")
    .select("id,slug,public_name,contact_email,status")
    .eq("slug", parsed.data.slug.toLowerCase())
    .maybeSingle();
  if (!partner?.contact_email || partner.contact_email.trim().toLowerCase() !== parsed.data.email.toLowerCase()) {
    return NextResponse.json(generic);
  }
  if (["suspended", "terminated"].includes(partner.status)) return NextResponse.json(generic);

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("partner_invites")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partner.id)
    .gte("created_at", tenMinutesAgo);
  if ((count ?? 0) >= 3) return NextResponse.json(generic);

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const { error } = await supabase.from("partner_invites").insert({ partner_id: partner.id, token_hash: hashToken(token), expires_at: expiresAt });
  if (error) return NextResponse.json({ error: "PARTNER_ACCESS_FAILED" }, { status: 500 });

  const url = `${requestOrigin(request)}/partner/invite/${token}`;
  const sent = await sendResendEmail({
    apiKey,
    from,
    to: partner.contact_email,
    subject: "Your secure EverBond Partner dashboard link",
    text: `Use this one-time link to open your private EverBond Partner dashboard:\n\n${url}\n\nThis link expires in 30 minutes.`,
    html: `<p>Use this one-time link to open your private EverBond Partner dashboard:</p><p><a href="${url}">Open my partner dashboard</a></p><p style="font-size:12px;color:#777">This link expires in 30 minutes.</p>`
  });
  if (!sent.ok) return NextResponse.json({ error: "PARTNER_ACCESS_EMAIL_FAILED" }, { status: 502 });
  return NextResponse.json(generic);
}
