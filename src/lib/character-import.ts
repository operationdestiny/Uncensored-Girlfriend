import { CharacterCategory } from "@/types/character";

export type PremiumCharacterInput = {
  id: string;
  slug?: string;
  image_file: string;
  image_url?: string;
  image_storage_bucket?: string;
  image_storage_path?: string;
  name: string;
  section: string;
  category?: CharacterCategory | string;
  role: string;
  relationship_pace?: string;
  tags: string[];
  title: string;
  opening_scenario: string;
  first_message: string;
  relationship_context: string;
  ai_profile: Record<string, unknown>;
  feature_flags: Record<string, boolean>;
  generated_seo: {
    slug?: string;
    seo_title?: string;
    seo_description?: string;
    search_terms?: string[];
  };
  quality_control?: Record<string, unknown>;
  display_order?: number;
};

// Backward-compatible export for old API routes that still import EverBondCharacterInput.
export type EverBondCharacterInput = PremiumCharacterInput;

export function sectionToCategory(section: string): CharacterCategory {
  const normalized = section.toLowerCase();

  if (normalized.includes("anime") || normalized.includes("fantasy")) {
    return "anime-fantasy";
  }

  if (normalized.includes("guys")) {
    return "everbond-guys";
  }

  if (normalized.includes("public")) {
    return "public-creations";
  }

  return "everbond-girls";
}

export function normalizeCharacterCategory(
  section: string,
  category?: string | null
): CharacterCategory {
  if (
    category === "everbond-girls" ||
    category === "anime-fantasy" ||
    category === "everbond-guys" ||
    category === "public-creations"
  ) {
    return category;
  }

  return sectionToCategory(section);
}

export function imageStoragePathForCharacter(character: PremiumCharacterInput) {
  const category = normalizeCharacterCategory(character.section, character.category);
  return `${category}/${character.image_file}`;
}

export function fallbackImagePathForCharacter(character: PremiumCharacterInput) {
  return `/character-assets/${imageStoragePathForCharacter(character)}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function toDatabaseCharacter(character: PremiumCharacterInput) {
  const category = normalizeCharacterCategory(character.section, character.category);

  // Every record imported from the bundled premium character library is an
  // official EverBond seed character, including the historical
  // public-creations collection now displayed as More for You. User-created
  // companions use /api/characters and never pass through this importer.
  const official = true;
  const imageStoragePath =
    character.image_storage_path || imageStoragePathForCharacter(character);

  return {
    id: character.id,
    slug:
      character.slug ||
      character.generated_seo?.slug ||
      slugify(`${character.name}-${character.title}`),
    name: character.name,
    section: character.section,
    category,
    role: character.role,
    relationship_pace: character.relationship_pace ?? null,
    tags: character.tags,
    title: character.title,
    opening_scenario: character.opening_scenario,
    first_message: character.first_message,
    relationship_context: character.relationship_context,
    ai_profile: character.ai_profile ?? {},
    feature_flags: character.feature_flags ?? {},
    generated_seo: character.generated_seo ?? {},
    quality_control: character.quality_control ?? {},
    image_file: character.image_file,
    image_storage_bucket: character.image_storage_bucket ?? "character-assets",
    image_storage_path: imageStoragePath,
    image_url: character.image_url || fallbackImagePathForCharacter(character),
    display_order: Number.isInteger(character.display_order)
      ? character.display_order
      : 0,
    visibility: "public",
    is_public: true,
    official,
    creator_username: null,
    is_active: true
  };
}
