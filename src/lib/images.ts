export async function getOrCreateCharacterImageUnlock({ characterId, slot }: { characterId: string; slot: number }) {
  return { characterId, slot, status: "provider_not_configured" as const, imageUrl: null as string | null };
}
