import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "SIGNUP_REQUIRED" },
        { status: 401 }
      );
    }

    const { data, error } = await getSupabaseServiceClient()
      .from("evercoin_purchases")
      .select(
        "paddle_transaction_id,pack_code,coins_granted,coins_reversed,transaction_total_minor,currency_code,status,created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const purchases = (data ?? []).map((purchase) => ({
      id: String(purchase.paddle_transaction_id ?? ""),
      packCode: String(purchase.pack_code ?? ""),
      coinsGranted: Math.max(Number(purchase.coins_granted ?? 0), 0),
      coinsReversed: Math.max(Number(purchase.coins_reversed ?? 0), 0),
      totalMinor:
        purchase.transaction_total_minor === null ||
        purchase.transaction_total_minor === undefined
          ? null
          : Math.max(Number(purchase.transaction_total_minor), 0),
      currencyCode:
        typeof purchase.currency_code === "string" &&
        purchase.currency_code.trim()
          ? purchase.currency_code.trim().toUpperCase()
          : "USD",
      status:
        typeof purchase.status === "string"
          ? purchase.status
          : "credited",
      createdAt: String(purchase.created_at ?? "")
    }));

    return NextResponse.json(
      { purchases },
      {
        headers: {
          "Cache-Control": "private, no-store"
        }
      }
    );
  } catch (error) {
    console.error("EverCoin purchase history failed:", error);

    return NextResponse.json(
      { error: "PURCHASE_HISTORY_FAILED" },
      { status: 500 }
    );
  }
}
