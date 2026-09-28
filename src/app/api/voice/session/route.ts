import { NextResponse } from "next/server";
import { z } from "zod";
import { createRealtimeVoiceSession } from "@/lib/voice/realtime";

const VoiceSessionRequest = z.object({ characterId: z.string() });

export async function POST(request: Request) {
  const parsed = VoiceSessionRequest.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid voice session request" }, { status: 400 });
  const result = await createRealtimeVoiceSession(parsed.data);
  return NextResponse.json(result);
}
