import { NextResponse } from "next/server";
import {
  droppWebhookEventSeen,
  fulfillDroppPaidOrder,
  recordDroppWebhookEvent,
  reverseDroppRefundedOrder,
  verifyDroppWebhookSignature
} from "@/lib/dropp-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-dropp-timestamp");
  const signature = request.headers.get("x-dropp-signature");
  const headerEventType = request.headers.get("x-dropp-event-type")?.trim() ?? "";
  const eventId = request.headers.get("x-dropp-event-id")?.trim() ?? "";

  let signatureValid = false;
  try {
    signatureValid = verifyDroppWebhookSignature(rawBody, timestamp, signature);
  } catch (error) {
    console.error("DROPP webhook signature setup failed:", error);
  }

  if (!signatureValid) {
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  if (!eventId || !headerEventType) {
    return NextResponse.json({ error: "INVALID_WEBHOOK_HEADERS" }, { status: 400 });
  }

  let event: {
    event?: string;
    occurred_at?: string;
    object?: string;
    profile_id?: string;
    agency_id?: string | null;
    data?: Record<string, unknown>;
    test?: boolean;
  };

  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "INVALID_WEBHOOK" }, { status: 400 });
  }

  const eventType = typeof event.event === "string" ? event.event.trim() : "";
  if (!eventType || eventType !== headerEventType) {
    return NextResponse.json({ error: "WEBHOOK_EVENT_MISMATCH" }, { status: 400 });
  }

  try {
    if (await droppWebhookEventSeen(eventId)) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    // DROPP dashboard/API test deliveries intentionally omit the full order
    // metadata. A signed test verifies delivery without ever granting coins.
    if (event.test === true) {
      await recordDroppWebhookEvent(eventId, eventType, event);
      return NextResponse.json({ received: true, test: true });
    }

    if (!event.data || typeof event.data !== "object") {
      return NextResponse.json({ error: "INVALID_WEBHOOK_DATA" }, { status: 400 });
    }

    if (eventType === "order.paid") {
      await fulfillDroppPaidOrder(event.data, event.occurred_at ?? null);
    } else if (eventType === "order.refunded") {
      // DROPP currently documents this event as subscribable but not yet
      // emitted in production. Keep the handler live so it becomes automatic
      // as soon as DROPP enables the event; transaction reconciliation covers
      // refunds in the meantime.
      await reverseDroppRefundedOrder(event.data, eventId);
    }

    await recordDroppWebhookEvent(eventId, eventType, event);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("DROPP webhook processing failed:", error);
    return NextResponse.json(
      { error: "WEBHOOK_PROCESSING_FAILED" },
      { status: 500 }
    );
  }
}
