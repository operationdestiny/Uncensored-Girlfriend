import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import {
  createDroppEverCoinCheckout,
  droppConfigured,
  publicDroppBundles,
  reconcileRecentDroppRefunds
} from "@/lib/dropp-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z
  .object({
    bundleCode: z.enum(["ec500", "ec1000", "ec5000"])
  })
  .strict();

export async function GET() {
  if (droppConfigured()) {
    await reconcileRecentDroppRefunds(1).catch((error) => {
      console.error("DROPP refund reconciliation check failed:", error);
    });
  }

  const bundles = publicDroppBundles();

  return NextResponse.json(
    {
      dropp: droppConfigured() && bundles.length > 0,
      bundles
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "SIGNUP_REQUIRED" }, { status: 401 });
    }

    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_BUNDLE" }, { status: 400 });
    }

    const checkout = await createDroppEverCoinCheckout({
      userId: user.id,
      bundleCode: parsed.data.bundleCode
    });

    return NextResponse.json(checkout, {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "CHECKOUT_FAILED";
    console.error("DROPP EverCoin checkout failed:", error);

    const notConfigured = detail === "DROPP_NOT_CONFIGURED";

    return NextResponse.json(
      {
        error: notConfigured
          ? "PAYMENT_RAIL_NOT_CONFIGURED"
          : "CHECKOUT_FAILED",
        message: process.env.NODE_ENV === "production" ? undefined : detail
      },
      { status: notConfigured ? 503 : 500 }
    );
  }
}
