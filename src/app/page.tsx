import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { HomeCompanionBrowser } from "@/components/character/HomeCompanionBrowser";
import { AppShell } from "@/components/layout/AppShell";
import { getCharactersFromSupabase } from "@/lib/characters-db";
import {
  EVERBOND_SOCIAL_PROFILES,
  OFFICIAL_SITE_URL,
  PRIMARY_SITE_PAGES,
  absoluteEverBondUrl
} from "@/lib/site-seo";

export const metadata: Metadata = {
  alternates: {
    canonical: "/"
  },
  robots: {
    index: process.env.LAUNCH_INDEXING_ENABLED === "true",
    follow: process.env.LAUNCH_INDEXING_ENABLED === "true"
  }
};

const ORGANIZATION_ID = `${OFFICIAL_SITE_URL}/#organization`;
const WEBSITE_ID = `${OFFICIAL_SITE_URL}/#website`;
const HOMEPAGE_ID = `${OFFICIAL_SITE_URL}/#webpage`;

const HOMEPAGE_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: BRAND.name,
      alternateName: "Uncensored Girlfriend",
      // Add verified legalName only after your new legal entity is established.
      url: `${OFFICIAL_SITE_URL}/`,
      logo: {
        "@type": "ImageObject",
        url: absoluteEverBondUrl("/ug-lips-logo.svg"),
        contentUrl: absoluteEverBondUrl("/ug-lips-logo.svg")
      },
      sameAs: EVERBOND_SOCIAL_PROFILES
    },
    {
      "@type": "WebSite",
      "@id": WEBSITE_ID,
      name: BRAND.name,
      alternateName: "Uncensored Girlfriend",
      url: `${OFFICIAL_SITE_URL}/`,
      publisher: {
        "@id": ORGANIZATION_ID
      },
      hasPart: PRIMARY_SITE_PAGES.map((page) => ({
        "@type": "WebPage",
        "@id": `${absoluteEverBondUrl(page.path)}#webpage`,
        name: page.name,
        url: absoluteEverBondUrl(page.path),
        isPartOf: {
          "@id": WEBSITE_ID
        }
      }))
    },
    {
      "@type": "WebPage",
      "@id": HOMEPAGE_ID,
      name: "Uncensored Girlfriend",
      url: `${OFFICIAL_SITE_URL}/`,
      isPartOf: {
        "@id": WEBSITE_ID
      },
      about: {
        "@id": ORGANIZATION_ID
      }
    },
    ...PRIMARY_SITE_PAGES.map((page, index) => ({
      "@type": "SiteNavigationElement",
      "@id": `${OFFICIAL_SITE_URL}/#primary-navigation-${index + 1}`,
      name: page.name,
      url: absoluteEverBondUrl(page.path),
      isPartOf: {
        "@id": HOMEPAGE_ID
      }
    }))
  ]
};

export default async function HomePage() {
  const characters = await getCharactersFromSupabase(
    50,
    0,
    "everbond-girls",
    "lowest"
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(HOMEPAGE_STRUCTURED_DATA)
        }}
      />
      <AppShell>
        <HomeCompanionBrowser characters={characters} />
      </AppShell>
    </>
  );
}
