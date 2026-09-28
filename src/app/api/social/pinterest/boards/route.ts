import { NextRequest, NextResponse } from "next/server";
import {
  listPinterestBoards,
  pinterestSetupSecret
} from "@/lib/pinterest-publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const expected = pinterestSetupSecret();
  const supplied = request.nextUrl.searchParams.get("key")?.trim();

  if (!expected || !supplied || supplied !== expected) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const boards = await listPinterestBoards();
    return NextResponse.json(
      { ok: true, boards },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Pinterest board lookup failed"
      },
      {
        status: 500,
        headers: { "Cache-Control": "private, no-store" }
      }
    );
  }
}
