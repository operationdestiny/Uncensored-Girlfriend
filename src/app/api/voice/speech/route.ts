import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      error: "VOICE_ENDPOINT_RETIRED",
      message: "Use the server-authoritative /api/voice/turn endpoint."
    },
    {
      status: 410,
      headers: { "Cache-Control": "private, no-store" }
    }
  );
}
