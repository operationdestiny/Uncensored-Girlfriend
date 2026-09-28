import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const FavoriteBody = z
  .object({
    characterId: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .optional(),
    characterSlug: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .optional(),
    toggle: z.boolean().optional()
  })
  .strict()
  .refine(
    (value) =>
      Boolean(
        value.characterId ||
          value.characterSlug
      ),
    {
      message: "Character is required."
    }
  );

async function getUser(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!token) return null;

  const supabase = getSupabaseServiceClient();
  const { data, error } =
    await supabase.auth.getUser(token);

  if (error || !data.user) return null;
  return data.user;
}

async function resolveCharacter(
  userId: string,
  input: {
    characterId?: string;
    characterSlug?: string;
  }
) {
  const supabase = getSupabaseServiceClient();
  let query = supabase
    .from("characters")
    .select(
      "id,slug,is_active,is_public,visibility,creator_id"
    );

  query = input.characterId
    ? query.eq("id", input.characterId)
    : query.eq(
        "slug",
        input.characterSlug as string
      );

  const { data, error } =
    await query.maybeSingle();

  if (error) throw error;
  if (!data || data.is_active !== true) {
    return null;
  }

  const isPublic =
    data.is_public === true &&
    data.visibility === "public";
  const isPrivateOwner =
    data.visibility === "private" &&
    data.creator_id === userId;

  return isPublic || isPrivateOwner
    ? data
    : null;
}

async function refreshFavoriteCount(
  characterId: string
) {
  const supabase = getSupabaseServiceClient();
  const { count, error } = await supabase
    .from("favorites")
    .select("*", {
      count: "exact",
      head: true
    })
    .eq("character_id", characterId);

  if (error) throw error;

  await supabase
    .from("characters")
    .update({
      favorite_count: count ?? 0,
      updated_at: new Date().toISOString()
    })
    .eq("id", characterId);
}

export async function GET(request: Request) {
  try {
    const user = await getUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "SIGNUP_REQUIRED" },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const characterId =
      url.searchParams
        .get("characterId")
        ?.trim() || undefined;
    const characterSlug =
      url.searchParams
        .get("characterSlug")
        ?.trim() || undefined;

    if (!characterId && !characterSlug) {
      const { data, error } =
        await getSupabaseServiceClient()
          .from("favorites")
          .select("character_id")
          .eq("user_id", user.id);

      if (error) throw error;

      return NextResponse.json(
        {
          characterIds: (data ?? []).map(
            (item) => item.character_id
          )
        },
        {
          headers: {
            "Cache-Control":
              "private, no-store"
          }
        }
      );
    }

    const character = await resolveCharacter(
      user.id,
      {
        characterId,
        characterSlug
      }
    );

    if (!character) {
      return NextResponse.json(
        { error: "CHARACTER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const { data, error } =
      await getSupabaseServiceClient()
        .from("favorites")
        .select("character_id")
        .eq("user_id", user.id)
        .eq("character_id", character.id)
        .maybeSingle();

    if (error) throw error;

    return NextResponse.json(
      {
        saved: Boolean(data),
        characterId: character.id
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
            : "FAVORITE_LOOKUP_FAILED"
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "SIGNUP_REQUIRED" },
        { status: 401 }
      );
    }

    const parsed = FavoriteBody.safeParse(
      await request.json().catch(() => null)
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_CHARACTER" },
        { status: 400 }
      );
    }

    const character = await resolveCharacter(
      user.id,
      parsed.data
    );

    if (!character) {
      return NextResponse.json(
        { error: "CHARACTER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const supabase =
      getSupabaseServiceClient();

    if (parsed.data.toggle) {
      const { data: existing, error } =
        await supabase
          .from("favorites")
          .select("character_id")
          .eq("user_id", user.id)
          .eq("character_id", character.id)
          .maybeSingle();

      if (error) throw error;

      if (existing) {
        const { error: deleteError } =
          await supabase
            .from("favorites")
            .delete()
            .eq("user_id", user.id)
            .eq(
              "character_id",
              character.id
            );

        if (deleteError) throw deleteError;

        await refreshFavoriteCount(
          character.id
        );

        return NextResponse.json({
          saved: false,
          characterId: character.id
        });
      }
    }

    const { error } = await supabase
      .from("favorites")
      .upsert(
        {
          user_id: user.id,
          character_id: character.id
        },
        {
          onConflict: "user_id,character_id"
        }
      );

    if (error) throw error;

    await refreshFavoriteCount(character.id);

    return NextResponse.json({
      saved: true,
      characterId: character.id
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "FAVORITE_SAVE_FAILED"
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "SIGNUP_REQUIRED" },
        { status: 401 }
      );
    }

    const parsed = FavoriteBody.safeParse(
      await request.json().catch(() => null)
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_CHARACTER" },
        { status: 400 }
      );
    }

    const character = await resolveCharacter(
      user.id,
      parsed.data
    );

    if (!character) {
      return NextResponse.json(
        { error: "CHARACTER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const { error } =
      await getSupabaseServiceClient()
        .from("favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("character_id", character.id);

    if (error) throw error;

    await refreshFavoriteCount(character.id);

    return NextResponse.json({
      saved: false,
      characterId: character.id
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "FAVORITE_DELETE_FAILED"
      },
      { status: 500 }
    );
  }
}
