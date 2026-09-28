import { createCheckbookPartnerPayout, getCheckbookStatus } from "@/lib/checkbook";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

type ClaimResult = {
  ok?: boolean;
  error?: string;
  payoutId?: string;
  partnerId?: string;
  amountMinor?: number;
  payoutReference?: string;
  idempotencyKey?: string;
};

export type SubmitPayoutResult = {
  ok: boolean;
  payoutId: string;
  status: "reserved" | "processing" | "paid";
  reason?: string;
  fundingRequired?: boolean;
  manualReview?: boolean;
};

function nowIso() {
  return new Date().toISOString();
}

async function restoreReserved(
  payoutId: string,
  code: string,
  message: string,
  extraMetadata: Record<string, unknown> = {}
) {
  const supabase = getSupabaseServiceClient();
  const { data: current } = await supabase
    .from("partner_payouts")
    .select("provider_metadata")
    .eq("id", payoutId)
    .maybeSingle();
  const providerMetadata = {
    ...((current?.provider_metadata as Record<string, unknown> | null) ?? {}),
    ...extraMetadata,
    lastAttemptAt: nowIso()
  };
  await supabase
    .from("partner_payouts")
    .update({
      status: "reserved",
      processing_at: null,
      failure_code: code,
      failure_message: message.slice(0, 500),
      provider_metadata: providerMetadata,
      updated_at: nowIso()
    })
    .eq("id", payoutId)
    .eq("provider", "checkbook")
    .is("provider_payout_id", null);
}

async function keepUnknownProcessing(payoutId: string, message: string) {
  const supabase = getSupabaseServiceClient();
  const { data: current } = await supabase
    .from("partner_payouts")
    .select("provider_metadata")
    .eq("id", payoutId)
    .maybeSingle();
  await supabase
    .from("partner_payouts")
    .update({
      status: "processing",
      failure_code: "CHECKBOOK_SUBMISSION_UNKNOWN",
      failure_message: message.slice(0, 500),
      provider_metadata: {
        ...((current?.provider_metadata as Record<string, unknown> | null) ?? {}),
        lastUnknownAttemptAt: nowIso()
      },
      updated_at: nowIso()
    })
    .eq("id", payoutId)
    .eq("provider", "checkbook")
    .is("provider_payout_id", null);
}

export async function submitCheckbookPayout(payoutId: string): Promise<SubmitPayoutResult> {
  const supabase = getSupabaseServiceClient();
  const { data: claimData, error: claimError } = await supabase.rpc("partner_claim_checkbook_payout", {
    p_payout_id: payoutId
  });
  if (claimError) {
    console.error("Checkbook payout claim failed", claimError);
    return { ok: false, payoutId, status: "reserved", reason: "PAYOUT_CLAIM_FAILED", manualReview: true };
  }

  const claim = (claimData ?? {}) as ClaimResult;
  if (!claim.ok) {
    if (claim.error === "PAYOUT_ALREADY_SUBMITTED") {
      return { ok: true, payoutId, status: "processing" };
    }
    return {
      ok: false,
      payoutId,
      status: claim.error === "PAYOUT_RETRY_WINDOW_EXPIRED" ? "processing" : "reserved",
      reason: claim.error || "PAYOUT_NOT_SUBMITTABLE",
      manualReview: claim.error === "PAYOUT_RETRY_WINDOW_EXPIRED"
    };
  }

  const partnerId = claim.partnerId;
  if (!partnerId || !claim.payoutReference || !claim.idempotencyKey || !claim.amountMinor) {
    await restoreReserved(payoutId, "CHECKBOOK_CLAIM_INCOMPLETE", "Payout claim did not return the required fields.");
    return { ok: false, payoutId, status: "reserved", reason: "CHECKBOOK_CLAIM_INCOMPLETE", manualReview: true };
  }

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("public_name,contact_email,status")
    .eq("id", partnerId)
    .maybeSingle();
  if (partnerError || !partner) {
    await restoreReserved(payoutId, "PARTNER_NOT_FOUND", "Partner payout identity could not be loaded.");
    return { ok: false, payoutId, status: "reserved", reason: "PARTNER_NOT_FOUND", manualReview: true };
  }

  const recipientEmail = partner.contact_email?.trim();
  if (!recipientEmail) {
    await restoreReserved(payoutId, "PARTNER_EMAIL_REQUIRED", "A payout email is required before this cashout can be sent.");
    return { ok: false, payoutId, status: "reserved", reason: "PARTNER_EMAIL_REQUIRED", manualReview: true };
  }

  const result = await createCheckbookPartnerPayout({
    payoutId,
    payoutReference: claim.payoutReference,
    partnerName: partner.public_name,
    recipientEmail,
    amountMinor: Number(claim.amountMinor),
    idempotencyKey: claim.idempotencyKey
  });

  if (!result.ok) {
    if (result.unknownResult) {
      await keepUnknownProcessing(payoutId, result.message);
      return {
        ok: true,
        payoutId,
        status: "processing",
        reason: result.code,
        manualReview: true
      };
    }

    const storedCode = result.configurationRequired ? "CHECKBOOK_CONFIGURATION_REQUIRED" : result.code;
    await restoreReserved(payoutId, storedCode, result.message, {
      fundingRequired: Boolean(result.fundingRequired),
      configurationRequired: Boolean(result.configurationRequired),
      configurationReason: result.configurationRequired ? result.code : undefined
    });
    return {
      ok: true,
      payoutId,
      status: "reserved",
      reason: result.code,
      fundingRequired: Boolean(result.fundingRequired),
      manualReview: !result.fundingRequired && !result.configurationRequired
    };
  }

  const timestamp = nowIso();
  const { data: current } = await supabase
    .from("partner_payouts")
    .select("provider_metadata")
    .eq("id", payoutId)
    .maybeSingle();
  const nextStatus = result.status;
  const { error: persistError } = await supabase
    .from("partner_payouts")
    .update({
      status: nextStatus,
      provider_payout_id: result.providerPayoutId,
      recipient_amount_minor: result.recipientAmountMinor,
      provider_fee_minor: result.providerFeeMinor,
      processing_at: timestamp,
      paid_at: nextStatus === "paid" ? timestamp : null,
      failed_at: null,
      failure_code: null,
      failure_message: null,
      provider_metadata: {
        ...((current?.provider_metadata as Record<string, unknown> | null) ?? {}),
        checkbookStatus: result.providerStatus,
        depositOptions: result.depositOptions,
        submittedAt: timestamp
      },
      updated_at: timestamp
    })
    .eq("id", payoutId)
    .eq("provider", "checkbook")
    .is("provider_payout_id", null);

  if (persistError) {
    console.error("Checkbook payment created but payout row could not be updated", {
      payoutId,
      providerPayoutId: result.providerPayoutId,
      persistError
    });
    return {
      ok: true,
      payoutId,
      status: "processing",
      reason: "CHECKBOOK_STATUS_PERSIST_FAILED",
      manualReview: true
    };
  }

  return { ok: true, payoutId, status: nextStatus };
}

export async function retryCheckbookPayoutQueue(limit = 12) {
  const config = getCheckbookStatus();
  if (!config.configured) {
    return { configured: false, reason: config.reason, attempted: 0, results: [] as SubmitPayoutResult[] };
  }

  const supabase = getSupabaseServiceClient();
  const retryCutoff = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
  const [reserved, unknown] = await Promise.all([
    supabase
      .from("partner_payouts")
      .select("id,failure_code")
      .eq("provider", "checkbook")
      .eq("status", "reserved")
      .is("provider_payout_id", null)
      .order("requested_at", { ascending: true })
      .limit(Math.max(limit * 5, 25)),
    supabase
      .from("partner_payouts")
      .select("id")
      .eq("provider", "checkbook")
      .eq("status", "processing")
      .eq("failure_code", "CHECKBOOK_SUBMISSION_UNKNOWN")
      .is("provider_payout_id", null)
      .gte("requested_at", retryCutoff)
      .order("requested_at", { ascending: true })
      .limit(limit)
  ]);
  if (reserved.error || unknown.error) {
    throw reserved.error ?? unknown.error;
  }

  const autoRetryCodes = new Set([null, "CHECKBOOK_FUNDING_REQUIRED", "CHECKBOOK_CONFIGURATION_REQUIRED", "CHECKBOOK_MIGRATED_RESERVED"]);
  const reservedIds = (reserved.data ?? [])
    .filter((row) => autoRetryCodes.has(row.failure_code ?? null))
    .map((row) => row.id);
  const ids = Array.from(new Set([...reservedIds, ...(unknown.data ?? []).map((row) => row.id)])).slice(0, limit);
  const results: SubmitPayoutResult[] = [];
  for (const id of ids) {
    const result = await submitCheckbookPayout(id);
    results.push(result);
    if (result.fundingRequired) break;
  }
  return { configured: true, reason: null, attempted: results.length, results };
}
