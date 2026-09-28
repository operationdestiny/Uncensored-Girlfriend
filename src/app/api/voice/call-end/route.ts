import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { finalizeRetellVoiceCall } from "@/lib/retell-call-finalize";
import { updateRetellCallMemory } from "@/lib/retell-call-memory";
import { reconcileRetellVoiceCost } from "@/lib/retell-finance";

export const runtime = "nodejs";

const TranscriptItem = z
  .object({
    role: z.enum(["user", "agent", "character"]),
    content: z.string().max(4000)
  })
  .strict();

const Body = z
  .object({
    callId: z.string().uuid(),
    reason: z.string().trim().min(1).max(100).optional(),
    transcript: z.array(TranscriptItem).max(400).optional().default([])
  })
  .strict();

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "SIGNUP_REQUIRED" }, { status: 401 });
    }

    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const result = await finalizeRetellVoiceCall({
      userId: user.id,
      billingCallId: parsed.data.callId,
      reason: parsed.data.reason ?? "user_hangup",
      transcript: parsed.data.transcript
    });

    if (
      result.finalized &&
      result.conversationId &&
      result.characterId &&
      result.characterSlug
    ) {
      waitUntil(
        updateRetellCallMemory({
          userId: user.id,
          characterSlug: result.characterSlug,
          characterId: result.characterId,
          conversationId: result.conversationId,
          transcript: result.transcript
        })
      );
    }

    // Retell may need a moment to finalize call_cost. This attempt is cheap;
    // if cost is still pending, the signed call_ended webhook and /money sweep
    // will reconcile it later. Until then the per-minute safety reserve remains.
    waitUntil(
      reconcileRetellVoiceCost({
        billingCallId: parsed.data.callId,
        source: "browser_call_end"
      }).catch((error) => {
        console.error("RETELL_CALL_END_FINANCE_RECONCILE_PENDING", error);
      })
    );

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("RETELL_CALL_END_FAILED", error);
    return NextResponse.json({ error: "VOICE_CALL_END_FAILED" }, { status: 500 });
  }
}
