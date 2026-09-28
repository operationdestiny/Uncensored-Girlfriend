"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useSiteLanguage } from "@/lib/site-language";
import { localizedMetadataForPath } from "@/lib/final-localization-language";

const LOCALIZED_METADATA_PATHS = new Set([
  "/",
  "/characters",
  "/create",
  "/coins",
  "/shop",
  "/my-bond",
  "/why-everbond",
  "/safety",
  "/legal",
  "/contact",
  "/account",
  "/auth/reset-password",
  "/pricing"
]);

const SERVER_AUTHORITATIVE_EN_PATHS = new Set([
  "/",
  "/characters",
  "/create",
  "/coins",
  "/shop",
  "/why-everbond",
  "/safety",
  "/legal",
  "/contact"
]);

function setMeta(selector: string, attribute: string, value: string) {
  const element = document.querySelector<HTMLMetaElement>(selector);
  if (element) element.setAttribute(attribute, value);
}

export function LocalizedDocumentMetadata() {
  const pathname = usePathname();
  const { language } = useSiteLanguage();

  useEffect(() => {
    const normalized = pathname.replace(/\/+$/, "") || "/";
    // New brand's server metadata is authoritative until rewritten translations ship.
    // Prevent legacy EverBond localized titles/descriptions from being re-inserted.
    if (new Set(["/", "/characters", "/create", "/coins", "/shop", "/why-choose-us", "/legal", "/contact", "/safety"]).has(normalized)) return;
    const isDynamicCharacterPage =
      normalized.startsWith("/chat/") ||
      normalized.startsWith("/character/");

    // SEO landing pages, guides, comparisons, and other server-authored routes
    // keep their server metadata instead of being replaced by the generic
    // client fallback after hydration.
    if (
      !isDynamicCharacterPage &&
      !LOCALIZED_METADATA_PATHS.has(normalized)
    ) {
      return;
    }

    // English search metadata is authored server-side for every public,
    // indexable route. Keep that HTML authoritative for crawlers and prevent
    // hydration from sending a second, conflicting title/description signal.
    if (
      language === "EN" &&
      (isDynamicCharacterPage ||
        SERVER_AUTHORITATIVE_EN_PATHS.has(normalized))
    ) {
      return;
    }

    function applyMetadata() {
      const dynamicName = isDynamicCharacterPage
        ? document.querySelector("h1")?.textContent?.trim()
        : undefined;
      const metadata = localizedMetadataForPath(
        pathname,
        language,
        dynamicName
      );

      document.title = metadata.title;
      setMeta('meta[name="description"]', "content", metadata.description);
      setMeta('meta[property="og:title"]', "content", metadata.title);
      setMeta(
        'meta[property="og:description"]',
        "content",
        metadata.description
      );
    }

    applyMetadata();

    if (!isDynamicCharacterPage) {
      return;
    }

    const observer = new MutationObserver(applyMetadata);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    return () => observer.disconnect();
  }, [language, pathname]);

  return null;
}
