export const OFFICIAL_SITE_URL = "https://uncensoredgirlfriend.chat";

export const EVERBOND_SOCIAL_PROFILES: readonly string[] = [];

export const PRIMARY_SITE_PAGES = [
  { name: "Characters", path: "/characters" },
  { name: "Create a Companion", path: "/create" },
  { name: "Why Choose Us", path: "/why-choose-us" },
  { name: "KissCoins", path: "/coins" },
  { name: "Gift Shop", path: "/shop" },
  { name: "AI Girlfriend", path: "/ai-girlfriend" },
  { name: "AI Boyfriend", path: "/ai-boyfriend" },
  { name: "Guides", path: "/guides" }
] as const;

export function absoluteEverBondUrl(path = "/") {
  if (path === "/") return `${OFFICIAL_SITE_URL}/`;
  return `${OFFICIAL_SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
