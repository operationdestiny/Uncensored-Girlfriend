import { NextResponse } from "next/server";
import { z } from "zod";
import { synthesizeSpeech } from "@/lib/voice/tts";

const TtsRequest = z.object({ text: z.string().min(1).max(3000), voiceId: z.string().optional() });

export async function POST(request: Request) {
  const parsed = TtsRequest.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid TTS request" }, { status: 400 });
  const result = await synthesizeSpeech(parsed.data);
  return NextResponse.json(result);
}
