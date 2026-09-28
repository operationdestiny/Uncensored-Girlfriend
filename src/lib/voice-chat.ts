import { z } from "zod";
import type { Character } from "@/types/character";
import type { MemoryState } from "@/types/memory";
import { defaultMemory } from "@/lib/memory/defaultMemory";
import {
  buildChatModePrompt,
  buildMemoryModePrompt,
  type SupportedLanguage
} from "@/lib/ai/prompts";
import {
  callEverBondMemoryModel,
  callEverBondModel,
  type EverBondMessage
} from "@/lib/ai/provider";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { limitVoiceReply } from "@/lib/voice-call";

const USER_MESSAGE_MAX_TOKENS = 80;
const CHARACTER_CONTEXT_MAX_TOKENS = 85;
const MODEL_HISTORY_MESSAGE_COUNT = 12;
const EVER_MEMORY_LIMIT = 12;
const PERSONAL_MEMORY_TYPES = [
  "fact",
  "preference",
  "routine",
  "inside_joke"
];

const MemoryExtractionSchema = z
  .object({
    story_summary: z.string(),
    user_facts: z.array(z.string()).max(12),
    superseded_user_facts: z.array(z.string()).max(12).optional(),
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

type StoredMessageRow = {
  role: string;
  content: string;
  metadata?: unknown;
};

type HistoryMessage = EverBondMessage & {
  excludeFromEverMemory?: boolean;
  memoryContent?: string;
};

type StoredGiftMetadata = {
  gift?: {
    title?: unknown;
  };
  giftEvent?: {
    excludeFromEverMemory?: unknown;
  };
  userText?: unknown;
};

function messageQueryErrorDetails(error: unknown) {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== "object") return String(error ?? "");

  const record = error as Record<string, unknown>;
  return [record.code, record.message, record.details, record.hint]
    .filter((value) => typeof value === "string" && value)
    .join(" ");
}

function isMissingMessageMetadataColumn(error: unknown) {
  const details = messageQueryErrorDetails(error).toLowerCase();
  return (
    details.includes("metadata") &&
    (details.includes("column") ||
      details.includes("schema cache") ||
      details.includes("pgrst204") ||
      details.includes("42703"))
  );
}

function storedGiftMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const metadata = value as StoredGiftMetadata;
  const event = metadata.giftEvent;
  const gift = metadata.gift;

  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return null;
  }

  if (!gift || typeof gift !== "object" || Array.isArray(gift)) {
    return null;
  }

  if (event.excludeFromEverMemory !== true) return null;

  const title =
    typeof gift.title === "string"
      ? gift.title.replace(/\s+/g, " ").trim()
      : "";

  if (!title) return null;

  return {
    title,
    userText:
      typeof metadata.userText === "string"
        ? metadata.userText.replace(/\s+/g, " ").trim()
        : ""
  };
}

function modelHistory(history: HistoryMessage[]): EverBondMessage[] {
  return history.map(({ role, content }) => ({ role, content }));
}

function memoryHistoryLines(
  history: HistoryMessage[],
  characterName: string
) {
  return history
    .map((message) => {
      if (message.excludeFromEverMemory) return "";

      const content = (message.memoryContent ?? message.content).trim();
      if (!content) return "";

      return `${message.role === "assistant" ? characterName : "User"}: ${content}`;
    })
    .filter(Boolean);
}

function estimateTokenCount(text: string) {
  const normalized = text.trim();
  if (!normalized) return 0;

  const wordCount = normalized.match(/\S+/g)?.length ?? 0;
  const charCount = normalized.length;
  const cjkCount =
    normalized.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g)?.length ?? 0;

  return Math.max(wordCount, Math.ceil(charCount / 4), cjkCount);
}

export function normalizeVoiceTranscript(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error("EMPTY_TRANSCRIPTION");
  if (estimateTokenCount(normalized) > USER_MESSAGE_MAX_TOKENS) {
    throw new Error("VOICE_TRANSCRIPT_TOO_LONG");
  }
  return normalized.slice(0, 320);
}

function limitTextToTokenBudget(text: string, maxTokens: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (estimateTokenCount(normalized) <= maxTokens) return normalized;

  let low = 0;
  let high = normalized.length;

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = normalized.slice(0, middle);

    if (estimateTokenCount(candidate) <= maxTokens) low = middle;
    else high = middle - 1;
  }

  return normalized.slice(0, low).trim();
}

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

function memoryKey(value: string) {
  return cleanMemoryText(value, 300).toLocaleLowerCase();
}

function mergePreservedUserFacts(
  currentFacts: string[],
  extractedFacts: string[],
  supersededFacts: string[] | undefined
) {
  const superseded = new Set(
    cleanMemoryList(supersededFacts ?? [], 12, 300).map(memoryKey)
  );

  const stillValidCurrentFacts = currentFacts.filter(
    (fact) => !superseded.has(memoryKey(fact))
  );

  return cleanMemoryList(
    [...extractedFacts, ...stillValidCurrentFacts],
    12,
    300
  );
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
      cleanMemoryText(extraction.story_summary, 1200) || currentMemory.story_summary,
    user_facts: mergePreservedUserFacts(
      currentMemory.user_facts,
      extraction.user_facts,
      extraction.superseded_user_facts
    ),
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
      [
        ...extraction.important_events,
        ...currentMemory.important_events
      ],
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

async function persistExtractedMemory(values: {
  userId: string;
  characterId: string;
  conversationId: string;
  memory: MemoryState;
}) {
  const supabase = getSupabaseServiceClient();
  const now = new Date().toISOString();

  const { error: conversationMemoryError } = await supabase
    .from("conversations")
    .update({ memory_state: values.memory, updated_at: now })
    .eq("id", values.conversationId)
    .eq("user_id", values.userId);

  if (conversationMemoryError) throw conversationMemoryError;

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
      (row) => `${row.memory_type}:${row.content.trim().toLocaleLowerCase()}`
    )
  );

  const rows = candidates
    .filter((candidate) => {
      const key = `${candidate.memory_type}:${candidate.content
        .trim()
        .toLocaleLowerCase()}`;
      if (keys.has(key)) return false;
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

async function getConversation(values: {
  userId: string;
  characterId: string;
  conversationId?: string | null;
}) {
  const supabase = getSupabaseServiceClient();

  if (values.conversationId) {
    const { data, error } = await supabase
      .from("conversations")
      .select("id,memory_state")
      .eq("id", values.conversationId)
      .eq("user_id", values.userId)
      .eq("character_id", values.characterId)
      .maybeSingle();

    if (error) throw error;
    if (data) return data as { id: string; memory_state: Partial<MemoryState> | null };
  }

  const { data: existing, error: existingError } = await supabase
    .from("conversations")
    .select("id,memory_state")
    .eq("user_id", values.userId)
    .eq("character_id", values.characterId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    return existing as { id: string; memory_state: Partial<MemoryState> | null };
  }

  const { data: created, error: createError } = await supabase
    .from("conversations")
    .insert({ user_id: values.userId, character_id: values.characterId })
    .select("id,memory_state")
    .single();

  if (createError) throw createError;
  return created as { id: string; memory_state: Partial<MemoryState> | null };
}

async function loadHistory(conversationId: string): Promise<HistoryMessage[]> {
  const supabase = getSupabaseServiceClient();
  const messageResult = await supabase
    .from("messages")
    .select("role,content,metadata")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "character"])
    .order("created_at", { ascending: false })
    .limit(MODEL_HISTORY_MESSAGE_COUNT);

  let data = messageResult.data as StoredMessageRow[] | null;
  let error = messageResult.error;

  if (error && isMissingMessageMetadataColumn(error)) {
    const fallbackResult = await supabase
      .from("messages")
      .select("role,content")
      .eq("conversation_id", conversationId)
      .in("role", ["user", "character"])
      .order("created_at", { ascending: false })
      .limit(MODEL_HISTORY_MESSAGE_COUNT);

    data = (fallbackResult.data ?? []) as StoredMessageRow[];
    error = fallbackResult.error;
  }

  if (error) throw error;

  const rows = (data ?? []).reverse();
  let previousWasGift = false;

  return rows
    .map((message) => {
      const isUser = message.role === "user";
      const giftMetadata = storedGiftMetadata(message.metadata);
      const excludeFromEverMemory =
        (!isUser && previousWasGift) ||
        Boolean(giftMetadata && !isUser);

      const modelContent =
        giftMetadata && isUser
          ? [
              `GIFT_EVENT: The user gave ${giftMetadata.title}.`,
              giftMetadata.userText
                ? `USER_MESSAGE: ${giftMetadata.userText}`
                : ""
            ]
              .filter(Boolean)
              .join("\n")
          : message.content;

      const historyMessage: HistoryMessage = {
        role: isUser ? ("user" as const) : ("assistant" as const),
        content: limitTextToTokenBudget(
          modelContent,
          isUser ? USER_MESSAGE_MAX_TOKENS : CHARACTER_CONTEXT_MAX_TOKENS
        ),
        excludeFromEverMemory,
        memoryContent:
          giftMetadata && isUser
            ? limitTextToTokenBudget(
                giftMetadata.userText,
                USER_MESSAGE_MAX_TOKENS
              )
            : undefined
      };

      previousWasGift = isUser && Boolean(giftMetadata);
      return historyMessage;
    })
    .filter((message) => message.content.trim());
}

async function loadMemory(values: {
  userId: string;
  characterId: string;
  conversationMemory: Partial<MemoryState> | null;
}) {
  const supabase = getSupabaseServiceClient();
  let memory: MemoryState = {
    ...defaultMemory,
    ...(values.conversationMemory ?? {})
  };

  const [{ data: relationship }, { data: memories }] = await Promise.all([
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
      .in("memory_type", PERSONAL_MEMORY_TYPES)
      .order("importance", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(EVER_MEMORY_LIMIT)
  ]);

  if (relationship) {
    memory = {
      ...memory,
      story_summary: relationship.summary || memory.story_summary,
      relationship_state: relationship.stage || memory.relationship_state,
      emotional_state: relationship.emotional_state || memory.emotional_state,
      open_threads: relationship.open_threads || memory.open_threads,
      important_promises:
        relationship.important_promises || memory.important_promises,
      important_events: relationship.important_events || memory.important_events,
      permanent_identity: {
        name: relationship.user_name ?? null,
        gender: relationship.user_gender ?? null,
        core_identity: relationship.user_core_identity ?? null
      }
    };
  }

  if (memories) {
    memory.user_facts = cleanMemoryList(
      [
        ...(memory.user_facts ?? []),
        ...memories.map((row) => row.content)
      ],
      EVER_MEMORY_LIMIT,
      300
    );
  }

  return memory;
}

export type VoiceCharacterDraft = {
  conversationId: string;
  transcript: string;
  reply: string;
  inputTokens: number;
  outputTokens: number;
  provider: string;
  model: string;
  memory: MemoryState;
  openingTurn: EverBondMessage[];
  history: EverBondMessage[];
};

export async function generateVoiceCharacterDraft(values: {
  userId: string;
  character: Character;
  transcript: string;
  language: SupportedLanguage;
  conversationId?: string | null;
  maxReplyCharacters: number;
}): Promise<VoiceCharacterDraft> {
  const conversation = await getConversation({
    userId: values.userId,
    characterId: values.character.id,
    conversationId: values.conversationId
  });
  const memory = await loadMemory({
    userId: values.userId,
    characterId: values.character.id,
    conversationMemory: conversation.memory_state
  });
  const history = await loadHistory(conversation.id);
  const previousCharacterReplies = history.filter(
    (message) => message.role === "assistant"
  ).length;
  const includeOpening = previousCharacterReplies < 3;
  const openingMessage = (
    values.character.firstMessage || values.character.openingMessage || ""
  ).trim();
  const hasAssistantHistory = history.some(
    (message) => message.role === "assistant"
  );
  const openingTurn: EverBondMessage[] =
    openingMessage && !hasAssistantHistory
      ? [{ role: "assistant", content: openingMessage }]
      : [];

  const voiceInstruction =
    "LIVE VOICE CALL: Reply as natural spoken dialogue with concise actions. " +
    "Use roughly 45-65 visible tokens when detail is needed, fewer for simple moments, " +
    "and never exceed 75 visible tokens. Do not use markdown headings or long narration.";

  const prompt = `${buildChatModePrompt(
    values.character,
    memory,
    [],
    values.language,
    includeOpening
  )}\n\n${voiceInstruction}`;

  const modelMessages: EverBondMessage[] = [
    { role: "system", content: prompt },
    ...openingTurn,
    ...modelHistory(history),
    { role: "user", content: values.transcript }
  ];

  const result = await callEverBondModel(modelMessages);
  const reply = limitVoiceReply(result.content, values.maxReplyCharacters);
  if (!reply) throw new Error("EMPTY_VOICE_REPLY");

  return {
    conversationId: conversation.id,
    transcript: values.transcript,
    reply,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    provider: result.provider,
    model: result.model,
    memory,
    openingTurn,
    history
  };
}

export async function updateVoiceMemoryAfterCommit(values: {
  userId: string;
  character: Character;
  draft: VoiceCharacterDraft;
}) {
  try {
    const transcript = [
      ...values.draft.openingTurn.map(
        (message) => `${values.character.name}: ${message.content}`
      ),
      ...memoryHistoryLines(
        values.draft.history,
        values.character.name
      ),
      `User: ${values.draft.transcript}`,
      `${values.character.name}: ${values.draft.reply}`
    ].join("\n");

    const memoryResult = await callEverBondMemoryModel(
      buildMemoryModePrompt(values.character, transcript, values.draft.memory)
    );
    const extraction = parseMemoryExtraction(memoryResult.content);

    if (extraction) {
      await persistExtractedMemory({
        userId: values.userId,
        characterId: values.character.id,
        conversationId: values.draft.conversationId,
        memory: mergeExtractedMemory(values.draft.memory, extraction)
      });
    }

    return {
      inputTokens: memoryResult.inputTokens,
      outputTokens: memoryResult.outputTokens
    };
  } catch (error) {
    console.error("EverBond voice memory update failed:", error);
    return { inputTokens: 0, outputTokens: 0 };
  }
}

export type GiftTurnEvent = {
  eventType: "gift";
  gift: {
    id: number;
    title: string;
    description: string;
    suggestedReaction: string;
  };
  userMessage?: string;
};

export async function generateTextCharacterTurn(values: {
  userId: string;
  character: Character;
  language: SupportedLanguage;
  conversationId: string;
  giftEvent?: GiftTurnEvent;
}) {
  const conversation = await getConversation({
    userId: values.userId,
    characterId: values.character.id,
    conversationId: values.conversationId
  });
  const memory = await loadMemory({
    userId: values.userId,
    characterId: values.character.id,
    conversationMemory: conversation.memory_state
  });
  const history = await loadHistory(conversation.id);
  const previousCharacterReplies = history.filter(
    (message) => message.role === "assistant"
  ).length;
  const includeOpening = previousCharacterReplies < 3;
  const openingMessage = (
    values.character.firstMessage || values.character.openingMessage || ""
  ).trim();
  const hasAssistantHistory = history.some(
    (message) => message.role === "assistant"
  );
  const openingTurn: EverBondMessage[] =
    openingMessage && !hasAssistantHistory
      ? [{ role: "assistant", content: openingMessage }]
      : [];

  const prompt = buildChatModePrompt(
    values.character,
    memory,
    [],
    values.language,
    includeOpening
  );

  const giftEventContext = values.giftEvent
    ? JSON.stringify({
        event_type: values.giftEvent.eventType,
        recipient: values.character.name,
        gift: {
          id: values.giftEvent.gift.id,
          title: values.giftEvent.gift.title,
          description: values.giftEvent.gift.description
        },
        suggested_reaction: values.giftEvent.gift.suggestedReaction,
        user_message: values.giftEvent.userMessage?.trim() || null
      })
    : "";

  const result = await callEverBondModel([
    { role: "system", content: prompt },
    ...(giftEventContext
      ? [
          {
            role: "system" as const,
            content: [
              "CURRENT_GIFT_EVENT",
              giftEventContext,
              "React to this gift now while staying fully in character.",
              "Use the character personality, relationship, previous replies, current scene, and optional user message.",
              "The suggested_reaction is guidance only, never a script to copy.",
              "Do not mention the event schema or save the gift itself to Ever Memory."
            ].join("\n")
          }
        ]
      : []),
    ...openingTurn,
    ...modelHistory(history)
  ]);

  let memoryInputTokens = 0;
  let memoryOutputTokens = 0;

  try {
    const transcript = [
      ...openingTurn.map(
        (message) => `${values.character.name}: ${message.content}`
      ),
      ...memoryHistoryLines(history, values.character.name),
      ...(values.giftEvent
        ? []
        : [`${values.character.name}: ${result.content}`])
    ].join("\n");
    const memoryResult = await callEverBondMemoryModel(
      buildMemoryModePrompt(values.character, transcript, memory)
    );
    memoryInputTokens = memoryResult.inputTokens;
    memoryOutputTokens = memoryResult.outputTokens;

    const extraction = parseMemoryExtraction(memoryResult.content);
    if (extraction) {
      await persistExtractedMemory({
        userId: values.userId,
        characterId: values.character.id,
        conversationId: conversation.id,
        memory: mergeExtractedMemory(memory, extraction)
      });
    }
  } catch (error) {
    console.error("EverBond text memory update failed:", error);
  }

  await getSupabaseServiceClient()
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversation.id)
    .eq("user_id", values.userId);

  return {
    conversationId: conversation.id,
    reply: result.content,
    inputTokens: result.inputTokens + memoryInputTokens,
    outputTokens: result.outputTokens + memoryOutputTokens,
    provider: result.provider,
    model: result.model
  };
}
