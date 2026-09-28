export const VISIBLE_CHARACTER_TAGS = [
  "Romance",
  "Fantasy",
  "Gothic",
  "Comfort",
  "Rival",
  "Mystery",
  "Campus",
  "Mean",
  "Submissive"
] as const;

export const ADDITIONAL_CHARACTER_TAGS = [
  "Protective",
  "Adventure",
  "Slice of Life",
  "Sarcastic"
] as const;

export const ALL_CHARACTER_TAGS = [
  ...VISIBLE_CHARACTER_TAGS,
  ...ADDITIONAL_CHARACTER_TAGS
] as const;

export type CharacterTag = (typeof ALL_CHARACTER_TAGS)[number];

export const CHARACTER_TAG_KEY_MAP: Record<CharacterTag, string> = {
  Romance: "romance",
  Fantasy: "fantasy",
  Gothic: "gothic",
  Comfort: "comfort",
  Rival: "rival",
  Mystery: "mystery",
  Campus: "campus",
  Mean: "mean",
  Submissive: "submissive",
  Protective: "protective",
  Adventure: "adventure",
  "Slice of Life": "sliceOfLife",
  Sarcastic: "sarcastic"
};
