import { NextRequest, NextResponse } from "next/server";
import {
  pinterestPublisherEnabled,
  runPinterestPublisherBatch
} from "@/lib/pinterest-publisher";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest) {
  const secret = String(process.env.ADMIN_SECRET || "").trim();
  return Boolean(
    secret && req.headers.get("authorization") === `Bearer ${secret}`
  );
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (!pinterestPublisherEnabled()) {
    return NextResponse.json(
      { error: "PINTEREST_PUBLISHER_DISABLED" },
      { status: 409 }
    );
  }

  try {
    let requested = Number(process.env.PINTEREST_FILL_BATCH || 1);

    try {
      const body = (await req.json()) as { limit?: number };
      if (body?.limit) requested = Number(body.limit);
    } catch {
      // Empty body is allowed.
    }

    const result = await runPinterestPublisherBatch(
      Math.max(1, Math.min(requested || 1, 5))
    );

    return NextResponse.json(
      { ok: true, source: "pinterest-manual", ...result },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
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
