import { NextResponse } from "next/server";
import { getCheckbookStatus } from "@/lib/checkbook";
import { retryCheckbookPayoutQueue } from "@/lib/partner-payouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const status = getCheckbookStatus();
  if (!status.configured) {
    return NextResponse.json({ ok: true, disabled: true, reason: status.reason });
  }

  try {
    const result = await retryCheckbookPayoutQueue(20);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Checkbook partner payout retry cron failed", error);
    return NextResponse.json({ ok: false, error: "PARTNER_PAYOUT_RETRY_FAILED" }, { status: 500 });
  }
}
