import { createHmac, timingSafeEqual } from "node:crypto";

const CHECKBOOK_PRODUCTION_BASE = "https://api.checkbook.io";
const CHECKBOOK_SANDBOX_BASE = "https://api.sandbox.checkbook.io";
const ALLOWED_DEPOSIT_OPTIONS = new Set([
  "BANK",
  "CARD",
  "RTP",
  "PAYPAL",
  "VENMO",
  "WIRE",
  "VCC",
  "WALLET",
  "PRINT",
  "MAIL"
]);
const INSTANT_OPTIONS = new Set(["CARD", "RTP", "PAYPAL", "VENMO", "WIRE", "VCC", "WALLET"]);

export type CheckbookConfigStatus = {
  configured: boolean;
  reason: string | null;
  environment: "production" | "sandbox";
  sourceMode: "wallet" | "bank";
  sourceAccountConfigured: boolean;
  depositOptions: string[];
  payoutFeeMinor: number;
};

export type CheckbookCreateResult =
  | {
      ok: true;
      providerPayoutId: string;
      providerStatus: string;
      status: "processing" | "paid";
      recipientAmountMinor: number;
      providerFeeMinor: number;
      depositOptions: string[];
    }
  | {
      ok: false;
      code: string;
      message: string;
      fundingRequired?: boolean;
      retryable?: boolean;
      unknownResult?: boolean;
      configurationRequired?: boolean;
    };

function clean(value: string | undefined) {
  return value?.trim() ?? "";
}

function environment() {
  return clean(process.env.CHECKBOOK_ENV).toLowerCase() === "sandbox" ? "sandbox" : "production";
}

function apiBase() {
  return environment() === "sandbox" ? CHECKBOOK_SANDBOX_BASE : CHECKBOOK_PRODUCTION_BASE;
}

function sourceMode(): "wallet" | "bank" {
  return clean(process.env.CHECKBOOK_SOURCE_MODE).toLowerCase() === "bank" ? "bank" : "wallet";
}

export function checkbookDepositOptions() {
  const raw = clean(process.env.CHECKBOOK_DEPOSIT_OPTIONS) || "BANK";
  const options = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => ALLOWED_DEPOSIT_OPTIONS.has(value));
  return Array.from(new Set(options.length ? options : ["BANK"]));
}

export function checkbookPayoutFeeMinor() {
  const raw = clean(process.env.CHECKBOOK_PAYOUT_FEE_MINOR);
  const parsed = Number.parseInt(raw, 10);
  return /^\d+$/.test(raw) && Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function getCheckbookStatus(): CheckbookConfigStatus {
  const publishableKey = clean(process.env.CHECKBOOK_PUBLISHABLE_KEY);
  const secretKey = clean(process.env.CHECKBOOK_SECRET_KEY);
  const webhookKey = clean(process.env.CHECKBOOK_WEBHOOK_KEY);
  const mode = sourceMode();
  const sourceAccount = clean(process.env.CHECKBOOK_SOURCE_ACCOUNT_ID);
  const depositOptions = checkbookDepositOptions();
  const payoutFeeRaw = clean(process.env.CHECKBOOK_PAYOUT_FEE_MINOR);

  let reason: string | null = null;
  if (!publishableKey) reason = "CHECKBOOK_PUBLISHABLE_KEY_MISSING";
  else if (!secretKey) reason = "CHECKBOOK_SECRET_KEY_MISSING";
  else if (!webhookKey) reason = "CHECKBOOK_WEBHOOK_KEY_MISSING";
  else if (!/^\d+$/.test(payoutFeeRaw)) reason = "CHECKBOOK_PAYOUT_FEE_MINOR_MISSING";
  else if (mode === "wallet" && !sourceAccount) reason = "CHECKBOOK_SOURCE_ACCOUNT_ID_MISSING";
  else if (mode !== "wallet" && depositOptions.some((option) => INSTANT_OPTIONS.has(option))) {
    reason = "CHECKBOOK_INSTANT_RAIL_REQUIRES_WALLET";
  }

  return {
    configured: reason === null,
    reason,
    environment: environment(),
    sourceMode: mode,
    sourceAccountConfigured: Boolean(sourceAccount),
    depositOptions,
    payoutFeeMinor: checkbookPayoutFeeMinor()
  };
}

function authHeader() {
  return `${clean(process.env.CHECKBOOK_PUBLISHABLE_KEY)}:${clean(process.env.CHECKBOOK_SECRET_KEY)}`;
}

function messageFromBody(body: unknown) {
  if (!body || typeof body !== "object") return "Checkbook request failed";
  const record = body as Record<string, unknown>;
  for (const key of ["message", "error", "detail", "description"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 500);
  }
  return "Checkbook request failed";
}

function fundingFailure(status: number, message: string) {
  return (
    status === 402 ||
    /insufficient(?: funds)?|not enough funds|wallet(?: balance)?|prefund|available funds|funds? (?:are )?not available/i.test(message)
  );
}

function providerStatusToInternal(status: string): "processing" | "paid" {
  return status.toUpperCase() === "PAID" ? "paid" : "processing";
}

export async function createCheckbookPartnerPayout(input: {
  payoutId: string;
  payoutReference: string;
  partnerName: string;
  recipientEmail: string;
  amountMinor: number;
  idempotencyKey: string;
}): Promise<CheckbookCreateResult> {
  const config = getCheckbookStatus();
  if (!config.configured) {
    return {
      ok: false,
      code: config.reason || "CHECKBOOK_NOT_CONFIGURED",
      message: "Checkbook payout automation is not fully configured.",
      configurationRequired: true
    };
  }

  const providerFeeMinor = config.payoutFeeMinor;
  const recipientAmountMinor = input.amountMinor - providerFeeMinor;
  if (recipientAmountMinor <= 0) {
    return {
      ok: false,
      code: "PAYOUT_AMOUNT_BELOW_PROVIDER_FEE",
      message: "The requested cashout is not large enough after the configured payout fee."
    };
  }

  const payload: Record<string, unknown> = {
    name: input.partnerName,
    recipient: input.recipientEmail,
    amount: Number((recipientAmountMinor / 100).toFixed(2)),
    description: `EverBond affiliate payout ${input.payoutReference}`,
    deposit_options: config.depositOptions
  };

  const sourceAccount = clean(process.env.CHECKBOOK_SOURCE_ACCOUNT_ID);
  if (config.sourceMode === "wallet" && sourceAccount) payload.account = sourceAccount;

  let response: Response;
  try {
    response = await fetch(`${apiBase()}/v3/check/digital`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: authHeader(),
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkbook request did not complete";
    return {
      ok: false,
      code: "CHECKBOOK_SUBMISSION_UNKNOWN",
      message: message.slice(0, 500),
      retryable: true,
      unknownResult: true
    };
  }

  const body = (await response.json().catch(() => null)) as
    | { id?: unknown; status?: unknown }
    | Record<string, unknown>
    | null;

  if (!response.ok) {
    const message = messageFromBody(body);
    if (fundingFailure(response.status, message)) {
      return {
        ok: false,
        code: "CHECKBOOK_FUNDING_REQUIRED",
        message,
        fundingRequired: true,
        retryable: true
      };
    }
    if (response.status >= 500 || response.status === 408 || response.status === 429) {
      return {
        ok: false,
        code: "CHECKBOOK_SUBMISSION_UNKNOWN",
        message,
        retryable: true,
        unknownResult: true
      };
    }
    return {
      ok: false,
      code: `CHECKBOOK_HTTP_${response.status}`,
      message
    };
  }

  const providerPayoutId = typeof body?.id === "string" ? body.id.trim() : "";
  if (!providerPayoutId) {
    return {
      ok: false,
      code: "CHECKBOOK_RESPONSE_MISSING_ID",
      message: "Checkbook accepted the request but did not return a payment ID.",
      unknownResult: true
    };
  }

  const providerStatus = typeof body?.status === "string" ? body.status.toUpperCase() : "UNPAID";
  return {
    ok: true,
    providerPayoutId,
    providerStatus,
    status: providerStatusToInternal(providerStatus),
    recipientAmountMinor,
    providerFeeMinor,
    depositOptions: config.depositOptions
  };
}

export function verifyCheckbookWebhook(rawBody: string, signatureHeader: string | null) {
  const webhookKey = clean(process.env.CHECKBOOK_WEBHOOK_KEY);
  if (!webhookKey || !signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader
      .split(",")
      .map((part) => part.trim().split("=", 2))
      .filter((pair) => pair.length === 2)
  );
  const nonce = parts.nonce?.trim();
  const signature = parts.signature?.trim().toLowerCase();
  if (!nonce || !signature || !/^[a-f0-9]{64}$/.test(signature)) return false;

  const expected = createHmac("sha256", webhookKey)
    .update(`${rawBody}${nonce}`, "utf8")
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}
