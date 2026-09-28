import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getPartnerSession,
  normalizeCampaign,
  randomToken,
  sanitizePartnerDestination
} from "@/lib/partner-engine";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  campaign: z.string().trim().min(1).max(80),
  destinationPath: z.string().trim().max(500).optional()
}).strict();

export async function POST(request: Request) {
  const session = await getPartnerSession(request);
  if (!session) return NextResponse.json({ error: "PARTNER_SESSION_REQUIRED" }, { status: 401 });
  if (["suspended", "terminated"].includes(session.status)) {
    return NextResponse.json({ error: "PARTNER_UNAVAILABLE" }, { status: 403 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_LINK" }, { status: 400 });

  const campaign = normalizeCampaign(parsed.data.campaign);
  if (!campaign) return NextResponse.json({ error: "INVALID_CAMPAIGN" }, { status: 400 });
  const destination = sanitizePartnerDestination(parsed.data.destinationPath, "/");
  const code = `${session.slug}-${campaign}`.slice(0, 72).replace(/-+$/g, "") + `-${randomToken(2).replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "x1"}`;

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("partner_links")
    .insert({ partner_id: session.partnerId, code, campaign_key: campaign, destination_path: destination })
    .select("id,code,campaign_key,destination_path")
    .single();
  if (error) return NextResponse.json({ error: "LINK_CREATE_FAILED" }, { status: 500 });
  return NextResponse.json({ ok: true, link: data });
}
