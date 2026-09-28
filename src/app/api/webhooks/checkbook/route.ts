import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { verifyCheckbookWebhook } from "@/lib/checkbook";
import { retryCheckbookPayoutQueue } from "@/lib/partner-payouts";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type CheckbookWebhook = {
  id?: unknown;
  type?: unknown;
  status?: unknown;
  deposit_option?: unknown;
  event_ts?: unknown;
  amount?: unknown;
  balance?: unknown;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parsedIso(value: unknown) {
  const raw = stringValue(value);
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyCheckbookWebhook(rawBody, request.headers.get("signature"))) {
    return NextResponse.json({ error: "INVALID_CHECKBOOK_SIGNATURE" }, { status: 401 });
  }

  let payload: CheckbookWebhook;
  try {
    payload = JSON.parse(rawBody) as CheckbookWebhook;
  } catch {
    return NextResponse.json({ error: "INVALID_CHECKBOOK_JSON" }, { status: 400 });
  }
  const type = stringValue(payload.type).toUpperCase();

  if (type === "PREFUND_ACCOUNT") {
    const sourceAccountId = process.env.CHECKBOOK_SOURCE_ACCOUNT_ID?.trim();
    const walletId = stringValue(payload.id);
    if (!sourceAccountId || walletId === sourceAccountId) {
      // Checkbook expects webhook acknowledgements quickly. Let Vercel finish the payout
      // retries after the 2xx response rather than holding the webhook open for network calls.
      waitUntil(
        retryCheckbookPayoutQueue(20).catch((error) => {
          console.error("Checkbook prefund payout retry failed", error);
        })
      );
      return NextResponse.json({ ok: true, type, retryQueued: true });
    }
    return NextResponse.json({ ok: true, ignored: true, type });
  }

  if (type !== "CHECK") {
    return NextResponse.json({ ok: true, ignored: true, type: type || "UNKNOWN" });
  }

  const providerPayoutId = stringValue(payload.id);
  const providerStatus = stringValue(payload.status).toUpperCase();
  if (!providerPayoutId || !providerStatus) {
    return NextResponse.json({ error: "INVALID_CHECKBOOK_EVENT" }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  const { data: payout, error: lookupError } = await supabase
    .from("partner_payouts")
    .select("id,status,failure_code,provider_metadata")
    .eq("provider", "checkbook")
    .eq("provider_payout_id", providerPayoutId)
    .maybeSingle();
  if (lookupError) {
    console.error("Checkbook webhook payout lookup failed", lookupError);
    return NextResponse.json({ error: "CHECKBOOK_WEBHOOK_LOOKUP_FAILED" }, { status: 500 });
  }
  if (!payout) {
    console.warn("Checkbook webhook payment is not mapped to a partner payout", { providerPayoutId, providerStatus });
    return NextResponse.json({ ok: true, unmapped: true });
  }

  const receivedAt = new Date().toISOString();
  const eventIso = parsedIso(payload.event_ts);
  const eventAt = eventIso ?? receivedAt;
  const currentMetadata = (payout.provider_metadata as Record<string, unknown> | null) ?? {};
  const previousEventAt = parsedIso(currentMetadata.lastWebhookAt);
  if (eventIso && previousEventAt && Date.parse(eventIso) < Date.parse(previousEventAt)) {
    return NextResponse.json({ ok: true, ignored: true, reason: "STALE_CHECKBOOK_EVENT" });
  }

  const terminalFailure = ["CHECKBOOK_VOID", "CHECKBOOK_EXPIRED", "CHECKBOOK_REFUNDED"].includes(
    stringValue(payout.failure_code).toUpperCase()
  );
  if (payout.status === "failed" && terminalFailure) {
    return NextResponse.json({ ok: true, ignored: true, reason: "TERMINAL_PAYOUT_ALREADY_RECORDED" });
  }

  const metadata = {
    ...currentMetadata,
    checkbookStatus: providerStatus,
    depositOption: stringValue(payload.deposit_option) || null,
    lastWebhookAt: eventAt,
    lastWebhookReceivedAt: receivedAt
  };

  const base = {
    provider_metadata: metadata,
    updated_at: new Date().toISOString()
  };

  let update: Record<string, unknown>;
  if (providerStatus === "PAID") {
    update = {
      ...base,
      status: "paid",
      paid_at: eventAt,
      failed_at: null,
      failure_code: null,
      failure_message: null
    };
  } else if (["VOID", "EXPIRED", "REFUNDED"].includes(providerStatus)) {
    update = {
      ...base,
      status: "failed",
      failed_at: eventAt,
      paid_at: null,
      failure_code: `CHECKBOOK_${providerStatus}`,
      failure_message:
        providerStatus === "REFUNDED"
          ? "Checkbook returned the payout funds; the commission is available to be paid again."
          : `Checkbook payment reached terminal status ${providerStatus}; the commission is available to be paid again.`
    };
  } else if (providerStatus === "FAILED") {
    // Checkbook documents FAILED as non-terminal: a failed payment must be re-deposited
    // or voided before it reaches a terminal state. Keep the full cashout locked so an
    // affiliate cannot create a second payout while the original Checkbook payment exists.
    update = {
      ...base,
      status: "processing",
      failure_code: "CHECKBOOK_FAILED_NONTERMINAL",
      failure_message: "Checkbook reported a failed deposit attempt. The payout remains protected until Checkbook reaches PAID, VOID, EXPIRED, or REFUNDED."
    };
  } else {
    update = {
      ...base,
      status: "processing",
      ...(payout.status === "reserved" ? { processing_at: eventAt } : {}),
      failure_code: null,
      failure_message: null
    };
  }

  const { error: updateError } = await supabase.from("partner_payouts").update(update).eq("id", payout.id);
  if (updateError) {
    console.error("Checkbook webhook payout update failed", updateError);
    return NextResponse.json({ error: "CHECKBOOK_WEBHOOK_UPDATE_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, payoutId: payout.id, status: providerStatus });
}
