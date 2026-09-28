import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { error: "VOICE_CALLS_UNAVAILABLE" },
    {
      status: 410,
      headers: { "Cache-Control": "private, no-store" }
    }
  );
}
