import type { MetadataRoute } from "next";
import { OFFICIAL_SITE_URL } from "@/lib/site-seo";

export default function robots(): MetadataRoute.Robots {
  const publicLaunch = process.env.LAUNCH_INDEXING_ENABLED === "true";
  return {
    rules: { userAgent: "*", allow: publicLaunch ? "/" : undefined,
      disallow: publicLaunch ? ["/api/", "/account", "/my-bond", "/money", "/partners"] : "/" },
    sitemap: publicLaunch ? `${OFFICIAL_SITE_URL}/sitemap.xml` : undefined
  };
}
