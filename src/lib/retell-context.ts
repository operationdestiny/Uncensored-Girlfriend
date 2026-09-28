import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupportedLanguage } from "@/lib/ai/prompts";

export type RetellCallContext = {
  v: 2;
  userId: string;
  characterSlug: string;
  language: SupportedLanguage;
  billingCallId: string;
  callCostPerMinute: number;
  exp: number;
};

function secret() {
  const value = process.env.RETELL_CONTEXT_SECRET?.trim();
  if (!value || value.length < 32) {
    throw new Error("RETELL_CONTEXT_SECRET_MISSING");
  }
  return value;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

export function createRetellCallContextToken(values: {
  userId: string;
  characterSlug: string;
  language: SupportedLanguage;
  billingCallId: string;
  callCostPerMinute: number;
}) {
  if (!isUuid(values.billingCallId)) {
    throw new Error("RETELL_BILLING_CALL_ID_INVALID");
  }

  const context: RetellCallContext = {
    v: 2,
    userId: values.userId,
    characterSlug: values.characterSlug,
    language: values.language,
    billingCallId: values.billingCallId,
    callCostPerMinute: Math.max(Math.trunc(values.callCostPerMinute), 1),
    exp: Date.now() + 2 * 60 * 60 * 1000
  };

  const payload = Buffer.from(JSON.stringify(context), "utf8").toString(
    "base64url"
  );
  return `${payload}.${sign(payload)}`;
}

export function verifyRetellCallContextToken(
  token: unknown
): RetellCallContext {
  if (typeof token !== "string" || token.length > 4096) {
    throw new Error("RETELL_CONTEXT_INVALID");
  }

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) {
    throw new Error("RETELL_CONTEXT_INVALID");
  }

  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error("RETELL_CONTEXT_INVALID");
  }

  const parsed = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8")
  ) as Partial<RetellCallContext>;

  const languages = new Set([
    "English",
    "Spanish",
    "French",
    "German",
    "Japanese",
    "Korean"
  ]);

  if (
    parsed.v !== 2 ||
    typeof parsed.userId !== "string" ||
    !parsed.userId ||
    typeof parsed.characterSlug !== "string" ||
    !parsed.characterSlug ||
    typeof parsed.language !== "string" ||
    !languages.has(parsed.language) ||
    !isUuid(parsed.billingCallId) ||
    typeof parsed.callCostPerMinute !== "number" ||
    !Number.isInteger(parsed.callCostPerMinute) ||
    parsed.callCostPerMinute < 1 ||
    parsed.callCostPerMinute > 100000 ||
    typeof parsed.exp !== "number" ||
    parsed.exp < Date.now()
  ) {
    throw new Error("RETELL_CONTEXT_INVALID");
  }

  return parsed as RetellCallContext;
}
