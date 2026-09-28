import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getEverCoinBalance } from "@/lib/evercoin";
import { getEverShopGift } from "@/lib/evershop/catalog";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type InventoryRow = {
  gift_id: number;
  quantity: number;
};

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "SIGNUP_REQUIRED" },
        { status: 401 }
      );
    }

    const [inventoryResult, wallet] = await Promise.all([
      getSupabaseServiceClient()
        .from("user_gift_inventory")
        .select("gift_id,quantity")
        .eq("user_id", user.id)
        .gt("quantity", 0)
        .order("updated_at", { ascending: false }),
      getEverCoinBalance(user.id)
    ]);

    if (inventoryResult.error) throw inventoryResult.error;

    const items = ((inventoryResult.data ?? []) as InventoryRow[])
      .map((row) => {
        const gift = getEverShopGift(Number(row.gift_id));
        if (!gift) return null;

        return {
          ...gift,
          quantity: Number(row.quantity)
        };
      })
      .filter(Boolean);

    return NextResponse.json(
      {
        items,
        balance: wallet.balance,
        debt: wallet.debt
      },
      {
        headers: {
          "Cache-Control": "private, no-store"
        }
      }
    );
  } catch (error) {
    console.error("EverShop inventory failed:", error);

    return NextResponse.json(
      { error: "INVENTORY_FAILED" },
      { status: 500 }
    );
  }
}
