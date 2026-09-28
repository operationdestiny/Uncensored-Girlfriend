import { NextResponse } from "next/server";
import {
  completeCharacterVideoRequest,
  failCharacterVideoRequest
} from "@/lib/evercoin";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  VIDEO_DURATION_SECONDS,
  VIDEO_EVERCOIN_COST,
  VIDEO_INTERNAL_PROMPT,
  VIDEO_LIMIT,
  WAVESPEED_VIDEO_MODEL,
  retrieveWaveSpeedVideo
} from "@/lib/wavespeed-video";

export const runtime = "nodejs";
export const maxDuration = 300;

type PendingVideoRequest = {
  request_id: string;
  user_id: string;
  character_id: string;
  provider_model: string;
  provider_queue_id: string | null;
  provider_download_url: string | null;
};

function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function finalizeVideo(request: PendingVideoRequest, bytes: Buffer) {
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

async function failRequest(request: PendingVideoRequest, errorCode: string) {
  await failCharacterVideoRequest({
    userId: request.user_id,
    requestId: request.request_id,
    errorCode: errorCode.slice(0, 200)
  }).catch(() => undefined);
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const apiKey = process.env.WAVESPEED_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "VIDEO_PROVIDER_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  try {
    const { data, error } = await getSupabaseServiceClient()
      .from("character_video_requests")
      .select(
        "request_id,user_id,character_id,provider_model,provider_queue_id,provider_download_url"
      )
      .eq("status", "processing")
      .order("created_at", { ascending: true })
      .limit(VIDEO_LIMIT);

    if (error) throw error;

    const requests = (data ?? []) as PendingVideoRequest[];
    let processing = 0;
    let completed = 0;
    let failed = 0;

    for (const current of requests) {
      if (current.provider_model !== WAVESPEED_VIDEO_MODEL) {
        await failRequest(current, "VIDEO_PROVIDER_RETIRED");
        failed += 1;
        continue;
      }

      if (!current.provider_queue_id) {
        await failRequest(current, "VIDEO_QUEUE_ID_MISSING");
        failed += 1;
        continue;
      }

      const result = await retrieveWaveSpeedVideo({
        apiKey,
        predictionId: current.provider_queue_id,
        resultUrl: current.provider_download_url
      });

      if (result.state === "processing") {
        processing += 1;
        continue;
      }

      if (result.state === "failed") {
        await failRequest(current, result.errorCode);
        failed += 1;
        continue;
      }

      try {
        await finalizeVideo(current, result.bytes);
        completed += 1;
      } catch (finalizeError) {
        await failRequest(
          current,
          finalizeError instanceof Error
            ? finalizeError.message
            : "VIDEO_FINALIZE_FAILED"
        );
        failed += 1;
      }
    }

    return NextResponse.json(
      {
        ok: true,
        scanned: requests.length,
        processing,
        completed,
        failed
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("WaveSpeed video cron failed:", error);
    return NextResponse.json(
      { error: "VIDEO_CRON_FAILED" },
      { status: 500 }
    );
  }
}
