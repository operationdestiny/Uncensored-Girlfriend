import { NextResponse } from "next/server";
import { z } from "zod";
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
    visibility: z.enum(["public", "private"])
  })
  .strict();

const CHARACTER_IMAGE_BUCKET = "character-images";
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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

function imageExtension(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
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
    // My Bond's old `public` value now means Share by link / unlisted.
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
  let newImagePath = "";

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
    const parsed = UpdateCharacter.safeParse({
      name: formData.get("name"),
      visualDescription: formData.get("visualDescription"),
      description: formData.get("description"),
      temperament: formData.get("temperament"),
      openingScenario: formData.get("openingScenario"),
      firstMessage: formData.get("firstMessage"),
      visibility: formData.get("visibility")
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

    const image = formData.get("image");
    const supabase = getSupabaseServiceClient();
    let imageUpdate: Record<string, string> = {};

    if (image instanceof File && image.size > 0) {
      if (
        !ALLOWED_IMAGE_TYPES.has(image.type) ||
        image.size > MAX_IMAGE_BYTES
      ) {
        return NextResponse.json(
          { error: "INVALID_IMAGE" },
          { status: 400 }
        );
      }

      const extension = imageExtension(image);
      newImagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const upload = await supabase.storage
        .from(CHARACTER_IMAGE_BUCKET)
        .upload(
          newImagePath,
          Buffer.from(await image.arrayBuffer()),
          {
            contentType: image.type,
            upsert: false,
            cacheControl: "31536000"
          }
        );

      if (upload.error) throw upload.error;

      const {
        data: { publicUrl }
      } = supabase.storage
        .from(CHARACTER_IMAGE_BUCKET)
        .getPublicUrl(newImagePath);

      imageUpdate = {
        image_storage_bucket: CHARACTER_IMAGE_BUCKET,
        image_storage_path: newImagePath,
        image_file:
          newImagePath.split("/").pop() ?? "character.jpg",
        image_url: publicUrl
      };
    }

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
          public_listing_disabled: true
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

    if (
      newImagePath &&
      existing.image_storage_path &&
      existing.image_storage_path !== newImagePath
    ) {
      await supabase.storage
        .from(
          existing.image_storage_bucket || CHARACTER_IMAGE_BUCKET
        )
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
    if (newImagePath) {
      await getSupabaseServiceClient()
        .storage.from(CHARACTER_IMAGE_BUCKET)
        .remove([newImagePath]);
    }

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

    if (existing.image_storage_path) {
      await supabase.storage
        .from(
          existing.image_storage_bucket || CHARACTER_IMAGE_BUCKET
        )
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
