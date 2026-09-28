import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const PARTNER_REFERRAL_COOKIE = "ug_partner_ref";
export const PARTNER_SESSION_COOKIE = "ug_partner_session";
export const PARTNER_REFERRAL_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const PARTNER_SESSION_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

export type PartnerSession = {
  partnerId: string;
  slug: string;
  publicName: string;
  status: string;
  termsVersionId: string;
};

function secret(name: "PARTNER_REFERRAL_SECRET") {
  const value = process.env[name]?.trim();
  if (!value || value.length < 32) {
    throw new Error(`${name} must be configured with at least 32 characters.`);
  }
  return value;
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashToken(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(value: string) {
  return crypto
    .createHmac("sha256", secret("PARTNER_REFERRAL_SECRET"))
    .update(value)
    .digest("base64url");
}

export type ReferralCookiePayload = {
  partnerId: string;
  linkId: string | null;
  clickedAt: string;
};

export function createReferralCookieValue(payload: ReferralCookiePayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(body)}`;
}

export function verifyReferralCookieValue(value: string | undefined | null): ReferralCookiePayload | null {
  if (!value) return null;
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra) return null;
  let expected: string;
  try {
    expected = hmac(body);
  } catch {
    return null;
  }
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ReferralCookiePayload;
    if (!parsed.partnerId || !parsed.clickedAt) return null;
    const clicked = Date.parse(parsed.clickedAt);
    if (!Number.isFinite(clicked)) return null;
    if (clicked < Date.now() - PARTNER_REFERRAL_MAX_AGE_SECONDS * 1000) return null;
    if (clicked > Date.now() + 5 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function setPartnerSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(PARTNER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PARTNER_SESSION_MAX_AGE_SECONDS
  });
}

export function setReferralCookie(response: NextResponse, value: string) {
  response.cookies.set(PARTNER_REFERRAL_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PARTNER_REFERRAL_MAX_AGE_SECONDS
  });
}

export function clearReferralCookie(response: NextResponse) {
  response.cookies.set(PARTNER_REFERRAL_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
}

export function sanitizePartnerDestination(value: string | null | undefined, fallback = "/") {
  const raw = (value ?? "").trim();
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.includes("\\") || raw.includes("://")) return fallback;
  const pathOnly = raw.split("#", 1)[0];
  const pathname = pathOnly.split("?", 1)[0].toLowerCase();
  if (pathname.startsWith("/api") || pathname.startsWith("/r/") || pathname.startsWith("/partner")) {
    return fallback;
  }
  return raw.slice(0, 500);
}

export function normalizeCampaign(value: string | null | undefined) {
  const clean = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return clean || null;
}

function randomSlugSuffix(bytes = 4) {
  return randomToken(bytes).replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "x1";
}

export function slugifyPartner(value: string) {
  let slug = value
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (slug.length < 3) slug = `partner-${randomSlugSuffix(4)}`;
  return slug;
}

export function requestOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const url = new URL(request.url);
  return url.origin;
}

export async function requireFinanceAdmin(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return { user: null, response: NextResponse.json({ error: "SIGNUP_REQUIRED" }, { status: 401 }) };
  }
  const email = user.email?.trim().toLowerCase() ?? "";
  const allowed = new Set(
    (process.env.FINANCE_ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  if (!email || !allowed.has(email)) {
    return { user: null, response: NextResponse.json({ error: "FINANCE_ADMIN_REQUIRED" }, { status: 403 }) };
  }
  return { user, response: null };
}

export async function getPartnerSession(request: Request): Promise<PartnerSession | null> {
  const token = readCookie(request, PARTNER_SESSION_COOKIE);
  if (!token) return null;
  const supabase = getSupabaseServiceClient();
  const tokenHash = hashToken(token);
  const { data, error } = await supabase
    .from("partner_sessions")
    .select("partner_id,expires_at,revoked_at,partners(id,slug,public_name,status,terms_version_id)")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;
  const partnerRaw = data.partners as unknown;
  const partner = Array.isArray(partnerRaw) ? partnerRaw[0] : partnerRaw;
  if (!partner || typeof partner !== "object") return null;
  const p = partner as { id: string; slug: string; public_name: string; status: string; terms_version_id: string };
  void supabase
    .from("partner_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("token_hash", tokenHash);
  return {
    partnerId: p.id,
    slug: p.slug,
    publicName: p.public_name,
    status: p.status,
    termsVersionId: p.terms_version_id
  };
}

export async function createPartnerSession(partnerId: string) {
  const supabase = getSupabaseServiceClient();
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + PARTNER_SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  const { error } = await supabase.from("partner_sessions").insert({
    partner_id: partnerId,
    token_hash: hashToken(token),
    expires_at: expiresAt
  });
  if (error) throw new Error(`Unable to create partner session: ${error.message}`);
  return { token, expiresAt };
}

export async function uniquePartnerSlug(preferred: string) {
  const supabase = getSupabaseServiceClient();
  const base = slugifyPartner(preferred);
  for (let i = 0; i < 20; i += 1) {
    const candidate = i === 0 ? base : `${base.slice(0, 52)}-${randomSlugSuffix(3)}`;
    const { data } = await supabase.from("partners").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
  }
  return `partner-${randomSlugSuffix(10)}`;
}
