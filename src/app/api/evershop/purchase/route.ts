import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getEverShopGift } from "@/lib/evershop/catalog";
import { purchaseEverShopGift } from "@/lib/evershop/server";

export const runtime = "nodejs";

const PurchaseRequest = z
  .object({
    requestId: z.string().uuid(),
    giftId: z.number().int().min(1).max(200)
  })
  .strict();

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "SIGNUP_REQUIRED" },
        { status: 401 }
      );
    }

    const parsed = PurchaseRequest.safeParse(
      await request.json().catch(() => null)
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_PURCHASE" },
        { status: 400 }
      );
    }

    const gift = getEverShopGift(parsed.data.giftId);

    if (!gift) {
      return NextResponse.json(
        { error: "GIFT_NOT_FOUND" },
        { status: 404 }
      );
    }

    const result = await purchaseEverShopGift({
      userId: user.id,
      requestId: parsed.data.requestId,
      giftId: gift.id,
      price: gift.price
    });

    if (result.status !== "completed") {
      const status =
        result.errorCode === "INSUFFICIENT_EVERCOIN"
          ? 402
          : result.errorCode === "EVERCOIN_DEBT"
            ? 409
            : 409;

      return NextResponse.json(
        {
          error: result.errorCode ?? "PURCHASE_FAILED",
          balance: result.balance,
          debt: result.debt
        },
        { status }
      );
    }

    return NextResponse.json(
      {
        gift,
        balance: result.balance,
        debt: result.debt,
        quantity: result.inventoryQuantity
      },
      {
        headers: {
          "Cache-Control": "private, no-store"
        }
      }
    );
  } catch (error) {
    console.error("EverShop purchase failed:", error);

    return NextResponse.json(
      { error: "PURCHASE_FAILED" },
      { status: 500 }
    );
  }
}
