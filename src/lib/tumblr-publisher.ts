import { createHash, randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

// tumblr.js is intentionally server-only. Keeping the integration in this file
// prevents any Tumblr code from entering EverBond's client bundle or UI.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tumblr = require("tumblr.js") as {
  createClient(options: {
    consumer_key: string;
    consumer_secret: string;
    token: string;
    token_secret: string;
  }): {
    createPost(blog: string, options: Record<string, unknown>): Promise<unknown>;
  };
};

const TUMBLR_BLOG = "everbondaiofficial";
const BATCH_LIMIT = 1;
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://uncensoredgirlfriend.chat").replace(/\/+$/, "");

export type TumblrCharacter = {
  id: string;
  slug: string;
  name: string;
  section: string;
  role: string;
  tags: string[] | null;
  title: string;
  image_url: string;
  display_order: number;
};

type TumblrResult = {
  characterId: string;
  name: string;
  status: "queued" | "error" | "stopped" | "tracking_error";
  tumblrPostId?: string | null;
  error?: string;
  reason?: string;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function tumblrPublisherEnabled() {
  const disabled = new Set(["0", "false", "off", "no"]);
  return !disabled.has(String(process.env.PUBLISHER_ENABLED ?? "true").trim().toLowerCase());
}

function tumblrClient() {
  return tumblr.createClient({
    consumer_key: requiredEnv("TUMBLR_CONSUMER_KEY"),
    consumer_secret: requiredEnv("TUMBLR_CONSUMER_SECRET"),
    token: requiredEnv("TUMBLR_TOKEN"),
    token_secret: requiredEnv("TUMBLR_TOKEN_SECRET")
  });
}

function cleanTag(value: unknown) {
  return String(value || "")
    .replace(/^#+/, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function uniqueTags(values: unknown[], maximum = 18) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    const tag = cleanTag(raw);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= maximum) break;
  }

  return result;
}

function seededNumber(value: unknown) {
  const hex = createHash("sha1")
    .update(String(value || ""))
    .digest("hex")
    .slice(0, 8);
  return Number.parseInt(hex, 16) || 0;
}

function rotate<T>(values: T[], seed: unknown) {
  if (values.length === 0) return [];
  const start = seededNumber(seed) % values.length;
  return [...values.slice(start), ...values.slice(0, start)];
}

function audienceClass(character: TumblrCharacter) {
  const section = String(character.section || "").toLowerCase();
  const haystack = [
    character.section,
    character.role,
    character.title,
    ...(Array.isArray(character.tags) ? character.tags : [])
  ]
    .join(" ")
    .toLowerCase();

  if (section.includes("guys")) return "male" as const;
  if (section.includes("girls")) return "female" as const;

  if (/(boyfriend|husband|fianc[eé](?!e)|\bman\b|\bguy\b|male|brother|prince|king|\bboy\b)/i.test(haystack)) {
    return "male" as const;
  }
  if (/(girlfriend|wife|fianc[eé]e|\bwoman\b|\bgirl\b|female|sister|princess|queen)/i.test(haystack)) {
    return "female" as const;
  }
  return "neutral" as const;
}

const FEMALE_CORE = [
  "beautiful woman",
  "pretty girl",
  "beautiful girl",
  "gorgeous girl",
  "beauty",
  "feminine"
];

const FEMALE_ROTATION = [
  "cute girl",
  "pretty face",
  "beautiful face",
  "gorgeous woman",
  "model",
  "female beauty",
  "feminine aesthetic",
  "glamour",
  "baddie",
  "soft girl",
  "it girl",
  "girl aesthetic",
  "beauty aesthetic",
  "pretty women",
  "beautiful women"
];

const MALE_CORE = [
  "handsome man",
  "handsome guy",
  "attractive man",
  "male model",
  "pretty boy",
  "mens style"
];

const MALE_ROTATION = [
  "beautiful man",
  "handsome men",
  "good looking guy",
  "mens fashion",
  "masculine",
  "male beauty",
  "boyfriend aesthetic",
  "heartthrob",
  "aesthetic guy",
  "handsome face",
  "model"
];

const NEUTRAL_CORE = ["aesthetic", "beauty", "character aesthetic", "romance", "style", "model"];

const STYLE_RULES: Array<[string, string]> = [
  ["brunette", "brunette beauty"],
  ["blonde", "blonde beauty"],
  ["redhead", "redhead beauty"],
  ["goth", "goth girl"],
  ["soft girl", "soft girl aesthetic"],
  ["y2k", "y2k girl"],
  ["cowgirl", "cowgirl"],
  ["pirate", "pirate girl"],
  ["princess", "princess aesthetic"],
  ["vampire", "vampire aesthetic"],
  ["witch", "witch aesthetic"],
  ["elf", "fantasy aesthetic"],
  ["anime", "anime girl"],
  ["fantasy", "fantasy girl"],
  ["denim", "denim outfit"],
  ["dress", "dress"],
  ["glasses", "girls with glasses"],
  ["tattoo", "tattoo aesthetic"],
  ["beach", "beach aesthetic"],
  ["gym", "fitness girl"],
  ["fitness", "fitness girl"],
  ["gamer", "gamer girl"],
  ["cosplay", "cosplay girl"]
];

function styleTagsFor(character: TumblrCharacter) {
  const haystack = [
    character.section,
    character.role,
    character.title,
    ...(Array.isArray(character.tags) ? character.tags : [])
  ]
    .join(" ")
    .toLowerCase();

  return STYLE_RULES.flatMap(([needle, tag]) => (haystack.includes(needle) ? [tag] : []));
}

export function tumblrTagsFor(character: TumblrCharacter) {
  const kind = audienceClass(character);
  const seed = character.id || character.slug || character.name;
  const styles = styleTagsFor(character);

  if (kind === "female") {
    return uniqueTags([
      ...FEMALE_CORE,
      ...rotate(FEMALE_ROTATION, seed).slice(0, 7),
      ...styles
    ]);
  }

  if (kind === "male") {
    return uniqueTags([
      ...MALE_CORE,
      ...rotate(MALE_ROTATION, seed).slice(0, 7),
      ...styles
    ]);
  }

  return uniqueTags([
    ...NEUTRAL_CORE,
    ...rotate([...FEMALE_ROTATION, ...MALE_ROTATION], seed).slice(0, 7),
    ...styles
  ]);
}

async function claimNextCharacters() {
  const { data, error } = await getSupabaseServiceClient().rpc("tumblr_claim_next_characters", {
    p_limit: BATCH_LIMIT
  });

  if (error) throw new Error(`Tumblr character claim failed: ${error.message}`);
  return (data ?? []) as TumblrCharacter[];
}

async function markQueued(characterId: string, tumblrPostId: string | null) {
  const { error } = await getSupabaseServiceClient()
    .from("tumblr_publish_state")
    .update({
      status: "queued",
      tumblr_post_id: tumblrPostId,
      last_error: null,
      queued_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("character_id", characterId)
    .eq("status", "processing");

  if (error) throw new Error(`Tumblr tracking update failed: ${error.message}`);
}

async function markError(characterId: string, message: string) {
  const { error } = await getSupabaseServiceClient()
    .from("tumblr_publish_state")
    .update({
      status: "error",
      last_error: message.slice(0, 1500),
      updated_at: new Date().toISOString()
    })
    .eq("character_id", characterId)
    .eq("status", "processing");

  if (error) throw new Error(`Tumblr tracking error update failed: ${error.message}`);
}

async function releaseClaims(characterIds: string[]) {
  if (characterIds.length === 0) return;
  const { error } = await getSupabaseServiceClient()
    .from("tumblr_publish_state")
    .delete()
    .in("character_id", characterIds)
    .eq("status", "processing");

  if (error) throw new Error(`Tumblr claim release failed: ${error.message}`);
}

function tumblrErrorText(error: unknown) {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function tumblrStatus(error: unknown) {
  const text = tumblrErrorText(error);
  const match = text.match(/API error:\s*(\d{3})/i) || text.match(/\b(4\d\d|5\d\d)\b/);
  return match ? Number(match[1]) : 0;
}

function isQueueFull(error: unknown) {
  const text = tumblrErrorText(error);
  return tumblrStatus(error) === 403 && (/8022/.test(text) || /queue/i.test(text));
}

function isDailyMediaLimit(error: unknown) {
  const text = tumblrErrorText(error);
  return tumblrStatus(error) === 403 && (/8004/.test(text) || /upload more media/i.test(text) || /media limit/i.test(text));
}

function isDefiniteApiRejection(error: unknown) {
  const status = tumblrStatus(error);
  return status >= 400 && status < 500;
}

async function downloadImage(character: TumblrCharacter) {
  if (!/^https?:\/\//i.test(String(character.image_url || ""))) {
    throw new Error("Character has no valid public image_url");
  }

  const response = await fetch(character.image_url, {
    redirect: "follow",
    headers: { "User-Agent": "EverBondTumblrPublisher/2.0" }
  });

  if (!response.ok) {
    throw new Error(`Image fetch failed ${response.status}`);
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  let extension = ".img";
  if (contentType.includes("webp")) extension = ".webp";
  else if (contentType.includes("png")) extension = ".png";
  else if (contentType.includes("jpeg") || contentType.includes("jpg")) extension = ".jpg";
  else if (contentType.includes("gif")) extension = ".gif";
  else {
    const matched = character.image_url.match(/\.(webp|png|jpe?g|gif)(?:\?|$)/i);
    if (matched) extension = `.${matched[1].toLowerCase().replace("jpeg", "jpg")}`;
  }

  const filePath = join(tmpdir(), `everbond-tumblr-${character.id}-${randomUUID()}${extension}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, bytes);
  return filePath;
}

function characterUrl(character: TumblrCharacter) {
  const slug = String(character.slug || "").trim();
  return slug ? `${SITE_URL}/chat/${encodeURIComponent(slug)}` : SITE_URL;
}

function linkedTextBlock(text: string, url: string) {
  return {
    type: "text",
    text,
    formatting: [{ type: "link", start: 0, end: Array.from(text).length, url }]
  };
}

function createPostOptions(character: TumblrCharacter, imagePath: string) {
  const name = String(character.name || "EverBond Character").trim();
  const destination = characterUrl(character);
  const linkLabel = "EverBond AI — Uncensored AI Girlfriends & Boyfriends Who Remember You";

  return {
    state: "published",
    tags: tumblrTagsFor(character),
    content: [
      {
        type: "image",
        media: createReadStream(imagePath),
        alt_text: `${name} from EverBond`
      },
      { type: "text", text: "💗 Call or chat with me anytime on EverBond:" },
      linkedTextBlock(linkLabel, destination)
    ]
  };
}

function extractPostId(created: unknown) {
  const value = created as {
    id_string?: string;
    id?: string | number;
    response?: { id_string?: string; id?: string | number };
  } | null;
  return value?.id_string || value?.id || value?.response?.id_string || value?.response?.id || null;
}

export async function fillTumblrQueue() {
  const candidates = await claimNextCharacters();
  if (candidates.length === 0) {
    return { attempted: 0, results: [] as TumblrResult[], stopReason: "No eligible characters remain." };
  }

  const client = tumblrClient();
  const results: TumblrResult[] = [];
  let stopReason: string | null = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const character = candidates[index];
    let imagePath: string | null = null;

    try {
      imagePath = await downloadImage(character);

      let created: unknown;
      try {
        created = await client.createPost(TUMBLR_BLOG, createPostOptions(character, imagePath));
      } catch (error) {
        if (isQueueFull(error) || isDailyMediaLimit(error)) {
          const remainingIds = candidates.slice(index).map((item) => item.id);
          await releaseClaims(remainingIds);
          stopReason = isQueueFull(error)
            ? "Tumblr queue is full. The next hourly run will try again after slots open."
            : "Tumblr daily media limit was reached. A later hourly run will try again.";
          results.push({
            characterId: character.id,
            name: character.name,
            status: "stopped",
            reason: isQueueFull(error) ? "queue_full" : "daily_media_limit"
          });
          break;
        }

        if (!isDefiniteApiRejection(error)) {
          // An ambiguous network failure may have reached Tumblr. Leave this one in
          // processing so it cannot be posted twice automatically, and release the rest.
          const remainingIds = candidates.slice(index + 1).map((item) => item.id);
          await releaseClaims(remainingIds);
          stopReason = "Tumblr returned an ambiguous network error. This character was held to prevent a duplicate.";
          results.push({
            characterId: character.id,
            name: character.name,
            status: "stopped",
            reason: "ambiguous_tumblr_error",
            error: tumblrErrorText(error).slice(0, 500)
          });
          break;
        }

        throw error;
      }

      const postId = extractPostId(created);
      try {
        await markQueued(character.id, postId ? String(postId) : null);
      } catch (trackingError) {
        // Tumblr already accepted the post. Never turn this into a retry, because
        // doing so could publish the same character twice.
        const remainingIds = candidates.slice(index + 1).map((item) => item.id);
        await releaseClaims(remainingIds).catch(() => undefined);
        stopReason = "Tumblr accepted a post but tracking could not be finalized. Automatic publishing stopped to prevent duplicates.";
        results.push({
          characterId: character.id,
          name: character.name,
          status: "tracking_error",
          tumblrPostId: postId ? String(postId) : null,
          error: trackingError instanceof Error ? trackingError.message.slice(0, 500) : "Tracking failed"
        });
        break;
      }

      results.push({
        characterId: character.id,
        name: character.name,
        status: "queued",
        tumblrPostId: postId ? String(postId) : null
      });
    } catch (error) {
      const message = tumblrErrorText(error);
      await markError(character.id, message).catch(() => undefined);
      results.push({
        characterId: character.id,
        name: character.name,
        status: "error",
        error: message.slice(0, 500)
      });
    } finally {
      if (imagePath) await fs.unlink(imagePath).catch(() => undefined);
    }
  }

  return { attempted: results.length, results, stopReason };
}
