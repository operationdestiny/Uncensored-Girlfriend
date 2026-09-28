import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  normalizeCampaign,
  uniquePartnerSlug
} from "@/lib/partner-engine";
import { sendPartnerOutreach } from "@/lib/partner-outreach";

const BRIGHTDATA_BASE = "https://api.brightdata.com";
const DATASET_TIKTOK_PROFILES = "gd_l1villgoiiidt09ci";
const DATASET_YOUTUBE_CHANNELS = "gd_lk538t2k2p1k3oos71";
const DATASET_INSTAGRAM_PROFILES = "gd_l1vikfch901nx3by4";
const DATASET_GOOGLE_SERP_100 = "gd_mfz5x93lmsjjjylob";

const SEARCH_RESULT_LIMIT = 20;
const DISCOVERY_TRIGGER_INTERVAL_MS = 55 * 60 * 1000;
const FOLLOWUP_AFTER_MS = 4 * 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_INITIAL_CAP = 60;
const DEFAULT_DAILY_FOLLOWUP_CAP = 30;
const DEFAULT_INITIALS_PER_RUN = 4;
const DEFAULT_FOLLOWUPS_PER_RUN = 2;
const DEFAULT_MIN_FOLLOWERS = 1_500;
const DEFAULT_MAX_FOLLOWERS = 1_500_000;
const SOURCE_ROTATION = ["tiktok", "instagram", "tiktok", "youtube", "tiktok", "seo"] as const;

const DIRECT_QUERIES = [
  "ai tools",
  "ai apps",
  "character ai",
  "ai companion",
  "ai girlfriend",
  "ai roleplay",
  "ai chatbot",
  "virtual companion",
  "dating apps",
  "generative ai apps",
  "chatbot apps",
  "ai app reviews"
] as const;

const SEO_QUERIES = [
  "ai girlfriend review",
  "ai companion review",
  "character ai alternatives",
  "ai roleplay apps",
  "uncensored ai chat",
  "best ai companion",
  "best ai apps",
  "ai chatbot review"
] as const;

const SOCIAL_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "tiktok.com",
  "www.tiktok.com",
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "facebook.com",
  "www.facebook.com",
  "reddit.com",
  "www.reddit.com",
  "pinterest.com",
  "www.pinterest.com"
]);

const IGNORE_WEB_HOSTS = new Set([
  ...SOCIAL_HOSTS,
  "google.com",
  "www.google.com",
  "bing.com",
  "www.bing.com",
  "wikipedia.org",
  "www.wikipedia.org",
  "everbond.ai",
  "www.everbond.ai"
]);

const MINOR_MARKERS = /\b(?:minor|under\s*18|u18|teen(?:ager)?|high\s*school|middle\s*school|13\s*(?:yo|yrs?|years?\s*old)|14\s*(?:yo|yrs?|years?\s*old)|15\s*(?:yo|yrs?|years?\s*old)|16\s*(?:yo|yrs?|years?\s*old)|17\s*(?:yo|yrs?|years?\s*old)|kid|kids|child|children)\b/i;
const DIRECT_RELEVANCE = /\b(?:ai\s*(?:girlfriend|boyfriend|companion|roleplay|chat|chatbot|app|apps|tool|tools)|character\s*ai|virtual\s*(?:girlfriend|boyfriend|companion)|uncensored\s*ai|generative\s*ai|dating\s*app|dating\s*apps)\b/i;
const ADJACENT_RELEVANCE = /\b(?:artificial\s*intelligence|chatgpt|dating|relationship|romance|tech\s*review|app\s*review|creator\s*tools|digital\s*companion)\b/i;
const CREATOR_SIGNAL = /\b(?:creator|influencer|reviewer|reviews|blogger|blog|writer|publisher|newsletter|business|collab|collabs|collaboration|partnership|sponsor|sponsorship|media|press|model|streamer|youtuber)\b/i;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}\b/gi;
const URL_RE = /https?:\/\/[^\s"'<>]+/gi;
const BAD_CONTACT_LOCAL_PART = /^(?:abuse|admin|billing|careers?|copyright|dmca|hostmaster|jobs?|legal|mailer-daemon|no-?reply|donotreply|postmaster|privacy|security|support|webmaster)$/i;
const PREFERRED_CONTACT_LOCAL_PART = /(?:business|collab|collaboration|contact|creator|hello|hi|info|media|partnership|press|sponsor|work)/i;
const LINK_IN_BIO_HOSTS = new Set([
  "linktr.ee", "www.linktr.ee", "beacons.ai", "www.beacons.ai", "bio.site", "www.bio.site",
  "campsite.bio", "www.campsite.bio", "lnk.bio", "www.lnk.bio", "solo.to", "www.solo.to",
  "stan.store", "www.stan.store", "hoo.be", "www.hoo.be", "taplink.cc", "www.taplink.cc",
  "allmylinks.com", "www.allmylinks.com", "carrd.co", "www.carrd.co"
]);

type DiscoverySource = "tiktok" | "youtube" | "instagram" | "seo";
type SnapshotKind = "tiktok_profiles" | "youtube_channels" | "instagram_serp" | "instagram_profiles" | "seo_serp";

type Candidate = {
  platform: DiscoverySource;
  handle: string | null;
  publicName: string;
  profileUrl: string;
  bio: string;
  followers: number | null;
  engagementRate: number | null;
  externalUrls: string[];
  email: string | null;
  isPrivate?: boolean;
  isProfessional?: boolean;
  sourceKeyword: string;
  niche: string;
  metadata: Record<string, unknown>;
};

type DiscoveryEventMetadata = {
  provider?: string;
  snapshotId?: string;
  kind?: SnapshotKind;
  source?: DiscoverySource;
  query?: string;
  triggeredAt?: string;
  processedAt?: string;
  records?: number;
  qualified?: number;
  prepared?: number;
  reason?: string;
  error?: string;
  [key: string]: unknown;
};

type RunStats = {
  enabled: boolean;
  triggered: boolean;
  trigger?: { source: DiscoverySource; query: string; snapshotId: string };
  snapshotsChecked: number;
  snapshotsCompleted: number;
  candidatesSeen: number;
  qualified: number;
  prepared: number;
  initialSent: number;
  followupsSent: number;
  skipped: number;
  errors: string[];
};

function envInt(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function brightDataKey() {
  return process.env.BRIGHTDATA_API_KEY?.trim() || "";
}

export function partnerDiscoveryEnabled() {
  if (process.env.PARTNER_DISCOVERY_ENABLED?.trim() === "0") return false;
  return Boolean(brightDataKey());
}

function siteOrigin() {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://uncensoredgirlfriend.chat").replace(/\/$/, "");
}

function toText(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((v) => (v ?? "").trim()).filter(Boolean))];
}

function normalizeUrl(value: unknown): string | null {
  const raw = toText(value).trim();
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : raw.includes(".") ? `https://${raw.replace(/^\/+/, "")}` : "";
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeEmail(value: string | null | undefined): string | null {
  const email = (value ?? "").trim().toLowerCase().replace(/^mailto:/, "").replace(/[)>.,;:]+$/, "");
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,24}$/i.test(email)) return null;
  const localPart = email.split("@", 1)[0] ?? "";
  if (BAD_CONTACT_LOCAL_PART.test(localPart)) return null;
  if (/@(?:example\.com|example\.org|test\.com)$/i.test(email)) return null;
  if (/@(?:everbond\.ai)$/i.test(email)) return null;
  return email;
}

function contactEmailScore(email: string) {
  const localPart = email.split("@", 1)[0] ?? "";
  let score = 0;
  if (PREFERRED_CONTACT_LOCAL_PART.test(localPart)) score += 10;
  if (/^[a-z]+(?:[._-][a-z]+){0,2}$/i.test(localPart)) score += 3;
  if (/\d{4,}/.test(localPart)) score -= 2;
  return score;
}

function extractEmails(text: string) {
  const normalized = text
    .replace(/\s+\[at\]\s+/gi, "@")
    .replace(/\s+\(at\)\s+/gi, "@")
    .replace(/\s+\[dot\]\s+/gi, ".")
    .replace(/\s+\(dot\)\s+/gi, ".")
    .replace(/&#64;|&commat;/gi, "@")
    .replace(/&#46;|&period;/gi, ".");
  const matches = normalized.match(EMAIL_RE) ?? [];
  return uniqueStrings(matches.map((match) => normalizeEmail(match)))
    .sort((a, b) => contactEmailScore(b) - contactEmailScore(a));
}

function extractUrls(text: string) {
  return uniqueStrings((text.match(URL_RE) ?? []).map((value) => normalizeUrl(value)));
}

function hasMinorSignal(candidate: Candidate) {
  return MINOR_MARKERS.test(`${candidate.publicName}\n${candidate.bio}`);
}

function scoreCandidate(candidate: Candidate) {
  if (candidate.isPrivate) return -100;
  if (hasMinorSignal(candidate)) return -100;
  const text = `${candidate.publicName}\n${candidate.bio}\n${candidate.sourceKeyword}`;
  let score = candidate.platform === "seo" ? 45 : 35;
  if (DIRECT_RELEVANCE.test(text)) score += 25;
  else if (ADJACENT_RELEVANCE.test(text)) score += 15;
  if (CREATOR_SIGNAL.test(text)) score += 8;
  if (candidate.email) score += 10;
  if (candidate.externalUrls.length) score += 5;
  if (candidate.isProfessional) score += 8;

  if (candidate.platform !== "seo") {
    const minFollowers = envInt("PARTNER_DISCOVERY_MIN_FOLLOWERS", DEFAULT_MIN_FOLLOWERS, 0, 100_000_000);
    const maxFollowers = envInt("PARTNER_DISCOVERY_MAX_FOLLOWERS", DEFAULT_MAX_FOLLOWERS, minFollowers, 500_000_000);
    const followers = candidate.followers ?? 0;
    if (followers < minFollowers) score -= 30;
    else if (followers <= 300_000) score += 15;
    else if (followers <= maxFollowers) score += 10;
    else score -= 8;
    if ((candidate.engagementRate ?? 0) >= 0.02) score += 8;
  }
  return score;
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return true;
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string) {
  const lower = address.toLowerCase();
  return lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb");
}

async function safePublicUrl(value: string): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
  const ipKind = isIP(host);
  if (ipKind === 4 && isPrivateIpv4(host)) return null;
  if (ipKind === 6 && isPrivateIpv6(host)) return null;
  if (!ipKind) {
    try {
      const resolved = await lookup(host, { all: true, verbatim: true });
      if (!resolved.length) return null;
      for (const item of resolved) {
        if ((item.family === 4 && isPrivateIpv4(item.address)) || (item.family === 6 && isPrivateIpv6(item.address))) return null;
      }
    } catch {
      return null;
    }
  }
  return url;
}

async function fetchPublicHtml(value: string, redirectDepth = 0): Promise<{ html: string; finalUrl: string } | null> {
  const safe = await safePublicUrl(value);
  if (!safe) return null;
  try {
    const response = await fetch(safe, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; UGPartnerDiscovery/1.0; +https://uncensoredgirlfriend.chat)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.8"
      },
      signal: AbortSignal.timeout(7_000),
      cache: "no-store"
    });
    if (response.status >= 300 && response.status < 400 && redirectDepth < 2) {
      const location = response.headers.get("location");
      if (!location) return null;
      return fetchPublicHtml(new URL(location, safe).toString(), redirectDepth + 1);
    }
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) return null;
    const html = (await response.text()).slice(0, 450_000);
    return { html, finalUrl: safe.toString() };
  } catch {
    return null;
  }
}

function linksFromHtml(html: string, base: string) {
  const found: string[] = [];
  const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRe.exec(html)) !== null && found.length < 80) {
    const raw = match[1]?.trim();
    if (!raw || raw.startsWith("#") || raw.startsWith("javascript:")) continue;
    try {
      const url = new URL(raw, base);
      if (url.protocol === "http:" || url.protocol === "https:") found.push(url.toString());
    } catch {
      // Ignore malformed links.
    }
  }
  return uniqueStrings(found);
}

async function findPublicBusinessEmail(urls: string[]) {
  const queue = uniqueStrings(urls.map((u) => normalizeUrl(u))).slice(0, 4);
  const visited = new Set<string>();
  let pages = 0;
  while (queue.length && pages < 6) {
    const next = queue.shift()!;
    const normalized = normalizeUrl(next);
    if (!normalized || visited.has(normalized)) continue;
    visited.add(normalized);
    const page = await fetchPublicHtml(normalized);
    if (!page) continue;
    pages += 1;
    const emails = extractEmails(page.html);
    if (emails.length) return emails[0];

    const current = new URL(page.finalUrl);
    const links = linksFromHtml(page.html, page.finalUrl);
    const prioritized = links.filter((link) => {
      try {
        const u = new URL(link);
        const path = u.pathname.toLowerCase();
        return u.hostname === current.hostname && /contact|about|work-with|collab|partner|advertis|sponsor|press/.test(path);
      } catch {
        return false;
      }
    });
    const oneHopExternal = LINK_IN_BIO_HOSTS.has(current.hostname.toLowerCase())
      ? links.filter((link) => {
          try {
            const u = new URL(link);
            return u.hostname !== current.hostname && !SOCIAL_HOSTS.has(u.hostname.toLowerCase());
          } catch {
            return false;
          }
        })
      : [];
    for (const link of [...prioritized.slice(0, 3), ...oneHopExternal.slice(0, 3)]) {
      if (!visited.has(link) && queue.length < 8) queue.push(link);
    }
  }
  return null;
}

async function brightDataRequest(url: URL, init: RequestInit) {
  const key = brightDataKey();
  if (!key) throw new Error("BRIGHTDATA_API_KEY_MISSING");
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {})
    },
    signal: init.signal ?? AbortSignal.timeout(25_000),
    cache: "no-store"
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const message = typeof payload === "string" ? payload : JSON.stringify(payload);
    throw new Error(`BRIGHTDATA_${response.status}:${message.slice(0, 300)}`);
  }
  return payload;
}

async function triggerBrightDataJob(input: {
  datasetId: string;
  body: Record<string, unknown>[];
  type?: "discover_new";
  discoverBy?: string;
  resultLimit?: number;
}) {
  const url = new URL(`${BRIGHTDATA_BASE}/datasets/v3/trigger`);
  url.searchParams.set("dataset_id", input.datasetId);
  url.searchParams.set("format", "json");
  url.searchParams.set("include_errors", "true");
  if (input.type) url.searchParams.set("type", input.type);
  if (input.discoverBy) url.searchParams.set("discover_by", input.discoverBy);
  if (input.resultLimit) url.searchParams.set("limit_multiple_results", String(input.resultLimit));
  const payload = await brightDataRequest(url, { method: "POST", body: JSON.stringify(input.body) });
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const snapshotId = toText((payload as { snapshot_id?: unknown }).snapshot_id);
    if (snapshotId) return snapshotId;
  }
  throw new Error("BRIGHTDATA_SNAPSHOT_ID_MISSING");
}

async function getSnapshotProgress(snapshotId: string) {
  const url = new URL(`${BRIGHTDATA_BASE}/datasets/v3/progress/${encodeURIComponent(snapshotId)}`);
  const payload = await brightDataRequest(url, { method: "GET" });
  if (!payload || typeof payload !== "object") return { status: "unknown" as const };
  return {
    status: toText((payload as { status?: unknown }).status).toLowerCase(),
    error: toText((payload as { error_message?: unknown }).error_message)
  };
}

async function downloadSnapshot(snapshotId: string) {
  const url = new URL(`${BRIGHTDATA_BASE}/datasets/v3/snapshot/${encodeURIComponent(snapshotId)}`);
  url.searchParams.set("format", "json");
  const payload = await brightDataRequest(url, { method: "GET", signal: AbortSignal.timeout(40_000) });
  return Array.isArray(payload) ? payload : payload == null ? [] : [payload];
}

async function recordDiscoveryJob(input: {
  snapshotId: string;
  kind: SnapshotKind;
  source: DiscoverySource;
  query: string;
}) {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.from("partner_outreach_events").insert({
    prospect_id: null,
    partner_id: null,
    channel: "discovery",
    event_type: "discovery_triggered",
    destination: input.source,
    message_subject: input.query,
    metadata: {
      provider: "brightdata",
      snapshotId: input.snapshotId,
      kind: input.kind,
      source: input.source,
      query: input.query,
      triggeredAt: new Date().toISOString()
    }
  });
  if (error) throw new Error(`DISCOVERY_EVENT_INSERT_FAILED:${error.message}`);
}

function searchSlot(values: readonly string[], sourceOffset = 0) {
  const hour = Math.floor(Date.now() / 3_600_000);
  return values[Math.abs(Math.floor(hour / 4) + sourceOffset) % values.length];
}

async function triggerNextDiscovery(): Promise<{ source: DiscoverySource; query: string; snapshotId: string }> {
  const hour = Math.floor(Date.now() / 3_600_000);
  const source = SOURCE_ROTATION[Math.abs(hour) % SOURCE_ROTATION.length];
  let snapshotId: string;
  let query: string;
  let kind: SnapshotKind;

  if (source === "tiktok") {
    query = searchSlot(DIRECT_QUERIES, 0);
    const country = (process.env.PARTNER_DISCOVERY_COUNTRY || "us").trim().toLowerCase();
    snapshotId = await triggerBrightDataJob({
      datasetId: DATASET_TIKTOK_PROFILES,
      type: "discover_new",
      discoverBy: "search_url",
      resultLimit: SEARCH_RESULT_LIMIT,
      body: [{ search_url: `https://www.tiktok.com/search/user?q=${encodeURIComponent(query)}`, country }]
    });
    kind = "tiktok_profiles";
  } else if (source === "youtube") {
    query = searchSlot(DIRECT_QUERIES, 2);
    snapshotId = await triggerBrightDataJob({
      datasetId: DATASET_YOUTUBE_CHANNELS,
      type: "discover_new",
      discoverBy: "keyword",
      resultLimit: SEARCH_RESULT_LIMIT,
      body: [{ keyword: query }]
    });
    kind = "youtube_channels";
  } else if (source === "instagram") {
    query = searchSlot(DIRECT_QUERIES, 4);
    const googleQuery = `site:instagram.com "${query}" ("email" OR "business" OR "collab") -inurl:/p/ -inurl:/reel/`;
    snapshotId = await triggerBrightDataJob({
      datasetId: DATASET_GOOGLE_SERP_100,
      resultLimit: SEARCH_RESULT_LIMIT,
      body: [{ url: "https://www.google.com/", keyword: googleQuery, language: "en", country: "US", start_page: 1, end_page: 2 }]
    });
    kind = "instagram_serp";
  } else {
    query = searchSlot(SEO_QUERIES, 1);
    const googleQuery = `"${query}" (review OR reviews OR blog OR guide OR alternatives)`;
    snapshotId = await triggerBrightDataJob({
      datasetId: DATASET_GOOGLE_SERP_100,
      resultLimit: SEARCH_RESULT_LIMIT,
      body: [{ url: "https://www.google.com/", keyword: googleQuery, language: "en", country: "US", start_page: 1, end_page: 2 }]
    });
    kind = "seo_serp";
  }

  await recordDiscoveryJob({ snapshotId, kind, source, query });
  return { source, query, snapshotId };
}

function tiktokCandidate(row: Record<string, unknown>, query: string): Candidate | null {
  const profileUrl = normalizeUrl(row.url);
  if (!profileUrl) return null;
  const rawHandle = (() => {
    try {
      return new URL(profileUrl).pathname.split("/").filter(Boolean).find((part) => part.startsWith("@"))?.replace(/^@/, "") ?? toText(row.account_id);
    } catch {
      return toText(row.account_id);
    }
  })();
  const bio = toText(row.biography);
  const publicName = toText(row.nickname) || rawHandle || "TikTok creator";
  const externalUrls = uniqueStrings([
    normalizeUrl(row.bio_link),
    ...extractUrls(bio)
  ]);
  return {
    platform: "tiktok",
    handle: rawHandle ? `@${rawHandle.replace(/^@/, "")}` : null,
    publicName,
    profileUrl,
    bio,
    followers: toNumber(row.followers),
    engagementRate: toNumber(row.awg_engagement_rate),
    externalUrls,
    email: extractEmails(bio)[0] ?? null,
    isPrivate: Boolean(row.is_private),
    sourceKeyword: query,
    niche: query,
    metadata: { region: row.region ?? null, verified: Boolean(row.is_verified) }
  };
}

function youtubeCandidate(row: Record<string, unknown>, query: string): Candidate | null {
  const profileUrl = normalizeUrl(row.url);
  if (!profileUrl) return null;
  const bio = toText(row.Description ?? row.description);
  const links = Array.isArray(row.Links) ? row.Links.map((value) => normalizeUrl(value)) : [];
  const externalUrls = uniqueStrings([
    ...links,
    ...extractUrls(bio)
  ]).filter((value) => {
    try { return !SOCIAL_HOSTS.has(new URL(value).hostname.toLowerCase()); } catch { return false; }
  });
  const handle = toText(row.handle) || (() => {
    try { return new URL(profileUrl).pathname.split("/").filter(Boolean)[0] ?? ""; } catch { return ""; }
  })();
  return {
    platform: "youtube",
    handle: handle || null,
    publicName: toText(row.name) || handle || "YouTube creator",
    profileUrl,
    bio,
    followers: toNumber(row.subscribers),
    engagementRate: null,
    externalUrls,
    email: extractEmails(`${bio}\n${links.join("\n")}`)[0] ?? null,
    sourceKeyword: query,
    niche: query,
    metadata: { location: (row.Details as Record<string, unknown> | undefined)?.location ?? null, verified: Boolean(row.verified) }
  };
}

function instagramCandidate(row: Record<string, unknown>, query: string): Candidate | null {
  const profileUrl = normalizeUrl(row.url ?? row.profile_url);
  if (!profileUrl) return null;
  const bio = toText(row.biography);
  const handle = toText(row.account ?? row.user_name) || (() => {
    try { return new URL(profileUrl).pathname.split("/").filter(Boolean)[0] ?? ""; } catch { return ""; }
  })();
  const externalTitle = row.external_url_title && typeof row.external_url_title === "object"
    ? normalizeUrl((row.external_url_title as { url?: unknown }).url)
    : null;
  const externalUrls = uniqueStrings([
    normalizeUrl(row.external_url),
    externalTitle,
    ...extractUrls(bio)
  ]);
  const directEmail = normalizeEmail(toText(row.email_address));
  return {
    platform: "instagram",
    handle: handle ? `@${handle.replace(/^@/, "")}` : null,
    publicName: toText(row.full_name ?? row.profile_name) || handle || "Instagram creator",
    profileUrl,
    bio,
    followers: toNumber(row.followers),
    engagementRate: toNumber(row.avg_engagement),
    externalUrls,
    email: directEmail ?? extractEmails(bio)[0] ?? null,
    isPrivate: Boolean(row.is_private),
    isProfessional: Boolean(row.is_professional_account || row.is_business_account),
    sourceKeyword: query,
    niche: query,
    metadata: {
      businessCategory: row.business_category_name ?? row.category_name ?? null,
      verified: Boolean(row.is_verified)
    }
  };
}

function searchObjects(value: unknown, output: Array<{ link: string; title: string; description: string }> = []) {
  if (output.length >= 80 || value == null) return output;
  if (Array.isArray(value)) {
    for (const item of value) searchObjects(item, output);
    return output;
  }
  if (typeof value !== "object") return output;
  const row = value as Record<string, unknown>;
  const link = normalizeUrl(row.link ?? row.url);
  if (link) {
    output.push({
      link,
      title: toText(row.title ?? row.source ?? row.name),
      description: toText(row.description ?? row.snippet ?? row.text)
    });
  }
  for (const child of Object.values(row)) {
    if (typeof child === "object" && child !== null) searchObjects(child, output);
  }
  return output;
}

function instagramProfileUrls(records: unknown[]) {
  const urls: string[] = [];
  for (const result of searchObjects(records)) {
    try {
      const u = new URL(result.link);
      if (!/(^|\.)instagram\.com$/i.test(u.hostname)) continue;
      const parts = u.pathname.split("/").filter(Boolean);
      if (!parts.length) continue;
      const first = parts[0].toLowerCase();
      if (["p", "reel", "reels", "stories", "explore", "accounts", "about", "developer"].includes(first)) continue;
      urls.push(`https://www.instagram.com/${parts[0].replace(/^@/, "")}/`);
    } catch {
      // Ignore malformed URLs.
    }
  }
  return uniqueStrings(urls).slice(0, SEARCH_RESULT_LIMIT);
}

async function emailForCandidate(candidate: Candidate) {
  if (candidate.email) return candidate.email;
  const inText = extractEmails(`${candidate.bio}\n${candidate.externalUrls.join("\n")}`)[0];
  if (inText) return inText;
  if (!candidate.externalUrls.length) return null;
  return findPublicBusinessEmail(candidate.externalUrls);
}

async function findExistingProspect(candidate: Candidate) {
  const supabase = getSupabaseServiceClient();
  if (candidate.email) {
    const { data } = await supabase
      .from("partner_prospects")
      .select("id,partner_id,status,contact_email,fit_score")
      .ilike("contact_email", candidate.email)
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  if (candidate.handle) {
    const { data } = await supabase
      .from("partner_prospects")
      .select("id,partner_id,status,contact_email,fit_score")
      .eq("platform", candidate.platform)
      .ilike("handle", candidate.handle)
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

async function contactSuppressed(email: string) {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from("partner_outreach_suppressions")
    .select("contact_email")
    .eq("contact_email", email)
    .maybeSingle();
  return Boolean(data);
}

async function partnerAlreadyExists(email: string) {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from("partners")
    .select("id")
    .ilike("contact_email", email)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

async function preparePartner(prospect: {
  id: string;
  platform: DiscoverySource;
  publicName: string;
  handle: string | null;
  email: string;
  profileUrl: string;
  sourceKeyword: string;
  fitScore: number;
}) {
  const supabase = getSupabaseServiceClient();
  if (await partnerAlreadyExists(prospect.email)) return null;
  const { data: terms } = await supabase
    .from("partner_terms_versions")
    .select("id")
    .eq("is_default", true)
    .maybeSingle();
  if (!terms?.id) throw new Error("PARTNER_TERMS_NOT_CONFIGURED");

  const preferred = prospect.handle || prospect.publicName;
  const slug = await uniquePartnerSlug(preferred);
  const partnerType = prospect.platform === "seo" ? "publisher" : "creator";
  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .insert({
      slug,
      public_name: prospect.publicName,
      partner_type: partnerType,
      source_platform: prospect.platform,
      contact_handle: prospect.handle,
      contact_email: prospect.email,
      terms_version_id: terms.id,
      metadata: {
        prospectId: prospect.id,
        autoDiscovered: true,
        discoveryProvider: "brightdata",
        sourceKeyword: prospect.sourceKeyword,
        profileUrl: prospect.profileUrl,
        fitScore: prospect.fitScore
      }
    })
    .select("id,slug")
    .single();
  if (partnerError || !partner) {
    if (partnerError?.code === "23505") return null;
    throw new Error(`PARTNER_AUTO_CREATE_FAILED:${partnerError?.message ?? "unknown"}`);
  }

  const campaign = normalizeCampaign(`auto-${prospect.platform}-${prospect.sourceKeyword}`) ?? "auto-discovery";
  const { error: linkError } = await supabase.from("partner_links").insert({
    partner_id: partner.id,
    code: partner.slug,
    campaign_key: campaign,
    destination_path: "/"
  });
  if (linkError) {
    await supabase.from("partners").delete().eq("id", partner.id);
    throw new Error(`PARTNER_AUTO_LINK_FAILED:${linkError.message}`);
  }

  const { error: financeError } = await supabase.from("partner_finance_state").insert({ partner_id: partner.id });
  if (financeError) {
    await supabase.from("partners").delete().eq("id", partner.id);
    throw new Error(`PARTNER_AUTO_FINANCE_FAILED:${financeError.message}`);
  }

  await supabase
    .from("partner_prospects")
    .update({ partner_id: partner.id, status: "prepared", updated_at: new Date().toISOString() })
    .eq("id", prospect.id);
  return partner.id as string;
}

async function qualifyAndPrepare(candidate: Candidate) {
  const firstScore = scoreCandidate(candidate);
  if (firstScore < 45) return { qualified: false, prepared: false, reason: "LOW_FIT" };

  candidate.email = normalizeEmail(await emailForCandidate(candidate));
  if (!candidate.email) return { qualified: false, prepared: false, reason: "NO_PUBLIC_EMAIL" };
  if (await contactSuppressed(candidate.email)) return { qualified: false, prepared: false, reason: "SUPPRESSED" };
  if (await partnerAlreadyExists(candidate.email)) return { qualified: false, prepared: false, reason: "PARTNER_EXISTS" };

  const fitScore = Math.min(100, Math.max(0, scoreCandidate(candidate)));
  if (fitScore < 55) return { qualified: false, prepared: false, reason: "LOW_FIT" };

  const supabase = getSupabaseServiceClient();
  let existing = await findExistingProspect(candidate);
  if (existing?.status === "suppressed" || existing?.status === "declined" || existing?.status === "activated") {
    return { qualified: false, prepared: false, reason: "PROSPECT_CLOSED" };
  }
  if (existing?.partner_id) return { qualified: true, prepared: false, reason: "ALREADY_PREPARED" };

  let prospectId = existing?.id as string | undefined;
  if (prospectId) {
    await supabase.from("partner_prospects").update({
      platform: candidate.platform,
      handle: candidate.handle,
      public_name: candidate.publicName,
      contact_email: candidate.email,
      public_contact_url: candidate.profileUrl,
      niche: candidate.niche,
      status: "qualified",
      fit_score: fitScore,
      metadata: {
        provider: "brightdata",
        profileUrl: candidate.profileUrl,
        sourceKeyword: candidate.sourceKeyword,
        followers: candidate.followers,
        engagementRate: candidate.engagementRate,
        externalUrls: candidate.externalUrls,
        ...candidate.metadata
      },
      updated_at: new Date().toISOString()
    }).eq("id", prospectId);
  } else {
    const { data, error } = await supabase.from("partner_prospects").insert({
      platform: candidate.platform,
      handle: candidate.handle,
      public_name: candidate.publicName,
      contact_email: candidate.email,
      public_contact_url: candidate.profileUrl,
      niche: candidate.niche,
      status: "qualified",
      fit_score: fitScore,
      metadata: {
        provider: "brightdata",
        profileUrl: candidate.profileUrl,
        sourceKeyword: candidate.sourceKeyword,
        followers: candidate.followers,
        engagementRate: candidate.engagementRate,
        externalUrls: candidate.externalUrls,
        ...candidate.metadata
      }
    }).select("id").single();
    if (error || !data?.id) {
      // A concurrent cron may have inserted the same prospect. Re-read and continue safely.
      existing = await findExistingProspect(candidate);
      if (!existing?.id || existing.partner_id) return { qualified: true, prepared: false, reason: "DUPLICATE" };
      prospectId = existing.id;
    } else {
      prospectId = data.id;
    }
  }

  const partnerId = await preparePartner({
    id: prospectId!,
    platform: candidate.platform,
    publicName: candidate.publicName,
    handle: candidate.handle,
    email: candidate.email,
    profileUrl: candidate.profileUrl,
    sourceKeyword: candidate.sourceKeyword,
    fitScore
  });
  return { qualified: true, prepared: Boolean(partnerId), reason: partnerId ? "PREPARED" : "PARTNER_EXISTS" };
}

async function processCandidates(candidates: Candidate[], stats: RunStats) {
  const queue = candidates.slice(0, SEARCH_RESULT_LIMIT);
  const concurrency = 3;
  let index = 0;
  async function worker() {
    while (index < queue.length) {
      const candidate = queue[index++];
      stats.candidatesSeen += 1;
      try {
        const result = await qualifyAndPrepare(candidate);
        if (result.qualified) stats.qualified += 1;
        if (result.prepared) stats.prepared += 1;
        if (!result.prepared) stats.skipped += 1;
      } catch (error) {
        stats.errors.push(error instanceof Error ? error.message.slice(0, 240) : "CANDIDATE_PROCESS_FAILED");
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, () => worker()));
}

async function processSeoRecords(records: unknown[], query: string, stats: RunStats) {
  const seenHosts = new Set<string>();
  const candidates: Candidate[] = [];
  for (const result of searchObjects(records)) {
    if (candidates.length >= 14) break;
    const url = normalizeUrl(result.link);
    if (!url) continue;
    let host: string;
    try { host = new URL(url).hostname.toLowerCase(); } catch { continue; }
    if (IGNORE_WEB_HOSTS.has(host) || seenHosts.has(host)) continue;
    seenHosts.add(host);
    const text = `${result.title}\n${result.description}\n${query}`;
    if (!DIRECT_RELEVANCE.test(text) && !ADJACENT_RELEVANCE.test(text)) continue;
    candidates.push({
      platform: "seo",
      handle: host,
      publicName: result.title || host,
      profileUrl: url,
      bio: result.description,
      followers: null,
      engagementRate: null,
      externalUrls: [url],
      email: extractEmails(result.description)[0] ?? null,
      isProfessional: true,
      sourceKeyword: query,
      niche: "AI review / publisher",
      metadata: { domain: host, discoveryTitle: result.title }
    });
  }
  await processCandidates(candidates, stats);
}

async function processSnapshot(kind: SnapshotKind, source: DiscoverySource, query: string, records: unknown[], stats: RunStats) {
  if (kind === "tiktok_profiles") {
    const candidates = records
      .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)))
      .map((row) => tiktokCandidate(row, query))
      .filter((value): value is Candidate => Boolean(value));
    await processCandidates(candidates, stats);
    return;
  }
  if (kind === "youtube_channels") {
    const candidates = records
      .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)))
      .map((row) => youtubeCandidate(row, query))
      .filter((value): value is Candidate => Boolean(value));
    await processCandidates(candidates, stats);
    return;
  }
  if (kind === "instagram_profiles") {
    const candidates = records
      .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)))
      .map((row) => instagramCandidate(row, query))
      .filter((value): value is Candidate => Boolean(value));
    await processCandidates(candidates, stats);
    return;
  }
  if (kind === "instagram_serp") {
    const urls = instagramProfileUrls(records);
    if (!urls.length) return;
    const snapshotId = await triggerBrightDataJob({
      datasetId: DATASET_INSTAGRAM_PROFILES,
      body: urls.map((url) => ({ url })),
      resultLimit: SEARCH_RESULT_LIMIT
    });
    await recordDiscoveryJob({ snapshotId, kind: "instagram_profiles", source: "instagram", query });
    return;
  }
  await processSeoRecords(records, query, stats);
}

async function updateDiscoveryEvent(id: string, eventType: string, metadata: DiscoveryEventMetadata) {
  const supabase = getSupabaseServiceClient();
  await supabase.from("partner_outreach_events").update({ event_type: eventType, metadata }).eq("id", id);
}

async function processPendingSnapshots(stats: RunStats) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("partner_outreach_events")
    .select("id,metadata,created_at")
    .eq("channel", "discovery")
    .eq("event_type", "discovery_triggered")
    .order("created_at", { ascending: true })
    .limit(6);
  if (error) throw new Error(`DISCOVERY_PENDING_LIST_FAILED:${error.message}`);

  for (const event of (data ?? []).slice(0, 2)) {
    stats.snapshotsChecked += 1;
    const metadata = (event.metadata ?? {}) as DiscoveryEventMetadata;
    const snapshotId = toText(metadata.snapshotId);
    const kind = metadata.kind as SnapshotKind | undefined;
    const source = metadata.source as DiscoverySource | undefined;
    const query = toText(metadata.query);
    if (!snapshotId || !kind || !source || !query) {
      await updateDiscoveryEvent(event.id, "discovery_failed", { ...metadata, reason: "INVALID_DISCOVERY_METADATA", processedAt: new Date().toISOString() });
      continue;
    }
    const createdAtMs = Date.parse(toText(event.created_at));
    if (Number.isFinite(createdAtMs) && Date.now() - createdAtMs > 6 * 60 * 60 * 1000) {
      await updateDiscoveryEvent(event.id, "discovery_failed", { ...metadata, reason: "DISCOVERY_SNAPSHOT_STALE", processedAt: new Date().toISOString() });
      continue;
    }
    try {
      const progress = await getSnapshotProgress(snapshotId);
      if (progress.status === "failed") {
        await updateDiscoveryEvent(event.id, "discovery_failed", { ...metadata, reason: progress.error || "BRIGHTDATA_FAILED", processedAt: new Date().toISOString() });
        continue;
      }
      if (progress.status !== "ready") continue;
      const beforeQualified = stats.qualified;
      const beforePrepared = stats.prepared;
      const records = await downloadSnapshot(snapshotId);
      await processSnapshot(kind, source, query, records, stats);
      stats.snapshotsCompleted += 1;
      await updateDiscoveryEvent(event.id, "discovery_completed", {
        ...metadata,
        processedAt: new Date().toISOString(),
        records: records.length,
        qualified: stats.qualified - beforeQualified,
        prepared: stats.prepared - beforePrepared
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "DISCOVERY_SNAPSHOT_FAILED";
      stats.errors.push(message);
      // Leave transient progress/download failures pending unless they are explicit configuration errors.
      if (/401|403|VALIDATION|MISSING|SUSPENDED|FAILED:/i.test(message)) {
        await updateDiscoveryEvent(event.id, "discovery_failed", { ...metadata, error: message, processedAt: new Date().toISOString() });
      }
    }
  }
}

async function shouldTriggerDiscovery(force = false) {
  if (force) return true;
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from("partner_outreach_events")
    .select("created_at")
    .eq("channel", "discovery")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.created_at) return true;
  return Date.now() - Date.parse(data.created_at) >= DISCOVERY_TRIGGER_INTERVAL_MS;
}

function utcMidnightIso() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function eventCountToday(eventType: "initial_sent" | "followup_sent") {
  const supabase = getSupabaseServiceClient();
  const { count } = await supabase
    .from("partner_outreach_events")
    .select("id", { count: "exact", head: true })
    .eq("channel", "email")
    .eq("event_type", eventType)
    .gte("created_at", utcMidnightIso());
  return count ?? 0;
}

async function sendPreparedInitials(stats: RunStats) {
  const dailyCap = envInt("PARTNER_DISCOVERY_DAILY_INITIAL_CAP", DEFAULT_DAILY_INITIAL_CAP, 0, 500);
  const sentToday = await eventCountToday("initial_sent");
  const remaining = Math.max(0, dailyCap - sentToday);
  if (!remaining) return;
  const perRun = Math.min(remaining, envInt("PARTNER_DISCOVERY_INITIALS_PER_RUN", DEFAULT_INITIALS_PER_RUN, 1, 25));
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from("partner_prospects")
    .select("id,partner_id,platform,public_name,niche,fit_score,contact_email,metadata")
    .eq("status", "prepared")
    .not("partner_id", "is", null)
    .not("contact_email", "is", null)
    .order("fit_score", { ascending: false, nullsFirst: false })
    .order("discovered_at", { ascending: true })
    .limit(Math.max(12, perRun * 3));

  for (const prospect of (data ?? []).slice(0, perRun)) {
    if (!prospect.partner_id) continue;
    const metadata = (prospect.metadata ?? {}) as { sourceKeyword?: string };
    const sourceKeyword = metadata.sourceKeyword || prospect.niche || "AI and apps";
    const intro = `We found your public ${prospect.platform || "creator"} work while looking for creators and publishers covering ${sourceKeyword}. Your audience looks like a strong fit for EverBond, so your referral link and private partner dashboard were prepared before this invitation was sent.`;
    const result = await sendPartnerOutreach({
      partnerId: prospect.partner_id,
      origin: siteOrigin(),
      customIntro: intro
    });
    if (result.ok) {
      stats.initialSent += 1;
      continue;
    }
    if (result.error === "INITIAL_ALREADY_SENT") {
      await supabase.from("partner_prospects").update({ status: "contacted", updated_at: new Date().toISOString() }).eq("id", prospect.id);
    } else if (result.error === "CONTACT_SUPPRESSED") {
      await supabase.from("partner_prospects").update({ status: "suppressed", updated_at: new Date().toISOString() }).eq("id", prospect.id);
    } else if (result.error !== "OUTREACH_SEND_FAILED") {
      stats.errors.push(`OUTREACH:${result.error}`);
    }
  }
}

async function sendEligibleFollowups(stats: RunStats) {
  const dailyCap = envInt("PARTNER_DISCOVERY_DAILY_FOLLOWUP_CAP", DEFAULT_DAILY_FOLLOWUP_CAP, 0, 500);
  const sentToday = await eventCountToday("followup_sent");
  const remaining = Math.max(0, dailyCap - sentToday);
  if (!remaining) return;
  const perRun = Math.min(remaining, envInt("PARTNER_DISCOVERY_FOLLOWUPS_PER_RUN", DEFAULT_FOLLOWUPS_PER_RUN, 1, 20));
  const cutoff = new Date(Date.now() - FOLLOWUP_AFTER_MS).toISOString();
  const supabase = getSupabaseServiceClient();
  const { data: initialEvents } = await supabase
    .from("partner_outreach_events")
    .select("partner_id,created_at")
    .eq("channel", "email")
    .eq("event_type", "initial_sent")
    .not("partner_id", "is", null)
    .lte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(80);

  let sent = 0;
  const checked = new Set<string>();
  for (const event of initialEvents ?? []) {
    if (sent >= perRun || !event.partner_id || checked.has(event.partner_id)) break;
    checked.add(event.partner_id);
    const [{ data: followup }, { data: partner }, { data: prospect }] = await Promise.all([
      supabase.from("partner_outreach_events").select("id").eq("partner_id", event.partner_id).eq("channel", "email").eq("event_type", "followup_sent").limit(1).maybeSingle(),
      supabase.from("partners").select("status").eq("id", event.partner_id).maybeSingle(),
      supabase.from("partner_prospects").select("id,status").eq("partner_id", event.partner_id).limit(1).maybeSingle()
    ]);
    if (followup || partner?.status !== "invited") continue;
    if (prospect && ["responded", "activated", "declined", "suppressed"].includes(prospect.status)) continue;
    const result = await sendPartnerOutreach({ partnerId: event.partner_id, origin: siteOrigin(), followUp: true });
    if (result.ok) {
      sent += 1;
      stats.followupsSent += 1;
    } else if (result.error === "CONTACT_SUPPRESSED" && prospect?.id) {
      await supabase.from("partner_prospects").update({ status: "suppressed", updated_at: new Date().toISOString() }).eq("id", prospect.id);
    }
  }
}

export async function runPartnerDiscoveryCycle(options?: { forceTrigger?: boolean }): Promise<RunStats> {
  const stats: RunStats = {
    enabled: partnerDiscoveryEnabled(),
    triggered: false,
    snapshotsChecked: 0,
    snapshotsCompleted: 0,
    candidatesSeen: 0,
    qualified: 0,
    prepared: 0,
    initialSent: 0,
    followupsSent: 0,
    skipped: 0,
    errors: []
  };
  if (!stats.enabled) return stats;

  try {
    await processPendingSnapshots(stats);
  } catch (error) {
    stats.errors.push(error instanceof Error ? error.message.slice(0, 300) : "DISCOVERY_PENDING_FAILED");
  }

  try {
    await sendPreparedInitials(stats);
  } catch (error) {
    stats.errors.push(error instanceof Error ? error.message.slice(0, 300) : "OUTREACH_DRAIN_FAILED");
  }

  try {
    await sendEligibleFollowups(stats);
  } catch (error) {
    stats.errors.push(error instanceof Error ? error.message.slice(0, 300) : "FOLLOWUP_DRAIN_FAILED");
  }

  try {
    if (await shouldTriggerDiscovery(Boolean(options?.forceTrigger))) {
      const trigger = await triggerNextDiscovery();
      stats.triggered = true;
      stats.trigger = trigger;
    }
  } catch (error) {
    stats.errors.push(error instanceof Error ? error.message.slice(0, 300) : "DISCOVERY_TRIGGER_FAILED");
  }

  return stats;
}
