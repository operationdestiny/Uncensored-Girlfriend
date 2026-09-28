import { NextResponse } from "next/server";
import {
  completeCharacterVideoRequest,
  failCharacterVideoRequest
} from "@/lib/evercoin";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  downloadWaveSpeedOutput,
  getWaveSpeedPrediction,
  wavespeedApiKey
} from "@/lib/wavespeed-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_LIMIT = 5;
const MAX_GENERATED_VIDEO_BYTES = 100 * 1024 * 1024;
const VIDEO_CONTENT_TYPES = new Set(["video/mp4", "application/octet-stream"]);

type PendingVideoRequest = {
  request_id: string;
  user_id: string;
  character_id: string;
  prompt: string;
  duration_seconds: number | string;
  evercoin_charge: number | string;
  provider_model: string;
  provider_queue_id: string;
  provider_download_url: string | null;
};

type ProviderResult =
  | { state: "processing" }
  | { state: "failed"; errorCode: string }
  | { state: "completed"; bytes: Buffer };

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function retrieveProviderVideo(values: {
  apiKey: string;
  queueId: string;
}): Promise<ProviderResult> {
  try {
    const prediction = await getWaveSpeedPrediction({
      apiKey: values.apiKey,
      predictionId: values.queueId,
      timeoutMs: 25_000
    });

    if (prediction.status === "completed") {
      const outputUrl = prediction.outputs[0];
      if (!outputUrl) {
        return {
          state: "failed",
          errorCode: "VIDEO_PROVIDER_OUTPUT_MISSING"
        };
      }

      try {
        const downloaded = await downloadWaveSpeedOutput({
          url: outputUrl,
          maximumBytes: MAX_GENERATED_VIDEO_BYTES,
          allowedContentTypes: VIDEO_CONTENT_TYPES,
          fallbackContentType: "video/mp4",
          timeoutMs: 35_000
        });
        return { state: "completed", bytes: downloaded.bytes };
      } catch (error) {
        return {
          state: "failed",
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
        state: "failed",
        errorCode:
          prediction.error || `VIDEO_PROVIDER_${prediction.status.toUpperCase()}`
      };
    }

    return { state: "processing" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/WAVESPEED_RESULT_FAILED:(400|401|402|403|404|410|422):/.test(message)) {
      return { state: "failed", errorCode: message.slice(0, 200) };
    }

    return { state: "processing" };
  }
}

async function finalizeVideo(request: PendingVideoRequest, bytes: Buffer) {
  const videoId = request.request_id;
  const storagePath = `${request.user_id}/${request.character_id}/${videoId}.mp4`;
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
        duration_seconds: Number(request.duration_seconds),
        provider: "wavespeed",
        model: request.provider_model,
        evercoin_charge: Number(request.evercoin_charge)
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

async function processRequest(request: PendingVideoRequest, apiKey: string) {
  const retrieved = await retrieveProviderVideo({
    apiKey,
    queueId: request.provider_queue_id
  });

  if (retrieved.state === "processing") return "processing" as const;

  if (retrieved.state === "failed") {
    await failCharacterVideoRequest({
      userId: request.user_id,
      requestId: request.request_id,
      errorCode: retrieved.errorCode
    });
    return "failed" as const;
  }

  await finalizeVideo(request, retrieved.bytes);
  return "completed" as const;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const apiKey = wavespeedApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "WAVESPEED_NOT_CONFIGURED" }, { status: 503 });
  }

  const { data, error } = await getSupabaseServiceClient()
    .from("character_video_requests")
    .select(
      "request_id,user_id,character_id,prompt,duration_seconds,evercoin_charge,provider_model,provider_queue_id,provider_download_url"
    )
    .eq("status", "processing")
    .not("provider_queue_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("Video recovery query failed:", error);
    return NextResponse.json({ error: "VIDEO_RECOVERY_QUERY_FAILED" }, { status: 500 });
  }

  const pending: PendingVideoRequest[] = (data ?? []).flatMap(
    (row: Record<string, unknown>) =>
      typeof row.provider_queue_id === "string" && row.provider_queue_id.length > 0
        ? [row as PendingVideoRequest]
        : []
  );

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
      console.error("Video recovery item failed:", result.reason);
      continue;
    }
    summary[result.value] += 1;
  }

  return NextResponse.json(summary, {
    headers: { "Cache-Control": "private, no-store" }
  });
}
