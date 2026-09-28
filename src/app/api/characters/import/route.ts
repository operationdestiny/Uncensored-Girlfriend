import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serverless bulk imports are intentionally disabled. The inherited endpoint
 * previously allowed privileged writes whenever CHARACTER_IMPORT_SECRET was
 * unset; it also targeted a non-existent seed_id conflict key.
 *
 * For a properly licensed, independent character catalog, use the
 * authenticated, dry-run-by-default scripts/import-characters.mjs job after
 * inspecting its source data and credentials. Never copy another business's
 * customer records, credentials or assets.
 */
export async function POST() {
  return NextResponse.json(
    { error: "BULK_IMPORT_DISABLED", message: "Use the reviewed, manual import job." },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
