import { createHash } from "node:crypto";
import type { Character } from "@/types/character";
import type { SupportedLanguage } from "@/lib/ai/prompts";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  characterVoiceSignal,
  getCharacterVoiceProfile,
  type CharacterVoiceProfileKey
} from "@/lib/character-voice-profile";

type VoiceGender = "male" | "female";

type CuratedVoice = {
  voiceId: string;
  voiceName: string;
};

export type RetellVoiceSelection = {
  voiceId: string;
  voiceName: string;
  provider: "elevenlabs";
  gender: VoiceGender;
  accent: string | null;
  age: string | null;
  locale:
    | "en-US"
    | "en-GB"
    | "en-AU"
    | "en-NZ"
    | "en-IN"
    | "es-ES"
    | "es-419"
    | "fr-FR"
    | "fr-CA"
    | "de-DE"
    | "ja-JP"
    | "ko-KR";
  voiceTemperature: number;
  voiceSpeed: number;
  responsiveness: number;
  interruptionSensitivity: number;
  personalityProfile: CharacterVoiceProfileKey;
};

const GLOBAL_ASSIGNMENT_KEY = "__global__";

const FEMALE_VOICES: CuratedVoice[] = [
  { voiceId: "11labs-Anna", voiceName: "Anna" },
  { voiceId: "11labs-Chloe", voiceName: "Chloe" },
  { voiceId: "11labs-Della", voiceName: "Della" },
  { voiceId: "11labs-Hailey", voiceName: "Hailey" },
  { voiceId: "11labs-Jenny", voiceName: "Jenny" },
  { voiceId: "11labs-Marissa", voiceName: "Marissa" },
  { voiceId: "11labs-Myra", voiceName: "Myra" },
  { voiceId: "11labs-Nia", voiceName: "Nia" },
  { voiceId: "11labs-Nyla", voiceName: "Nyla" },
  { voiceId: "11labs-Paola", voiceName: "Paola" },
  { voiceId: "11labs-Rita", voiceName: "Rita" },
  { voiceId: "11labs-victoria", voiceName: "Victoria" }
];

const MALE_VOICES: CuratedVoice[] = [
  { voiceId: "11labs-Billy", voiceName: "Billy" },
  { voiceId: "11labs-Brian", voiceName: "Brian" },
  { voiceId: "11labs-Ethan", voiceName: "Ethan" }
];

const FEMALE_PROFILE_POOLS: Record<
  CharacterVoiceProfileKey,
  string[]
> = {
  soft_tender: [
    "11labs-Chloe",
    "11labs-Della",
    "11labs-Myra",
    "11labs-Nyla"
  ],
  playful_bright: [
    "11labs-Anna",
    "11labs-Hailey",
    "11labs-Jenny",
    "11labs-Nia"
  ],
  confident_sultry: [
    "11labs-Marissa",
    "11labs-Paola",
    "11labs-Rita",
    "11labs-victoria"
  ],
  mysterious_dramatic: [
    "11labs-Della",
    "11labs-Myra",
    "11labs-Rita",
    "11labs-victoria"
  ],
  grounded_protective: [
    "11labs-Della",
    "11labs-Marissa",
    "11labs-Myra",
    "11labs-Rita"
  ],
  romantic_warm: [
    "11labs-Chloe",
    "11labs-Hailey",
    "11labs-Marissa",
    "11labs-Paola"
  ],
  balanced: FEMALE_VOICES.map((voice) => voice.voiceId)
};

const MALE_PROFILE_POOLS: Record<
  CharacterVoiceProfileKey,
  string[]
> = {
  soft_tender: ["11labs-Ethan", "11labs-Brian"],
  playful_bright: ["11labs-Billy", "11labs-Ethan"],
  confident_sultry: ["11labs-Ethan", "11labs-Brian"],
  mysterious_dramatic: ["11labs-Brian", "11labs-Ethan"],
  grounded_protective: ["11labs-Brian", "11labs-Ethan"],
  romantic_warm: ["11labs-Ethan", "11labs-Brian"],
  balanced: MALE_VOICES.map((voice) => voice.voiceId)
};

function characterGender(character: Character): VoiceGender {
  if (
    character.voiceGender === "male" ||
    character.gender === "male"
  ) {
    return "male";
  }

  return "female";
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function localeFor(
  language: SupportedLanguage,
  character: Character
): RetellVoiceSelection["locale"] {
  const text = characterVoiceSignal(character);

  if (language === "Spanish") {
    if (
      hasAny(text, [
        "latin american",
        "latina",
        "latino",
        "mexican",
        "colombian",
        "argentinian",
        "argentine",
        "chilean",
        "peruvian",
        "venezuelan",
        "puerto rican"
      ])
    ) {
      return "es-419";
    }

    return "es-ES";
  }

  if (language === "French") {
    if (
      hasAny(text, [
        "canadian french",
        "québécois",
        "quebecois",
        "quebec"
      ])
    ) {
      return "fr-CA";
    }

    return "fr-FR";
  }

  if (language === "German") return "de-DE";
  if (language === "Japanese") return "ja-JP";
  if (language === "Korean") return "ko-KR";

  if (
    hasAny(text, [
      "british accent",
      "english accent",
      "speaks with a british",
      "speaks with an english"
    ])
  ) {
    return "en-GB";
  }

  if (
    hasAny(text, [
      "australian accent",
      "aussie accent",
      "speaks with an australian"
    ])
  ) {
    return "en-AU";
  }

  if (
    hasAny(text, [
      "new zealand accent",
      "kiwi accent"
    ])
  ) {
    return "en-NZ";
  }

  if (
    hasAny(text, [
      "indian accent",
      "speaks with an indian"
    ])
  ) {
    return "en-IN";
  }

  return "en-US";
}

function stableIndex(key: string, length: number) {
  if (length <= 1) return 0;

  const hash = createHash("sha256")
    .update(key)
    .digest();

  return hash.readUInt32BE(0) % length;
}

function allVoices(gender: VoiceGender) {
  return gender === "male"
    ? MALE_VOICES
    : FEMALE_VOICES;
}

function profileVoiceIds(
  gender: VoiceGender,
  profile: CharacterVoiceProfileKey
) {
  return gender === "male"
    ? MALE_PROFILE_POOLS[profile]
    : FEMALE_PROFILE_POOLS[profile];
}

function voiceById(
  gender: VoiceGender,
  voiceId: string
) {
  return (
    allVoices(gender).find(
      (voice) => voice.voiceId === voiceId
    ) ?? null
  );
}

async function existingGlobalAssignment(
  characterId: string
) {
  const { data, error } =
    await getSupabaseServiceClient()
      .from("character_voice_assignments")
      .select(
        "voice_id,voice_name,provider,gender,accent,age"
      )
      .eq("character_id", characterId)
      .eq("locale", GLOBAL_ASSIGNMENT_KEY)
      .maybeSingle();

  if (error) throw error;

  return data;
}

async function saveGlobalAssignment(values: {
  characterId: string;
  gender: VoiceGender;
  voice: CuratedVoice;
}) {
  const { error } =
    await getSupabaseServiceClient()
      .from("character_voice_assignments")
      .upsert(
        {
          character_id: values.characterId,
          locale: GLOBAL_ASSIGNMENT_KEY,
          voice_id: values.voice.voiceId,
          voice_name: values.voice.voiceName,
          provider: "elevenlabs",
          gender: values.gender,
          accent: null,
          age: null,
          updated_at: new Date().toISOString()
        },
        {
          onConflict: "character_id,locale"
        }
      );

  if (error) throw error;
}

export async function selectRetellVoiceForCall(values: {
  apiKey: string;
  character: Character;
  language: SupportedLanguage;
}): Promise<RetellVoiceSelection> {
  // The IDs are a curated EverBond allow-list. Retell's catalog is not used
  // to introduce unknown voices at runtime.
  void values.apiKey;

  const gender = characterGender(values.character);
  const locale = localeFor(
    values.language,
    values.character
  );
  const personality =
    getCharacterVoiceProfile(values.character);
  const candidateIds = profileVoiceIds(
    gender,
    personality.key
  );

  let voice: CuratedVoice | null = null;

  try {
    const assigned =
      await existingGlobalAssignment(
        values.character.id
      );

    if (
      assigned?.voice_id &&
      assigned?.provider === "elevenlabs"
    ) {
      voice = voiceById(
        gender,
        assigned.voice_id
      );
    }
  } catch (error) {
    console.warn(
      "RETELL_VOICE_ASSIGNMENT_LOOKUP_FAILED",
      error
    );
  }

  if (!voice) {
    const chosenId =
      candidateIds[
        stableIndex(
          `${values.character.slug}|${personality.key}`,
          candidateIds.length
        )
      ];

    voice = voiceById(gender, chosenId);

    if (!voice) {
      voice =
        allVoices(gender)[
          stableIndex(
            values.character.slug,
            allVoices(gender).length
          )
        ];
    }

    try {
      await saveGlobalAssignment({
        characterId: values.character.id,
        gender,
        voice
      });
    } catch (error) {
      console.warn(
        "RETELL_VOICE_ASSIGNMENT_SAVE_FAILED",
        error
      );
    }
  }

  return {
    voiceId: voice.voiceId,
    voiceName: voice.voiceName,
    provider: "elevenlabs",
    gender,
    accent: null,
    age: null,
    locale,
    voiceTemperature:
      personality.voiceTemperature,
    voiceSpeed: personality.voiceSpeed,
    responsiveness:
      personality.responsiveness,
    interruptionSensitivity:
      personality.interruptionSensitivity,
    personalityProfile: personality.key
  };
}
