import { AppShell } from "@/components/layout/AppShell";
import { CharacterGalleryClient } from "@/components/media/CharacterGalleryClient";

export default async function CharacterGalleryPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <AppShell>
      <CharacterGalleryClient slug={slug} />
    </AppShell>
  );
}
