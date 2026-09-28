import type { Character } from "@/types/character";

function objectFrom(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringFrom(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberFrom(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, minimum), maximum);
}

export type CharacterVoiceConfig = {
  model: string;
  voice: string;
  prompt: string;
  speed: number;
  temperature: number;
  topP: number;
};

export function getCharacterVoiceConfig(
  character: Character
): CharacterVoiceConfig | null {
  const flags = objectFrom(character.featureFlags);
  const genderDefault =
    character.voiceGender === "male"
      ? process.env.VENICE_TTS_DEFAULT_MALE_VOICE
      : character.voiceGender === "neutral"
        ? process.env.VENICE_TTS_DEFAULT_NEUTRAL_VOICE
        : process.env.VENICE_TTS_DEFAULT_FEMALE_VOICE;

  const voice =
    stringFrom(flags.voice_id) ||
    stringFrom(genderDefault) ||
    stringFrom(process.env.VENICE_TTS_DEFAULT_VOICE);

  if (!voice) return null;

  const defaultPrompt =
    "Warm, intimate, emotionally expressive, natural and conversational. " +
    "Speak with gentle affection and subtle playful tension.";

  return {
    model:
      stringFrom(process.env.VENICE_TTS_CALL_MODEL) ||
      "tts-qwen3-1-7b",
    voice,
    prompt: (stringFrom(flags.voice_prompt) || defaultPrompt).slice(0, 500),
    speed: numberFrom(flags.voice_speed, 0.96, 0.25, 4),
    temperature: numberFrom(flags.voice_temperature, 0.8, 0, 2),
    topP: numberFrom(flags.voice_top_p, 0.95, 0, 1)
  };
}
