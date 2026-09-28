export type CharacterCardData = {
  name: string;
  personality: string;
  tone: string;
  speechStyle: string;
  motivations: string;
  boundaries: string;
  relationshipStyle: string;
  worldContext: string;
  exampleDialogue: string[];
};

export type CharacterVisibility = "public" | "private" | "unlisted";
export type CharacterCategory =
  | "everbond-girls"
  | "anime-fantasy"
  | "everbond-guys"
  | "public-creations";

export type CharacterAiProfile = {
  visual_identity?: Record<string, unknown>;
  personality_core?: Record<string, unknown>;
  romantic_dynamic?: Record<string, unknown>;
  speech_style?: Record<string, unknown>;
  memory_rules?: Record<string, unknown>;
  sample_dialogue?: string[];
  [key: string]: unknown;
};

export type Character = {
  id: string;
  name: string;
  slug: string;
  archetype: string;
  category?: CharacterCategory;
  gender?: "female" | "male" | "neutral";
  voiceGender?: "female" | "male" | "neutral";
  image: string;
  imageFile?: string;
  tagline: string;
  description: string;
  openingMessage: string;
  tags: string[];
  visibility?: CharacterVisibility;
  official?: boolean;
  viewCount?: string | null;
  creatorUsername?: string;
  createdAt?: "today" | "older";

  section?: string;
  role?: string;
  relationshipPace?: string;
  title?: string;
  openingScenario?: string;
  firstMessage?: string;
  relationshipContext?: string;
  aiProfile?: CharacterAiProfile;
  featureFlags?: Record<string, unknown>;
  generatedSeo?: Record<string, unknown>;
  qualityControl?: Record<string, unknown>;

  card: CharacterCardData;
};
