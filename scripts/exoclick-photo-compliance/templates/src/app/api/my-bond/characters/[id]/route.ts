import { NextResponse } from "next/server";
import { z } from "zod";
import { getApprovedAppearanceById } from "@/lib/appearance-gallery";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// `public` is retained only as the existing My Bond client value. The server
// always converts it to database visibility `unlisted` (Share by link).
const UpdateCharacter = z
  .object({
    name: z.string().trim().min(1).max(30),
    visualDescription: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(100),
    temperament: z.string().trim().min(1).max(50),
    openingScenario: z.string().trim().min(1).max(200),
    firstMessage: z.string().trim().min(1).max(100),
    visibility: z.enum(["public", "private"]),
    appearanceId: z.string().trim().min(1).max(160).optional()
  })
  .strict();

const LEGACY_USER_IMAGE_BUCKET = "character-images";

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

function imageFromRow(row: {
  image_url?: string | null;
  image_storage_path?: string | null;
  category?: string | null;
  image_file?: string | null;
}) {
  if (row.image_url) return row.image_url;
  if (row.image_storage_path) {
    return `/character-assets/${row.image_storage_path}`;
  }
  if (row.category && row.image_file) {
    return `/character-assets/${row.category}/${row.image_file}`;
  }
  return "";
}

function summaryFromRow(row: {
  id: string;
  slug: string;
  name: string;
  image_url?: string | null;
  image_storage_path?: string | null;
  category?: string | null;
  image_file?: string | null;
  title?: string | null;
  visibility?: string | null;
  creator_username?: string | null;
}) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    image: imageFromRow(row),
    title: row.title ?? "",
    visibility:
      row.visibility === "private"
        ? ("private" as const)
        : ("public" as const),
    creatorUsername:
      row.visibility === "unlisted"
        ? undefined
        : row.creator_username ?? undefined,
    shareUrl:
      row.visibility === "unlisted" || row.visibility === "public"
        ? `/chat/${row.slug}`
        : undefined
  };
}

async function getOwnedCharacter(userId: string, characterId: string) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("characters")
    .select(
      "id,slug,name,section,category,role,title,opening_scenario,first_message,relationship_context,ai_profile,generated_seo,quality_control,image_file,image_storage_bucket,image_storage_path,image_url,visibility,is_public,official,creator_id,creator_username,is_active"
    )
    .eq("id", characterId)
    .eq("creator_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "SIGNUP_REQUIRED" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const character = await getOwnedCharacter(user.id, id);

    if (!character) {
      return NextResponse.json(
        { error: "CHARACTER_NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        character: {
          ...summaryFromRow(character),
          visualDescription: character.title ?? "",
          description: character.relationship_context ?? "",
          temperament: character.role ?? "",
          openingScenario: character.opening_scenario ?? "",
          firstMessage: character.first_message ?? ""
        }
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
            : "CHARACTER_LOAD_FAILED"
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "SIGNUP_REQUIRED" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const existing = await getOwnedCharacter(user.id, id);

    if (!existing) {
      return NextResponse.json(
        { error: "CHARACTER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const formData = await request.formData();

    // Compliance boundary: My Bond can switch only to a server-approved
    // EverBond appearance. It cannot accept a local file, image URL, or blob.
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

    const parsed = UpdateCharacter.safeParse({
      name: formData.get("name"),
      visualDescription: formData.get("visualDescription"),
      description: formData.get("description"),
      temperament: formData.get("temperament"),
      openingScenario: formData.get("openingScenario"),
      firstMessage: formData.get("firstMessage"),
      visibility: formData.get("visibility"),
      appearanceId: formData.get("appearanceId") || undefined
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

    const appearance = parsed.data.appearanceId
      ? await getApprovedAppearanceById(parsed.data.appearanceId)
      : null;

    if (parsed.data.appearanceId && !appearance) {
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
    const imageUpdate = appearance
      ? {
          image_storage_bucket: appearance.imageStorageBucket,
          image_storage_path: appearance.imageStoragePath,
          image_file: appearance.imageFile,
          image_url: appearance.imageUrl
        }
      : {};

    const currentAi =
      existing.ai_profile && typeof existing.ai_profile === "object"
        ? existing.ai_profile
        : {};
    const visual =
      currentAi.visual_identity &&
      typeof currentAi.visual_identity === "object"
        ? currentAi.visual_identity
        : {};
    const personality =
      currentAi.personality_core &&
      typeof currentAi.personality_core === "object"
        ? currentAi.personality_core
        : {};
    const dynamic =
      currentAi.romantic_dynamic &&
      typeof currentAi.romantic_dynamic === "object"
        ? currentAi.romantic_dynamic
        : {};

    const databaseVisibility =
      parsed.data.visibility === "public" ? "unlisted" : "private";
    const now = new Date().toISOString();

    const existingGeneratedSeo =
      existing.generated_seo && typeof existing.generated_seo === "object"
        ? existing.generated_seo
        : {};
    const existingQualityControl =
      existing.quality_control &&
      typeof existing.quality_control === "object"
        ? existing.quality_control
        : {};

    const { data: updated, error } = await supabase
      .from("characters")
      .update({
        name: parsed.data.name,
        role: parsed.data.temperament,
        title: parsed.data.visualDescription,
        opening_scenario: parsed.data.openingScenario,
        first_message: parsed.data.firstMessage,
        relationship_context: parsed.data.description,
        ai_profile: {
          ...currentAi,
          visual_identity: {
            ...visual,
            description: parsed.data.visualDescription
          },
          personality_core: {
            ...personality,
            traits: [parsed.data.temperament],
            description: parsed.data.description
          },
          romantic_dynamic: {
            ...dynamic,
            affection_style: parsed.data.temperament
          },
          sample_dialogue: [parsed.data.firstMessage]
        },
        section: "My Companions",
        visibility: databaseVisibility,
        is_public: false,
        generated_seo: {
          ...existingGeneratedSeo,
          indexable: false
        },
        quality_control: {
          ...existingQualityControl,
          public_listing_disabled: true,
          external_photo_uploads_disabled: true,
          ...(appearance
            ? {
                locked_to_everbond_appearance_gallery: true,
                base_official_appearance_id: appearance.id
              }
            : {})
        },
        updated_at: now,
        ...imageUpdate
      })
      .eq("id", id)
      .eq("creator_id", user.id)
      .select(
        "id,slug,name,category,title,image_file,image_storage_path,image_url,visibility,creator_username"
      )
      .single();

    if (error) throw error;

    // Clean up a legacy uploaded image only after the database has safely moved
    // the companion onto an approved shared EverBond catalog appearance.
    if (
      appearance &&
      existing.image_storage_bucket === LEGACY_USER_IMAGE_BUCKET &&
      existing.image_storage_path
    ) {
      await supabase.storage
        .from(LEGACY_USER_IMAGE_BUCKET)
        .remove([existing.image_storage_path]);
    }

    return NextResponse.json(
      { character: summaryFromRow(updated) },
      {
        headers: {
          "Cache-Control": "private, no-store"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "CHARACTER_UPDATE_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Character update failed"
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "SIGNUP_REQUIRED" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const existing = await getOwnedCharacter(user.id, id);

    if (!existing) {
      return NextResponse.json(
        { error: "CHARACTER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("characters")
      .delete()
      .eq("id", id)
      .eq("creator_id", user.id);

    if (error) throw error;

    // Never delete an official shared catalog image. Only legacy per-user
    // uploads from the retired character-images bucket are removed.
    if (
      existing.image_storage_bucket === LEGACY_USER_IMAGE_BUCKET &&
      existing.image_storage_path
    ) {
      await supabase.storage
        .from(LEGACY_USER_IMAGE_BUCKET)
        .remove([existing.image_storage_path]);
    }

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    return NextResponse.json(
      {
        error: "CHARACTER_DELETE_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Character deletion failed"
      },
      { status: 500 }
    );
  }
}
