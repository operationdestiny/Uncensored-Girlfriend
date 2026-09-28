import { NextResponse } from "next/server";
import { z } from "zod";
import { characters as fallbackCharacters } from "@/lib/characters";
import { rowToCharacter } from "@/lib/characters-db";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { Character, CharacterCategory } from "@/types/character";

export const runtime = "nodejs";

const Category = z.enum([
  "everbond-girls",
  "anime-fantasy",
  "everbond-guys",
  "public-creations"
]);

const selectFields =
  "id,slug,name,section,category,role,relationship_pace,tags,title,opening_scenario,first_message,relationship_context,ai_profile,feature_flags,generated_seo,quality_control,image_file,image_storage_bucket,image_storage_path,image_url,visibility,is_public,official,view_count,favorite_count,display_order,creator_username,created_at";

function canUseSupabase() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function matchesFallbackCategory(
  character: Character,
  category: CharacterCategory
) {
  if (category === "public-creations") {
    return (
      character.official !== false &&
      character.category === "public-creations"
    );
  }

  return character.category === category;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(100),
      offset: z.coerce.number().int().min(0).default(0),
      category: Category.default("everbond-girls"),
      q: z.string().max(100).optional(),
      tag: z.string().max(50).optional()
    })
    .safeParse(Object.fromEntries(url.searchParams));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid character query" },
      { status: 400 }
    );
  }

  try {
    const { category, limit, offset, q, tag } = parsed.data;

    if (!canUseSupabase()) {
      const term = q?.trim().toLowerCase() ?? "";
      const filtered = fallbackCharacters
        .filter((character) => matchesFallbackCategory(character, category))
        .filter((character) => !tag || character.tags.includes(tag))
        .filter((character) => {
          if (!term) return true;

          return [
            character.name,
            character.tagline,
            character.description,
            character.archetype
          ].some((value) => value.toLowerCase().includes(term));
        })
        .reverse();

      return NextResponse.json(
        {
          characters: filtered.slice(offset, offset + limit),
          hasMore: filtered.length > offset + limit
        },
        {
          headers: {
            "Cache-Control":
              "public, s-maxage=60, stale-while-revalidate=300"
          }
        }
      );
    }

    const supabase = getSupabaseServiceClient();
    let query = supabase
      .from("characters")
      .select(selectFields, { count: "exact" })
      .eq("is_public", true)
      .eq("is_active", true)
      .eq("visibility", "public");

    if (category === "public-creations") {
      query = query
        .eq("official", true)
        .eq("category", "public-creations");
    } else {
      query = query.eq("category", category);
    }

    if (tag) query = query.contains("tags", [tag]);

    if (q?.trim()) {
      const term = q.trim().replaceAll(",", " ");
      query = query.or(
        `name.ilike.%${term}%,title.ilike.%${term}%,opening_scenario.ilike.%${term}%,role.ilike.%${term}%`
      );
    }

    const { data, error, count } = await query
      .order("display_order", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json(
      {
        characters: (data ?? []).map((row) =>
          rowToCharacter(
            row as Parameters<typeof rowToCharacter>[0]
          )
        ),
        hasMore:
          typeof count === "number"
            ? offset + limit < count
            : (data?.length ?? 0) === limit
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=60, stale-while-revalidate=300"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Character query failed"
      },
      { status: 500 }
    );
  }
}
