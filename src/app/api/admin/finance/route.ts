import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { reconcileRecentDroppRefunds } from "@/lib/dropp-payments";
import { reconcileRecentRetellVoiceCosts } from "@/lib/retell-finance";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Processor = z.literal("dropp");

const UpdateBody = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("record_withdrawal"),
      amountMinor: z.number().int().min(1).max(100_000_000),
      note: z.string().trim().max(240).optional()
    })
    .strict(),
  z
    .object({
      action: z.literal("record_processor_payout"),
      provider: Processor,
      amountMinor: z.number().int().min(1).max(100_000_000),
      payoutReference: z.string().trim().min(3).max(160),
      note: z.string().trim().max(240).optional()
    })
    .strict(),
  // Backward compatibility with the old Money page. This always means DROPP.
  z
    .object({
      action: z.literal("record_payout"),
      amountMinor: z.number().int().min(1).max(100_000_000),
      payoutReference: z.string().trim().min(3).max(160),
      note: z.string().trim().max(240).optional()
    })
    .strict(),
  z
    .object({
      action: z.literal("update_rate"),
      reason: z.string().trim().min(1).max(120),
      costUsd: z.number().min(0).max(100)
    })
    .strict()
]);

function financeAdminEmails() {
  return new Set(
    (process.env.FINANCE_ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

async function requireFinanceAdmin(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "SIGNUP_REQUIRED" }, { status: 401 })
    };
  }

  const email = user.email?.trim().toLowerCase() ?? "";
  const allowed = financeAdminEmails();
  if (!email || !allowed.has(email)) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "FINANCE_ADMIN_REQUIRED" },
        { status: 403 }
      )
    };
  }

  return { user, response: null };
}

function cleanIso(value: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

async function summary(from: string | null, to: string | null) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "platform_finance_summary_safe",
    { p_from: from, p_to: to }
  );
  if (error) throw error;
  return data ?? { current: {}, period: {} };
}

async function rates() {
  const { data, error } = await getSupabaseServiceClient()
    .from("platform_feature_cost_rates")
    .select("reason,provider,feature,cost_usd,notes,updated_at")
    .order("feature", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

async function health() {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "platform_finance_health"
  );
  if (error) throw error;
  return data ?? { healthy: false, blockingIssues: 1 };
}

async function voiceStatus() {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "platform_voice_finance_status"
  );
  if (error) throw error;
  return data ?? {};
}

async function partnerSummary() {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "partner_traffic_engine_summary"
  );
  if (error) throw error;
  return data ?? {};
}

async function recentActivity() {
  const supabase = getSupabaseServiceClient();

  const [payouts, withdrawals] = await Promise.all([
    supabase
      .from("platform_processor_payouts")
      .select("id,provider,payout_reference,amount_minor,received_at,note")
      .eq("provider", "dropp")
      .order("received_at", { ascending: false })
      .limit(18),
    supabase
      .from("platform_owner_withdrawals")
      .select("id,amount_minor,created_at,note")
      .order("created_at", { ascending: false })
      .limit(12)
  ]);

  if (payouts.error) throw payouts.error;
  if (withdrawals.error) throw withdrawals.error;

  return {
    payouts: payouts.data ?? [],
    withdrawals: withdrawals.data ?? []
  };
}

export async function GET(request: Request) {
  const auth = await requireFinanceAdmin(request);
  if (auth.response) return auth.response;

  try {
    const [droppRefresh, retellRefresh] = await Promise.allSettled([
      reconcileRecentDroppRefunds(20),
      reconcileRecentRetellVoiceCosts(12)
    ]);

    if (droppRefresh.status === "rejected") {
      console.error(
        "DROPP finance reconciliation unavailable:",
        droppRefresh.reason
      );
    }
    if (retellRefresh.status === "rejected") {
      console.error(
        "Retell finance reconciliation unavailable:",
        retellRefresh.reason
      );
    }

    const url = new URL(request.url);
    const from = cleanIso(url.searchParams.get("from"));
    const to = cleanIso(url.searchParams.get("to")) ?? new Date().toISOString();

    const [
      finance,
      featureRates,
      financeHealth,
      voice,
      partners,
      activity
    ] = await Promise.all([
      summary(from, to),
      rates(),
      health(),
      voiceStatus(),
      partnerSummary(),
      recentActivity()
    ]);

    return NextResponse.json(
      {
        finance,
        rates: featureRates,
        health: financeHealth,
        voice,
        partners,
        recentPayouts: activity.payouts,
        recentWithdrawals: activity.withdrawals,
        generatedAt: new Date().toISOString()
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("Finance dashboard load failed:", error);
    return NextResponse.json(
      { error: "FINANCE_LOAD_FAILED" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireFinanceAdmin(request);
  if (auth.response) return auth.response;

  try {
    const parsed = UpdateBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_FINANCE_REQUEST" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServiceClient();

    if (parsed.data.action === "update_rate") {
      const { data: existing, error: lookupError } = await supabase
        .from("platform_feature_cost_rates")
        .select("reason")
        .eq("reason", parsed.data.reason)
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (!existing) {
        return NextResponse.json(
          { error: "UNKNOWN_COST_RATE" },
          { status: 404 }
        );
      }

      const { error } = await supabase
        .from("platform_feature_cost_rates")
        .update({
          cost_usd: parsed.data.costUsd,
          updated_at: new Date().toISOString()
        })
        .eq("reason", parsed.data.reason);

      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (
      parsed.data.action === "record_processor_payout" ||
      parsed.data.action === "record_payout"
    ) {
      const provider =
        parsed.data.action === "record_processor_payout"
          ? parsed.data.provider
          : "dropp";
      const payoutReference = parsed.data.payoutReference.trim();
      const providerLabel = "DROPP";

      const { data, error } = await supabase
        .from("platform_processor_payouts")
        .insert({
          provider,
          payout_reference: payoutReference,
          amount_minor: parsed.data.amountMinor,
          currency_code: "USD",
          received_at: new Date().toISOString(),
          note:
            parsed.data.note ||
            `${providerLabel} payout received in business bank account`
        })
        .select(
          "id,provider,payout_reference,amount_minor,received_at"
        )
        .single();

      if (error) {
        if (error.code === "23505") {
          return NextResponse.json(
            { error: "PAYOUT_ALREADY_RECORDED" },
            { status: 409 }
          );
        }
        throw error;
      }

      return NextResponse.json({ ok: true, payout: data });
    }

    const { data, error } = await supabase.rpc(
      "platform_record_owner_withdrawal_safe",
      {
        p_amount_minor: parsed.data.amountMinor,
        p_note: parsed.data.note || "Owner withdrawal/distribution"
      }
    );
    if (error) throw error;

    const result = (data ?? {}) as {
      ok?: boolean;
      error?: string;
      safeMinor?: number | string;
      withdrawal?: unknown;
    };

    if (result.ok !== true) {
      const safeMinor = Math.max(Number(result.safeMinor ?? 0), 0);
      return NextResponse.json(
        {
          error: result.error || "WITHDRAWAL_REJECTED",
          safeMinor
        },
        {
          status:
            result.error === "WITHDRAWAL_EXCEEDS_SAFE_PROFIT" ? 409 : 400
        }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Finance dashboard update failed:", error);
    return NextResponse.json(
      { error: "FINANCE_UPDATE_FAILED" },
      { status: 500 }
    );
  }
}
