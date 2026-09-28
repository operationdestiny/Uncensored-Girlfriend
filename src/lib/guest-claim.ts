import { createHmac, timingSafeEqual } from "node:crypto";

type GuestClaimPayload = {
  guestUserId: string;
  exp: number;
  nonce: string;
};

function secret() {
  const value =
    process.env.GUEST_CLAIM_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!value) {
    throw new Error("GUEST_CLAIM_SECRET_NOT_CONFIGURED");
  }

  return value;
}

function sign(encodedPayload: string) {
  return createHmac("sha256", secret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createGuestClaimToken(guestUserId: string) {
  const payload: GuestClaimPayload = {
    guestUserId,
    exp: Date.now() + 20 * 60 * 1000,
    nonce: crypto.randomUUID()
  };

  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );

  return `${encoded}.${sign(encoded)}`;
}

export function verifyGuestClaimToken(token: string) {
  const [encoded, suppliedSignature] = token.split(".");
  if (!encoded || !suppliedSignature) return null;

  const expectedSignature = sign(encoded);
  const supplied = Buffer.from(suppliedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");

  if (supplied.length !== expected.length) return null;
  if (!timingSafeEqual(supplied, expected)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as GuestClaimPayload;

    if (!payload.guestUserId || !payload.exp || payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
