import { AppShell } from "@/components/layout/AppShell";
import { CreatorPublicPage } from "@/components/creator/CreatorPublicPage";
import { getPublicCharactersByCreatorUsername } from "@/lib/user-characters";

export default async function CreatorPage({
  params
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const decodedUsername = username.trim().toLowerCase();
  const characters = await getPublicCharactersByCreatorUsername(
    decodedUsername
  );

  return (
    <AppShell>
      <CreatorPublicPage
        username={decodedUsername}
        characters={characters}
      />
    </AppShell>
  );
}
