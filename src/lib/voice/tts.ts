export async function synthesizeSpeech({ text, voiceId }: { text: string; voiceId?: string }) {
  return { status: "provider_not_configured" as const, audioUrl: null as string | null, text, voiceId };
}
