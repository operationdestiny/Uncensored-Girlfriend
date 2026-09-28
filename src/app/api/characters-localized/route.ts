import { NextResponse } from "next/server";
import { z } from "zod";
import {
  localizeCharacters,
  type CharacterContentLanguage
} from "@/lib/character-localization";
import { queryCharacters } from "@/lib/characters-db";

export const runtime = "nodejs";
export const maxDuration = 60;

const Category = z.enum([
  "everbond-girls",
  "anime-fantasy",
  "everbond-guys",
  "public-creations"
]);

const Language = z.enum(["EN", "ES", "FR", "DE", "JA", "KO"]);

const Query = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(8),
  offset: z.coerce.number().int().min(0).default(0),
  category: Category.default("everbond-girls"),
  q: z.string().max(100).optional(),
  tag: z.string().max(50).optional(),
  language: Language.default("EN")
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_CHARACTER_QUERY" },
      { status: 400 }
    );
  }

  try {
    const result = await queryCharacters({
      limit: parsed.data.limit,
      offset: parsed.data.offset,
      category: parsed.data.category,
      query: parsed.data.q,
      tag:
        parsed.data.tag && parsed.data.tag !== "All"
          ? parsed.data.tag
          : undefined
    });

    const characters = await localizeCharacters(
      result.characters,
      parsed.data.language as CharacterContentLanguage,
      { translateTags: true, allowProvider: false }
    );

    return NextResponse.json(
      {
        characters,
        hasMore: result.hasMore,
        language: parsed.data.language
      },
      {
        headers: {
          "Cache-Control": "private, no-store"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "CHARACTER_LOCALIZATION_FAILED"
      },
      { status: 500 }
    );
  }
}
