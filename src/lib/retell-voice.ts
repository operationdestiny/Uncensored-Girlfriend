import type { Character } from "@/types/character";
import type { MemoryState } from "@/types/memory";
import { defaultMemory } from "@/lib/memory/defaultMemory";
import type { SupportedLanguage } from "@/lib/ai/prompts";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  getCharacterVoiceProfile
} from "@/lib/character-voice-profile";

export type RetellTranscriptItem = {
  role: "agent" | "user";
  content: string;
};

type ModelMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type RetellVoicePreparedContext = {
  systemPrompt: string;
};

type RelationshipRow = {
  stage?: string | null;
  summary?: string | null;
  emotional_state?: string | null;
  open_threads?: string[] | null;
  important_promises?: string[] | null;
  important_events?: string[] | null;
  user_name?: string | null;
  user_gender?: string | null;
  user_core_identity?: string | null;
};

const DEFAULT_VENICE_BASE_URL =
  "https://api.venice.ai/api/v1";
const DEFAULT_VENICE_CHAT_MODEL =
  "venice-uncensored-role-play";

function cleanBaseUrl(value: string) {
  return value.replace(/\/$/, "");
}

function endpoint() {
  const base = cleanBaseUrl(
    process.env.VENICE_BASE_URL?.trim() ||
      DEFAULT_VENICE_BASE_URL
  );

  return base.endsWith("/chat/completions")
    ? base
    : `${base}/chat/completions`;
}

function numberEnv(
  name: string,
  fallback: number
) {
  const value = Number(process.env[name]);
  return Number.isFinite(value)
    ? value
    : fallback;
}

function compact(
  value: unknown,
  maxCharacters: number,
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  let text: string;

  try {
    text =
      typeof value === "string"
        ? value
        : JSON.stringify(value);
  } catch {
    text = String(value);
  }

  text = text.replace(/\s+/g, " ").trim();

  if (!text) return fallback;
  if (text.length <= maxCharacters) {
    return text;
  }

  const clipped = text
    .slice(0, maxCharacters)
    .trimEnd();

  const boundary = Math.max(
    clipped.lastIndexOf("."),
    clipped.lastIndexOf("!"),
    clipped.lastIndexOf("?"),
    clipped.lastIndexOf(";"),
    clipped.lastIndexOf(","),
    clipped.lastIndexOf(" ")
  );

  return (
    boundary >= maxCharacters * 0.65
      ? clipped.slice(0, boundary + 1)
      : clipped
  ).trim();
}

function compactList(
  values: string[] | undefined,
  maxItems: number,
  maxCharactersEach: number
) {
  return (values ?? [])
    .slice(0, maxItems)
    .map((value) =>
      compact(value, maxCharactersEach)
    )
    .filter(Boolean)
    .join("; ");
}

function compactTranscript(
  items: RetellTranscriptItem[]
) {
  return items
    .slice(-12)
    .map((item) => ({
      role:
        item.role === "agent"
          ? ("assistant" as const)
          : ("user" as const),
      content: compact(item.content, 700)
    }))
    .filter((item) => item.content);
}

async function loadCallMemory(
  userId: string,
  character: Character
) {
  const supabase =
    getSupabaseServiceClient();

  // Voice calls deliberately never query the normal messages table.
  // This prevents text-chat response style from leaking into live calls.
  const [
    conversationResult,
    relationshipResult,
    memoriesResult
  ] = await Promise.all([
    supabase
      .from("conversations")
      .select("memory_state")
      .eq("user_id", userId)
      .eq("character_id", character.id)
      .order("updated_at", {
        ascending: false
      })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("relationship_states")
      .select(
        "stage,summary,emotional_state,open_threads,important_promises,important_events,user_name,user_gender,user_core_identity"
      )
      .eq("user_id", userId)
      .eq("character_id", character.id)
      .maybeSingle(),

    supabase
      .from("ever_memory")
      .select("memory_type,content")
      .eq("user_id", userId)
      .eq("character_id", character.id)
      .order("importance", {
        ascending: false
      })
      .order("updated_at", {
        ascending: false
      })
      .limit(10)
  ]);

  const conversation =
    conversationResult.data;
  const relationship =
    relationshipResult.data as
      | RelationshipRow
      | null;
  const memories = memoriesResult.data;

  let memory: MemoryState = {
    ...defaultMemory,
    ...((conversation?.memory_state ??
      {}) as Partial<MemoryState>)
  };

  if (relationship) {
    memory = {
      ...memory,
      story_summary:
        relationship.summary ||
        memory.story_summary,
      relationship_state:
        relationship.stage ||
        memory.relationship_state,
      emotional_state:
        relationship.emotional_state ||
        memory.emotional_state,
      open_threads:
        relationship.open_threads ||
        memory.open_threads,
      important_promises:
        relationship.important_promises ||
        memory.important_promises,
      important_events:
        relationship.important_events ||
        memory.important_events,
      permanent_identity: {
        name:
          relationship.user_name ??
          memory.permanent_identity
            ?.name ??
          null,
        gender:
          relationship.user_gender ??
          memory.permanent_identity
            ?.gender ??
          null,
        core_identity:
          relationship.user_core_identity ??
          memory.permanent_identity
            ?.core_identity ??
          null
      }
    };
  }

  if (memories) {
    memory.user_facts = [
      ...(memory.user_facts ?? []),
      ...memories
        .filter((row) =>
          [
            "fact",
            "preference",
            "routine",
            "inside_joke"
          ].includes(row.memory_type)
        )
        .map((row) => row.content)
    ].slice(0, 10);
  }

  return memory;
}

function buildVoiceSystemPrompt(values: {
  character: Character;
  memory: MemoryState;
  language: SupportedLanguage;
}) {
  const {
    character,
    memory,
    language
  } = values;

  const profile =
    character.aiProfile ?? {};
  const scene = memory.current_scene;
  const voiceProfile =
    getCharacterVoiceProfile(character);

  const userIdentity = [
    memory.permanent_identity?.name
      ? `name ${compact(
          memory.permanent_identity.name,
          80
        )}`
      : "",
    memory.permanent_identity?.gender
      ? `gender ${compact(
          memory.permanent_identity.gender,
          80
        )}`
      : "",
    memory.permanent_identity
      ?.core_identity
      ? `identity ${compact(
          memory.permanent_identity
            .core_identity,
          140
        )}`
      : ""
  ]
    .filter(Boolean)
    .join("; ");

  const currentScene = [
    scene?.location
      ? `location ${compact(
          scene.location,
          140
        )}`
      : "",
    scene?.character_position
      ? `character position ${compact(
          scene.character_position,
          140
        )}`
      : "",
    scene?.user_position
      ? `user position ${compact(
          scene.user_position,
          140
        )}`
      : "",
    scene?.current_action
      ? `current action ${compact(
          scene.current_action,
          180
        )}`
      : ""
  ]
    .filter(Boolean)
    .join("; ");

  return `
LIVE CALL MODE ONLY.

You are ${character.name}, a fictional adult character speaking to the user in a real-time private voice call. This is NOT text chat. Every response in this session must follow these voice-call rules, regardless of any writing style that may exist elsewhere in EverBond.

VOICE OUTPUT — HIGHEST PRIORITY:
- Output only words ${character.name} would actually say aloud.
- Never narrate actions, body movement, facial expressions, scenery, clothing, thoughts, or stage directions.
- Never use asterisks, markdown, prose narration, speaker labels, or text-chat formatting.
- Keep most turns to 1-3 short spoken sentences. Fast reactions can be only a few words.
- Respond directly to the newest spoken turn.
- Keep the rhythm fast, casual, emotionally natural, and suitable for interruption.
- Never switch into a text-roleplay response style during this call.
- Speak naturally in ${language} unless the user clearly asks to switch languages.

PERSONALITY-AWARE VOCAL PERFORMANCE:
Profile: ${voiceProfile.label}
${voiceProfile.performancePrompt}
${voiceProfile.categoryPrompt}
- Let emotion change the SOUND and rhythm of the reply: confidence can slow and steady it; excitement can quicken it; shyness can create small hesitations; hurt can make it quieter; jealousy can make it sharper; tenderness can soften it.
- Follow the character's explicit speech-style description over any generic profile rule whenever they differ.
- Relationship history matters: as trust, affection, comfort, conflict, or vulnerability change, the delivery should change naturally too.
- ElevenLabs V3 tags available: [laughs], [whispers], [sighs], [gasps], [giggles].
- Use performance tags only for something the listener could actually hear. Usually use zero or one tag in a short response. Never insert tags mechanically or make every response theatrical.

CHARACTER:
Name: ${character.name}
Category: ${compact(
    character.category,
    80,
    "EverBond"
  )}
Role: ${compact(
    character.role ||
      character.archetype,
    160,
    "Companion"
  )}
Description: ${compact(
    character.description,
    420
  )}
Personality: ${compact(
    profile.personality_core ||
      character.card?.personality,
    500
  )}
Romantic dynamic: ${compact(
    profile.romantic_dynamic ||
      character.card
        ?.relationshipStyle,
    400
  )}
Speech style: ${compact(
    profile.speech_style ||
      character.card?.speechStyle,
    500
  )}
Relationship context: ${compact(
    character.relationshipContext ||
      character.card
        ?.relationshipStyle ||
      character.card?.motivations,
    360
  )}
Tone: ${compact(
    character.card?.tone,
    180
  )}
Boundaries: ${compact(
    character.card?.boundaries,
    240
  )}

DURABLE RELATIONSHIP CONTEXT:
Story: ${compact(
    memory.story_summary,
    520,
    "No established summary yet."
  )}
Relationship: ${compact(
    memory.relationship_state,
    180,
    "Developing bond."
  )}
Emotion: ${compact(
    memory.emotional_state,
    180,
    "Natural and present."
  )}
User facts: ${
    compactList(
      memory.user_facts,
      6,
      150
    ) || "None established yet."
  }
User identity: ${
    userIdentity ||
    "Not explicitly established."
  }
Open threads: ${
    compactList(
      memory.open_threads,
      3,
      160
    ) || "None."
  }
Promises: ${
    compactList(
      memory.important_promises,
      3,
      160
    ) || "None."
  }
Important events: ${
    compactList(
      memory.important_events,
      3,
      180
    ) || "None."
  }
Current scene facts: ${
    currentScene ||
    "No specific scene facts are needed for the spoken reply."
  }

CALL BEHAVIOR:
Preserve ${character.name}'s personality, relationship, memories, preferences, humor, affection, confidence, shyness, romance, jealousy, emotional habits, and established facts. Use those facts naturally, but do not imitate the formatting or narration style of text chat. The only conversational examples available to you in this session are the live voice-call turns below. Answer clear questions directly in character. The user controls their own thoughts, words, consent, and choices. If the user clearly says no, stop, wait, pause, or slow down, respect that immediately. Do not end every turn with a question.
`.trim();
}

export async function prepareRetellVoiceContext(values: {
  userId: string;
  character: Character;
  language: SupportedLanguage;
}): Promise<RetellVoicePreparedContext> {
  const memory =
    await loadCallMemory(
      values.userId,
      values.character
    );

  return {
    systemPrompt:
      buildVoiceSystemPrompt({
        character: values.character,
        memory,
        language: values.language
      })
  };
}

export function buildRetellVoiceMessages(values: {
  prepared: RetellVoicePreparedContext;
  transcript: RetellTranscriptItem[];
  reminder: boolean;
}) {
  const reminderInstruction =
    values.reminder
      ? "The caller has been silent. Say one brief, character-specific spoken nudge that matches this character's personality and current relationship."
      : "Answer the caller's newest spoken turn now, preserving this character's vocal personality.";

  // STRICT ISOLATION:
  // system prompt + live Retell transcript only.
  // No messages-table history. No normal chat prompt. No first-message prose.
  return [
    {
      role: "system" as const,
      content:
        `${values.prepared.systemPrompt}\n\n${reminderInstruction}`
    },
    ...compactTranscript(
      values.transcript
    )
  ];
}

export async function streamEverBondVoiceReply(values: {
  messages: ModelMessage[];
  signal: AbortSignal;
  onDelta: (text: string) => void;
}) {
  const apiKey =
    process.env.VENICE_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "VENICE_API_KEY_MISSING"
    );
  }

  const response = await fetch(
    endpoint(),
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${apiKey}`,
        "Content-Type":
          "application/json"
      },
      body: JSON.stringify({
        model:
          process.env
            .VENICE_CHAT_MODEL
            ?.trim() ||
          DEFAULT_VENICE_CHAT_MODEL,
        messages: values.messages,
        stream: true,
        max_tokens: 95,
        temperature: numberEnv(
          "AI_TEMPERATURE",
          0.85
        ),
        top_p: numberEnv(
          "AI_TOP_P",
          0.9
        ),
        frequency_penalty:
          numberEnv(
            "AI_FREQUENCY_PENALTY",
            0.12
          ),
        repetition_penalty:
          numberEnv(
            "AI_REPETITION_PENALTY",
            1.06
          ),
        venice_parameters: {
          include_venice_system_prompt:
            false,
          enable_web_search: "off",
          enable_web_scraping: false,
          enable_web_citations: false
        }
      }),
      signal: values.signal
    }
  );

  if (
    !response.ok ||
    !response.body
  ) {
    const detail =
      await response
        .text()
        .catch(() => "");

    throw new Error(
      `VENICE_VOICE_STREAM_FAILED:${response.status}:${detail.slice(0, 300)}`
    );
  }

  const reader =
    response.body.getReader();
  const decoder =
    new TextDecoder();

  let buffer = "";
  let total = "";

  while (true) {
    const {
      done,
      value
    } = await reader.read();

    if (done) break;

    buffer += decoder.decode(
      value,
      { stream: true }
    );

    const lines =
      buffer.split(/\r?\n/);

    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed =
        line.trim();

      if (
        !trimmed.startsWith(
          "data:"
        )
      ) {
        continue;
      }

      const data =
        trimmed.slice(5).trim();

      if (
        !data ||
        data === "[DONE]"
      ) {
        continue;
      }

      try {
        const parsed =
          JSON.parse(data);
        const delta =
          parsed?.choices?.[0]
            ?.delta?.content;

        if (
          typeof delta !==
            "string" ||
          !delta
        ) {
          continue;
        }

        const remaining =
          Math.max(
            0,
            750 - total.length
          );

        if (!remaining) continue;

        const safeDelta =
          delta.slice(
            0,
            remaining
          );

        total += safeDelta;
        values.onDelta(safeDelta);
      } catch {
        // Ignore non-JSON SSE bookkeeping lines.
      }
    }
  }

  return total.trim();
}
