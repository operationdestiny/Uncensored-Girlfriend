import type { MetadataRoute } from "next";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { SEO_GUIDE_PATHS } from "@/lib/seo-guides";
import { SEO_LANDING_PATHS } from "@/lib/seo-landing-pages";
import { OFFICIAL_SITE_URL } from "@/lib/site-seo";

const SITE_URL = OFFICIAL_SITE_URL;

export const revalidate = 3600;

async function getPublicCharacterSlugs() {
  const supabase = getSupabaseServiceClient();
  const rows: Array<{ slug: string }> = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("characters")
      .select("slug")
      .eq("is_public", true)
      .eq("is_active", true)
      .eq("visibility", "public")
      .order("slug", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const page = (data ?? []) as Array<{ slug: string }>;
    rows.push(...page.filter((row) => Boolean(row.slug)));

    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/` },
    { url: `${SITE_URL}/characters` },
    { url: `${SITE_URL}/create` },
    { url: `${SITE_URL}/why-choose-us` },
    { url: `${SITE_URL}/coins` },
    { url: `${SITE_URL}/shop` },
    { url: `${SITE_URL}/safety` },
    { url: `${SITE_URL}/contact` },
    ...SEO_LANDING_PATHS.map((path) => ({
      url: `${SITE_URL}${path}`
    })),
    { url: `${SITE_URL}/guides` },
    ...SEO_GUIDE_PATHS.map((path) => ({
      url: `${SITE_URL}${path}`
    })),

  ];

  // Public preview can build before the NEW Supabase instance has been provisioned.
  // No access to the previous product's database is attempted.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return staticPages;
  }
  try {
    const characters = await getPublicCharacterSlugs();
    return [
      ...staticPages,
      ...characters.map((character) => ({
        url: `${SITE_URL}/chat/${encodeURIComponent(character.slug)}`
      }))
    ];
  } catch (error) {
    console.error("Uncensored Girlfriend sitemap character load failed:", error);
    return staticPages;
  }
}
