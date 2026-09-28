import sharp from "sharp";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const DEVIANTART_API_BASE = "https://www.deviantart.com/api/v1/oauth2";
const DEVIANTART_TOKEN_URL = "https://www.deviantart.com/oauth2/token";
const DEFAULT_SITE_URL = "https://uncensoredgirlfriend.chat";

// Exact copy requested for every DeviantArt submission.
export const DEVIANTART_TITLE = "Message me? https://uncensoredgirlfriend.chat";
export const DEVIANTART_DESCRIPTION = "Call or message me? 💗 https://uncensoredgirlfriend.chat 💗";

// 30 is DeviantArt's documented tag limit. These intentionally sell the character/look
// first instead of leading with AI/product tags.
export const DEVIANTART_TAGS = [
  "sexygirl",
  "prettygirl",
  "gorgeousgirl",
  "beautifulgirl",
  "hotgirl",
  "cutegirl",
  "blonde",
  "brunette",
  "blondegirl",
  "brunettegirl",
  "baddie",
  "sexywoman",
  "sexywomen",
  "prettywoman",
  "gorgeouswoman",
  "beautifulwoman",
  "hotwoman",
  "beautifulwomen",
  "prettywomen",
  "gorgeouswomen",
  "sexy",
  "pretty",
  "gorgeous",
  "beautiful",
  "hot",
  "cute",
  "beauty",
  "model",
  "fashiongirl",
  "girlfriend"
] as const;

type DeviantArtCharacter = {
  id: string;
  slug: string;
  name: string;
  image_url: string;
  display_order: number;
  stash_item_id: number | null;
};

type OAuthTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  status?: string;
  error?: string;
  error_description?: string;
};

type TokenRow = {
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  scope: string | null;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function deviantArtPublisherEnabled() {
  return new Set(["1", "true", "yes", "on"]).has(
    String(process.env.DEVIANTART_PUBLISHER_ENABLED ?? "false").trim().toLowerCase()
  );
}

export function deviantArtRedirectUri() {
  const explicit = process.env.DEVIANTART_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const site = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
  return `${site}/api/social/deviantart/callback`;
}

export function deviantArtClientId() {
  return requiredEnv("DEVIANTART_CLIENT_ID");
}

function deviantArtClientSecret() {
  return requiredEnv("DEVIANTART_CLIENT_SECRET");
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return {} as Record<string, unknown>;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text } as Record<string, unknown>;
  }
}

function responseError(prefix: string, response: Response, payload: Record<string, unknown>) {
  const detail =
    String(payload.error_description || payload.error || payload.status || payload.raw || "").trim() ||
    response.statusText;
  return new Error(`${prefix} ${response.status}: ${detail}`);
}

async function readStoredToken() {
  const { data, error } = await getSupabaseServiceClient()
    .from("deviantart_oauth_tokens")
    .select("access_token,refresh_token,expires_at,scope")
    .eq("singleton_key", "primary")
    .maybeSingle();

  if (error) throw new Error(`DeviantArt token read failed: ${error.message}`);
  return (data ?? null) as TokenRow | null;
}

async function saveToken(payload: OAuthTokenPayload, fallbackRefreshToken?: string | null) {
  const accessToken = String(payload.access_token || "").trim();
  if (!accessToken) throw new Error("DeviantArt token response did not include access_token");

  const expiresIn = Math.max(60, Number(payload.expires_in || 3600));
  const refreshToken = String(payload.refresh_token || fallbackRefreshToken || "").trim() || null;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const { error } = await getSupabaseServiceClient().from("deviantart_oauth_tokens").upsert(
    {
      singleton_key: "primary",
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      scope: String(payload.scope || "").trim() || null,
      updated_at: new Date().toISOString()
    },
    { onConflict: "singleton_key" }
  );

  if (error) throw new Error(`DeviantArt token save failed: ${error.message}`);
  return accessToken;
}

async function tokenRequest(body: URLSearchParams) {
  const response = await fetch(DEVIANTART_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body,
    cache: "no-store"
  });
  const payload = (await parseResponse(response)) as OAuthTokenPayload;
  if (!response.ok) {
    throw responseError("DeviantArt OAuth failed", response, payload as Record<string, unknown>);
  }
  return payload;
}

export async function exchangeDeviantArtAuthorizationCode(code: string, codeVerifier: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: deviantArtClientId(),
    client_secret: deviantArtClientSecret(),
    code,
    redirect_uri: deviantArtRedirectUri(),
    code_verifier: codeVerifier
  });
  const payload = await tokenRequest(body);
  await saveToken(payload);
}

async function refreshAccessToken(row: TokenRow) {
  if (!row.refresh_token) {
    throw new Error("DeviantArt refresh token is missing. Re-authorize the DeviantArt connection.");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: deviantArtClientId(),
    client_secret: deviantArtClientSecret(),
    refresh_token: row.refresh_token
  });
  const payload = await tokenRequest(body);
  return saveToken(payload, row.refresh_token);
}

async function accessToken() {
  const row = await readStoredToken();
  if (!row) throw new Error("DeviantArt is not authorized yet.");

  const expiresAt = Date.parse(row.expires_at);
  if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 5 * 60 * 1000) {
    return row.access_token;
  }
  return refreshAccessToken(row);
}

async function claimNextCharacter() {
  const { data, error } = await getSupabaseServiceClient().rpc("deviantart_claim_next_characters", {
    p_limit: 1
  });
  if (error) throw new Error(`DeviantArt character claim failed: ${error.message}`);
  return ((data ?? [])[0] ?? null) as DeviantArtCharacter | null;
}

async function saveStashItem(characterId: string, stashItemId: number) {
  const { error } = await getSupabaseServiceClient()
    .from("deviantart_publish_state")
    .update({ stash_item_id: stashItemId, updated_at: new Date().toISOString() })
    .eq("character_id", characterId)
    .eq("status", "processing");

  if (error) throw new Error(`DeviantArt stash tracking failed: ${error.message}`);
}

async function markPublished(characterId: string, deviationId: string | null, deviationUrl: string | null) {
  const { error } = await getSupabaseServiceClient()
    .from("deviantart_publish_state")
    .update({
      status: "published",
      deviation_id: deviationId,
      deviation_url: deviationUrl,
      last_error: null,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("character_id", characterId)
    .eq("status", "processing");

  if (error) throw new Error(`DeviantArt publish tracking failed: ${error.message}`);
}

async function markError(characterId: string, message: string) {
  const { error } = await getSupabaseServiceClient()
    .from("deviantart_publish_state")
    .update({
      status: "error",
      last_error: message.slice(0, 1500),
      updated_at: new Date().toISOString()
    })
    .eq("character_id", characterId)
    .eq("status", "processing");

  if (error) throw new Error(`DeviantArt error tracking failed: ${error.message}`);
}

async function downloadAndConvertImage(character: DeviantArtCharacter) {
  if (!/^https?:\/\//i.test(String(character.image_url || ""))) {
    throw new Error("Character has no valid public image_url");
  }

  const response = await fetch(character.image_url, {
    redirect: "follow",
    headers: { "User-Agent": "EverBondDeviantArtPublisher/1.0" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Character image fetch failed ${response.status}`);

  const source = Buffer.from(await response.arrayBuffer());
  if (source.length === 0) throw new Error("Character image was empty");

  // EverBond images can stay .webp. Only the temporary DeviantArt upload copy is
  // converted to JPEG so DeviantArt treats it as an image and does not ask for a cover.
  const jpeg = await sharp(source)
    .rotate()
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer();

  const safeSlug = String(character.slug || character.id)
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "everbond-character";

  return { jpeg, filename: `${safeSlug}.jpg` };
}

function appendTags(form: FormData) {
  DEVIANTART_TAGS.forEach((tag, index) => form.append(`tags[${index}]`, tag));
}

async function deviantArtPost(path: string, form: FormData) {
  const token = await accessToken();
  const response = await fetch(`${DEVIANTART_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "dA-minor-version": "20240701"
    },
    body: form,
    cache: "no-store"
  });

  const payload = await parseResponse(response);
  if (!response.ok) throw responseError(`DeviantArt API ${path} failed`, response, payload);
  if (String(payload.status || "").toLowerCase() === "error" || payload.error) {
    throw new Error(`DeviantArt API ${path} rejected the request: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function numberFromPayload(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const nested = payload.result;
  if (nested && typeof nested === "object") {
    return numberFromPayload(nested as Record<string, unknown>, keys);
  }
  return null;
}

function stringFromPayload(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = String(payload[key] || "").trim();
    if (value) return value;
  }
  const nested = payload.result;
  if (nested && typeof nested === "object") {
    return stringFromPayload(nested as Record<string, unknown>, keys);
  }
  return null;
}

async function submitToStash(character: DeviantArtCharacter) {
  const { jpeg, filename } = await downloadAndConvertImage(character);
  const form = new FormData();
  form.append("title", DEVIANTART_TITLE);
  form.append("artist_comments", DEVIANTART_DESCRIPTION);
  appendTags(form);

  const jpegArrayBuffer = new ArrayBuffer(jpeg.byteLength);
  new Uint8Array(jpegArrayBuffer).set(jpeg);
  form.append("file", new Blob([jpegArrayBuffer], { type: "image/jpeg" }), filename);

  // Intentionally do NOT send AI, NoAI, gallery, watermark, download, feature,
  // license, or other optional label/settings. Those remain DeviantArt defaults.
  const payload = await deviantArtPost("/stash/submit", form);
  const itemId = numberFromPayload(payload, ["itemid", "stashid", "item_id", "stash_id"]);
  if (!itemId) throw new Error("DeviantArt Sta.sh submit succeeded but returned no item id");
  return itemId;
}

async function publishStashItem(itemId: number) {
  const form = new FormData();
  form.append("itemid", String(itemId));
  form.append("is_mature", "false");
  appendTags(form);

  // is_mature is required by the publish endpoint. Every other optional label/setting
  // is omitted so it remains at DeviantArt's default.
  return deviantArtPost("/stash/publish", form);
}

export async function publishNextDeviantArtCharacter() {
  const character = await claimNextCharacter();
  if (!character) {
    return { attempted: 0, published: 0, reason: "No eligible characters remain." };
  }

  try {
    let itemId = character.stash_item_id;
    if (!itemId) {
      itemId = await submitToStash(character);
      await saveStashItem(character.id, itemId);
    }

    const published = await publishStashItem(itemId);
    const deviationId = stringFromPayload(published, ["deviationid", "deviation_id", "id"]);
    const deviationUrl = stringFromPayload(published, ["url", "deviationurl", "deviation_url"]);
    await markPublished(character.id, deviationId, deviationUrl);

    return {
      attempted: 1,
      published: 1,
      characterId: character.id,
      characterName: character.name,
      deviationId,
      deviationUrl
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markError(character.id, message);
    throw error;
  }
}
