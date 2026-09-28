import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { LocalizedCharacterProfileShell } from "@/components/character/LocalizedCharacterProfileShell";
import { getLinkAccessibleCharacterBySlugFromSupabase } from "@/lib/characters-db";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const companion =
    await getLinkAccessibleCharacterBySlugFromSupabase(slug);

  if (!companion) {
    return {
      title: "Companion not found — EverBond"
    };
  }

  const isShareByLink = companion.visibility === "unlisted";

  return {
    title: `${companion.name} — EverBond`,
    description: companion.description,
    robots: isShareByLink
      ? {
          index: false,
          follow: false,
          noarchive: true,
          noimageindex: true
        }
      : undefined
  };
}

export default async function CompanionProfilePage({
  params
}: PageProps) {
  const { slug } = await params;
  const companion =
    await getLinkAccessibleCharacterBySlugFromSupabase(slug);

  if (!companion) notFound();

  return (
    <AppShell>
      <LocalizedCharacterProfileShell character={companion} />
    </AppShell>
  );
}
