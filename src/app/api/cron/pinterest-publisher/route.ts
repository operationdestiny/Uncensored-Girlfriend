import { NextRequest, NextResponse } from "next/server";
import {
  pinterestPublisherEnabled,
  runPinterestPublisherBatch
} from "@/lib/pinterest-publisher";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  return Boolean(
    secret && req.headers.get("authorization") === `Bearer ${secret}`
  );
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (!pinterestPublisherEnabled()) {
    return NextResponse.json({
      ok: true,
      source: "pinterest-cron",
      disabled: true,
      attempted: 0,
      published: 0
    });
  }

  try {
    const requested = Math.max(
      1,
      Math.min(
        Number(
          req.nextUrl.searchParams.get("limit") ||
            process.env.PINTEREST_FILL_BATCH ||
            1
        ),
        5
      )
    );
    const result = await runPinterestPublisherBatch(requested);
    return NextResponse.json(
      { ok: true, source: "pinterest-cron", ...result },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("Pinterest publisher cron failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "PINTEREST_PUBLISHER_FAILED"
      },
      {
        status: 500,
        headers: { "Cache-Control": "private, no-store" }
      }
    );
  }
}
