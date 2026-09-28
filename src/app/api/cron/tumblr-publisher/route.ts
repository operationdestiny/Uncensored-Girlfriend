import { NextResponse } from "next/server";
import { fillTumblrQueue, tumblrPublisherEnabled } from "@/lib/tumblr-publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (!tumblrPublisherEnabled()) {
    return NextResponse.json(
      { ok: true, disabled: true, attempted: 0, results: [] },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  try {
    const result = await fillTumblrQueue();
    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("Tumblr publisher cron failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "TUMBLR_PUBLISHER_FAILED"
      },
      { status: 500, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
