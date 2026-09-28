import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import {
  completeCharacterImageRequest,
  everCoinImageCost,
  failCharacterImageRequest,
  startCharacterImageRequest
} from "@/lib/evercoin";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getCharacterBySlugForUser } from "@/lib/user-characters";
import { activeCharacterReferenceDataUrl } from "@/lib/character-media-reference";
import {
  downloadWaveSpeedOutput,
  submitWaveSpeedPrediction,
  waitForWaveSpeedPrediction,
  wavespeedApiKey
} from "@/lib/wavespeed-media";

export const runtime = "nodejs";
export const maxDuration = 300;

const GALLERY_LIMIT = 7;
const MAX_GENERATED_IMAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_IMAGE_MODEL = "bytedance/seedream-v5.0-pro/edit";
const ALLOWED_SOURCE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp"
]);

const GenerateBody = z
  .object({
    requestId: z.string().uuid(),
    prompt: z.string().trim().min(3).max(600)
  })
  .strict();

const ActionBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("select"), imageId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("deselect"), imageId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("delete"), imageId: z.string().uuid() }).strict()
]);

type GalleryRow = {
  id: string;
  storage_path: string;
  prompt: string;
  created_at: string;
};

function imageResolution() {
  return process.env.WAVESPEED_IMAGE_RESOLUTION?.trim().toLowerCase() === "2k"
    ? "2k"
    : "1k";
}

async function signedUrl(path: string) {
  const { data, error } = await getSupabaseServiceClient()
    .storage.from("character-gallery")
    .createSignedUrl(path, 60 * 60);

  if (error) throw error;
  return data.signedUrl;
}

async function galleryImageResponse(imageId: string, userId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from("character_gallery_images")
    .select("id,storage_path,prompt,created_at")
    .eq("id", imageId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const image = data as GalleryRow;
  return {
    id: image.id,
    prompt: image.prompt,
    createdAt: image.created_at,
    url: await signedUrl(image.storage_path)
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "SIGNUP_REQUIRED" }, { status: 401 });
    }

    const { slug } = await params;
    const character = await getCharacterBySlugForUser(slug, user.id);
    if (!character) {
      return NextResponse.json(
        { error: "CHARACTER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const supabase = getSupabaseServiceClient();
    const [
      { data: images, error: imagesError },
      { data: preference, error: preferenceError }
    ] = await Promise.all([
      supabase
        .from("character_gallery_images")
        .select("id,storage_path,prompt,created_at")
        .eq("user_id", user.id)
        .eq("character_id", character.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("user_character_preferences")
        .select("selected_gallery_image_id")
        .eq("user_id", user.id)
        .eq("character_id", character.id)
        .maybeSingle()
    ]);

    if (imagesError) throw imagesError;
    if (preferenceError) throw preferenceError;

    const result = await Promise.all(
      ((images ?? []) as GalleryRow[]).map(async (image) => ({
        id: image.id,
        prompt: image.prompt,
        createdAt: image.created_at,
        url: await signedUrl(image.storage_path)
      }))
    );

    return NextResponse.json(
      {
        character: {
          id: character.id,
          slug: character.slug,
          name: character.name,
          image: character.image
        },
        images: result,
        selectedImageId: preference?.selected_gallery_image_id ?? null,
        limit: GALLERY_LIMIT,
        imageCost: everCoinImageCost()
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "GALLERY_LOAD_FAILED"
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  let userId = "";
  let requestId = "";
  let uploadedPath = "";
  let insertedImageId = "";

  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "SIGNUP_REQUIRED" }, { status: 401 });
    }
    userId = user.id;

    const parsed = GenerateBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_PROMPT" }, { status: 400 });
    }
    requestId = parsed.data.requestId;

    const { slug } = await params;
    const character = await getCharacterBySlugForUser(slug, user.id);
    if (!character) {
      return NextResponse.json(
        { error: "CHARACTER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const cost = everCoinImageCost();
    const claim = await startCharacterImageRequest({
      userId: user.id,
      requestId,
      characterId: character.id,
      prompt: parsed.data.prompt,
      amount: cost,
      galleryLimit: GALLERY_LIMIT
    });

    if (claim.status === "completed" && claim.imageId) {
      const existingImage = await galleryImageResponse(claim.imageId, user.id);
      if (!existingImage) {
        return NextResponse.json(
          { error: "IMAGE_NOT_FOUND" },
          { status: 410 }
        );
      }

      return NextResponse.json(
        { image: existingImage, duplicate: true },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }

    if (claim.status === "busy") {
      return NextResponse.json(
        { error: "IMAGE_REQUEST_IN_PROGRESS" },
        { status: 409 }
      );
    }

    if (claim.status === "limit_reached") {
      return NextResponse.json(
        { error: "IMAGE_LIMIT_REACHED" },
        { status: 409 }
      );
    }

    if (claim.status === "insufficient") {
      return NextResponse.json(
        {
          error: claim.errorCode || "INSUFFICIENT_EVERCOIN",
          balance: claim.balance,
          debt: claim.debt,
          required: cost
        },
        { status: 402 }
      );
    }

    if (claim.status !== "claimed") {
      return NextResponse.json(
        { error: claim.errorCode || "REQUEST_FAILED" },
        { status: 409 }
      );
    }

    const apiKey = wavespeedApiKey();
    if (!apiKey) throw new Error("WAVESPEED_NOT_CONFIGURED");

    const model =
      process.env.WAVESPEED_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
    const referenceImage = await activeCharacterReferenceDataUrl({
      request,
      userId: user.id,
      characterId: character.id,
      fallbackImage: character.image
    });

    const identityPrompt =
      `The supplied reference image defines the exact visual identity of the fictional adult character ${character.name}. ` +
      "Preserve the same recognizable person: face and facial proportions, adult age appearance, eye color, hair color and hairstyle, skin tone, body proportions, tattoos, scars, and permanent identifying features. " +
      "Do not substitute a different person or redesign the character. Keep identity consistent even when changing pose, expression, clothing state, location, lighting, camera angle, or scene. " +
      `Follow the user's requested image closely: ${parsed.data.prompt}`;

    const submitted = await submitWaveSpeedPrediction({
      apiKey,
      model,
      input: {
        prompt: identityPrompt,
        images: [referenceImage],
        aspect_ratio: "4:5",
        resolution: imageResolution(),
        output_format: "jpeg"
      },
      timeoutMs: 60_000
    });

    const prediction = await waitForWaveSpeedPrediction({
      apiKey,
      predictionId: submitted.id,
      maximumWaitMs: 145_000,
      pollIntervalMs: 2_000
    });
    const outputUrl = prediction.outputs[0];
    if (!outputUrl) throw new Error("IMAGE_PROVIDER_OUTPUT_MISSING");

    const downloaded = await downloadWaveSpeedOutput({
      url: outputUrl,
      maximumBytes: MAX_GENERATED_IMAGE_BYTES,
      allowedContentTypes: ALLOWED_SOURCE_MIME_TYPES,
      fallbackContentType: "image/jpeg",
      timeoutMs: 45_000
    });

    const imageId = crypto.randomUUID();
    insertedImageId = imageId;
    const extension =
      downloaded.contentType === "image/png"
        ? "png"
        : downloaded.contentType === "image/webp"
          ? "webp"
          : "jpg";
    uploadedPath = `${user.id}/${character.id}/${imageId}.${extension}`;
    const supabase = getSupabaseServiceClient();

    const upload = await supabase.storage
      .from("character-gallery")
      .upload(uploadedPath, downloaded.bytes, {
        contentType: downloaded.contentType,
        upsert: false,
        cacheControl: "31536000"
      });
    if (upload.error) throw upload.error;

    const { data: inserted, error: insertError } = await supabase
      .from("character_gallery_images")
      .insert({
        id: imageId,
        user_id: user.id,
        character_id: character.id,
        storage_path: uploadedPath,
        prompt: parsed.data.prompt,
        provider: "wavespeed",
        model: submitted.model,
        evercoin_charge: cost
      })
      .select("id,storage_path,prompt,created_at")
      .single();
    if (insertError) throw insertError;

    const responseImage = {
      id: inserted.id,
      prompt: inserted.prompt,
      createdAt: inserted.created_at,
      url: await signedUrl(inserted.storage_path)
    };

    const completed = await completeCharacterImageRequest({
      userId: user.id,
      requestId,
      imageId
    });
    if (!completed) throw new Error("IMAGE_REQUEST_COMPLETION_FAILED");

    return NextResponse.json(
      { image: responseImage },
      {
        status: 201,
        headers: { "Cache-Control": "private, no-store" }
      }
    );
  } catch (error) {
    const errorCode =
      error instanceof Error
        ? error.message.slice(0, 200)
        : "IMAGE_GENERATION_FAILED";

    if (userId && insertedImageId) {
      try {
        await getSupabaseServiceClient()
          .from("character_gallery_images")
          .delete()
          .eq("id", insertedImageId)
          .eq("user_id", userId);
      } catch {
        // The request refund below is the financial source of truth.
      }
    }

    if (uploadedPath) {
      await getSupabaseServiceClient().storage
        .from("character-gallery")
        .remove([uploadedPath])
        .catch(() => undefined);
    }

    if (userId && requestId) {
      await failCharacterImageRequest({
        userId,
        requestId,
        errorCode
      }).catch(() => undefined);
    }

    console.error("Character image generation failed:", error);
    return NextResponse.json(
      { error: "IMAGE_GENERATION_FAILED" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "SIGNUP_REQUIRED" }, { status: 401 });
    }

    const { slug } = await params;
    const character = await getCharacterBySlugForUser(slug, user.id);
    if (!character) {
      return NextResponse.json(
        { error: "CHARACTER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const parsed = ActionBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();

    if (parsed.data.action === "select") {
      const { data: image, error } = await supabase
        .from("character_gallery_images")
        .select("id")
        .eq("id", parsed.data.imageId)
        .eq("user_id", user.id)
        .eq("character_id", character.id)
        .maybeSingle();

      if (error) throw error;
      if (!image) {
        return NextResponse.json(
          { error: "IMAGE_NOT_FOUND" },
          { status: 404 }
        );
      }

      const { error: preferenceError } = await supabase
        .from("user_character_preferences")
        .upsert(
          {
            user_id: user.id,
            character_id: character.id,
            selected_gallery_image_id: image.id,
            updated_at: new Date().toISOString()
          },
          { onConflict: "user_id,character_id" }
        );
      if (preferenceError) throw preferenceError;

      return NextResponse.json({ selectedImageId: image.id });
    }

    if (parsed.data.action === "deselect") {
      const { error: preferenceError } = await supabase
        .from("user_character_preferences")
        .update({
          selected_gallery_image_id: null,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", user.id)
        .eq("character_id", character.id)
        .eq("selected_gallery_image_id", parsed.data.imageId);
      if (preferenceError) throw preferenceError;

      return NextResponse.json({ selectedImageId: null });
    }

    const { data: image, error: lookupError } = await supabase
      .from("character_gallery_images")
      .select("id,storage_path")
      .eq("id", parsed.data.imageId)
      .eq("user_id", user.id)
      .eq("character_id", character.id)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!image) {
      return NextResponse.json({ error: "IMAGE_NOT_FOUND" }, { status: 404 });
    }

    const { error: preferenceError } = await supabase
      .from("user_character_preferences")
      .update({
        selected_gallery_image_id: null,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", user.id)
      .eq("character_id", character.id)
      .eq("selected_gallery_image_id", image.id);
    if (preferenceError) throw preferenceError;

    const { error: deleteError } = await supabase
      .from("character_gallery_images")
      .delete()
      .eq("id", image.id)
      .eq("user_id", user.id)
      .eq("character_id", character.id);
    if (deleteError) throw deleteError;

    await supabase.storage
      .from("character-gallery")
      .remove([image.storage_path])
      .catch(() => undefined);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "GALLERY_ACTION_FAILED"
      },
      { status: 500 }
    );
  }
}
