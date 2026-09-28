import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { LocalizedChatShell } from "@/components/chat/LocalizedChatShell";
import { PrivateChatLoader } from "@/components/chat/PrivateChatLoader";
import { RelatedCompanions } from "@/components/seo/RelatedCompanions";
import { getLinkAccessibleCharacterBySlugFromSupabase } from "@/lib/characters-db";

type PageProps = {
  params: Promise<{ slug: string }>;
};

function seoString(
  generatedSeo: Record<string, unknown> | undefined,
  key: "seo_title" | "seo_description"
) {
  const value = generatedSeo?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function fallbackDescription(name: string, text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) {
    return `Chat with ${name}, an AI companion on EverBond.`;
  }

  if (clean.length <= 170) return clean;
  return `${clean.slice(0, 167).replace(/\s+\S*$/, "")}…`;
}

export async function generateMetadata({
  params
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const companion =
    await getLinkAccessibleCharacterBySlugFromSupabase(slug);

  if (!companion) {
    return {
      title: "EverBond Chat",
      robots: {
        index: false,
        follow: false
      }
    };
  }

  const isShareByLink = companion.visibility === "unlisted";
  const seoTitle =
    seoString(companion.generatedSeo, "seo_title") ||
    `Chat with ${companion.name} — EverBond AI Companion`;
  const seoDescription =
    seoString(companion.generatedSeo, "seo_description") ||
    fallbackDescription(
      companion.name,
      companion.tagline || companion.description || ""
    );
  const canonicalPath = `/chat/${encodeURIComponent(companion.slug)}`;

  if (isShareByLink) {
    return {
      title: seoTitle,
      description: seoDescription,
      robots: {
        index: false,
        follow: false,
        noarchive: true,
        noimageindex: true
      }
    };
  }

  return {
    title: seoTitle,
    description: seoDescription,
    alternates: {
      canonical: canonicalPath
    },
    robots: {
      index: true,
      follow: true
    },
    openGraph: {
      title: seoTitle,
      description: seoDescription,
      url: canonicalPath,
      siteName: "EverBond",
      images: companion.image
        ? [
            {
              url: companion.image,
              alt: companion.name
            }
          ]
        : undefined,
      type: "website"
    },
    twitter: {
      card: "summary_large_image",
      title: seoTitle,
      description: seoDescription,
      images: companion.image ? [companion.image] : undefined
    }
  };
}

export default async function ChatPage({ params }: PageProps) {
  const { slug } = await params;
  const companion =
    await getLinkAccessibleCharacterBySlugFromSupabase(slug);

  return (
    <AppShell>
      {companion ? (
        <>
          <LocalizedChatShell character={companion} />
          {companion.visibility === "public" ? (
            <RelatedCompanions character={companion} />
          ) : null}
        </>
      ) : (
        <PrivateChatLoader slug={slug} />
      )}
    </AppShell>
  );
}
