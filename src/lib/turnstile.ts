const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type SiteverifyResult = {
  success?: boolean;
  hostname?: string;
  action?: string;
  cdata?: string;
  "error-codes"?: string[];
};

export function turnstileConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() &&
      process.env.TURNSTILE_SECRET_KEY?.trim()
  );
}

export async function verifyTurnstileToken(values: {
  token: string;
  remoteIp?: string | null;
}) {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return false;

  const response = await fetch(SITEVERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret,
      response: values.token,
      remoteip: values.remoteIp || undefined
    }),
    cache: "no-store"
  });

  if (!response.ok) return false;
  const result = (await response.json().catch(() => ({}))) as SiteverifyResult;
  return result.success === true;
}
