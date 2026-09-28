import { getSupabaseServiceClient } from "@/lib/supabase/server";

const PINTEREST_API_BASE = "https://api.pinterest.com/v5";
const PINTEREST_TOKEN_URL = `${PINTEREST_API_BASE}/oauth/token`;
const DEFAULT_SITE_URL = "https://uncensoredgirlfriend.chat";

type PinterestCharacter = {
  id: string;
  slug: string;
  name: string;
  image_url: string;
  display_order: number | null;
};

type PinterestTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  refresh_token_expires_at?: number;
  scope?: string;
  token_type?: string;
  response_type?: string;
  code?: number;
  message?: string;
  error?: string;
  error_description?: string;
};

type PinterestTokenRow = {
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  refresh_token_expires_at: string | null;
  scope: string | null;
};

type PinterestPinPayload = {
  id?: string;
  code?: number;
  message?: string;
};

class PinterestHttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PinterestHttpError";
    this.status = status;
  }
}

class PinterestSafeRetryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PinterestSafeRetryError";
  }
}

function envFirst(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function requiredEnv(...names: string[]) {
  const value = envFirst(...names);
  if (!value) {
    throw new PinterestSafeRetryError(
      `Missing required environment variable: ${names.join(" or ")}`
    );
  }
  return value;
}

export function pinterestPublisherEnabled() {
  return new Set(["1", "true", "yes", "on"]).has(
    String(process.env.PINTEREST_PUBLISHER_ENABLED ?? "false")
      .trim()
      .toLowerCase()
  );
}

export function pinterestClientId() {
  return requiredEnv("PINTEREST_APP_ID", "PINTEREST_CLIENT_ID");
}

function pinterestClientSecret() {
  return requiredEnv("PINTEREST_APP_SECRET", "PINTEREST_CLIENT_SECRET");
}

export function pinterestRedirectUri() {
  const explicit = process.env.PINTEREST_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const site = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(
    /\/+$/,
    ""
  );
  return `${site}/api/social/pinterest/callback`;
}

export function pinterestSetupSecret() {
  return envFirst("PINTEREST_SETUP_SECRET");
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(
    /\/+$/,
    ""
  );
}

function characterUrl(character: PinterestCharacter) {
  const slug = String(character.slug || "").trim();
  return slug
    ? `${siteUrl()}/chat/${encodeURIComponent(slug)}`
    : siteUrl();
}

function basicAuth() {
  return Buffer.from(
    `${pinterestClientId()}:${pinterestClientSecret()}`,
    "utf8"
  ).toString("base64");
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return {} as Record<string, unknown>;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text } as Record<string, unknown>;
  }
}

function httpError(
  prefix: string,
  response: Response,
  payload: Record<string, unknown>
) {
  const detail = String(
    payload.message ||
      payload.error_description ||
      payload.error ||
      payload.raw ||
      response.statusText
  ).trim();

  return new PinterestHttpError(
    `${prefix} ${response.status}: ${detail || "Unknown error"}`,
    response.status
  );
}

async function tokenRequest(body: URLSearchParams) {
  const response = await fetch(PINTEREST_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body,
    cache: "no-store"
  });

  const payload = (await parseJson(response)) as PinterestTokenPayload;
  if (!response.ok || !payload.access_token) {
    throw httpError(
      "Pinterest OAuth failed",
      response,
      payload as Record<string, unknown>
    );
  }
  return payload;
}

async function saveToken(
  payload: PinterestTokenPayload,
  fallbackRefreshToken?: string | null
) {
  const accessToken = String(payload.access_token || "").trim();
  if (!accessToken) {
    throw new PinterestSafeRetryError(
      "Pinterest token response did not include access_token"
    );
  }

  const refreshToken =
    String(payload.refresh_token || fallbackRefreshToken || "").trim() || null;
  const expiresIn = Math.max(60, Number(payload.expires_in || 2592000));
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  let refreshTokenExpiresAt: string | null = null;
  const absoluteRefreshExpiry = Number(payload.refresh_token_expires_at || 0);

  if (Number.isFinite(absoluteRefreshExpiry) && absoluteRefreshExpiry > 0) {
    refreshTokenExpiresAt = new Date(
      absoluteRefreshExpiry * 1000
    ).toISOString();
  } else {
    const refreshExpiresIn = Number(payload.refresh_token_expires_in || 0);
    if (Number.isFinite(refreshExpiresIn) && refreshExpiresIn > 0) {
      refreshTokenExpiresAt = new Date(
        Date.now() + refreshExpiresIn * 1000
      ).toISOString();
    }
  }

  const { error } = await getSupabaseServiceClient()
    .from("pinterest_oauth_tokens")
    .upsert(
      {
        singleton_key: "primary",
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        refresh_token_expires_at: refreshTokenExpiresAt,
        scope: String(payload.scope || "").trim() || null,
        updated_at: new Date().toISOString()
      },
      { onConflict: "singleton_key" }
    );

  if (error) {
    throw new PinterestSafeRetryError(
      `Pinterest token save failed: ${error.message}`
    );
  }
  return accessToken;
}

export async function exchangePinterestAuthorizationCode(code: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: pinterestRedirectUri()
  });
  const payload = await tokenRequest(body);
  await saveToken(payload);
}

async function readStoredToken() {
  const { data, error } = await getSupabaseServiceClient()
    .from("pinterest_oauth_tokens")
    .select(
      "access_token,refresh_token,expires_at,refresh_token_expires_at,scope"
    )
    .eq("singleton_key", "primary")
    .maybeSingle();

  if (error) {
    throw new PinterestSafeRetryError(
      `Pinterest token read failed: ${error.message}`
    );
  }
  return (data ?? null) as PinterestTokenRow | null;
}

async function refreshWithToken(refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
  const payload = await tokenRequest(body);
  return saveToken(payload, refreshToken);
}

async function forceRefreshAccessToken() {
  const row = await readStoredToken();
  const refreshToken =
    row?.refresh_token || envFirst("PINTEREST_REFRESH_TOKEN");

  if (!refreshToken) {
    throw new PinterestSafeRetryError(
      "Pinterest refresh token is missing. Re-authorize Pinterest."
    );
  }
  return refreshWithToken(refreshToken);
}

async function accessToken() {
  const row = await readStoredToken();

  if (row) {
    const expiresAt = Date.parse(row.expires_at);
    if (
      Number.isFinite(expiresAt) &&
      expiresAt > Date.now() + 5 * 60 * 1000
    ) {
      return row.access_token;
    }
    return forceRefreshAccessToken();
  }

  const compatibilityToken = envFirst("PINTEREST_ACCESS_TOKEN");
  if (compatibilityToken) return compatibilityToken;

  if (envFirst("PINTEREST_REFRESH_TOKEN")) {
    return forceRefreshAccessToken();
  }

  throw new PinterestSafeRetryError(
    "Pinterest is not authorized yet. Complete the Pinterest connection flow."
  );
}

async function pinterestRequest(
  path: string,
  token: string,
  init: RequestInit
) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${PINTEREST_API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });
  const payload = await parseJson(response);
  return { response, payload };
}

async function pinterestApi(path: string, init: RequestInit = {}) {
  let token = await accessToken();
  let result = await pinterestRequest(path, token, init);

  // A stored or compatibility access token can become invalid before its
  // recorded expiration. If Pinterest returns 401, refresh once and retry.
  if (result.response.status === 401) {
    token = await forceRefreshAccessToken();
    result = await pinterestRequest(path, token, init);
  }

  if (!result.response.ok) {
    throw httpError(
      `Pinterest API ${path} failed`,
      result.response,
      result.payload
    );
  }

  return result.payload;
}

export async function listPinterestBoards() {
  const payload = await pinterestApi("/boards?page_size=100");
  const items = Array.isArray(payload.items) ? payload.items : [];

  return items.map((item) => {
    const value = item as Record<string, unknown>;
    return {
      id: String(value.id || ""),
      name: String(value.name || ""),
      privacy: String(value.privacy || "")
    };
  });
}

async function claimNextCharacter() {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "pinterest_claim_next_characters",
    { p_limit: 1 }
  );

  if (error) {
    throw new PinterestSafeRetryError(
      `Pinterest character claim failed: ${error.message}`
    );
  }
  return ((data ?? [])[0] ?? null) as PinterestCharacter | null;
}

async function markPublished(characterId: string, pinId: string) {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseServiceClient()
    .from("pinterest_publish_state")
    .update({
      status: "published",
      pinterest_pin_id: pinId,
      last_error: null,
      published_at: now,
      updated_at: now
    })
    .eq("character_id", characterId)
    .eq("status", "processing")
    .select("character_id")
    .maybeSingle();

  if (error) {
    throw new Error(`Pinterest tracking update failed: ${error.message}`);
  }
  if (!data) {
    throw new Error(
      "Pinterest accepted the Pin but the tracking row could not be finalized."
    );
  }
}

async function markError(characterId: string, message: string) {
  const { error } = await getSupabaseServiceClient()
    .from("pinterest_publish_state")
    .update({
      status: "error",
      last_error: message.slice(0, 1500),
      updated_at: new Date().toISOString()
    })
    .eq("character_id", characterId)
    .eq("status", "processing");

  if (error) {
    throw new Error(`Pinterest error tracking failed: ${error.message}`);
  }
}

function pinTitle(character: PinterestCharacter) {
  const name = String(character.name || "EverBond character").trim();
  return `${name} | EverBond AI`.slice(0, 100);
}

function pinDescription(character: PinterestCharacter) {
  const name = String(character.name || "this character").trim();
  return `Meet ${name} on EverBond AI. Call or chat anytime and build a relationship that remembers you.`.slice(
    0,
    500
  );
}

async function createPin(character: PinterestCharacter) {
  const imageUrl = String(character.image_url || "").trim();
  if (!/^https?:\/\//i.test(imageUrl)) {
    throw new PinterestSafeRetryError(
      "Character has no valid public image_url"
    );
  }

  const boardId = requiredEnv("PINTEREST_BOARD_ID");
  const payload = (await pinterestApi("/pins", {
    method: "POST",
    body: JSON.stringify({
      board_id: boardId,
      link: characterUrl(character),
      title: pinTitle(character),
      description: pinDescription(character),
      alt_text: `${String(
        character.name || "EverBond character"
      ).trim()} on EverBond AI`.slice(0, 500),
      media_source: {
        source_type: "image_url",
        url: imageUrl
      }
    })
  })) as PinterestPinPayload;

  const pinId = String(payload.id || "").trim();
  if (!pinId) {
    // Pinterest returned success but not enough information to safely retry.
    throw new Error(
      "Pinterest accepted the request but returned no Pin id; holding this character to prevent a duplicate."
    );
  }
  return pinId;
}

function safeToRetry(error: unknown) {
  if (error instanceof PinterestSafeRetryError) return true;
  return (
    error instanceof PinterestHttpError &&
    error.status >= 400 &&
    error.status < 500
  );
}

export async function publishNextPinterestCharacter() {
  const character = await claimNextCharacter();

  if (!character) {
    return {
      attempted: 0,
      published: 0,
      status: "empty" as const,
      reason: "No eligible characters remain."
    };
  }

  let pinId: string;

  try {
    pinId = await createPin(character);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    if (safeToRetry(error)) {
      await markError(character.id, message).catch(() => undefined);
      return {
        attempted: 1,
        published: 0,
        status: "error" as const,
        characterId: character.id,
        characterName: character.name,
        error: message.slice(0, 500)
      };
    }

    // Network/5xx/unknown failures can be ambiguous after a POST. Keep the
    // row in processing so the same image is never automatically posted twice.
    return {
      attempted: 1,
      published: 0,
      status: "held" as const,
      characterId: character.id,
      characterName: character.name,
      error: message.slice(0, 500),
      reason: "Ambiguous Pinterest response; held to prevent duplicate posting."
    };
  }

  try {
    await markPublished(character.id, pinId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    // The Pin already exists remotely. Never change this row to error/retry.
    return {
      attempted: 1,
      published: 1,
      status: "tracking_error" as const,
      characterId: character.id,
      characterName: character.name,
      pinId,
      error: message.slice(0, 500),
      reason:
        "Pinterest accepted the Pin, but local tracking could not be finalized. Held to prevent a duplicate."
    };
  }

  return {
    attempted: 1,
    published: 1,
    status: "published" as const,
    characterId: character.id,
    characterName: character.name,
    pinId,
    pinUrl: `https://www.pinterest.com/pin/${encodeURIComponent(pinId)}/`
  };
}

export async function runPinterestPublisherBatch(requested = 1) {
  const limit = Math.max(1, Math.min(Number(requested || 1), 5));
  const results: Array<Record<string, unknown>> = [];
  let attempted = 0;
  let published = 0;
  let held = 0;
  let stopReason: string | null = null;

  for (let index = 0; index < limit; index += 1) {
    const result = await publishNextPinterestCharacter();

    if (!result.attempted) {
      stopReason = String(result.reason || "No eligible characters remain.");
      break;
    }

    attempted += Number(result.attempted || 0);
    published += Number(result.published || 0);
    if (
      result.status === "held" ||
      result.status === "tracking_error"
    ) {
      held += 1;
    }

    results.push(result as unknown as Record<string, unknown>);

    // Stop a batch on any non-success result. The next scheduled run can
    // continue with the next eligible character without hammering an API
    // that may be unavailable or misconfigured.
    if (result.status !== "published") {
      stopReason = String(
        result.reason ||
          result.error ||
          "Pinterest publishing stopped for this run."
      );
      break;
    }
  }

  return { attempted, published, held, results, stopReason };
}
