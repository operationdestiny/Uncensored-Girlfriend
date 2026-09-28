import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { activeCharacterReferenceDataUrl } from "@/lib/character-media-reference";
import {
  completeCharacterVideoRequest,
  everCoinVideoCost,
  failCharacterVideoRequest,
  setCharacterVideoQueue,
  startCharacterVideoRequest
} from "@/lib/evercoin";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getCharacterBySlugForUser } from "@/lib/user-characters";
import {
  downloadWaveSpeedOutput,
  getWaveSpeedPrediction,
  submitWaveSpeedPrediction,
  wavespeedApiKey
} from "@/lib/wavespeed-media";

export const runtime = "nodejs";
export const maxDuration = 300;

const VIDEO_LIMIT = 5;
const VIDEO_PROMPT_MAX_CHARACTERS = 1_000;
const MAX_GENERATED_VIDEO_BYTES = 100 * 1024 * 1024;
const VIDEO_DURATIONS = [8] as const;
const DEFAULT_VIDEO_MODEL = "bytedance/seedance-v1.5-pro/image-to-video-spicy";
const VIDEO_CONTENT_TYPES = new Set(["video/mp4", "application/octet-stream"]);

const GenerateBody = z
  .object({
    requestId: z.string().uuid(),
    prompt: z.string().trim().min(3).max(VIDEO_PROMPT_MAX_CHARACTERS),
    durationSeconds: z.literal(VIDEO_DURATIONS[0])
  })
  .strict();

const DeleteBody = z
  .object({
    action: z.literal("delete"),
    videoId: z.string().uuid()
  })
  .strict();

type VideoRow = {
  id: string;
  storage_path: string;
  prompt: string;
  duration_seconds: number;
  created_at: string;
};

type VideoRequestRow = {
  request_id: string;
  status: "processing" | "completed" | "failed";
  video_id: string | null;
  provider_model: string;
  provider_queue_id: string | null;
  provider_download_url: string | null;
  error_code: string | null;
  created_at: string;
};

function videoModel() {
  return process.env.WAVESPEED_VIDEO_MODEL?.trim() || DEFAULT_VIDEO_MODEL;
}

function videoResolution() {
  const value = process.env.WAVESPEED_VIDEO_RESOLUTION?.trim().toLowerCase();
  return new Set(["480p", "720p", "1080p"]).has(value || "")
    ? value!
    : "720p";
}

function videoAspectRatio() {
  const value = process.env.WAVESPEED_VIDEO_ASPECT_RATIO?.trim();
  return new Set(["1:1", "3:4", "4:3", "9:16", "16:9", "21:9"]).has(
    value || ""
  )
    ? value!
    : "9:16";
}

function naturalMotionPrompt(characterName: string, userPrompt: string) {
  return (
    `The input image is the exact fictional adult character ${characterName}. ` +
    "Preserve the same recognizable face, adult age appearance, hair, body proportions, anatomy, skin tone, scene, lighting, and overall identity throughout the entire clip. " +
    "Animate one continuous realistic shot with natural body movement, hand movement, gravity, and fabric physics. " +
    "If clothing is visibly already being opened, lifted, lowered, pulled aside, or removed in the input image, or the user request clearly asks for that clothing action, continue it gradually and naturally. " +
    "Hands should interact with the garment, fabric should slide and fold progressively, and any change in coverage should happen in small continuous steps. " +
    "Do not rip, tear, snap, teleport, dissolve, instantly remove, or abruptly replace clothing. Do not begin unrelated clothing changes that are neither requested nor already underway. " +
    "Keep motion physically coherent: no face drift, body morphing, extra limbs or fingers, abrupt pose jumps, jump cuts, sudden scene changes, or wardrobe teleportation. " +
    `User direction: ${userPrompt}`
  );
}

async function signedVideoUrl(path: string) {
  const { data, error } = await getSupabaseServiceClient()
    .storage.from("character-videos")
    .createSignedUrl(path, 60 * 60);

  if (error) throw error;
  return data.signedUrl;
}

async function videoResponse(videoId: string, userId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from("character_gallery_videos")
    .select("id,storage_path,prompt,duration_seconds,created_at")
    .eq("id", videoId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const video = data as VideoRow;
  return {
    id: video.id,
    prompt: video.prompt,
    durationSeconds: Number(video.duration_seconds),
    createdAt: video.created_at,
    url: await signedVideoUrl(video.storage_path)
  };
}

async function retrieveProviderVideo(values: {
  apiKey: string;
  queueId: string;
}) {
  try {
    const prediction = await getWaveSpeedPrediction({
      apiKey: values.apiKey,
      predictionId: values.queueId,
      timeoutMs: 30_000
    });

    if (prediction.status === "completed") {
      const outputUrl = prediction.outputs[0];
      if (!outputUrl) {
        return {
          state: "failed" as const,
          errorCode: "VIDEO_PROVIDER_OUTPUT_MISSING"
        };
      }

      try {
        const downloaded = await downloadWaveSpeedOutput({
          url: outputUrl,
          maximumBytes: MAX_GENERATED_VIDEO_BYTES,
          allowedContentTypes: VIDEO_CONTENT_TYPES,
          fallbackContentType: "video/mp4",
          timeoutMs: 120_000
        });
        return { state: "completed" as const, bytes: downloaded.bytes };
      } catch (error) {
        return {
          state: "failed" as const,
          errorCode:
            error instanceof Error ? error.message : "VIDEO_DOWNLOAD_FAILED"
        };
      }
    }

    if (
      prediction.status === "failed" ||
      prediction.status === "cancelled" ||
      prediction.status === "timeout"
    ) {
      return {
        state: "failed" as const,
        errorCode:
          prediction.error || `VIDEO_PROVIDER_${prediction.status.toUpperCase()}`
      };
    }

    const rawInference = Number(prediction.timings?.inference ?? 0);
    const executionDuration = Number.isFinite(rawInference)
      ? rawInference > 100
        ? rawInference / 1000
        : rawInference
      : 0;

    return {
      state: "processing" as const,
      averageExecutionTime: 0,
      executionDuration
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/WAVESPEED_RESULT_FAILED:(400|401|402|403|404|410|422):/.test(message)) {
      return { state: "failed" as const, errorCode: message.slice(0, 200) };
    }

    // Temporary result-query failures should not refund a still-running job.
    return {
      state: "processing" as const,
      averageExecutionTime: 0,
      executionDuration: 0
    };
  }
}

async function finalizeVideo(values: {
  userId: string;
  requestId: string;
  characterId: string;
  prompt: string;
  durationSeconds: number;
  model: string;
  cost: number;
  bytes: Buffer;
}) {
  const videoId = values.requestId;
  const storagePath = `${values.userId}/${values.characterId}/${videoId}.mp4`;
  const supabase = getSupabaseServiceClient();

  const upload = await supabase.storage
    .from("character-videos")
    .upload(storagePath, values.bytes, {
      contentType: "video/mp4",
      cacheControl: "31536000",
      upsert: true
    });
  if (upload.error) throw upload.error;

  const { error: upsertError } = await supabase
    .from("character_gallery_videos")
    .upsert(
      {
        id: videoId,
        user_id: values.userId,
        character_id: values.characterId,
        storage_path: storagePath,
        prompt: values.prompt,
        duration_seconds: values.durationSeconds,
        provider: "wavespeed",
        model: values.model,
        evercoin_charge: values.cost
      },
      { onConflict: "id" }
    );
  if (upsertError) throw upsertError;

  const completed = await completeCharacterVideoRequest({
    userId: values.userId,
    requestId: values.requestId,
    videoId
  });

  if (!completed) {
    await supabase
      .from("character_gallery_videos")
      .delete()
      .eq("id", videoId)
      .eq("user_id", values.userId);
    await supabase.storage
      .from("character-videos")
      .remove([storagePath])
      .catch(() => undefined);
    throw new Error("VIDEO_REQUEST_COMPLETION_FAILED");
  }

  const completedVideo = await videoResponse(videoId, values.userId);
  if (!completedVideo) throw new Error("VIDEO_NOT_FOUND_AFTER_COMPLETION");
  return completedVideo;
}

async function requestRow(values: {
  userId: string;
  characterId: string;
  requestId: string;
}) {
  const { data, error } = await getSupabaseServiceClient()
    .from("character_video_requests")
    .select(
      "request_id,status,video_id,provider_model,provider_queue_id,provider_download_url,error_code,created_at"
    )
    .eq("request_id", values.requestId)
    .eq("user_id", values.userId)
    .eq("character_id", values.characterId)
    .maybeSingle();

  if (error) throw error;
  return (data as VideoRequestRow | null) ?? null;
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

    const requestedId = new URL(request.url).searchParams.get("requestId");
    if (requestedId) {
      const parsedId = z.string().uuid().safeParse(requestedId);
      if (!parsedId.success) {
        return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
      }

      const current = await requestRow({
        userId: user.id,
        characterId: character.id,
        requestId: parsedId.data
      });
      if (!current) {
        return NextResponse.json(
          { error: "VIDEO_REQUEST_NOT_FOUND" },
          { status: 404 }
        );
      }

      if (current.status === "completed" && current.video_id) {
        return NextResponse.json({
          status: "completed",
          video: await videoResponse(current.video_id, user.id)
        });
      }

      if (current.status === "failed") {
        return NextResponse.json({
          status: "failed",
          error: current.error_code || "VIDEO_GENERATION_FAILED"
        });
      }

      if (!current.provider_queue_id) {
        return NextResponse.json({ status: "processing" });
      }

      const apiKey = wavespeedApiKey();
      if (!apiKey) throw new Error("WAVESPEED_NOT_CONFIGURED");

      const retrieved = await retrieveProviderVideo({
        apiKey,
        queueId: current.provider_queue_id
      });

      if (retrieved.state === "processing") {
        return NextResponse.json(
          {
            status: "processing",
            averageExecutionTime: retrieved.averageExecutionTime ?? 0,
            executionDuration: retrieved.executionDuration ?? 0
          },
          { headers: { "Cache-Control": "private, no-store" } }
        );
      }

      if (retrieved.state === "failed") {
        await failCharacterVideoRequest({
          userId: user.id,
          requestId: current.request_id,
          errorCode: retrieved.errorCode
        });

        return NextResponse.json({
          status: "failed",
          error: "VIDEO_GENERATION_FAILED"
        });
      }

      const { data: requestDetails, error: requestDetailsError } =
        await getSupabaseServiceClient()
          .from("character_video_requests")
          .select("prompt,duration_seconds,evercoin_charge")
          .eq("request_id", current.request_id)
          .eq("user_id", user.id)
          .single();
      if (requestDetailsError) throw requestDetailsError;

      const video = await finalizeVideo({
        userId: user.id,
        requestId: current.request_id,
        characterId: character.id,
        prompt: requestDetails.prompt,
        durationSeconds: Number(requestDetails.duration_seconds),
        model: current.provider_model,
        cost: Number(requestDetails.evercoin_charge),
        bytes: retrieved.bytes
      });

      return NextResponse.json(
        { status: "completed", video },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }

    const supabase = getSupabaseServiceClient();
    const [videosResult, pendingResult] = await Promise.all([
      supabase
        .from("character_gallery_videos")
        .select("id,storage_path,prompt,duration_seconds,created_at")
        .eq("user_id", user.id)
        .eq("character_id", character.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("character_video_requests")
        .select("request_id,created_at")
        .eq("user_id", user.id)
        .eq("character_id", character.id)
        .eq("status", "processing")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    if (videosResult.error) throw videosResult.error;
    if (pendingResult.error) throw pendingResult.error;

    const videos = await Promise.all(
      ((videosResult.data ?? []) as VideoRow[]).map(async (video) => ({
        id: video.id,
        prompt: video.prompt,
        durationSeconds: Number(video.duration_seconds),
        createdAt: video.created_at,
        url: await signedVideoUrl(video.storage_path)
      }))
    );

    const cost = everCoinVideoCost();
    return NextResponse.json(
      {
        character: {
          id: character.id,
          slug: character.slug,
          name: character.name,
          image: character.image
        },
        videos,
        limit: VIDEO_LIMIT,
        videoCost: cost,
        pricingConfigured: cost > 0,
        pendingRequestId: pendingResult.data?.request_id ?? null,
        durationOptions: VIDEO_DURATIONS
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("Character video gallery request failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "VIDEO_GALLERY_LOAD_FAILED"
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

    const cost = everCoinVideoCost();
    if (cost <= 0) {
      return NextResponse.json(
        { error: "VIDEO_PRICING_NOT_CONFIGURED" },
        { status: 503 }
      );
    }

    const { slug } = await params;
    const character = await getCharacterBySlugForUser(slug, user.id);
    if (!character) {
      return NextResponse.json(
        { error: "CHARACTER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const model = videoModel();
    const claim = await startCharacterVideoRequest({
      userId: user.id,
      requestId,
      characterId: character.id,
      prompt: parsed.data.prompt,
      durationSeconds: parsed.data.durationSeconds,
      amount: cost,
      galleryLimit: VIDEO_LIMIT,
      providerModel: model
    });

    if (claim.status === "completed" && claim.videoId) {
      return NextResponse.json({
        status: "completed",
        video: await videoResponse(claim.videoId, user.id),
        duplicate: true
      });
    }

    if (claim.status === "processing" && claim.providerQueueId) {
      return NextResponse.json(
        { status: "processing", requestId, duplicate: true },
        { status: 202 }
      );
    }

    if (claim.status === "busy") {
      return NextResponse.json(
        { error: "VIDEO_REQUEST_IN_PROGRESS" },
        { status: 409 }
      );
    }

    if (claim.status === "limit_reached") {
      return NextResponse.json(
        { error: "VIDEO_LIMIT_REACHED" },
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
        { error: claim.errorCode || "VIDEO_REQUEST_FAILED" },
        { status: 409 }
      );
    }

    const apiKey = wavespeedApiKey();
    if (!apiKey) throw new Error("WAVESPEED_NOT_CONFIGURED");

    const referenceImage = await activeCharacterReferenceDataUrl({
      request,
      userId: user.id,
      characterId: character.id,
      fallbackImage: character.image
    });

    const submitted = await submitWaveSpeedPrediction({
      apiKey,
      model,
      input: {
        image: referenceImage,
        prompt: naturalMotionPrompt(character.name, parsed.data.prompt),
        duration: parsed.data.durationSeconds,
        resolution: videoResolution(),
        aspect_ratio: videoAspectRatio(),
        generate_audio: false,
        camera_fixed: false,
        seed: -1
      },
      timeoutMs: 60_000
    });

    const recorded = await setCharacterVideoQueue({
      userId: user.id,
      requestId,
      providerModel: submitted.model,
      providerQueueId: submitted.id,
      providerDownloadUrl: null
    });
    if (!recorded) throw new Error("VIDEO_QUEUE_RECORD_FAILED");

    return NextResponse.json(
      { status: "processing", requestId },
      {
        status: 202,
        headers: { "Cache-Control": "private, no-store" }
      }
    );
  } catch (error) {
    const errorCode =
      error instanceof Error
        ? error.message.slice(0, 200)
        : "VIDEO_GENERATION_FAILED";

    if (userId && requestId) {
      await failCharacterVideoRequest({
        userId,
        requestId,
        errorCode
      }).catch(() => undefined);
    }

    console.error("Character video queue failed:", error);
    return NextResponse.json(
      { error: "VIDEO_GENERATION_FAILED" },
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

    const parsed = DeleteBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
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
    const { data: video, error: lookupError } = await supabase
      .from("character_gallery_videos")
      .select("id,storage_path")
      .eq("id", parsed.data.videoId)
      .eq("user_id", user.id)
      .eq("character_id", character.id)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!video) {
      return NextResponse.json({ error: "VIDEO_NOT_FOUND" }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("character_gallery_videos")
      .delete()
      .eq("id", video.id)
      .eq("user_id", user.id)
      .eq("character_id", character.id);
    if (deleteError) throw deleteError;

    await supabase.storage
      .from("character-videos")
      .remove([video.storage_path])
      .catch(() => undefined);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "VIDEO_GALLERY_ACTION_FAILED"
      },
      { status: 500 }
    );
  }
}
