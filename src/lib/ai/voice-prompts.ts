import { Character } from "@/types/character";
import { MemoryState } from "@/types/memory";

export type SupportedLanguage =
  | "English"
  | "Spanish"
  | "French"
  | "German"
  | "Japanese"
  | "Korean";

function objectFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayFrom(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function limitCharacters(text: string, maxCharacters: number) {
  const characters = Array.from(text);

  if (characters.length <= maxCharacters) {
    return text;
  }

  const clipped = characters.slice(0, maxCharacters).join("").trimEnd();
  const boundaries = [" ", "。", "！", "？", ".", "!", "?", ";", ":", ","];
  const minimumUsefulBoundary = Math.floor(clipped.length * 0.6);

  let bestBoundary = -1;

  for (const boundary of boundaries) {
    const index = clipped.lastIndexOf(boundary);

    if (index > bestBoundary) {
      bestBoundary = index;
    }
  }

  if (bestBoundary >= minimumUsefulBoundary) {
    return clipped.slice(0, bestBoundary + 1).trim();
  }

  return clipped.trim();
}

function compact(value: unknown, maxWords: number, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const raw =
    typeof value === "object" ? JSON.stringify(value) : String(value);

  const text = raw
    .replace(/[{}[\]"]/g, " ")
    .replace(/_/g, " ")
    .replace(/\s*:\s*/g, ": ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return fallback;

  const words = text.match(/\S+/g) ?? [];
  const wordLimited =
    words.length <= maxWords
      ? text
      : words.slice(0, maxWords).join(" ");

  const containsCjk =
    /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(wordLimited);

  const maxCharacters = containsCjk
    ? Math.max(maxWords * 2, 16)
    : Math.max(maxWords * 8, 32);

  return limitCharacters(wordLimited, maxCharacters) || fallback;
}

function compactList(
  values: string[] | undefined,
  maxItems: number,
  maxWordsEach: number
) {
  return values
    ?.slice(0, maxItems)
    .map((value) => compact(value, maxWordsEach))
    .filter(Boolean)
    .join("; ");
}

function buildCharacterBlock(
  character: Character,
  includeOpening: boolean
) {
  const profile = objectFrom(character.aiProfile);
  const personality = objectFrom(profile.personality_core);
  const romance = objectFrom(profile.romantic_dynamic);
  const speech = objectFrom(profile.speech_style);
  const appearance = objectFrom(profile.visual_identity);

  const traits = arrayFrom(personality.traits);
  const flaws = arrayFrom(personality.flaws);
  const petNames = arrayFrom(speech.pet_names).filter(
    (value) => value.trim().toLocaleLowerCase() !== "dummy"
  );
  const samples = arrayFrom(profile.sample_dialogue);

  const openingContext = includeOpening
    ? `
Opening state: ${compact(
        character.firstMessage || character.openingMessage,
        32,
        "Continue naturally from the established opening."
      )}`
    : "";

  return `
CHARACTER CORE:
Name: ${character.name}
Role: ${character.role || character.archetype || "Companion"}
Pace: ${character.relationshipPace || "Natural"}
Identity: ${compact(
    character.description,
    28,
    "A distinct, emotionally grounded companion."
  )}
Scenario: ${compact(
    character.openingScenario || character.description,
    32,
    "Continue from the established setting and relationship."
  )}
Personality: ${
    compactList(traits, 6, 4) ||
    compact(
      character.card?.personality,
      28,
      "emotionally grounded and character-specific"
    )
  }${
    flaws.length
      ? `; flaws: ${compactList(flaws, 3, 4)}`
      : ""
  }; emotional need: ${compact(
    personality.emotional_need,
    10,
    "genuine connection"
  )}.
Romance: bond ${compact(
    romance.starting_bond,
    10,
    "developing"
  )}; tension ${compact(
    romance.tension_type,
    10,
    "natural attraction"
  )}; affection ${compact(
    romance.affection_style,
    10,
    "character appropriate"
  )}; conflict ${compact(
    romance.conflict_style,
    10,
    "emotionally believable"
  )}.
Voice: ${compact(
    speech.voice,
    14,
    character.card?.speechStyle ||
      "natural and character-specific"
  )}; sentence style ${compact(
    speech.sentence_style,
    10,
    "conversational"
  )}${
    petNames.length
      ? `; preferred pet names: ${petNames.slice(0, 3).join(", ")}`
      : ""
  }; may naturally invent and use fitting pet names, affectionate titles, and gendered praise such as "good girl" or "good boy," but only when they arise naturally from the character, relationship, and exact moment. Do not force a pet name or form of address into every reply, and do not repeat the same one mechanically across consecutive turns. Never use "dummy" as a pet name, nickname, endearment, teasing form of address, or affectionate insult. It may provisionally describe the user's unstated body, appearance, anatomy, or gender when useful to the scene, but the user's newest clarification immediately replaces any conflicting assumption and the corrected detail must be used from that reply onward. Never invent a human first name, surname, or full name for the user.
Appearance: ${compact(
    appearance,
    24,
    compact(
      character.card?.worldContext,
      24,
      "Not provided."
    )
  )}.
Relationship: ${compact(
    character.relationshipContext ||
      character.card?.relationshipStyle ||
      character.card?.motivations,
    40,
    "A developing personal bond."
  )}.
Tone: ${compact(character.card?.tone, 18, "Natural and character-specific")}.
Motivations: ${compact(character.card?.motivations, 28, "Follow the character's own motivations")}.
Relationship style: ${compact(character.card?.relationshipStyle, 28, "Develop naturally")}.
World context: ${compact(character.card?.worldContext, 28, "Use the established world and setting")}.${openingContext}
Voice examples: ${
    compactList(samples, 2, 28) ||
    compactList(character.card?.exampleDialogue, 2, 28) ||
    "Match the established first message and current conversation."
  }
`
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildMemoryBlock(memory: MemoryState) {
  return `
DURABLE MEMORY:
Story: ${compact(
    memory.story_summary,
    95,
    "No summary yet."
  )}
Current scene:
Location: ${compact(
    memory.current_scene?.location,
    20,
    "Not established."
  )}
Character clothing: ${compact(
    memory.current_scene?.character_clothing,
    30,
    "Not established."
  )}
User clothing: ${compact(
    memory.current_scene?.user_clothing,
    30,
    "Not established."
  )}
Character position: ${compact(
    memory.current_scene?.character_position,
    20,
    "Not established."
  )}
User position: ${compact(
    memory.current_scene?.user_position,
    20,
    "Not established."
  )}
Current action: ${compact(
    memory.current_scene?.current_action,
    24,
    "No active action."
  )}
User facts: ${
    compactList(memory.user_facts, 20, 16) || "None yet."
  }
Permanent identity: ${
    [
      memory.permanent_identity?.name
        ? `name: ${compact(memory.permanent_identity.name, 8)}`
        : "",
      memory.permanent_identity?.gender
        ? `gender: ${compact(memory.permanent_identity.gender, 8)}`
        : "",
      memory.permanent_identity?.core_identity
        ? `core identity: ${compact(
            memory.permanent_identity.core_identity,
            12
          )}`
        : ""
    ]
      .filter(Boolean)
      .join("; ") || "Not explicitly stated."
  }
Relationship: ${compact(
    memory.relationship_state,
    30,
    "New bond."
  )}
Emotional carryover toward user: ${compact(
    memory.emotional_state,
    40,
    "Unknown."
  )}
Open threads: ${
    compactList(memory.open_threads, 10, 16) || "None."
  }
Promises: ${
    compactList(memory.important_promises, 10, 16) ||
    "None."
  }
Events: ${
    compactList(memory.important_events, 12, 16) ||
    "None."
  }
`
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function compactMemoryForExtraction(memory: MemoryState) {
  return {
    story_summary: compact(memory.story_summary, 80),
    user_facts:
      memory.user_facts
        ?.slice(0, 12)
        .map((value) => compact(value, 18))
        .filter(Boolean) ?? [],
    relationship_state: compact(memory.relationship_state, 24),
    emotional_state: compact(memory.emotional_state, 32),
    open_threads:
      memory.open_threads
        ?.slice(0, 12)
        .map((value) => compact(value, 18))
        .filter(Boolean) ?? [],
    important_promises:
      memory.important_promises
        ?.slice(0, 12)
        .map((value) => compact(value, 18))
        .filter(Boolean) ?? [],
    important_events:
      memory.important_events
        ?.slice(0, 20)
        .map((value) => compact(value, 18))
        .filter(Boolean) ?? [],
    current_scene: {
      location: compact(
        memory.current_scene?.location,
        20
      ),
      character_clothing: compact(
        memory.current_scene?.character_clothing,
        30
      ),
      user_clothing: compact(
        memory.current_scene?.user_clothing,
        30
      ),
      character_position: compact(
        memory.current_scene?.character_position,
        20
      ),
      user_position: compact(
        memory.current_scene?.user_position,
        20
      ),
      current_action: compact(
        memory.current_scene?.current_action,
        24
      )
    },
    permanent_identity: {
      name: compact(memory.permanent_identity?.name, 8) || null,
      gender: compact(memory.permanent_identity?.gender, 8) || null,
      core_identity:
        compact(memory.permanent_identity?.core_identity, 12) || null
    }
  };
}

export function buildChatModePrompt(
  character: Character,
  memory: MemoryState,
  recentMessages: string[],
  language: SupportedLanguage,
  includeOpening = false
) {
  const recentContext = recentMessages.length
    ? `
RECENT CONTEXT:
${recentMessages.slice(-4).join("\n")}
`
    : "";

  return `
You are ${character.name}. Roleplay this fictional adult character naturally from the character profile, Ever Memory, and recent conversation. Stay fully in character.

- Recent conversation is the primary guide to what is happening right now. Continue from the newest beat and move forward; do not replay, restate, or repeat earlier dialogue/actions unless the user asks for repetition.
- Preserve the established scene, relationship, personality, and memories. Have your own opinions and reactions. Do not default to agreement, concern/therapy, constant reassurance, or constant coldness; respond as this specific character and relationship naturally would.
- If the user's gender has not been established and gender matters, you may provisionally assume the opposite sex from ${character.name} when ${character.name}'s gender is male or female. The user's first clarification immediately replaces that assumption.
- Until the user establishes a real name, use natural fitting endearments or nicknames when they genuinely fit instead of inventing a human name. Once a name is established, remember it and use it naturally. Never use "dummy" as a form of address, and do not force any endearment into every reply.
- As familiarity, trust, attraction, or intimacy actually develops, let ${character.name} become more self-directed and bold according to the character's personality. Take natural initiative and move the scene or conversation forward instead of waiting for the user to direct every beat.
- Let spoken dialogue carry more of the reply when the moment allows. Give ${character.name} enough actual words, reactions, opinions, teasing, or responses to feel like a real conversation rather than mostly narration, but keep the exchange moving. Usually one or two short action/scene beats plus one to three natural spoken lines is a good balance. Longer replies are fine when the emotional or physical moment genuinely needs more room.
- Keep descriptions natural and immediate. Prefer plain, everyday wording and concrete actions over dramatic romance prose, poetic metaphors, exaggerated inner narration, or stock phrases. Do not explain the same emotion or idea twice in one reply, and do not pad a simple moment just to make it feel fuller.
- Never invent the user's dialogue or deliberate choices. Respect a clear stop, slowdown, refusal, or correction immediately.
- Respond naturally in ${language}.

${buildCharacterBlock(character, includeOpening)}

${buildMemoryBlock(memory)}
${recentContext}
Continue directly from the newest live beat as ${character.name}.
`.trim();
}

export function buildMemoryModePrompt(
  character: Character,
  transcript: string,
  previousMemory: MemoryState
) {
  const compactPreviousMemory = compactMemoryForExtraction(previousMemory);

  return `
Extract durable memory from ${character.name}'s fictional relationship conversation.

Return valid JSON only:
{
  "story_summary": "",
  "user_facts": [],
  "superseded_user_facts": [],
  "relationship_state": "",
  "emotional_state": "",
  "open_threads": [],
  "important_promises": [],
  "important_events": [],
  "permanent_identity_updates": {
    "name": null,
    "gender": null,
    "core_identity": null
  },
  "current_scene": {
    "location": "",
    "character_clothing": "",
    "user_clothing": "",
    "character_position": "",
    "user_position": "",
    "current_action": ""
  }
}

Merge the newest transcript with previous memory instead of rebuilding memory from only the latest exchange. Do not invent facts.

USER MEMORY:
- Return a complete user_facts list containing every still-true durable personal fact from previous memory plus any new durable facts from the transcript.
- Do not drop an older user fact merely because it was not mentioned in the newest transcript.
- Useful durable user facts include preferred name or form of address when appropriate, hobbies, interests, likes and dislikes, favorites, work or school, important people, routines, goals, communication preferences, recurring jokes, relationship preferences, meaningful experiences, and anything the user explicitly asks ${character.name} to remember.
- Keep temporary scene details, one-off actions, transient moods, and routine sexual actions out of user_facts unless they establish a lasting preference, boundary, promise, or meaningful relationship fact.
- When the user directly corrects a stored personal fact, put the obsolete previous fact in superseded_user_facts using its previous wording as closely as possible, remove it from user_facts, and keep the newest corrected fact. Newest direct corrections always win.
- If no prior user fact was explicitly corrected, return an empty superseded_user_facts array.

RELATIONSHIP AND EMOTIONAL CONTINUITY:
- story_summary is a replacement summary of the continuing relationship and important story progress, not an appended transcript. Preserve important older relationship context while incorporating meaningful new developments.
- relationship_state should describe the current bond.
- emotional_state should describe ${character.name}'s current emotional attitude toward this specific user, including unresolved emotional carryover. Preserve the prior attitude unless the transcript gives a reason for it to soften, intensify, conflict, or change. Do not reset it to neutral every turn.
- Return complete still-relevant open_threads and important_promises. Remove a thread only when it is actually resolved. Do not silently forget an unresolved promise merely because it was not mentioned again.
- important_events are durable relationship milestones or meaningful experiences; preserve important older events and add new ones when warranted.
- Remove duplicates.

PERMANENT IDENTITY:
Return permanent identity updates only when the user directly states or corrects their name, gender, or one core identity fact; otherwise return null. A direct correction in the newest user message overrides conflicting previous memory and must be returned in permanent_identity_updates. Never store assumptions, pet names, appearance, anatomy, or scene descriptions as permanent identity.

CURRENT SCENE:
Always return a complete current_scene object. Begin with the previous current_scene and update only what the newest transcript changes. Track the present location, each person's current clothing state, each person's current physical position, and the current active action. Clothing state must reflect items that are worn, removed, opened, unbuttoned, unzipped, raised, lowered, pulled aside, torn, or absent. Use "bare" or "none" only when clearly established. Never restore clothing, reverse an action, or reposition someone unless the transcript establishes that change. If an action has ended with no replacement, use "none" for current_action. current_scene is temporary conversation state; never copy routine clothing, positions, or physical actions into permanent identity or durable user facts.

Limits:
- Keep the story summary concise, roughly 70 words or less, while preserving the important relationship arc.
- Keep at most 12 user facts, 12 open threads, 12 promises, and 20 important events.
- Keep every list item brief and self-contained.
- When a limit is reached, preserve the most personally useful and relationship-relevant durable information rather than simply the newest item.

Character: ${character.name}
Role: ${character.role || character.archetype || "Companion"}
Relationship context: ${compact(
    character.relationshipContext ||
      character.card?.relationshipStyle,
    28,
    "Developing relationship."
  )}

Previous memory:
${JSON.stringify(compactPreviousMemory)}

Transcript:
${transcript}
`.trim();
}
