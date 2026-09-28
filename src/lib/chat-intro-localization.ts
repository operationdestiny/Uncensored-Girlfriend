import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { Character } from "@/types/character";

type ChatIntroTranslationRow = {
  opening_scenario: string | null;
  first_message: string | null;
};

function applyChatIntro(
  character: Character,
  openingScenario: string,
  firstMessage: string
): Character {
  return {
    ...character,
    description: openingScenario,
    openingScenario,
    openingMessage: firstMessage,
    firstMessage
  };
}

export async function localizeCharacterChatIntroFromCache(
  character: Character,
  language: "JA"
): Promise<Character> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("character_chat_translations")
    .select("opening_scenario,first_message")
    .eq("character_id", character.id)
    .eq("language", language)
    .maybeSingle();

  if (error) throw error;

  const row = data as ChatIntroTranslationRow | null;
  const openingScenario = row?.opening_scenario?.trim() || "";
  const firstMessage = row?.first_message?.trim() || "";

  if (!openingScenario || !firstMessage) return character;

  return applyChatIntro(character, openingScenario, firstMessage);
}
