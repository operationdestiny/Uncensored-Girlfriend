import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateCharacterImageUnlock } from "@/lib/images";

const UnlockRequest = z.object({ characterId: z.string(), slot: z.number().int().min(1).max(10) });

export async function POST(request: Request) {
  const parsed = UnlockRequest.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid unlock request" }, { status: 400 });
  const result = await getOrCreateCharacterImageUnlock(parsed.data);
  return NextResponse.json(result);
}
