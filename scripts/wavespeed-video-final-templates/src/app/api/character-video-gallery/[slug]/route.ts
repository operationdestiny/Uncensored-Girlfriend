import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { activeCharacterReferenceDataUrl } from "@/lib/character-media-reference";
import {
  completeCharacterVideoRequest,
  failCharacterVideoRequest,
  setCharacterVideoQueue,
  startCharacterVideoRequest
} from "@/lib/evercoin";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getCharacterBySlugForUser } from "@/lib/user-characters";
import {
  VIDEO_DURATION_SECONDS,
  VIDEO_EVERCOIN_COST,
  VIDEO_INTERNAL_PROMPT,
  VIDEO_LIMIT,
  WAVESPEED_VIDEO_MODEL,
  queueWaveSpeedVideo,
  retrieveWaveSpeedVideo
} from "@/lib/wavespeed-video";

export const runtime = "nodejs";
export const maxDuration = 300;

const GenerateBody = z
  .object({
    requestId: z.string().uuid()
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
  duration_seconds: number | string;
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
  duration_seconds: number | string;
  evercoin_charge: number | string;
  created_at: string;
};

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
    .select("id,storage_path,duration_seconds,created_at")
    .eq("id", videoId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const video = data as VideoRow;
  return {
    id: video.id,
    durationSeconds: Number(video.duration_seconds),
    createdAt: video.created_at,
    url: await signedVideoUrl(video.storage_path)
  };
}

async function finalizeVideo(values: {
  userId: string;
  requestId: string;
  characterId: string;
  bytes: Buffer;
}) {
  const videoId = values.requestId;
  const storagePath =
    `${values.userId}/${values.characterId}/${videoId}.mp4`;
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
        prompt: VIDEO_INTERNAL_PROMPT,
        duration_seconds: VIDEO_DURATION_SECONDS,
        provider: "wavespeed",
        model: WAVESPEED_VIDEO_MODEL,
        evercoin_charge: VIDEO_EVERCOIN_COST
      },
      { onConflict: "id" }
    );

  if (upsertError) {
    await supabase.storage
      .from("character-videos")
      .remove([storagePath])
      .catch(() => undefined);
    throw upsertError;
  }

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
  if (!completedVideo) {
    throw new Error("VIDEO_NOT_FOUND_AFTER_COMPLETION");
  }

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
      "request_id,status,video_id,provider_model,provider_queue_id,provider_download_url,error_code,duration_seconds,evercoin_charge,created_at"
    )
    .eq("request_id", values.requestId)
    .eq("user_id", values.userId)
    .eq("character_id", values.characterId)
    .maybeSingle();

  if (error) throw error;
  return (data as VideoRequestRow | null) ?? null;
}

async function failAndReturn(values: {
  userId: string;
  requestId: string;
  errorCode: string;
}) {
  await failCharacterVideoRequest(values).catch(() => undefined);
  return NextResponse.json({
    status: "failed",
    error: "VIDEO_GENERATION_FAILED"
  });
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

      const apiKey = process.env.WAVESPEED_API_KEY?.trim();
      if (!apiKey) {
        return NextResponse.json(
          { error: "VIDEO_PROVIDER_NOT_CONFIGURED" },
          { status: 503 }
        );
      }

      if (current.provider_model !== WAVESPEED_VIDEO_MODEL) {
        return failAndReturn({
          userId: user.id,
          requestId: current.request_id,
          errorCode: "VIDEO_PROVIDER_RETIRED"
        });
      }

      if (!current.provider_queue_id) {
        // WaveSpeed warns against blindly resubmitting generation POSTs because
        // a disconnected response can still represent an accepted/billed job.
        // Refund the EverCoin reservation rather than risk a duplicate charge.
        return failAndReturn({
          userId: user.id,
          requestId: current.request_id,
          errorCode: "VIDEO_QUEUE_ID_MISSING"
        });
      }

      const retrieved = await retrieveWaveSpeedVideo({
        apiKey,
        predictionId: current.provider_queue_id,
        resultUrl: current.provider_download_url
      });

      if (retrieved.state === "processing") {
        return NextResponse.json(
          { status: "processing" },
          { headers: { "Cache-Control": "private, no-store" } }
        );
      }

      if (retrieved.state === "failed") {
        return failAndReturn({
          userId: user.id,
          requestId: current.request_id,
          errorCode: retrieved.errorCode
        });
      }

      const video = await finalizeVideo({
        userId: user.id,
        requestId: current.request_id,
        characterId: character.id,
        bytes: retrieved.bytes
      });

      return NextResponse.json({ status: "completed", video });
    }

    const supabase = getSupabaseServiceClient();
    const [{ data: rows, error: videoError }, { data: pending, error: pendingError }] =
      await Promise.all([
        supabase
          .from("character_gallery_videos")
          .select("id,storage_path,duration_seconds,created_at")
          .eq("user_id", user.id)
          .eq("character_id", character.id)
          .order("created_at", { ascending: false })
          .limit(VIDEO_LIMIT),
        supabase
          .from("character_video_requests")
          .select("request_id")
          .eq("user_id", user.id)
          .eq("character_id", character.id)
          .eq("status", "processing")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle()
      ]);

    if (videoError) throw videoError;
    if (pendingError) throw pendingError;

    const videos = await Promise.all(
      ((rows ?? []) as VideoRow[]).map(async (video) => ({
        id: video.id,
        durationSeconds: Number(video.duration_seconds),
        createdAt: video.created_at,
        url: await signedVideoUrl(video.storage_path)
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
        videos,
        limit: VIDEO_LIMIT,
        videoCost: VIDEO_EVERCOIN_COST,
        pricingConfigured: Boolean(process.env.WAVESPEED_API_KEY?.trim()),
        pendingRequestId:
          typeof pending?.request_id === "string" ? pending.request_id : null
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("Character video gallery GET failed:", error);
    return NextResponse.json(
      { error: "VIDEO_GALLERY_FAILED" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  let userId: string | null = null;
  let requestId: string | null = null;
  let claimed = false;

  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "SIGNUP_REQUIRED" }, { status: 401 });
    }
    userId = user.id;

    const apiKey = process.env.WAVESPEED_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "VIDEO_PROVIDER_NOT_CONFIGURED" },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = GenerateBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
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

    const claim = await startCharacterVideoRequest({
      userId: user.id,
      requestId,
      characterId: character.id,
      prompt: VIDEO_INTERNAL_PROMPT,
      durationSeconds: VIDEO_DURATION_SECONDS,
      amount: VIDEO_EVERCOIN_COST,
      galleryLimit: VIDEO_LIMIT,
      providerModel: WAVESPEED_VIDEO_MODEL
    });

    if (claim.status === "completed" && claim.videoId) {
      return NextResponse.json({
        status: "completed",
        video: await videoResponse(claim.videoId, user.id)
      });
    }

    if (claim.status === "processing") {
      return NextResponse.json(
        {
          status: "processing",
          requestId,
          everCoinCost: VIDEO_EVERCOIN_COST
        },
        { status: 202 }
      );
    }

    if (claim.status === "insufficient") {
      return NextResponse.json(
        {
          error: claim.errorCode || "INSUFFICIENT_EVERCOIN",
          balance: claim.balance,
          debt: claim.debt,
          required: VIDEO_EVERCOIN_COST
        },
        { status: 402 }
      );
    }

    if (claim.status === "limit_reached") {
      return NextResponse.json(
        { error: "VIDEO_LIMIT_REACHED" },
        { status: 409 }
      );
    }

    if (claim.status === "busy") {
      return NextResponse.json(
        { error: "VIDEO_REQUEST_IN_PROGRESS" },
        { status: 409 }
      );
    }

    if (claim.status !== "claimed") {
      return NextResponse.json(
        { error: claim.errorCode || "VIDEO_REQUEST_FAILED" },
        { status: 400 }
      );
    }
    claimed = true;

    const referenceImageDataUrl = await activeCharacterReferenceDataUrl({
      request,
      userId: user.id,
      characterId: character.id,
      fallbackImage: character.image
    });

    const queued = await queueWaveSpeedVideo({
      apiKey,
      referenceImageDataUrl
    });

    const recorded = await setCharacterVideoQueue({
      userId: user.id,
      requestId,
      providerModel: WAVESPEED_VIDEO_MODEL,
      providerQueueId: queued.predictionId,
      providerDownloadUrl: queued.resultUrl
    });

    if (!recorded) {
      throw new Error("VIDEO_QUEUE_RECORD_FAILED");
    }

    return NextResponse.json(
      {
        status: "processing",
        requestId,
        everCoinCost: VIDEO_EVERCOIN_COST
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("Character video generation failed:", error);

    if (claimed && userId && requestId) {
      await failCharacterVideoRequest({
        userId,
        requestId,
        errorCode:
          error instanceof Error
            ? error.message.slice(0, 200)
            : "VIDEO_GENERATION_FAILED"
      }).catch(() => undefined);
    }

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

    const body = await request.json().catch(() => null);
    const parsed = DeleteBody.safeParse(body);
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

    const { error: removeError } = await supabase.storage
      .from("character-videos")
      .remove([video.storage_path]);
    if (removeError) throw removeError;

    const { error: deleteError } = await supabase
      .from("character_gallery_videos")
      .delete()
      .eq("id", parsed.data.videoId)
      .eq("user_id", user.id)
      .eq("character_id", character.id);
    if (deleteError) throw deleteError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Character video delete failed:", error);
    return NextResponse.json(
      { error: "VIDEO_DELETE_FAILED" },
      { status: 500 }
    );
  }
}
