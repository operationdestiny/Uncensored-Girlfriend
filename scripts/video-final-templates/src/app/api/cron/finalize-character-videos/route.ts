import { NextResponse } from "next/server";
import { activeCharacterReferenceDataUrl } from "@/lib/character-media-reference";
import {
  beginCharacterVideoFallback,
  completeCharacterVideoRequest,
  failCharacterVideoRequest,
  setCharacterVideoQueue
} from "@/lib/evercoin";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  FALLBACK_VIDEO_MODEL,
  PRIMARY_VIDEO_MODEL,
  quoteEverCoinVideoCost
} from "@/lib/video-pricing";
import {
  cleanupProviderVideo,
  queueProviderVideo,
  retrieveProviderVideo
} from "@/lib/video-routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_LIMIT = 5;

type PendingVideoRequest = {
  request_id: string;
  user_id: string;
  character_id: string;
  prompt: string;
  duration_seconds: number | string;
  evercoin_charge: number | string;
  provider_model: string;
  provider_queue_id: string | null;
  provider_download_url: string | null;
};

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  return (
    request.headers.get("authorization") ===
    `Bearer ${secret}`
  );
}

function syntheticSiteRequest() {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://everbond.ai";

  return new Request(site);
}

async function characterFallbackImage(characterId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from("characters")
    .select(
      "image_url,image_storage_path,image_file,category"
    )
    .eq("id", characterId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("CHARACTER_NOT_FOUND");
  }

  if (
    typeof data.image_url === "string" &&
    data.image_url.trim()
  ) {
    return data.image_url;
  }

  if (
    typeof data.image_storage_path === "string" &&
    data.image_storage_path.trim()
  ) {
    return `/character-assets/${data.image_storage_path}`;
  }

  return `/character-assets/${String(
    data.category || "everbond-girls"
  )}/${String(data.image_file || "")}`;
}

async function activeReference(request: PendingVideoRequest) {
  return activeCharacterReferenceDataUrl({
    request: syntheticSiteRequest(),
    userId: request.user_id,
    characterId: request.character_id,
    fallbackImage: await characterFallbackImage(
      request.character_id
    )
  });
}

async function queueAndRecord(
  request: PendingVideoRequest,
  apiKey: string
) {
  const queued = await queueProviderVideo({
    apiKey,
    model: request.provider_model,
    characterName: "the companion",
    prompt: request.prompt,
    durationSeconds: Number(request.duration_seconds),
    referenceImage: await activeReference(request)
  });

  const recorded = await setCharacterVideoQueue({
    userId: request.user_id,
    requestId: request.request_id,
    providerModel: request.provider_model,
    providerQueueId: queued.queueId,
    providerDownloadUrl: queued.downloadUrl
  });

  if (!recorded) {
    await cleanupProviderVideo({
      apiKey,
      model: request.provider_model,
      queueId: queued.queueId
    });
    throw new Error("VIDEO_QUEUE_RECORD_FAILED");
  }
}

async function beginWanFallback(
  request: PendingVideoRequest,
  apiKey: string
) {
  const pricing = await quoteEverCoinVideoCost(
    FALLBACK_VIDEO_MODEL,
    Number(request.duration_seconds)
  );

  if (
    pricing.source !== "venice" ||
    pricing.everCoinCost <= 0
  ) {
    if (request.provider_queue_id) {
      await cleanupProviderVideo({
        apiKey,
        model: request.provider_model,
        queueId: request.provider_queue_id
      });
    }

    await failCharacterVideoRequest({
      userId: request.user_id,
      requestId: request.request_id,
      errorCode: "VIDEO_FALLBACK_PRICING_UNAVAILABLE"
    });

    return "failed" as const;
  }

  const fallback = await beginCharacterVideoFallback({
    userId: request.user_id,
    requestId: request.request_id,
    expectedProviderModel: request.provider_model,
    fallbackProviderModel: FALLBACK_VIDEO_MODEL,
    newAmount: pricing.everCoinCost
  });

  if (fallback.status === "insufficient") {
    if (request.provider_queue_id) {
      await cleanupProviderVideo({
        apiKey,
        model: request.provider_model,
        queueId: request.provider_queue_id
      });
    }

    await failCharacterVideoRequest({
      userId: request.user_id,
      requestId: request.request_id,
      errorCode:
        fallback.errorCode ||
        "INSUFFICIENT_EVERCOIN_FOR_VIDEO_FALLBACK"
    });

    return "failed" as const;
  }

  if (fallback.status === "already_fallback") {
    return "processing" as const;
  }

  if (fallback.status !== "claimed") {
    return "failed" as const;
  }

  if (request.provider_queue_id) {
    await cleanupProviderVideo({
      apiKey,
      model: request.provider_model,
      queueId: request.provider_queue_id
    });
  }

  const fallbackRequest: PendingVideoRequest = {
    ...request,
    provider_model: FALLBACK_VIDEO_MODEL,
    provider_queue_id: null,
    provider_download_url: null,
    evercoin_charge: pricing.everCoinCost
  };

  try {
    await queueAndRecord(fallbackRequest, apiKey);
    return "processing" as const;
  } catch (error) {
    await failCharacterVideoRequest({
      userId: request.user_id,
      requestId: request.request_id,
      errorCode:
        error instanceof Error
          ? error.message.slice(0, 200)
          : "VIDEO_FALLBACK_QUEUE_FAILED"
    }).catch(() => undefined);

    return "failed" as const;
  }
}

async function finalizeVideo(
  request: PendingVideoRequest,
  bytes: Buffer
) {
  const videoId = request.request_id;
  const storagePath =
    `${request.user_id}/${request.character_id}/${videoId}.mp4`;
  const supabase = getSupabaseServiceClient();

  const upload = await supabase.storage
    .from("character-videos")
    .upload(storagePath, bytes, {
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
        user_id: request.user_id,
        character_id: request.character_id,
        storage_path: storagePath,
        prompt: request.prompt,
        duration_seconds: Number(
          request.duration_seconds
        ),
        provider: "venice",
        model: request.provider_model,
        evercoin_charge: Number(
          request.evercoin_charge
        )
      },
      { onConflict: "id" }
    );

  if (upsertError) throw upsertError;

  const completed = await completeCharacterVideoRequest({
    userId: request.user_id,
    requestId: request.request_id,
    videoId
  });

  if (!completed) {
    await supabase
      .from("character_gallery_videos")
      .delete()
      .eq("id", videoId)
      .eq("user_id", request.user_id);

    await supabase.storage
      .from("character-videos")
      .remove([storagePath])
      .catch(() => undefined);

    throw new Error("VIDEO_REQUEST_COMPLETION_FAILED");
  }
}

async function processRequest(
  request: PendingVideoRequest,
  apiKey: string
) {
  if (!request.provider_queue_id) {
    // Historical requests may have a Venice-normalized Grok model string.
    // Anything not already on Wan is still the primary leg, so route it to
    // Wan rather than failing it as an unsupported model.
    if (
      request.provider_model !== PRIMARY_VIDEO_MODEL &&
      request.provider_model !== FALLBACK_VIDEO_MODEL
    ) {
      return beginWanFallback(request, apiKey);
    }

    try {
      await queueAndRecord(request, apiKey);
      return "processing" as const;
    } catch (error) {
      if (
        request.provider_model !== FALLBACK_VIDEO_MODEL
      ) {
        return beginWanFallback(request, apiKey);
      }

      await failCharacterVideoRequest({
        userId: request.user_id,
        requestId: request.request_id,
        errorCode:
          error instanceof Error
            ? error.message.slice(0, 200)
            : "VIDEO_QUEUE_RECOVERY_FAILED"
      }).catch(() => undefined);

      return "failed" as const;
    }
  }

  const retrieved = await retrieveProviderVideo({
    apiKey,
    model: request.provider_model,
    queueId: request.provider_queue_id,
    downloadUrl: request.provider_download_url
  });

  if (retrieved.state === "processing") {
    return "processing" as const;
  }

  if (retrieved.state === "failed") {
    if (
      request.provider_model !== FALLBACK_VIDEO_MODEL
    ) {
      return beginWanFallback(request, apiKey);
    }

    await failCharacterVideoRequest({
      userId: request.user_id,
      requestId: request.request_id,
      errorCode: retrieved.errorCode
    });

    await cleanupProviderVideo({
      apiKey,
      model: request.provider_model,
      queueId: request.provider_queue_id
    });

    return "failed" as const;
  }

  await finalizeVideo(request, retrieved.bytes);

  await cleanupProviderVideo({
    apiKey,
    model: request.provider_model,
    queueId: request.provider_queue_id
  });

  return "completed" as const;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const apiKey = process.env.VENICE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "VENICE_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  const { data, error } = await getSupabaseServiceClient()
    .from("character_video_requests")
    .select(
      "request_id,user_id,character_id,prompt,duration_seconds,evercoin_charge,provider_model,provider_queue_id,provider_download_url"
    )
    .eq("status", "processing")
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("Video recovery query failed:", error);
    return NextResponse.json(
      { error: "VIDEO_RECOVERY_QUERY_FAILED" },
      { status: 500 }
    );
  }

  const pending = (data ?? []) as PendingVideoRequest[];

  const settled = await Promise.allSettled(
    pending.map((row) => processRequest(row, apiKey))
  );

  const summary = {
    checked: pending.length,
    completed: 0,
    failed: 0,
    processing: 0,
    errors: 0
  };

  for (const result of settled) {
    if (result.status === "rejected") {
      summary.errors += 1;
      console.error(
        "Video recovery item failed:",
        result.reason
      );
      continue;
    }

    summary[result.value] += 1;
  }

  return NextResponse.json(summary, {
    headers: {
      "Cache-Control": "private, no-store"
    }
  });
}
