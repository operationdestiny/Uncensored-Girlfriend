import { NextResponse } from "next/server";
import { z } from "zod";
import { requestOrigin, requireFinanceAdmin } from "@/lib/partner-engine";
import { sendPartnerOutreach } from "@/lib/partner-outreach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({
  partnerId: z.string().uuid(),
  followUp: z.boolean().optional(),
  customSubject: z.string().trim().max(300).optional(),
  customIntro: z.string().trim().max(3000).optional()
}).strict();

export async function POST(request: Request) {
  const auth = await requireFinanceAdmin(request);
  if (auth.response) return auth.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_OUTREACH" }, { status: 400 });
  const result = await sendPartnerOutreach({ ...parsed.data, origin: requestOrigin(request) });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.setupRequired ? 409 : 400 });
  }
  return NextResponse.json(result);
}
