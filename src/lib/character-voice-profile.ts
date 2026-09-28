import type { Character } from "@/types/character";

export type CharacterVoiceProfileKey =
  | "soft_tender"
  | "playful_bright"
  | "confident_sultry"
  | "mysterious_dramatic"
  | "grounded_protective"
  | "romantic_warm"
  | "balanced";

export type CharacterVoiceProfile = {
  key: CharacterVoiceProfileKey;
  label: string;
  voiceTemperature: number;
  voiceSpeed: number;
  responsiveness: number;
  interruptionSensitivity: number;
  performancePrompt: string;
  categoryPrompt: string;
};

const PROFILE_KEYWORDS: Record<CharacterVoiceProfileKey, string[]> = {
  soft_tender: [
    "soft-spoken",
    "soft spoken",
    "gentle",
    "shy",
    "quiet",
    "delicate",
    "sweet",
    "tender",
    "breathy",
    "airy",
    "hushed",
    "soft and melodic",
    "slightly breathless",
    "reserved"
  ],
  playful_bright: [
    "playful",
    "bubbly",
    "energetic",
    "bright",
    "cheerful",
    "lively",
    "teasing",
    "mischievous",
    "witty",
    "spontaneous",
    "excitable",
    "streamer",
    "quick",
    "high-energy",
    "high energy"
  ],
  confident_sultry: [
    "confident",
    "sensual",
    "sultry",
    "seductive",
    "husky",
    "velvety",
    "assured",
    "dominant",
    "commanding",
    "flirtatious",
    "flirty",
    "low and controlled",
    "low, velvety",
    "self-possessed"
  ],
  mysterious_dramatic: [
    "mysterious",
    "secretive",
    "enigmatic",
    "theatrical",
    "dramatic",
    "regal",
    "royal",
    "ceremonial",
    "poetic",
    "witch",
    "vampire",
    "sorceress",
    "mage",
    "enchantress",
    "princess",
    "queen",
    "gothic"
  ],
  grounded_protective: [
    "protective",
    "grounded",
    "steadfast",
    "stoic",
    "guarded",
    "disciplined",
    "bodyguard",
    "trainer",
    "rough",
    "low, slightly rough",
    "observant",
    "composed",
    "measured",
    "direct"
  ],
  romantic_warm: [
    "romantic",
    "warm",
    "devoted",
    "affectionate",
    "supportive",
    "sincere",
    "earnest",
    "dreamy",
    "daydream",
    "artistic",
    "creative",
    "melodic",
    "introspective",
    "empathetic"
  ],
  balanced: []
};

function normalize(value: unknown) {
  if (typeof value === "string") {
    return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
  }

  try {
    return JSON.stringify(value ?? "")
      .toLocaleLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

export function characterVoiceSignal(character: Character) {
  const profile = character.aiProfile ?? {};

  return [
    normalize(profile.speech_style),
    normalize(profile.personality_core),
    normalize(profile.romantic_dynamic),
    normalize(character.card?.speechStyle),
    normalize(character.card?.personality),
    normalize(character.card?.tone),
    normalize(character.card?.relationshipStyle),
    normalize(character.relationshipContext),
    normalize(character.role),
    normalize(character.title),
    normalize(character.archetype),
    normalize(character.tags)
  ]
    .filter(Boolean)
    .join(" ");
}

function scoreProfile(
  signal: string,
  key: CharacterVoiceProfileKey
) {
  if (key === "balanced") return 0;

  return PROFILE_KEYWORDS[key].reduce((score, keyword) => {
    let index = signal.indexOf(keyword);
    let occurrences = 0;

    while (index >= 0 && occurrences < 3) {
      occurrences += 1;
      index = signal.indexOf(keyword, index + keyword.length);
    }

    return score + occurrences;
  }, 0);
}

function categoryPrompt(character: Character) {
  switch (character.category) {
    case "anime-fantasy":
      return "Keep the character's fantasy/anime flavor, vocabulary, mystique, humor, and emotional color, but make it sound like a real live call. Never turn world flavor into prose narration or stage directions.";
    case "public-creations":
      return "Prioritize the creator-authored personality, speech style, tone, romantic dynamic, and boundaries. Do not impose a generic EverBond voice personality over the creator's character.";
    case "everbond-guys":
    case "everbond-girls":
    default:
      return "Keep the delivery grounded, contemporary, intimate, and human unless this specific character profile explicitly calls for a different style.";
  }
}

function profileValues(
  key: CharacterVoiceProfileKey,
  character: Character
): CharacterVoiceProfile {
  const category = categoryPrompt(character);

  switch (key) {
    case "soft_tender":
      return {
        key,
        label: "soft-tender",
        voiceTemperature: 1.04,
        voiceSpeed: 0.97,
        responsiveness: 0.97,
        interruptionSensitivity: 0.87,
        categoryPrompt: category,
        performancePrompt:
          "Speak softly and naturally with gentle pacing, small hesitations when emotionally appropriate, and warmth that grows as trust grows. Prefer [whispers] or [sighs] occasionally; use [laughs] or [giggles] only when the moment genuinely calls for it. Do not sound timid if the character is being decisive."
      };

    case "playful_bright":
      return {
        key,
        label: "playful-bright",
        voiceTemperature: 1.17,
        voiceSpeed: 1.03,
        responsiveness: 1,
        interruptionSensitivity: 0.92,
        categoryPrompt: category,
        performancePrompt:
          "Keep reactions quick, bright, teasing, and spontaneous. Let jokes land with natural timing and let excitement speed the rhythm slightly. [laughs] and [giggles] are the most natural performance tags; [gasps] can appear for genuine surprise. Do not force a laugh into every turn."
      };

    case "confident_sultry":
      return {
        key,
        label: "confident-sultry",
        voiceTemperature: 1.13,
        voiceSpeed: 0.98,
        responsiveness: 0.99,
        interruptionSensitivity: 0.89,
        categoryPrompt: category,
        performancePrompt:
          "Speak with confident, unhurried presence. Teasing should feel deliberate rather than bubbly, and vulnerable moments should noticeably soften the delivery without erasing confidence. [whispers], [laughs], and [sighs] may be used sparingly when they fit the emotion."
      };

    case "mysterious_dramatic":
      return {
        key,
        label: "mysterious-dramatic",
        voiceTemperature: 1.15,
        voiceSpeed: 0.96,
        responsiveness: 0.97,
        interruptionSensitivity: 0.87,
        categoryPrompt: category,
        performancePrompt:
          "Use controlled dramatic timing, intrigue, and emotional contrast without sounding like a narrator. Let important words breathe, but keep live-call responses concise. [whispers], [sighs], [gasps], and a quiet [laughs] are appropriate when earned by the moment. Never perform stage directions."
      };

    case "grounded_protective":
      return {
        key,
        label: "grounded-protective",
        voiceTemperature: 1.07,
        voiceSpeed: 0.98,
        responsiveness: 0.98,
        interruptionSensitivity: 0.88,
        categoryPrompt: category,
        performancePrompt:
          "Keep the voice steady, direct, attentive, and emotionally contained until the character's guard genuinely drops. Protection or concern should make the delivery firmer; tenderness should make it noticeably softer. Use [sighs] or a restrained [laughs] occasionally, not theatrically."
      };

    case "romantic_warm":
      return {
        key,
        label: "romantic-warm",
        voiceTemperature: 1.1,
        voiceSpeed: 0.99,
        responsiveness: 0.99,
        interruptionSensitivity: 0.89,
        categoryPrompt: category,
        performancePrompt:
          "Keep the delivery warm, emotionally attentive, sincere, and naturally affectionate. Let nervousness, longing, relief, jealousy, and tenderness alter cadence instead of merely naming the emotion. [whispers], [sighs], [laughs], and [giggles] are available when natural."
      };

    case "balanced":
    default:
      return {
        key: "balanced",
        label: "balanced-natural",
        voiceTemperature: 1.1,
        voiceSpeed: 1,
        responsiveness: 1,
        interruptionSensitivity: 0.9,
        categoryPrompt: category,
        performancePrompt:
          "Use natural conversational pacing and let the character's explicit speech style determine confidence, softness, humor, and emotional intensity. Performance tags should be occasional and motivated by the actual moment."
      };
  }
}

export function getCharacterVoiceProfile(
  character: Character
): CharacterVoiceProfile {
  const signal = characterVoiceSignal(character);

  const keys: CharacterVoiceProfileKey[] = [
    "soft_tender",
    "playful_bright",
    "confident_sultry",
    "mysterious_dramatic",
    "grounded_protective",
    "romantic_warm"
  ];

  let bestKey: CharacterVoiceProfileKey = "balanced";
  let bestScore = 0;

  for (const key of keys) {
    let score = scoreProfile(signal, key);

    // Explicit speech-style wording should dominate generic description text.
    const speech = normalize(
      character.aiProfile?.speech_style ??
        character.card?.speechStyle
    );

    score += scoreProfile(speech, key) * 2;

    // Fantasy gets a small dramatic bias only when the character itself also
    // contains fantasy/mystical signals. Category alone never forces it.
    if (
      character.category === "anime-fantasy" &&
      key === "mysterious_dramatic" &&
      /(witch|vampire|mage|magic|sorcer|enchant|elf|royal|princess|queen|mystic|fantasy)/.test(
        signal
      )
    ) {
      score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }

  return profileValues(bestKey, character);
}
