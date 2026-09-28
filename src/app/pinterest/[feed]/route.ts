import { getSupabaseServiceClient } from "@/lib/supabase/server";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://uncensoredgirlfriend.chat"
).replace(/\/+$/, "");

export const revalidate = 3600;

const PIN_FEED_VERSION = "beauty-fashion-v4-fresh";

type FeedKind = "girls" | "guys" | "anime" | "general";

const PIN_ROLLOUT_START_MS = Date.parse("2026-08-27T20:30:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const FEED_DAILY_LIMITS: Record<FeedKind, number> = {
  girls: 118,
  guys: 15,
  anime: 42,
  general: 25
};

const FEEDS = {
  "everbond-girls-v4.xml": {
    category: "everbond-girls",
    kind: "girls" as const,
    channelTitle: "EverBond Girls — Beauty & Style",
    channelDescription:
      "Beautiful girls, fashion looks, outfits, aesthetics, and style inspiration from EverBond."
  },
  "everbond-guys-v4.xml": {
    category: "everbond-guys",
    kind: "guys" as const,
    channelTitle: "EverBond Guys — Style & Looks",
    channelDescription:
      "Handsome guys, men's fashion, outfits, aesthetics, and style inspiration from EverBond."
  },
  "everbond-anime-v4.xml": {
    category: "anime-fantasy",
    kind: "anime" as const,
    channelTitle: "EverBond Anime & Fantasy Style",
    channelDescription:
      "Anime beauty, fantasy fashion, character outfits, aesthetics, and style inspiration from EverBond."
  },
  "everbond-characters-v4.xml": {
    category: "public-creations",
    kind: "general" as const,
    channelTitle: "EverBond Characters — Beauty & Style",
    channelDescription:
      "Beautiful characters, fashion looks, outfits, aesthetics, and style inspiration from EverBond."
  }
} as const;

type FeedName = keyof typeof FEEDS;
type FeedConfig = (typeof FEEDS)[FeedName];

type JsonObject = Record<string, unknown>;

type CharacterRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  tags?: string[] | null;
  title?: string | null;
  role?: string | null;
  ai_profile?: JsonObject | null;
  image_file?: string | null;
  image_storage_path?: string | null;
  image_url?: string | null;
  created_at?: string | null;
};

type KeywordRule = {
  keyword: string;
  all?: string[];
  any?: string[];
};

const GIRL_CORE_KEYWORDS = [
  "beautiful girl",
  "pretty girl",
  "gorgeous girl",
  "cute girl",
  "girl aesthetic",
  "hot girl",
  "hot girl aesthetic",
  "baddie",
  "baddie aesthetic",
  "soft girl aesthetic",
  "clean girl aesthetic",
  "pop girl aesthetic",
  "Y2K girl",
  "it girl",
  "it girl aesthetic",
  "model",
  "fashion model",
  "female model",
  "feminine aesthetic",
  "beauty aesthetic",
  "brunette beauty",
  "blonde beauty",
  "redhead beauty",
  "blonde girl",
  "brunette girl",
  "redhead girl",
  "goth girl",
  "goth girl aesthetic",
  "dark feminine aesthetic",
  "beautiful woman"
] as const;

const GUY_CORE_KEYWORDS = [
  "handsome man",
  "handsome guy",
  "attractive man",
  "good looking guy",
  "male model",
  "fashion model",
  "men's fashion",
  "guy aesthetic",
  "handsome aesthetic",
  "model aesthetic",
  "dark masculine aesthetic",
  "classy man",
  "stylish man",
  "streetwear guy",
  "beautiful man"
] as const;

const ANIME_CORE_KEYWORDS = [
  "beautiful anime girl",
  "pretty anime girl",
  "cute anime girl",
  "anime girl aesthetic",
  "anime beauty",
  "fantasy girl",
  "fantasy girl aesthetic",
  "goth anime girl",
  "dark fantasy girl",
  "anime fashion",
  "anime outfit",
  "fantasy outfit"
] as const;

const GENERAL_CORE_KEYWORDS = [
  "beautiful character",
  "character aesthetic",
  "fashion aesthetic",
  "beauty aesthetic",
  "model aesthetic",
  "cute outfit",
  "classy outfit",
  "elegant outfit",
  "style inspiration",
  "fashion inspiration"
] as const;

const VISUAL_RULES: KeywordRule[] = [
  { keyword: "blonde beauty", any: ["blonde hair", "blond hair", "blonde"] },
  { keyword: "brunette beauty", any: ["brown hair", "brunette", "dark brown hair"] },
  { keyword: "redhead beauty", any: ["red hair", "redhead", "auburn hair", "ginger hair"] },
  { keyword: "black hair", any: ["black hair", "jet-black hair", "jet black hair"] },
  { keyword: "goth girl aesthetic", any: ["gothic", "goth ", "goth-inspired"] },
  { keyword: "dark feminine aesthetic", any: ["dark feminine", "dark glamour", "darkly feminine"] },
  { keyword: "soft girl aesthetic", any: ["soft girl", "soft feminine", "pastel", "delicate feminine"] },
  { keyword: "clean girl aesthetic", any: ["clean girl", "minimal makeup", "minimalist", "fresh-faced", "fresh faced"] },
  { keyword: "Y2K girl", any: ["y2k", "2000s"] },
  { keyword: "baddie aesthetic", any: ["baddie", "glamorous", "glam ", "bold makeup"] },
  { keyword: "coquette outfit", any: ["coquette", "bows", "lace-trimmed", "lace trimmed"] },
  { keyword: "romantic goth", any: ["romantic goth", "gothic romance"] },
  { keyword: "grunge outfit", any: ["grunge"] },
  { keyword: "alt outfit", any: ["alternative style", "alt style", "alternative fashion"] },
  { keyword: "emo outfit", any: ["emo"] },
  { keyword: "vampire aesthetic", any: ["vampire", "vampiric"] },
  { keyword: "classy outfit", any: ["classy", "polished", "sophisticated", "refined"] },
  { keyword: "elegant outfit", any: ["elegant", "eveningwear", "evening wear"] },
  { keyword: "feminine outfit", any: ["feminine", "girly"] },
  { keyword: "model outfit", any: ["model-off-duty", "model off duty", "runway", "editorial"] },
  { keyword: "beach outfit", any: ["beach", "resort", "seaside"] },
  { keyword: "streetwear outfit", any: ["streetwear", "street style"] },
  { keyword: "party outfit", any: ["party dress", "party look", "clubwear", "club wear"] },
  { keyword: "date night outfit", any: ["date night", "romantic dinner"] },
  { keyword: "going out outfit", any: ["going-out", "going out", "nightlife"] },
  { keyword: "night out outfit", any: ["night out", "cocktail bar"] },
  { keyword: "summer outfit", any: ["summer", "warm-weather", "warm weather"] },
  { keyword: "casual outfit", any: ["casual", "laid-back", "laid back"] },
  { keyword: "little black dress", any: ["little black dress", "lbd"] },
  { keyword: "bodycon dress", any: ["bodycon dress", "body-con dress", "form-fitting dress", "form fitting dress"] },
  { keyword: "mini dress", all: ["mini", "dress"] },
  { keyword: "black dress", all: ["black", "dress"] },
  { keyword: "summer dress", all: ["summer", "dress"] },
  { keyword: "sundress", any: ["sundress", "sun dress"] },
  { keyword: "slip dress", any: ["slip dress"] },
  { keyword: "cocktail dress", any: ["cocktail dress"] },
  { keyword: "evening dress", any: ["evening dress", "evening gown"] },
  { keyword: "party dress", any: ["party dress"] },
  { keyword: "dress", any: [" dress", "dress ", "gown"] },
  { keyword: "crop top", any: ["crop top", "cropped top", "cropped shirt"] },
  { keyword: "corset top", any: ["corset top", "corset-style top", "corset style top", "corset"] },
  { keyword: "tank top", any: ["tank top", "tank-top"] },
  { keyword: "off shoulder top", any: ["off-shoulder", "off shoulder"] },
  { keyword: "blouse", any: ["blouse"] },
  { keyword: "button up shirt", any: ["button-up", "button up", "button-down", "button down"] },
  { keyword: "black top", all: ["black", "top"] },
  { keyword: "white top", all: ["white", "top"] },
  { keyword: "mini skirt", all: ["mini", "skirt"] },
  { keyword: "denim skirt", all: ["denim", "skirt"] },
  { keyword: "pleated skirt", all: ["pleated", "skirt"] },
  { keyword: "suede mini skirt", all: ["suede", "mini", "skirt"] },
  { keyword: "sheer skirt", all: ["sheer", "skirt"] },
  { keyword: "skirt outfit", any: ["skirt"] },
  { keyword: "low rise jeans", all: ["low rise", "jeans"] },
  { keyword: "skinny jeans", all: ["skinny", "jeans"] },
  { keyword: "cargo jeans", all: ["cargo", "jeans"] },
  { keyword: "jeans outfit", any: ["jeans", "denim pants"] },
  { keyword: "cargo pants", any: ["cargo pants", "cargo trousers"] },
  { keyword: "denim shorts", all: ["denim", "shorts"] },
  { keyword: "low rise shorts", all: ["low rise", "shorts"] },
  { keyword: "micro shorts", any: ["micro shorts", "micro-shorts"] },
  { keyword: "mini shorts", all: ["mini", "shorts"] },
  { keyword: "short shorts", any: ["short shorts"] },
  { keyword: "jorts outfit", any: ["jorts", "denim jorts"] },
  { keyword: "bikini", any: ["bikini"] },
  { keyword: "swimsuit", any: ["swimsuit", "one-piece swimsuit", "one piece swimsuit"] },
  { keyword: "lingerie aesthetic", any: ["lingerie", "lace bra", "bralette"] },
  { keyword: "oversized shirt", any: ["oversized shirt", "oversized tee", "oversized t-shirt"] },
  { keyword: "leather jacket", any: ["leather jacket"] },
  { keyword: "tracksuit outfit", any: ["tracksuit", "track suit"] },
  { keyword: "corset blouse", all: ["corset", "blouse"] },
  { keyword: "cute outfit", any: ["cute outfit", "cute look"] },
  { keyword: "girl outfit", any: ["girl outfit"] },
  { keyword: "women's outfit", any: ["women's outfit", "womens outfit"] }
];

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function compactText(value: string, maxLength: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).replace(/\s+\S*$/, "")}…`;
}

function absoluteUrl(value: string) {
  const clean = value.trim();
  if (!clean) return "";
  if (clean.startsWith("//")) return `https:${clean}`;

  try {
    return new URL(clean, `${SITE_URL}/`).toString();
  } catch {
    return "";
  }
}

function imageUrlForCharacter(row: CharacterRow) {
  if (row.image_url?.trim()) return absoluteUrl(row.image_url);

  if (row.image_storage_path?.trim()) {
    return absoluteUrl(`/character-assets/${row.image_storage_path}`);
  }

  if (row.image_file?.trim()) {
    return absoluteUrl(`/character-assets/${row.category}/${row.image_file}`);
  }

  return "";
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function visualStyle(row: CharacterRow) {
  const ai = asObject(row.ai_profile);
  const visual = asObject(ai.visual_identity);
  return stringValue(visual.style).toLowerCase();
}

function matchesRule(text: string, rule: KeywordRule) {
  if (rule.all?.length && !rule.all.every((term) => text.includes(term))) {
    return false;
  }

  if (rule.any?.length && !rule.any.some((term) => text.includes(term))) {
    return false;
  }

  return Boolean(rule.all?.length || rule.any?.length);
}

function matchingVisualKeywords(row: CharacterRow, kind: FeedKind) {
  const style = visualStyle(row);
  const matches = VISUAL_RULES.filter((rule) => matchesRule(style, rule)).map(
    (rule) => rule.keyword
  );

  const unique = [...new Set(matches)];

  const fillers: Record<FeedKind, string[]> = {
    girls: [
      "feminine aesthetic",
      "beauty aesthetic",
      "girl aesthetic",
      "cute outfit",
      "girl outfit",
      "women's outfit"
    ],
    guys: [
      "men's fashion",
      "guy aesthetic",
      "male model",
      "casual outfit",
      "classy outfit",
      "streetwear outfit"
    ],
    anime: [
      "anime girl aesthetic",
      "anime fashion",
      "anime outfit",
      "fantasy outfit",
      "beauty aesthetic",
      "cute outfit"
    ],
    general: [
      "fashion aesthetic",
      "beauty aesthetic",
      "cute outfit",
      "classy outfit",
      "style inspiration",
      "fashion inspiration"
    ]
  };

  for (const filler of fillers[kind]) {
    if (unique.length >= 6) break;
    if (!unique.includes(filler)) unique.push(filler);
  }

  return unique.slice(0, 6);
}

function coreKeyword(row: CharacterRow, kind: FeedKind) {
  const style = visualStyle(row);
  const hash = stableHash(row.id);

  if (kind === "girls") {
    if (style.includes("blonde")) {
      return hash % 2 === 0 ? "blonde beauty" : "blonde girl";
    }
    if (style.includes("red hair") || style.includes("redhead") || style.includes("auburn")) {
      return hash % 2 === 0 ? "redhead beauty" : "redhead girl";
    }
    if (style.includes("brown hair") || style.includes("brunette")) {
      return hash % 2 === 0 ? "brunette beauty" : "brunette girl";
    }
    if (style.includes("goth")) {
      return hash % 2 === 0 ? "goth girl" : "goth girl aesthetic";
    }
    if (style.includes("y2k") || style.includes("2000s")) return "Y2K girl";
    if (style.includes("pastel") || style.includes("soft feminine")) return "soft girl aesthetic";
    if (style.includes("minimalist") || style.includes("fresh-faced")) return "clean girl aesthetic";
    if (style.includes("glam") || style.includes("bold makeup")) return "baddie aesthetic";

    return GIRL_CORE_KEYWORDS[hash % GIRL_CORE_KEYWORDS.length];
  }

  if (kind === "guys") {
    return GUY_CORE_KEYWORDS[hash % GUY_CORE_KEYWORDS.length];
  }

  if (kind === "anime") {
    return ANIME_CORE_KEYWORDS[hash % ANIME_CORE_KEYWORDS.length];
  }

  return GENERAL_CORE_KEYWORDS[hash % GENERAL_CORE_KEYWORDS.length];
}

function pinTitle(row: CharacterRow, feed: FeedConfig) {
  const main = coreKeyword(row, feed.kind);
  const secondary = matchingVisualKeywords(row, feed.kind).filter(
    (keyword) => keyword.toLowerCase() !== main.toLowerCase()
  );

  const pieces = [main, ...secondary];
  let title = pieces[0];

  for (let index = 1; index < pieces.length; index += 1) {
    const candidate = `${title} | ${pieces[index]}`;
    if (candidate.length > 100) break;
    title = candidate;
  }

  return compactText(title, 100);
}

function pinDescription(row: CharacterRow) {
  const variants = [
    `Call me? 💗 Find me on EverBond: ${SITE_URL}`,
    `Talk with me 💗 Find me on EverBond: ${SITE_URL}`,
    `Find me on EverBond 💗 ${SITE_URL}`
  ];

  return variants[stableHash(`${row.id}:description`) % variants.length];
}

function scheduledPubDate(index: number, kind: FeedKind) {
  const dailyLimit = FEED_DAILY_LIMITS[kind];
  const dayIndex = Math.floor(index / dailyLimit);
  const slotIndex = index % dailyLimit;

  // Pinterest polls RSS feeds in batches rather than continuously. Release each
  // day's quota together so a single Pinterest poll can see the full day's
  // available Pins instead of only the small number whose minute-by-minute
  // slots happened to be visible at that poll. A one-second offset keeps each
  // pubDate unique while still releasing the whole daily batch immediately.
  const slotOffsetMs = slotIndex * 1000;

  return new Date(
    PIN_ROLLOUT_START_MS + dayIndex * DAY_MS + slotOffsetMs
  );
}

async function getFeedCharacters(category: string) {
  const supabase = getSupabaseServiceClient();
  const rows: CharacterRow[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("characters")
      .select(
        "id,slug,name,category,tags,title,role,ai_profile,image_file,image_storage_path,image_url,created_at"
      )
      .eq("is_public", true)
      .eq("is_active", true)
      .eq("visibility", "public")
      .eq("category", category)
      .order("created_at", { ascending: true, nullsFirst: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const page = (data ?? []) as CharacterRow[];
    rows.push(
      ...page.filter(
        (row) => Boolean(row.slug?.trim()) && Boolean(row.name?.trim())
      )
    );

    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

function rssItem(row: CharacterRow, feed: FeedConfig, pubDate: Date) {
  const imageUrl = imageUrlForCharacter(row);
  if (!imageUrl) return "";

  const link = `${SITE_URL}/chat/${encodeURIComponent(row.slug)}`;
  const guid = `everbond:${PIN_FEED_VERSION}:${row.id}`;
  const title = pinTitle(row, feed);
  const description = pinDescription(row);

  return [
    "    <item>",
    `      <title>${escapeXml(title)}</title>`,
    `      <description>${escapeXml(description)}</description>`,
    `      <link>${escapeXml(link)}</link>`,
    `      <guid isPermaLink=\"false\">${escapeXml(guid)}</guid>`,
    `      <pubDate>${escapeXml(pubDate.toUTCString())}</pubDate>`,
    `      <media:content url=\"${escapeXml(imageUrl)}\" medium=\"image\" />`,
    "    </item>"
  ].join("\n");
}

function rssDocument(feed: FeedConfig, characters: CharacterRow[]) {
  const now = Date.now();
  const items = characters
    .map((character, index) => {
      const pubDate = scheduledPubDate(index, feed.kind);
      if (pubDate.getTime() > now) return "";
      return rssItem(character, feed, pubDate);
    })
    .filter(Boolean)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${escapeXml(feed.channelTitle)}</title>
    <link>${escapeXml(SITE_URL)}</link>
    <description>${escapeXml(feed.channelDescription)}</description>
    <language>en-us</language>
    <lastBuildDate>${escapeXml(new Date().toUTCString())}</lastBuildDate>
${items}
  </channel>
</rss>`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ feed: string }> }
) {
  const { feed } = await context.params;
  const config = FEEDS[feed as FeedName];

  if (!config) {
    return new Response("Pinterest feed not found.", { status: 404 });
  }

  try {
    const characters = await getFeedCharacters(config.category);
    const xml = rssDocument(config, characters);

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Robots-Tag": "noindex, follow"
      }
    });
  } catch (error) {
    console.error(`EverBond Pinterest RSS failed for ${feed}:`, error);
    return new Response("Pinterest feed temporarily unavailable.", {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }
}
