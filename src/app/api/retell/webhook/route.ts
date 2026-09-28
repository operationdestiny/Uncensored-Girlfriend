import { waitUntil } from "@vercel/functions";
import {
  reconcileRetellVoiceCost,
  verifyRetellWebhookSignature
} from "@/lib/retell-finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-retell-signature");

  if (!verifyRetellWebhookSignature(rawBody, signature)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return new Response(null, { status: 204 });
  }

  const record = payload as Record<string, unknown>;
  if (record.event !== "call_ended") {
    return new Response(null, { status: 204 });
  }

  const call =
    record.call && typeof record.call === "object" && !Array.isArray(record.call)
      ? (record.call as Record<string, unknown>)
      : null;

  if (!call) return new Response(null, { status: 204 });

  const metadata =
    call.metadata && typeof call.metadata === "object" && !Array.isArray(call.metadata)
      ? (call.metadata as Record<string, unknown>)
      : {};

  const billingCallId =
    typeof metadata.everbond_billing_call_id === "string"
      ? metadata.everbond_billing_call_id
      : null;
  const retellCallId = typeof call.call_id === "string" ? call.call_id : null;

  if (billingCallId || retellCallId) {
    waitUntil(
      reconcileRetellVoiceCost({
        billingCallId,
        retellCallId,
        callPayload: call,
        source: "retell_webhook"
      }).catch((error) => {
        console.error("RETELL_FINANCE_WEBHOOK_RECONCILE_FAILED", error);
      })
    );
  }

  return new Response(null, { status: 204 });
}
