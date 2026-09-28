import { z } from "zod";
import type { MemoryState } from "@/types/memory";
import { defaultMemory } from "@/lib/memory/defaultMemory";
import { buildMemoryModePrompt } from "@/lib/ai/prompts";
import { callEverBondMemoryModel } from "@/lib/ai/provider";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getCharacterBySlugForUser } from "@/lib/user-characters";
import type { RetellCallTranscriptItem } from "@/lib/retell-call-finalize";

const MemoryExtractionSchema = z
  .object({
    story_summary: z.string(),
    user_facts: z.array(z.string()).max(12),
    relationship_state: z.string(),
    emotional_state: z.string(),
    open_threads: z.array(z.string()).max(12),
    important_promises: z.array(z.string()).max(12),
    important_events: z.array(z.string()).max(20),
    permanent_identity_updates: z
      .object({
        name: z.string().nullable().optional(),
        gender: z.string().nullable().optional(),
        core_identity: z.string().nullable().optional()
      })
      .optional(),
    current_scene: z
      .object({
        location: z.string().optional(),
        character_clothing: z.string().optional(),
        user_clothing: z.string().optional(),
        character_position: z.string().optional(),
        user_position: z.string().optional(),
        current_action: z.string().optional()
      })
      .optional()
  })
  .passthrough();

type MemoryExtraction = z.infer<typeof MemoryExtractionSchema>;

function cleanMemoryText(value: unknown, maxCharacters: number) {
  if (typeof value !== "string") return "";
  return Array.from(value.replace(/\s+/g, " ").trim())
    .slice(0, maxCharacters)
    .join("")
    .trim();
}

function cleanMemoryList(
  values: string[],
  maxItems: number,
  maxCharacters: number
) {
  const seen = new Set<string>();

  return values
    .map((value) => cleanMemoryText(value, maxCharacters))
    .filter((value) => {
      if (!value) return false;
      const key = value.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxItems);
}

function parseMemoryExtraction(content: string): MemoryExtraction | null {
  const withoutFences = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    const parsed = JSON.parse(withoutFences.slice(start, end + 1));
    const result = MemoryExtractionSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function mergeExtractedMemory(
  currentMemory: MemoryState,
  extraction: MemoryExtraction
): MemoryState {
  const identityUpdates = extraction.permanent_identity_updates ?? {};

  return {
    story_summary:
      cleanMemoryText(extraction.story_summary, 1200) ||
      currentMemory.story_summary,
    user_facts: cleanMemoryList(extraction.user_facts, 12, 300),
    relationship_state:
      cleanMemoryText(extraction.relationship_state, 120) ||
      currentMemory.relationship_state,
    emotional_state:
      cleanMemoryText(extraction.emotional_state, 300) ||
      currentMemory.emotional_state,
    open_threads: cleanMemoryList(extraction.open_threads, 12, 300),
    important_promises: cleanMemoryList(
      extraction.important_promises,
      12,
      300
    ),
    important_events: cleanMemoryList(
      extraction.important_events,
      20,
      300
    ),
    current_scene: {
      location:
        cleanMemoryText(extraction.current_scene?.location, 200) ||
        currentMemory.current_scene?.location ||
        "",
      character_clothing:
        cleanMemoryText(extraction.current_scene?.character_clothing, 300) ||
        currentMemory.current_scene?.character_clothing ||
        "",
      user_clothing:
        cleanMemoryText(extraction.current_scene?.user_clothing, 300) ||
        currentMemory.current_scene?.user_clothing ||
        "",
      character_position:
        cleanMemoryText(extraction.current_scene?.character_position, 200) ||
        currentMemory.current_scene?.character_position ||
        "",
      user_position:
        cleanMemoryText(extraction.current_scene?.user_position, 200) ||
        currentMemory.current_scene?.user_position ||
        "",
      current_action:
        cleanMemoryText(extraction.current_scene?.current_action, 300) ||
        currentMemory.current_scene?.current_action ||
        ""
    },
    permanent_identity: {
      name:
        cleanMemoryText(identityUpdates.name, 80) ||
        currentMemory.permanent_identity?.name ||
        null,
      gender:
        cleanMemoryText(identityUpdates.gender, 80) ||
        currentMemory.permanent_identity?.gender ||
        null,
      core_identity:
        cleanMemoryText(identityUpdates.core_identity, 160) ||
        currentMemory.permanent_identity?.core_identity ||
        null
    }
  };
}

async function loadCurrentMemory(values: {
  userId: string;
  characterId: string;
  conversationId: string;
}) {
  const supabase = getSupabaseServiceClient();

  const [conversationResult, relationshipResult, memoriesResult] =
    await Promise.all([
      supabase
        .from("conversations")
        .select("memory_state")
        .eq("id", values.conversationId)
        .eq("user_id", values.userId)
        .eq("character_id", values.characterId)
        .maybeSingle(),
      supabase
        .from("relationship_states")
        .select(
          "stage,summary,emotional_state,open_threads,important_promises,important_events,user_name,user_gender,user_core_identity"
        )
        .eq("user_id", values.userId)
        .eq("character_id", values.characterId)
        .maybeSingle(),
      supabase
        .from("ever_memory")
        .select("memory_type,content")
        .eq("user_id", values.userId)
        .eq("character_id", values.characterId)
        .order("importance", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(12)
    ]);

  if (conversationResult.error) throw conversationResult.error;
  if (relationshipResult.error) throw relationshipResult.error;
  if (memoriesResult.error) throw memoriesResult.error;

  let memory: MemoryState = {
    ...defaultMemory,
    ...((conversationResult.data?.memory_state ?? {}) as Partial<MemoryState>)
  };

  const relationship = relationshipResult.data;
  if (relationship) {
    memory = {
      ...memory,
      story_summary: relationship.summary || memory.story_summary,
      relationship_state: relationship.stage || memory.relationship_state,
      emotional_state:
        relationship.emotional_state || memory.emotional_state,
      open_threads: relationship.open_threads || memory.open_threads,
      important_promises:
        relationship.important_promises || memory.important_promises,
      important_events:
        relationship.important_events || memory.important_events,
      permanent_identity: {
        name:
          relationship.user_name ??
          memory.permanent_identity?.name ??
          null,
        gender:
          relationship.user_gender ??
          memory.permanent_identity?.gender ??
          null,
        core_identity:
          relationship.user_core_identity ??
          memory.permanent_identity?.core_identity ??
          null
      }
    };
  }

  if (memoriesResult.data) {
    memory.user_facts = [
      ...(memory.user_facts ?? []),
      ...memoriesResult.data
        .filter((row) =>
          ["fact", "preference", "routine", "inside_joke"].includes(
            row.memory_type
          )
        )
        .map((row) => row.content)
    ].slice(0, 12);
  }

  return memory;
}

async function persistMemory(values: {
  userId: string;
  characterId: string;
  conversationId: string;
  memory: MemoryState;
}) {
  const supabase = getSupabaseServiceClient();
  const now = new Date().toISOString();

  const { error: conversationError } = await supabase
    .from("conversations")
    .update({
      memory_state: values.memory,
      updated_at: now
    })
    .eq("id", values.conversationId)
    .eq("user_id", values.userId)
    .eq("character_id", values.characterId);

  if (conversationError) throw conversationError;

  const { error: relationshipError } = await supabase
    .from("relationship_states")
    .upsert(
      {
        user_id: values.userId,
        character_id: values.characterId,
        stage: values.memory.relationship_state || "new",
        summary: values.memory.story_summary,
        emotional_state: values.memory.emotional_state,
        open_threads: values.memory.open_threads,
        important_promises: values.memory.important_promises,
        important_events: values.memory.important_events,
        user_name: values.memory.permanent_identity?.name ?? null,
        user_gender: values.memory.permanent_identity?.gender ?? null,
        user_core_identity:
          values.memory.permanent_identity?.core_identity ?? null,
        updated_at: now
      },
      { onConflict: "user_id,character_id" }
    );

  if (relationshipError) throw relationshipError;

  const candidates = [
    ...values.memory.user_facts.map((content) => ({
      memory_type: "fact",
      content,
      importance: 70
    })),
    ...values.memory.open_threads.map((content) => ({
      memory_type: "open_thread",
      content,
      importance: 85
    })),
    ...values.memory.important_promises.map((content) => ({
      memory_type: "promise",
      content,
      importance: 90
    })),
    ...values.memory.important_events.map((content) => ({
      memory_type: "event",
      content,
      importance: 80
    }))
  ];

  if (!candidates.length) return;

  const { data: existing, error: existingError } = await supabase
    .from("ever_memory")
    .select("memory_type,content")
    .eq("user_id", values.userId)
    .eq("character_id", values.characterId);

  if (existingError) throw existingError;

  const keys = new Set(
    (existing ?? []).map(
      (row) =>
        `${row.memory_type}:${String(row.content)
          .trim()
          .toLocaleLowerCase()}`
    )
  );

  const rows = candidates
    .filter((candidate) => {
      const key = `${candidate.memory_type}:${candidate.content
        .trim()
        .toLocaleLowerCase()}`;
      if (!candidate.content.trim() || keys.has(key)) return false;
      keys.add(key);
      return true;
    })
    .map((candidate) => ({
      user_id: values.userId,
      character_id: values.characterId,
      conversation_id: values.conversationId,
      ...candidate
    }));

  if (rows.length) {
    const { error } = await supabase.from("ever_memory").insert(rows);
    if (error) throw error;
  }
}

function memoryTranscript(
  characterName: string,
  transcript: RetellCallTranscriptItem[]
) {
  const lines = transcript
    .map((item) => {
      const raw = item.content
        .replace(/\[(?:laughs?|giggles?|whispers?|sighs?|gasps?|moans?)\]/gi, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1200);

      if (!raw) return "";
      return item.role === "user"
        ? `User: ${raw}`
        : `${characterName}: ${raw}`;
    })
    .filter(Boolean);

  let joined = lines.join("\n");
  if (joined.length > 24_000) {
    joined =
      joined.slice(0, 4_000) +
      "\n[Middle of call omitted for compact memory extraction]\n" +
      joined.slice(-19_500);
  }

  return joined;
}

export async function updateRetellCallMemory(values: {
  userId: string;
  characterSlug: string;
  characterId: string;
  conversationId: string;
  transcript: RetellCallTranscriptItem[];
}) {
  if (!values.transcript.length) return;

  try {
    const character = await getCharacterBySlugForUser(
      values.characterSlug,
      values.userId
    );
    if (!character || character.id !== values.characterId) return;

    const currentMemory = await loadCurrentMemory({
      userId: values.userId,
      characterId: values.characterId,
      conversationId: values.conversationId
    });

    const transcript = memoryTranscript(
      character.name,
      values.transcript
    );
    if (!transcript) return;

    const result = await callEverBondMemoryModel(
      buildMemoryModePrompt(
        character,
        `LIVE VOICE CALL TRANSCRIPT:\n${transcript}`,
        currentMemory
      )
    );

    const extraction = parseMemoryExtraction(result.content);
    if (!extraction) return;

    await persistMemory({
      userId: values.userId,
      characterId: values.characterId,
      conversationId: values.conversationId,
      memory: mergeExtractedMemory(currentMemory, extraction)
    });
  } catch (error) {
    console.error("RETELL_CALL_MEMORY_UPDATE_FAILED", error);
  }
}
