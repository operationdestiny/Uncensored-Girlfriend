import { Character, CharacterCategory } from "@/types/character";

export const characterCategories: { id: CharacterCategory; label: string }[] = [
  { id: "everbond-girls", label: "EverBond Girls" },
  { id: "anime-fantasy", label: "Anime & Fantasy" },
  { id: "everbond-guys", label: "EverBond Guys" },
  { id: "public-creations", label: "More for You" }
];

// V108 loads live characters from Supabase.
// This fallback intentionally contains no placeholder characters.
export const characters: Character[] = [];

export function getCharacterBySlug(slug: string): Character | undefined {
  return characters.find((character) => character.slug === slug);
}
