/**
 * DROPP Agency integration boundary.
 *
 * EverBond deliberately does NOT reuse DROPP_API_KEY here. Customer EverCoin checkout
 * remains isolated. Partner onboarding uses the separate DROPP_AGENCY_API_KEY.
 *
 * DROPP's Agency API now documents creator creation/invitation at:
 *   POST https://api.external.dropp.fans/v1/agency/creators
 * using an agency Bearer key with creators:write ("Creators create + invite").
 *
 * DROPP still does not document an arbitrary agency-to-creator payout POST contract in
 * the API reference available to EverBond. Money-moving payouts therefore continue to
 * fail closed and use EverBond's bank-safe manual reservation/settlement fallback.
 */

const DROPP_EXTERNAL_API_BASE = "https://api.external.dropp.fans/v1";

function agencyKey() {
  return process.env.DROPP_AGENCY_API_KEY?.trim() || "";
}

export type DroppAgencyOnboardingStatus = {
  configured: boolean;
  reason?: string;
};

export function getDroppAgencyOnboardingStatus(): DroppAgencyOnboardingStatus {
  if (!agencyKey()) {
    return { configured: false, reason: "DROPP_AGENCY_API_KEY_MISSING" };
  }
  return { configured: true };
}

export type DroppAgencyCreatorRequest = {
  partnerId: string;
  email: string;
  publicName: string;
};

export type DroppAgencyCreatorResult =
  | {
      ok: true;
      providerCreatorId: string;
      status: string;
      email: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
      setupRequired?: boolean;
      ownerActionRequired?: boolean;
    };

type DroppErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    status?: number;
    request_id?: string;
  };
};

type DroppCreatorPayload = {
  id?: string;
  email?: string;
  display_name?: string;
  username?: string | null;
  agency_id?: string | null;
  status?: string;
};

function splitPublicName(publicName: string) {
  const clean = publicName.replace(/\s+/g, " ").trim();
  if (!clean) return { firstName: "EverBond", lastName: "Partner" };
  const parts = clean.split(" ");
  const firstName = (parts.shift() || "Partner").slice(0, 100);
  const lastName = parts.join(" ").trim().slice(0, 100);
  return { firstName, lastName };
}

/**
 * Creates (or safely reuses) a creator inside the EverBond DROPP Agency and causes
 * DROPP to email the creator its account invitation. DROPP documents this endpoint as
 * idempotent on email; EverBond also supplies a deterministic Idempotency-Key so a
 * network retry cannot race-create a second invitation.
 */
export async function createOrInviteDroppAgencyCreator(
  request: DroppAgencyCreatorRequest
): Promise<DroppAgencyCreatorResult> {
  const key = agencyKey();
  if (!key) {
    return {
      ok: false,
      code: "DROPP_AGENCY_API_KEY_MISSING",
      message: "DROPP Agency creator onboarding is not configured.",
      setupRequired: true
    };
  }

  const email = request.email.trim().toLowerCase();
  if (!email) {
    return {
      ok: false,
      code: "PARTNER_EMAIL_REQUIRED",
      message: "A partner email is required for DROPP onboarding.",
      ownerActionRequired: true
    };
  }

  const { firstName, lastName } = splitPublicName(request.publicName);
  const body: Record<string, string> = {
    email,
    first_name: firstName
  };
  if (lastName) body.last_name = lastName;

  let response: Response;
  try {
    response = await fetch(`${DROPP_EXTERNAL_API_BASE}/agency/creators`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `everbond-partner-onboard-${request.partnerId}`
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000)
    });
  } catch (error) {
    return {
      ok: false,
      code: "DROPP_AGENCY_REQUEST_FAILED",
      message: error instanceof Error ? error.message : "DROPP creator onboarding request failed."
    };
  }

  const payload = (await response.json().catch(() => ({}))) as
    | (DroppCreatorPayload & DroppErrorEnvelope)
    | ({ data?: DroppCreatorPayload } & DroppErrorEnvelope);

  if (!response.ok) {
    const apiError = payload.error;
    const code = apiError?.code || `DROPP_HTTP_${response.status}`;
    const message = apiError?.message || "DROPP creator onboarding failed.";

    // DROPP documents this as terminal for API onboarding, most commonly because the
    // email already owns a DROPP account. The agency must link/invite that account in
    // the DROPP dashboard rather than iterating email variants.
    if (response.status === 409 && code === "email_unavailable") {
      return {
        ok: false,
        code: "DROPP_EMAIL_ALREADY_IN_USE",
        message,
        ownerActionRequired: true
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        code,
        message,
        setupRequired: true
      };
    }

    return { ok: false, code, message };
  }

  const creator = ("data" in payload && payload.data ? payload.data : payload) as DroppCreatorPayload;
  const providerCreatorId = creator.id?.trim();
  if (!providerCreatorId) {
    return {
      ok: false,
      code: "DROPP_CREATOR_ID_MISSING",
      message: "DROPP accepted creator onboarding but did not return a creator ID."
    };
  }

  return {
    ok: true,
    providerCreatorId,
    status: creator.status?.trim() || "created",
    email: creator.email?.trim().toLowerCase() || email
  };
}

export type DroppAgencyStatus = {
  configured: boolean;
  reason?: string;
};

/**
 * Status for the actual money-moving Agency payout adapter (not creator onboarding).
 * This remains intentionally separate from getDroppAgencyOnboardingStatus().
 */
export function getDroppAgencyStatus(): DroppAgencyStatus {
  if (!agencyKey()) {
    return { configured: false, reason: "DROPP_AGENCY_API_KEY_MISSING" };
  }
  if (!process.env.DROPP_AGENCY_ID?.trim()) {
    return { configured: false, reason: "DROPP_AGENCY_ID_MISSING" };
  }
  if (!process.env.DROPP_AGENCY_PAYOUT_CREATE_PATH?.trim()) {
    return { configured: false, reason: "DROPP_AGENCY_PAYOUT_ENDPOINT_UNVERIFIED" };
  }
  return { configured: true };
}

export type DroppPartnerPayoutRequest = {
  payoutId: string;
  payoutReference: string;
  providerCreatorId: string;
  amountMinor: number;
  currency: "USD";
};

export type DroppPartnerPayoutResult =
  | { ok: true; providerPayoutId: string; status: "processing" | "paid" }
  | { ok: false; code: string; message: string; setupRequired?: boolean };

export async function createDroppAgencyPartnerPayout(
  request: DroppPartnerPayoutRequest
): Promise<DroppPartnerPayoutResult> {
  const status = getDroppAgencyStatus();
  if (!status.configured) {
    return {
      ok: false,
      code: status.reason ?? "DROPP_AGENCY_NOT_CONFIGURED",
      message: "DROPP Agency payout API setup is not complete.",
      setupRequired: true
    };
  }

  // Safety gate: never invent a money-moving request contract. The endpoint must be
  // explicitly enabled after its exact Agency API payload has been verified in DROPP.
  // PARTNER_DROPP_PAYOUT_CONTRACT_VERSION=1 is only set during that final wiring step.
  if (process.env.PARTNER_DROPP_PAYOUT_CONTRACT_VERSION !== "1") {
    return {
      ok: false,
      code: "DROPP_AGENCY_PAYOUT_CONTRACT_NOT_VERIFIED",
      message: "DROPP Agency payout contract must be verified before money can be sent.",
      setupRequired: true
    };
  }

  // The implementation is intentionally blocked here until the exact verified DROPP
  // agency POST schema is supplied. This protects the existing EverCoin payment key and
  // prevents sending malformed/incorrect creator payouts.
  void request;
  return {
    ok: false,
    code: "DROPP_AGENCY_PAYOUT_CONTRACT_NOT_VERIFIED",
    message: "DROPP Agency payout contract must be verified before money can be sent.",
    setupRequired: true
  };
}
