import { getSupabaseServiceClient } from "@/lib/supabase/server";

export type RetellCallTranscriptItem = {
  role: "user" | "agent" | "character";
  content: string;
};

export type RetellCallFinalizeResult = {
  finalized: boolean;
  conversationId: string | null;
  characterId: string | null;
  characterSlug: string | null;
  transcript: RetellCallTranscriptItem[];
};

function cleanContent(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 4000);
}

export function normalizeRetellCallTranscript(
  value: unknown
): RetellCallTranscriptItem[] {
  if (!Array.isArray(value)) return [];

  const normalized: RetellCallTranscriptItem[] = [];

  for (const item of value.slice(0, 400)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;

    const record = item as Record<string, unknown>;
    const rawRole = String(record.role ?? "").toLowerCase();
    const role =
      rawRole === "user"
        ? ("user" as const)
        : rawRole === "agent" || rawRole === "character"
          ? ("agent" as const)
          : null;
    const content = cleanContent(record.content);

    if (!role || !content) continue;

    const previous = normalized[normalized.length - 1];
    if (previous && previous.role === role && previous.content === content) {
      continue;
    }

    normalized.push({ role, content });
  }

  return normalized;
}

export async function finalizeRetellVoiceCall(values: {
  userId: string;
  billingCallId: string;
  reason: string;
  transcript: unknown;
}): Promise<RetellCallFinalizeResult> {
  const transcript = normalizeRetellCallTranscript(values.transcript);

  const { data, error } = await getSupabaseServiceClient().rpc(
    "finalize_retell_voice_call",
    {
      p_user_id: values.userId,
      p_call_id: values.billingCallId,
      p_reason: values.reason.slice(0, 100),
      p_transcript: transcript
    }
  );

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;

  return {
    finalized: Boolean(row?.finalized),
    conversationId:
      typeof row?.conversation_id === "string" ? row.conversation_id : null,
    characterId:
      typeof row?.character_id === "string" ? row.character_id : null,
    characterSlug:
      typeof row?.character_slug === "string" ? row.character_slug : null,
    transcript
  };
}
