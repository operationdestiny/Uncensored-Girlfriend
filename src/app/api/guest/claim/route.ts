import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { verifyGuestClaimToken } from "@/lib/guest-claim";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ claimToken: z.string().min(20).max(4096) }).strict();

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "ACCOUNT_REQUIRED" }, { status: 401 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_GUEST_CLAIM" }, { status: 400 });
  }

  const claim = verifyGuestClaimToken(parsed.data.claimToken);
  if (!claim) {
    return NextResponse.json({ error: "INVALID_GUEST_CLAIM" }, { status: 400 });
  }

  if (claim.guestUserId === user.id) {
    return NextResponse.json({ ok: true, transferred: false });
  }

  try {
    const { data, error } = await getSupabaseServiceClient().rpc(
      "claim_guest_chat_data",
      {
        p_guest_user_id: claim.guestUserId,
        p_target_user_id: user.id
      }
    );

    if (error) throw error;

    return NextResponse.json({ ok: true, transferred: true, result: data ?? null });
  } catch (error) {
    console.error("Guest data claim failed:", error);
    return NextResponse.json({ error: "GUEST_CLAIM_FAILED" }, { status: 500 });
  }
}
