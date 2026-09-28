import { NextResponse } from "next/server";
import { z } from "zod";
import {
  localizeCharacters,
  type CharacterContentLanguage
} from "@/lib/character-localization";
import { rowToCharacter } from "@/lib/characters-db";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { Character } from "@/types/character";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z
  .object({
    slugs: z.array(z.string().trim().min(1).max(160)).min(1).max(12),
    language: z.enum(["EN", "ES", "FR", "DE", "JA", "KO"])
  })
  .strict();

const selectFields =
  "id,slug,name,section,category,role,relationship_pace,tags,title,opening_scenario,first_message,relationship_context,ai_profile,feature_flags,generated_seo,quality_control,image_file,image_storage_bucket,image_storage_path,image_url,visibility,is_public,official,view_count,favorite_count,display_order,creator_id,creator_username,created_at";

async function optionalUserId(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!token) return null;

  const { data, error } =
    await getSupabaseServiceClient().auth.getUser(token);
  return error ? null : data.user?.id ?? null;
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_LOCALIZATION_REQUEST" },
      { status: 400 }
    );
  }

  try {
    const userId = await optionalUserId(request);
    const uniqueSlugs = [...new Set(parsed.data.slugs)];
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("characters")
      .select(selectFields)
      .in("slug", uniqueSlugs)
      .eq("is_active", true);

    if (error) throw error;

    const allowedRows = (data ?? []).filter(
      (row: Record<string, unknown>) => {
        const isPublic =
          row.is_public === true && row.visibility === "public";
        const isShareByLink = row.visibility === "unlisted";
        const isOwner =
          Boolean(userId) &&
          row.creator_id === userId &&
          ["private", "unlisted", "public"].includes(
            String(row.visibility)
          );

        return isPublic || isShareByLink || isOwner;
      }
    );

    const bySlug = new Map(
      allowedRows.map((row: Record<string, unknown>) => [
        String(row.slug),
        rowToCharacter(row as Parameters<typeof rowToCharacter>[0])
      ])
    );
    const characters = uniqueSlugs
      .map((slug: string) => bySlug.get(slug))
      .filter((character): character is Character => Boolean(character));
    const localized = await localizeCharacters(
      characters,
      parsed.data.language as CharacterContentLanguage,
      { translateTags: true, allowProvider: false }
    );
    const localizedBySlug = new Map(
      localized.map((character) => [character.slug, character])
    );

    return NextResponse.json(
      {
        characters: parsed.data.slugs
          .map((slug: string) => localizedBySlug.get(slug))
          .filter(Boolean),
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
