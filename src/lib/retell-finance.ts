import { createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const RETELL_API_BASE = "https://api.retellai.com/v2";
const FINAL_CALL_STATUSES = new Set(["ended", "error", "not_connected"]);

type RetellCallPayload = {
  call_id?: string;
  call_status?: string;
  duration_ms?: number;
  metadata?: Record<string, unknown> | null;
  call_cost?: {
    combined_cost?: number;
    total_duration_seconds?: number;
    product_costs?: unknown[];
  } | null;
};

function apiKey() {
  const value = process.env.RETELL_API_KEY?.trim();
  if (!value) throw new Error("RETELL_NOT_CONFIGURED");
  return value;
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function persistRetellCallId(values: {
  userId: string;
  billingCallId: string;
  retellCallId: string;
}) {
  const retellCallId = cleanString(values.retellCallId);
  if (!retellCallId) throw new Error("RETELL_CALL_ID_MISSING");

  const { data, error } = await getSupabaseServiceClient()
    .from("voice_calls")
    .update({
      retell_call_id: retellCallId,
      updated_at: new Date().toISOString()
    })
    .eq("id", values.billingCallId)
    .eq("user_id", values.userId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error("RETELL_BILLING_CALL_NOT_FOUND");
}

async function getLocalCall(values: {
  billingCallId?: string | null;
  retellCallId?: string | null;
}) {
  const supabase = getSupabaseServiceClient();
  const billingCallId = cleanString(values.billingCallId);
  const retellCallId = cleanString(values.retellCallId);

  let query = supabase
    .from("voice_calls")
    .select("id,user_id,status,retell_call_id,ended_at,started_at")
    .limit(1);

  if (billingCallId) {
    query = query.eq("id", billingCallId);
  } else if (retellCallId) {
    query = query.eq("retell_call_id", retellCallId);
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function fetchRetellCall(retellCallId: string): Promise<RetellCallPayload> {
  const response = await fetch(
    `${RETELL_API_BASE}/get-call/${encodeURIComponent(retellCallId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        Accept: "application/json"
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000)
    }
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object") {
    throw new Error(`RETELL_GET_CALL_FAILED:${response.status}`);
  }

  return payload as RetellCallPayload;
}

function billingIdFromPayload(payload: RetellCallPayload) {
  return cleanString(payload.metadata?.everbond_billing_call_id);
}

function actualCostUsd(payload: RetellCallPayload) {
  const cents = finiteNumber(payload.call_cost?.combined_cost);
  if (cents === null || cents < 0) return null;
  return cents / 100;
}

function durationSeconds(payload: RetellCallPayload) {
  const fromCost = finiteNumber(payload.call_cost?.total_duration_seconds);
  if (fromCost !== null && fromCost >= 0) return fromCost;

  const durationMs = finiteNumber(payload.duration_ms);
  return durationMs !== null && durationMs >= 0 ? durationMs / 1000 : 0;
}

export async function reconcileRetellVoiceCost(values: {
  billingCallId?: string | null;
  retellCallId?: string | null;
  callPayload?: RetellCallPayload | null;
  source?: string;
}) {
  let payload = values.callPayload ?? null;
  let retellCallId = cleanString(values.retellCallId ?? payload?.call_id);
  let billingCallId = cleanString(
    values.billingCallId ?? (payload ? billingIdFromPayload(payload) : "")
  );

  let local = await getLocalCall({ billingCallId, retellCallId });
  if (!local) {
    return { reconciled: false, pending: false, reason: "LOCAL_CALL_NOT_FOUND" };
  }

  billingCallId = String(local.id);
  const storedRetellCallId = cleanString(local.retell_call_id);
  if (!retellCallId) retellCallId = storedRetellCallId;

  if (!retellCallId) {
    return { reconciled: false, pending: true, reason: "RETELL_CALL_ID_PENDING" };
  }

  if (storedRetellCallId && storedRetellCallId !== retellCallId) {
    throw new Error("RETELL_CALL_ID_MISMATCH");
  }

  if (!storedRetellCallId) {
    await persistRetellCallId({
      userId: String(local.user_id),
      billingCallId,
      retellCallId
    });
  }

  if (!payload) {
    payload = await fetchRetellCall(retellCallId);
  }

  const payloadCallId = cleanString(payload.call_id);
  if (payloadCallId && payloadCallId !== retellCallId) {
    throw new Error("RETELL_PAYLOAD_CALL_ID_MISMATCH");
  }

  const payloadBillingId = billingIdFromPayload(payload);
  if (payloadBillingId && payloadBillingId !== billingCallId) {
    throw new Error("RETELL_PAYLOAD_BILLING_ID_MISMATCH");
  }

  const status = cleanString(payload.call_status).toLowerCase();
  if (status && !FINAL_CALL_STATUSES.has(status)) {
    return { reconciled: false, pending: true, reason: `RETELL_${status.toUpperCase()}` };
  }

  const retellCostUsd = actualCostUsd(payload);
  if (retellCostUsd === null) {
    return { reconciled: false, pending: true, reason: "RETELL_COST_PENDING" };
  }

  const { data, error } = await getSupabaseServiceClient().rpc(
    "platform_reconcile_voice_call_cost",
    {
      p_call_id: billingCallId,
      p_retell_call_id: retellCallId,
      p_retell_cost_usd: retellCostUsd,
      p_duration_seconds: durationSeconds(payload),
      p_source: values.source?.slice(0, 80) || "retell",
      p_metadata: {
        call_status: status || null,
        product_costs: payload.call_cost?.product_costs ?? [],
        retell_combined_cost_cents: payload.call_cost?.combined_cost ?? null
      }
    }
  );

  if (error) throw error;

  return {
    reconciled: data === true,
    pending: false,
    retellCostUsd
  };
}

export async function reconcileRecentRetellVoiceCosts(limit = 12) {
  if (!process.env.RETELL_API_KEY?.trim()) {
    return { attempted: 0, reconciled: 0 };
  }

  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 25));
  const supabase = getSupabaseServiceClient();

  const { data: calls, error } = await supabase
    .from("voice_calls")
    .select("id,retell_call_id,ended_at")
    .eq("status", "ended")
    .not("retell_call_id", "is", null)
    .order("ended_at", { ascending: false })
    .limit(safeLimit * 2);

  if (error) throw error;
  if (!calls?.length) return { attempted: 0, reconciled: 0 };

  const callIds = calls.map((call) => String(call.id));
  const { data: existing, error: existingError } = await supabase
    .from("platform_voice_call_cost_reconciliations")
    .select("billing_call_id")
    .in("billing_call_id", callIds);

  if (existingError) throw existingError;
  const done = new Set((existing ?? []).map((row) => String(row.billing_call_id)));
  const pending = calls.filter((call) => !done.has(String(call.id))).slice(0, safeLimit);

  const results = await Promise.allSettled(
    pending.map((call) =>
      reconcileRetellVoiceCost({
        billingCallId: String(call.id),
        retellCallId: cleanString(call.retell_call_id),
        source: "finance_sweep"
      })
    )
  );

  let reconciled = 0;
  for (const result of results) {
    if (result.status === "fulfilled" && result.value.reconciled) reconciled += 1;
  }

  return { attempted: pending.length, reconciled };
}

export function verifyRetellWebhookSignature(rawBody: string, signature: string | null) {
  if (!signature) return false;
  const match = /^v=(\d+),d=([0-9a-fA-F]+)$/.exec(signature.trim());
  if (!match) return false;

  const timestampText = match[1];
  const suppliedHex = match[2].toLowerCase();
  const timestamp = Number(timestampText);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return false;

  const expectedHex = createHmac("sha256", apiKey())
    .update(rawBody + timestampText)
    .digest("hex");

  try {
    const expected = Buffer.from(expectedHex, "hex");
    const supplied = Buffer.from(suppliedHex, "hex");
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  } catch {
    return false;
  }
}
