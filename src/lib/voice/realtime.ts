export async function createRealtimeVoiceSession({ characterId }: { characterId: string }) {
  return { status: "provider_not_configured" as const, characterId, session: null };
}
