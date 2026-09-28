import { NextResponse } from "next/server";
import { z } from "zod";
import { queryCharacters } from "@/lib/characters-db";
import { getApprovedAppearanceById } from "@/lib/appearance-gallery";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const Category = z.enum([
  "everbond-girls",
  "anime-fantasy",
  "everbond-guys",
  "public-creations"
]);

const CreateCharacter = z
  .object({
    name: z.string().trim().min(1).max(30),
    visualDescription: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(100),
    temperament: z.string().trim().min(1).max(50),
    openingScenario: z.string().trim().min(1).max(200),
    firstMessage: z.string().trim().min(1).max(100),
    visibility: z.enum(["private", "unlisted"]),
    appearanceId: z.string().trim().min(1).max(160)
  })
  .strict();

const USER_CHARACTER_LIMIT = 25;

async function getUser(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!token) return null;

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) return null;
  return data.user;
}

function containsUploadedFile(formData: FormData) {
  for (const value of formData.values()) {
    if (value instanceof File && value.size > 0) return true;
  }
  return false;
}

function slugify(value: string) {
  const base = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return base || "companion";
}

function defaultUsername(userId: string) {
  return `member_${userId.replaceAll("-", "").slice(0, 8)}`;
}

async function ensureUsername(
  user: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown>;
  }
) {
  const supabase = getSupabaseServiceClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: user.id,
        email: user.email ?? null
      },
      {
        onConflict: "user_id"
      }
    )
    .select("username")
    .single();

  if (error) throw error;

  const stored =
    typeof profile.username === "string"
      ? profile.username.trim().toLowerCase()
      : "";

  if (/^[a-z0-9_]{3,30}$/.test(stored)) {
    return stored;
  }

  const metadata =
    typeof user.user_metadata?.username === "string"
      ? user.user_metadata.username.trim().toLowerCase()
      : "";

  const username = /^[a-z0-9_]{3,30}$/.test(metadata)
    ? metadata
    : defaultUsername(user.id);

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      username,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", user.id);

  if (updateError) throw updateError;

  return username;
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
    const result = await queryCharacters({
      limit: parsed.data.limit,
      offset: parsed.data.offset,
      category: parsed.data.category,
      query: parsed.data.q,
      tag: parsed.data.tag
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control":
          "public, s-maxage=60, stale-while-revalidate=300"
      }
    });
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

export async function POST(request: Request) {
  try {
    const user = await getUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "SIGNUP_REQUIRED" },
        { status: 401 }
      );
    }

    const formData = await request.formData();

    // Compliance boundary: character creation never accepts user files.
    // The appearance ID must resolve to a currently public, active,
    // official EverBond character image on the server.
    if (containsUploadedFile(formData)) {
      return NextResponse.json(
        {
          error: "CUSTOM_UPLOADS_DISABLED",
          message:
            "External photo uploads are disabled. Choose an EverBond appearance."
        },
        { status: 400 }
      );
    }

    const parsed = CreateCharacter.safeParse({
      name: formData.get("name"),
      visualDescription: formData.get("visualDescription"),
      description: formData.get("description"),
      temperament: formData.get("temperament"),
      openingScenario: formData.get("openingScenario"),
      firstMessage: formData.get("firstMessage"),
      visibility: formData.get("visibility"),
      appearanceId: formData.get("appearanceId")
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "INVALID_CHARACTER",
          message:
            parsed.error.issues[0]?.message ?? "Invalid character"
        },
        { status: 400 }
      );
    }

    const appearance = await getApprovedAppearanceById(
      parsed.data.appearanceId
    );

    if (!appearance) {
      return NextResponse.json(
        {
          error: "INVALID_APPEARANCE",
          message:
            "Choose an appearance from the current EverBond appearance gallery."
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServiceClient();

    const { count, error: countError } = await supabase
      .from("characters")
      .select("*", {
        count: "exact",
        head: true
      })
      .eq("creator_id", user.id);

    if (countError) throw countError;

    if ((count ?? 0) >= USER_CHARACTER_LIMIT) {
      return NextResponse.json(
        { error: "CHARACTER_LIMIT_REACHED" },
        { status: 409 }
      );
    }

    const username = await ensureUsername(user);
    const randomId = crypto.randomUUID();
    const shareToken = randomId.replaceAll("-", "");
    const slug = `${slugify(parsed.data.name)}-${shareToken}`;
    const characterId = `user-${randomId}`;
    const now = new Date();
    const aiProfile = {
      visual_identity: {
        description: parsed.data.visualDescription
      },
      personality_core: {
        traits: [parsed.data.temperament],
        description: parsed.data.description
      },
      romantic_dynamic: {
        starting_bond: "New bond",
        affection_style: parsed.data.temperament
      },
      speech_style: {
        voice: "Natural, emotional, in-character dialogue.",
        sentence_style: "Descriptive"
      },
      sample_dialogue: [parsed.data.firstMessage]
    };

    const { error: insertError } = await supabase
      .from("characters")
      .insert({
        id: characterId,
        slug,
        name: parsed.data.name,
        section: "My Companions",
        // This internal category keeps legacy data compatibility. The selected
        // image itself remains an approved EverBond-owned catalog asset.
        category: "public-creations",
        role: parsed.data.temperament,
        relationship_pace: "Natural",
        tags: [],
        title: parsed.data.visualDescription,
        opening_scenario: parsed.data.openingScenario,
        first_message: parsed.data.firstMessage,
        relationship_context: parsed.data.description,
        ai_profile: aiProfile,
        feature_flags: {
          voice_enabled: false,
          image_generation_enabled: false,
          gifts_enabled: true
        },
        generated_seo: {
          title: `${parsed.data.name} — EverBond`,
          description: parsed.data.description,
          indexable: false
        },
        quality_control: {
          source: "user-created-gallery",
          public_listing_disabled: true,
          reviewed: false,
          external_photo_uploads_disabled: true,
          locked_to_everbond_appearance_gallery: true,
          base_official_appearance_id: appearance.id
        },
        image_file: appearance.imageFile,
        image_storage_bucket: appearance.imageStorageBucket,
        image_storage_path: appearance.imageStoragePath,
        image_url: appearance.imageUrl,
        display_order: -Math.floor(now.getTime() / 1000),
        visibility: parsed.data.visibility,
        is_public: false,
        official: false,
        creator_id: user.id,
        creator_username: username,
        view_count: 0,
        favorite_count: 0,
        is_active: true,
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      });

    if (insertError) throw insertError;

    return NextResponse.json(
      {
        id: characterId,
        slug,
        visibility: parsed.data.visibility,
        shareUrl:
          parsed.data.visibility === "unlisted"
            ? `/chat/${encodeURIComponent(slug)}`
            : null
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "CHARACTER_CREATE_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Character creation failed"
      },
      { status: 500 }
    );
  }
}
