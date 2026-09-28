import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { activeCharacterReferenceDataUrl } from "@/lib/character-media-reference";
import {
  beginCharacterVideoFallback,
  completeCharacterVideoRequest,
  failCharacterVideoRequest,
  setCharacterVideoQueue,
  startCharacterVideoRequest
} from "@/lib/evercoin";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getCharacterBySlugForUser } from "@/lib/user-characters";
import {
  FALLBACK_VIDEO_MODEL,
  PRIMARY_VIDEO_MODEL,
  VIDEO_DURATION_SECONDS,
  advertisedVideoEverCoinCost,
  quoteEverCoinVideoCost
} from "@/lib/video-pricing";
import {
  cleanupProviderVideo,
  queueProviderVideo,
  retrieveProviderVideo
} from "@/lib/video-routing";

export const runtime = "nodejs";
export const maxDuration = 300;

const VIDEO_LIMIT = 5;
const VIDEO_PROMPT_MAX_CHARACTERS = 1_000;
const VIDEO_DURATIONS = [VIDEO_DURATION_SECONDS] as const;

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
  prompt: string;
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
        prompt: values.prompt,
        duration_seconds: values.durationSeconds,
        provider: "venice",
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

  const completedVideo = await videoResponse(
    videoId,
    values.userId
  );
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
      "request_id,status,video_id,provider_model,provider_queue_id,provider_download_url,error_code,prompt,duration_seconds,evercoin_charge,created_at"
    )
    .eq("request_id", values.requestId)
    .eq("user_id", values.userId)
    .eq("character_id", values.characterId)
    .maybeSingle();

  if (error) throw error;
  return (data as VideoRequestRow | null) ?? null;
}

async function queueAndRecord(values: {
  apiKey: string;
  userId: string;
  requestId: string;
  characterName: string;
  model: string;
  prompt: string;
  durationSeconds: number;
  referenceImage: string;
}) {
  const queued = await queueProviderVideo({
    apiKey: values.apiKey,
    model: values.model,
    characterName: values.characterName,
    prompt: values.prompt,
    durationSeconds: values.durationSeconds,
    referenceImage: values.referenceImage
  });

  const recorded = await setCharacterVideoQueue({
    userId: values.userId,
    requestId: values.requestId,
    providerModel: values.model,
    providerQueueId: queued.queueId,
    providerDownloadUrl: queued.downloadUrl
  });

  if (!recorded) {
    await cleanupProviderVideo({
      apiKey: values.apiKey,
      model: values.model,
      queueId: queued.queueId
    });
    throw new Error("VIDEO_QUEUE_RECORD_FAILED");
  }

  return queued;
}

async function fallbackToWan(values: {
  request: Request;
  apiKey: string;
  userId: string;
  characterId: string;
  characterName: string;
  characterImage: string;
  current: VideoRequestRow;
}) {
  const fallbackPricing = await quoteEverCoinVideoCost(
    FALLBACK_VIDEO_MODEL,
    Number(values.current.duration_seconds)
  );

  if (
    fallbackPricing.source !== "venice" ||
    fallbackPricing.everCoinCost <= 0
  ) {
    if (values.current.provider_queue_id) {
      await cleanupProviderVideo({
        apiKey: values.apiKey,
        model: values.current.provider_model,
        queueId: values.current.provider_queue_id
      });
    }

    await failCharacterVideoRequest({
      userId: values.userId,
      requestId: values.current.request_id,
      errorCode: "VIDEO_FALLBACK_PRICING_UNAVAILABLE"
    });

    return {
      state: "failed" as const,
      error: "VIDEO_GENERATION_FAILED"
    };
  }

  const fallback = await beginCharacterVideoFallback({
    userId: values.userId,
    requestId: values.current.request_id,
    expectedProviderModel: values.current.provider_model,
    fallbackProviderModel: FALLBACK_VIDEO_MODEL,
    newAmount: fallbackPricing.everCoinCost
  });

  if (fallback.status === "insufficient") {
    if (values.current.provider_queue_id) {
      await cleanupProviderVideo({
        apiKey: values.apiKey,
        model: values.current.provider_model,
        queueId: values.current.provider_queue_id
      });
    }

    await failCharacterVideoRequest({
      userId: values.userId,
      requestId: values.current.request_id,
      errorCode:
        fallback.errorCode ||
        "INSUFFICIENT_EVERCOIN_FOR_VIDEO_FALLBACK"
    });

    return {
      state: "insufficient" as const,
      balance: fallback.balance,
      debt: fallback.debt,
      required: fallbackPricing.everCoinCost
    };
  }

  if (fallback.status === "already_fallback") {
    return { state: "processing" as const };
  }

  if (fallback.status !== "claimed") {
    return {
      state: "failed" as const,
      error:
        fallback.errorCode || "VIDEO_FALLBACK_CLAIM_FAILED"
    };
  }

  if (values.current.provider_queue_id) {
    await cleanupProviderVideo({
      apiKey: values.apiKey,
      model: values.current.provider_model,
      queueId: values.current.provider_queue_id
    });
  }

  try {
    const referenceImage =
      await activeCharacterReferenceDataUrl({
        request: values.request,
        userId: values.userId,
        characterId: values.characterId,
        fallbackImage: values.characterImage
      });

    await queueAndRecord({
      apiKey: values.apiKey,
      userId: values.userId,
      requestId: values.current.request_id,
      characterName: values.characterName,
      model: FALLBACK_VIDEO_MODEL,
      prompt: values.current.prompt,
      durationSeconds: Number(values.current.duration_seconds),
      referenceImage
    });

    console.info("EverBond video fallback started:", {
      requestId: values.current.request_id,
      from: values.current.provider_model,
      to: FALLBACK_VIDEO_MODEL,
      everCoinCost: fallbackPricing.everCoinCost
    });

    return { state: "processing" as const };
  } catch (error) {
    await failCharacterVideoRequest({
      userId: values.userId,
      requestId: values.current.request_id,
      errorCode:
        error instanceof Error
          ? error.message.slice(0, 200)
          : "VIDEO_FALLBACK_QUEUE_FAILED"
    }).catch(() => undefined);

    return {
      state: "failed" as const,
      error: "VIDEO_GENERATION_FAILED"
    };
  }
}

async function recoverMissingQueue(values: {
  request: Request;
  apiKey: string;
  userId: string;
  characterId: string;
  characterName: string;
  characterImage: string;
  current: VideoRequestRow;
}) {
  // Historical requests may contain a provider-normalized Grok model string.
  // If it is not our Wan fallback model, treat it as the primary leg and
  // switch to Wan instead of declaring the request unsupported.
  if (
    values.current.provider_model !== PRIMARY_VIDEO_MODEL &&
    values.current.provider_model !== FALLBACK_VIDEO_MODEL
  ) {
    return fallbackToWan(values);
  }

  try {
    const referenceImage =
      await activeCharacterReferenceDataUrl({
        request: values.request,
        userId: values.userId,
        characterId: values.characterId,
        fallbackImage: values.characterImage
      });

    await queueAndRecord({
      apiKey: values.apiKey,
      userId: values.userId,
      requestId: values.current.request_id,
      characterName: values.characterName,
      model: values.current.provider_model,
      prompt: values.current.prompt,
      durationSeconds: Number(values.current.duration_seconds),
      referenceImage
    });

    return { state: "processing" as const };
  } catch (error) {
    if (values.current.provider_model !== FALLBACK_VIDEO_MODEL) {
      return fallbackToWan(values);
    }

    await failCharacterVideoRequest({
      userId: values.userId,
      requestId: values.current.request_id,
      errorCode:
        error instanceof Error
          ? error.message.slice(0, 200)
          : "VIDEO_QUEUE_RECOVERY_FAILED"
    }).catch(() => undefined);

    return {
      state: "failed" as const,
      error: "VIDEO_GENERATION_FAILED"
    };
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "SIGNUP_REQUIRED" },
        { status: 401 }
      );
    }

    const { slug } = await params;
    const character = await getCharacterBySlugForUser(
      slug,
      user.id
    );
    if (!character) {
      return NextResponse.json(
        { error: "CHARACTER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const requestedId =
      new URL(request.url).searchParams.get("requestId");

    if (requestedId) {
      const parsedId = z.string().uuid().safeParse(requestedId);
      if (!parsedId.success) {
        return NextResponse.json(
          { error: "INVALID_REQUEST" },
          { status: 400 }
        );
      }

      let current = await requestRow({
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
          video: await videoResponse(
            current.video_id,
            user.id
          )
        });
      }

      if (current.status === "failed") {
        return NextResponse.json({
          status: "failed",
          error:
            current.error_code || "VIDEO_GENERATION_FAILED"
        });
      }

      const apiKey = process.env.VENICE_API_KEY?.trim();
      if (!apiKey) {
        throw new Error("VENICE_NOT_CONFIGURED");
      }

      if (!current.provider_queue_id) {
        const recovered = await recoverMissingQueue({
          request,
          apiKey,
          userId: user.id,
          characterId: character.id,
          characterName: character.name,
          characterImage: character.image,
          current
        });

        if (recovered.state === "insufficient") {
          return NextResponse.json(
            {
              status: "failed",
              error: "INSUFFICIENT_EVERCOIN",
              balance: recovered.balance,
              debt: recovered.debt,
              required: recovered.required
            },
            { status: 402 }
          );
        }

        return NextResponse.json(
          {
            status:
              recovered.state === "failed"
                ? "failed"
                : "processing"
          },
          {
            headers: {
              "Cache-Control": "private, no-store"
            }
          }
        );
      }

      const retrieved = await retrieveProviderVideo({
        apiKey,
        model: current.provider_model,
        queueId: current.provider_queue_id,
        downloadUrl: current.provider_download_url
      });

      if (retrieved.state === "processing") {
        return NextResponse.json(
          {
            status: "processing",
            averageExecutionTime:
              retrieved.averageExecutionTime ?? 0,
            executionDuration:
              retrieved.executionDuration ?? 0
          },
          {
            headers: {
              "Cache-Control": "private, no-store"
            }
          }
        );
      }

      if (retrieved.state === "failed") {
        if (current.provider_model !== FALLBACK_VIDEO_MODEL) {
          const fallback = await fallbackToWan({
            request,
            apiKey,
            userId: user.id,
            characterId: character.id,
            characterName: character.name,
            characterImage: character.image,
            current
          });

          if (fallback.state === "insufficient") {
            return NextResponse.json(
              {
                status: "failed",
                error: "INSUFFICIENT_EVERCOIN",
                balance: fallback.balance,
                debt: fallback.debt,
                required: fallback.required
              },
              { status: 402 }
            );
          }

          return NextResponse.json(
            {
              status:
                fallback.state === "failed"
                  ? "failed"
                  : "processing"
            },
            {
              headers: {
                "Cache-Control": "private, no-store"
              }
            }
          );
        }

        await failCharacterVideoRequest({
          userId: user.id,
          requestId: current.request_id,
          errorCode: retrieved.errorCode
        });

        await cleanupProviderVideo({
          apiKey,
          model: current.provider_model,
          queueId: current.provider_queue_id
        });

        return NextResponse.json({
          status: "failed",
          error: "VIDEO_GENERATION_FAILED"
        });
      }

      const video = await finalizeVideo({
        userId: user.id,
        requestId: current.request_id,
        characterId: character.id,
        prompt: current.prompt,
        durationSeconds: Number(current.duration_seconds),
        model: current.provider_model,
        cost: Number(current.evercoin_charge),
        bytes: retrieved.bytes
      });

      await cleanupProviderVideo({
        apiKey,
        model: current.provider_model,
        queueId: current.provider_queue_id
      });

      return NextResponse.json(
        { status: "completed", video },
        {
          headers: {
            "Cache-Control": "private, no-store"
          }
        }
      );
    }

    const supabase = getSupabaseServiceClient();
    const [videosResult, pendingResult] =
      await Promise.all([
        supabase
          .from("character_gallery_videos")
          .select(
            "id,storage_path,prompt,duration_seconds,created_at"
          )
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
      ((videosResult.data ?? []) as VideoRow[]).map(
        async (video) => ({
          id: video.id,
          prompt: video.prompt,
          durationSeconds: Number(video.duration_seconds),
          createdAt: video.created_at,
          url: await signedVideoUrl(video.storage_path)
        })
      )
    );

    const advertisedCost = advertisedVideoEverCoinCost();
    const pricingConfigured = Boolean(
      process.env.VENICE_API_KEY?.trim()
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

        // Public UI advertises ~155 EC. The exact amount is intentionally
        // calculated only when Generate is pressed from a fresh provider quote.
        videoCost: advertisedCost,
        videoDisplayCost: advertisedCost,
        pricingConfigured,

        pendingRequestId:
          pendingResult.data?.request_id ?? null,
        durationOptions: VIDEO_DURATIONS
      },
      {
        headers: {
          "Cache-Control": "private, no-store"
        }
      }
    );
  } catch (error) {
    console.error(
      "Character video gallery request failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "VIDEO_GALLERY_LOAD_FAILED"
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
  let queuedModel = "";
  let queuedId = "";

  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "SIGNUP_REQUIRED" },
        { status: 401 }
      );
    }
    userId = user.id;

    const parsed = GenerateBody.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_PROMPT" },
        { status: 400 }
      );
    }
    requestId = parsed.data.requestId;

    // Quote Grok first. A quote/schema/provider failure is itself a primary
    // failure, so route directly to Wan instead of returning a 503 to users.
    const primaryPricing = await quoteEverCoinVideoCost(
      PRIMARY_VIDEO_MODEL,
      parsed.data.durationSeconds
    );

    let initialModel = PRIMARY_VIDEO_MODEL;
    let pricing = primaryPricing;

    if (
      primaryPricing.source !== "venice" ||
      primaryPricing.everCoinCost <= 0
    ) {
      const fallbackPricing = await quoteEverCoinVideoCost(
        FALLBACK_VIDEO_MODEL,
        parsed.data.durationSeconds
      );

      if (
        fallbackPricing.source !== "venice" ||
        fallbackPricing.everCoinCost <= 0
      ) {
        return NextResponse.json(
          { error: "VIDEO_PRICING_NOT_CONFIGURED" },
          { status: 503 }
        );
      }

      initialModel = FALLBACK_VIDEO_MODEL;
      pricing = fallbackPricing;
    }

    const cost = pricing.everCoinCost;

    const { slug } = await params;
    const character = await getCharacterBySlugForUser(
      slug,
      user.id
    );
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
      prompt: parsed.data.prompt,
      durationSeconds: parsed.data.durationSeconds,
      amount: cost,
      galleryLimit: VIDEO_LIMIT,
      providerModel: initialModel
    });

    if (claim.status === "completed" && claim.videoId) {
      return NextResponse.json({
        status: "completed",
        video: await videoResponse(
          claim.videoId,
          user.id
        ),
        duplicate: true
      });
    }

    if (claim.status === "processing") {
      return NextResponse.json(
        {
          status: "processing",
          requestId,
          duplicate: true
        },
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
          error:
            claim.errorCode ||
            "INSUFFICIENT_EVERCOIN",
          balance: claim.balance,
          debt: claim.debt,
          required: cost
        },
        { status: 402 }
      );
    }

    if (claim.status !== "claimed") {
      return NextResponse.json(
        {
          error:
            claim.errorCode ||
            "VIDEO_REQUEST_FAILED"
        },
        { status: 409 }
      );
    }

    const apiKey = process.env.VENICE_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("VENICE_NOT_CONFIGURED");
    }

    const referenceImage =
      await activeCharacterReferenceDataUrl({
        request,
        userId: user.id,
        characterId: character.id,
        fallbackImage: character.image
      });

    try {
      const queued = await queueAndRecord({
        apiKey,
        userId: user.id,
        requestId,
        characterName: character.name,
        model: initialModel,
        prompt: parsed.data.prompt,
        durationSeconds: parsed.data.durationSeconds,
        referenceImage
      });

      queuedModel = queued.model;
      queuedId = queued.queueId;

      return NextResponse.json(
        {
          status: "processing",
          requestId,
          everCoinCost: cost,
          fallback: initialModel === FALLBACK_VIDEO_MODEL
        },
        {
          status: 202,
          headers: {
            "Cache-Control": "private, no-store"
          }
        }
      );
    } catch (primaryError) {
      // If we already started directly on Wan because the Grok quote failed,
      // there is no second provider to fall back to. Fail/refund normally.
      if (initialModel === FALLBACK_VIDEO_MODEL) {
        throw primaryError;
      }

      console.warn(
        "Grok video attempt did not produce a queue; switching to Wan:",
        primaryError
      );

      const current = await requestRow({
        userId: user.id,
        characterId: character.id,
        requestId
      });

      if (!current) {
        throw primaryError;
      }

      const fallback = await fallbackToWan({
        request,
        apiKey,
        userId: user.id,
        characterId: character.id,
        characterName: character.name,
        characterImage: character.image,
        current
      });

      if (fallback.state === "insufficient") {
        return NextResponse.json(
          {
            error: "INSUFFICIENT_EVERCOIN",
            balance: fallback.balance,
            debt: fallback.debt,
            required: fallback.required
          },
          { status: 402 }
        );
      }

      if (fallback.state === "failed") {
        return NextResponse.json(
          { error: "VIDEO_GENERATION_FAILED" },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          status: "processing",
          requestId,
          fallback: true
        },
        {
          status: 202,
          headers: {
            "Cache-Control": "private, no-store"
          }
        }
      );
    }
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

    const apiKey = process.env.VENICE_API_KEY?.trim();
    if (apiKey && queuedModel && queuedId) {
      await cleanupProviderVideo({
        apiKey,
        model: queuedModel,
        queueId: queuedId
      });
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
      return NextResponse.json(
        { error: "SIGNUP_REQUIRED" },
        { status: 401 }
      );
    }

    const parsed = DeleteBody.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    const { slug } = await params;
    const character = await getCharacterBySlugForUser(
      slug,
      user.id
    );
    if (!character) {
      return NextResponse.json(
        { error: "CHARACTER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const supabase = getSupabaseServiceClient();
    const { data: video, error: lookupError } =
      await supabase
        .from("character_gallery_videos")
        .select("id,storage_path")
        .eq("id", parsed.data.videoId)
        .eq("user_id", user.id)
        .eq("character_id", character.id)
        .maybeSingle();

    if (lookupError) throw lookupError;
    if (!video) {
      return NextResponse.json(
        { error: "VIDEO_NOT_FOUND" },
        { status: 404 }
      );
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
          error instanceof Error
            ? error.message
            : "VIDEO_GALLERY_ACTION_FAILED"
      },
      { status: 500 }
    );
  }
}
