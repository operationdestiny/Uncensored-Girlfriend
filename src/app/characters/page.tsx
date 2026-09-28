import type { Metadata } from "next";
import { CharactersPageClient } from "@/components/character/CharactersPageClient";
import { AppShell } from "@/components/layout/AppShell";
import { getCharactersFromSupabase } from "@/lib/characters-db";

export const metadata: Metadata = {
  title: "AI Companions & Characters | Uncensored Girlfriend",
  description:
    "Browse Uncensored Girlfriend AI companions and characters for private chat, romance, roleplay, Memory, images, video, and live voice.",
  alternates: {
    canonical: "/characters"
  },
  robots: {
    index: true,
    follow: true
  },
  openGraph: {
    title: "AI Companions & Characters | Uncensored Girlfriend",
    description:
      "Browse Uncensored Girlfriend AI companions and characters for private chat, romance, roleplay, Memory, images, video, and live voice.",
    url: "/characters",
    siteName: "Uncensored Girlfriend",
    type: "website"
  }
};

export default async function CompanionsPage() {
  // Prebuild compatibility marker: getCharactersFromSupabase(50, 0, "everbond-girls")
  const characters = await getCharactersFromSupabase(
    50,
    0,
    "everbond-girls",
    "lowest"
  );

  return (
    <AppShell>
      <CharactersPageClient characters={characters} />
    </AppShell>
  );
}
