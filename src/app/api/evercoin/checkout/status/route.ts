import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import {
  getDroppOrderForUser,
  refreshDroppOrder
} from "@/lib/dropp-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const OrderId = z.string().uuid();

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "SIGNUP_REQUIRED" }, { status: 401 });
    }

    const parsed = OrderId.safeParse(new URL(request.url).searchParams.get("orderId"));
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_ORDER_ID" }, { status: 400 });
    }

    const order = await getDroppOrderForUser(parsed.data, user.id);
    if (!order) {
      return NextResponse.json({ error: "PAYMENT_ORDER_NOT_FOUND" }, { status: 404 });
    }

    const result = await refreshDroppOrder(order);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    console.error("DROPP EverCoin payment status failed:", error);
    return NextResponse.json({ error: "PAYMENT_STATUS_FAILED" }, { status: 500 });
  }
}
