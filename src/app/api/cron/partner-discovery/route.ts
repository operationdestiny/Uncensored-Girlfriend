import { NextResponse } from "next/server";
import { partnerDiscoveryEnabled, runPartnerDiscoveryCycle } from "@/lib/partner-discovery";

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

  if (!partnerDiscoveryEnabled()) {
    return NextResponse.json(
      { ok: true, disabled: true, reason: process.env.BRIGHTDATA_API_KEY ? "PARTNER_DISCOVERY_DISABLED" : "BRIGHTDATA_API_KEY_MISSING" },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  try {
    const result = await runPartnerDiscoveryCycle();
    return NextResponse.json(
      { ok: result.errors.length === 0, ...result },
      { status: result.errors.length ? 207 : 200, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("Partner discovery cron failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "PARTNER_DISCOVERY_FAILED" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
