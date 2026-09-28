export const WAVESPEED_VIDEO_MODEL =
  "bytedance/seedance-v1.5-pro/image-to-video-spicy";
export const VIDEO_DURATION_SECONDS = 10;
export const VIDEO_RESOLUTION = "720p" as const;
export const VIDEO_ASPECT_RATIO = "9:16" as const;
export const VIDEO_EVERCOIN_COST = 80;
export const VIDEO_LIMIT = 5;
export const VIDEO_INTERNAL_PROMPT = "Automatic companion video";
export const MAX_GENERATED_VIDEO_BYTES = 100 * 1024 * 1024;

const WAVESPEED_API_BASE = "https://api.wavespeed.ai/api/v3";
const RETRYABLE_HTTP_STATUSES = new Set([
  408,
  425,
  429,
  500,
  502,
  503,
  504
]);

type WaveSpeedTask = {
  id?: string;
  status?: string;
  outputs?: unknown;
  error?: unknown;
  message?: unknown;
  urls?: {
    get?: unknown;
  };
};

export type WaveSpeedQueuedVideo = {
  predictionId: string;
  resultUrl: string;
};

export type WaveSpeedVideoResult =
  | { state: "processing" }
  | { state: "failed"; errorCode: string }
  | { state: "completed"; bytes: Buffer };

function providerHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

function isRetryableNetworkError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "AbortError" ||
    error.name === "TimeoutError" ||
    error instanceof TypeError
  );
}

function unwrapTask(payload: unknown): WaveSpeedTask {
  if (!payload || typeof payload !== "object") return {};
  const value = payload as Record<string, unknown>;
  const data = value.data;
  if (data && typeof data === "object") return data as WaveSpeedTask;
  return value as WaveSpeedTask;
}

function parseReferenceDataUrl(value: string) {
  const match = value.match(
    /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\r\n]+)$/i
  );
  if (!match) throw new Error("VIDEO_REFERENCE_IMAGE_INVALID");

  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) {
    throw new Error("VIDEO_REFERENCE_IMAGE_INVALID");
  }

  const extension =
    match[1].toLowerCase() === "image/png"
      ? "png"
      : match[1].toLowerCase() === "image/webp"
        ? "webp"
        : "jpg";

  return {
    bytes,
    contentType: match[1].toLowerCase(),
    filename: `everbond-reference.${extension}`
  };
}

async function uploadReferenceImage(apiKey: string, dataUrl: string) {
  const reference = parseReferenceDataUrl(dataUrl);
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(reference.bytes)], { type: reference.contentType }),
    reference.filename
  );

  const response = await fetch(`${WAVESPEED_API_BASE}/media/upload/binary`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form,
    signal: AbortSignal.timeout(60_000)
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || Number(payload?.code ?? 200) !== 200) {
    const detail = String(
      payload?.message ?? `HTTP_${response.status}`
    ).slice(0, 300);
    throw new Error(`WAVESPEED_UPLOAD_FAILED:${detail}`);
  }

  const url =
    typeof payload?.data?.download_url === "string"
      ? payload.data.download_url
      : typeof payload?.data?.url === "string"
        ? payload.data.url
        : "";

  if (!url || !url.startsWith("https://")) {
    throw new Error("WAVESPEED_UPLOAD_URL_MISSING");
  }

  return url;
}

function safetyFieldRejected(status: number, detail: string) {
  if (status !== 400 && status !== 422) return false;
  const normalized = detail.toLowerCase();
  return (
    normalized.includes("enable_safety_checker") ||
    (normalized.includes("safety") &&
      (normalized.includes("unknown") ||
        normalized.includes("unrecognized") ||
        normalized.includes("extra") ||
        normalized.includes("invalid")))
  );
}

async function submitPrediction(
  apiKey: string,
  imageUrl: string,
  includeSafetyOverride: boolean
): Promise<WaveSpeedQueuedVideo> {
  const body: Record<string, unknown> = {
    image: imageUrl,
    aspect_ratio: VIDEO_ASPECT_RATIO,
    duration: VIDEO_DURATION_SECONDS,
    resolution: VIDEO_RESOLUTION,
    generate_audio: false,
    camera_fixed: false,
    seed: -1
  };

  // WaveSpeed's playground exposes this switch, while the public schema for
  // this exact Spicy endpoint currently omits it. Try the explicit OFF value.
  // If WaveSpeed rejects only this unknown field at validation time, retry the
  // validation-safe request without it. Never retry an ambiguous accepted POST.
  if (includeSafetyOverride) {
    body.enable_safety_checker = false;
  }

  const response = await fetch(
    `${WAVESPEED_API_BASE}/${WAVESPEED_VIDEO_MODEL}`,
    {
      method: "POST",
      headers: providerHeaders(apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000)
    }
  );

  const raw = await response.text();
  let payload: any = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  if (!response.ok || Number(payload?.code ?? 200) !== 200) {
    const detail = String(
      payload?.message ?? payload?.error ?? raw ?? `HTTP_${response.status}`
    ).slice(0, 700);

    if (
      includeSafetyOverride &&
      safetyFieldRejected(response.status, detail)
    ) {
      return submitPrediction(apiKey, imageUrl, false);
    }

    throw new Error(
      `WAVESPEED_VIDEO_SUBMIT_FAILED:${response.status}:${detail}`
    );
  }

  const task = unwrapTask(payload);
  const predictionId = typeof task.id === "string" ? task.id.trim() : "";
  if (!predictionId) {
    throw new Error("WAVESPEED_VIDEO_PREDICTION_ID_MISSING");
  }

  const resultUrl =
    typeof task.urls?.get === "string" && task.urls.get.startsWith("https://")
      ? task.urls.get
      : `${WAVESPEED_API_BASE}/predictions/${predictionId}/result`;

  return { predictionId, resultUrl };
}

export async function queueWaveSpeedVideo(values: {
  apiKey: string;
  referenceImageDataUrl: string;
}) {
  const imageUrl = await uploadReferenceImage(
    values.apiKey,
    values.referenceImageDataUrl
  );
  return submitPrediction(values.apiKey, imageUrl, true);
}

async function downloadWaveSpeedVideo(urlValue: string) {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    return { state: "failed" as const, errorCode: "VIDEO_DOWNLOAD_URL_INVALID" };
  }

  if (url.protocol !== "https:") {
    return { state: "failed" as const, errorCode: "VIDEO_DOWNLOAD_URL_INVALID" };
  }

  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(120_000)
    });

    if (!response.ok) {
      if (RETRYABLE_HTTP_STATUSES.has(response.status)) {
        return { state: "processing" as const };
      }
      return {
        state: "failed" as const,
        errorCode: `VIDEO_DOWNLOAD_FAILED:${response.status}`
      };
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_GENERATED_VIDEO_BYTES
    ) {
      return {
        state: "failed" as const,
        errorCode: "VIDEO_PROVIDER_RETURNED_INVALID_FILE"
      };
    }

    const contentType =
      response.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim()
        .toLowerCase() || "";

    if (
      contentType &&
      contentType !== "video/mp4" &&
      contentType !== "application/octet-stream"
    ) {
      return {
        state: "failed" as const,
        errorCode: "VIDEO_PROVIDER_RETURNED_INVALID_FILE"
      };
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_GENERATED_VIDEO_BYTES) {
      return {
        state: "failed" as const,
        errorCode: "VIDEO_PROVIDER_RETURNED_INVALID_FILE"
      };
    }

    return { state: "completed" as const, bytes };
  } catch (error) {
    if (isRetryableNetworkError(error)) {
      return { state: "processing" as const };
    }
    return {
      state: "failed" as const,
      errorCode:
        error instanceof Error
          ? error.message.slice(0, 200)
          : "VIDEO_DOWNLOAD_FAILED"
    };
  }
}

export async function retrieveWaveSpeedVideo(values: {
  apiKey: string;
  predictionId: string;
  resultUrl?: string | null;
}): Promise<WaveSpeedVideoResult> {
  const resultUrl =
    values.resultUrl && values.resultUrl.startsWith("https://")
      ? values.resultUrl
      : `${WAVESPEED_API_BASE}/predictions/${values.predictionId}/result`;

  try {
    const response = await fetch(resultUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${values.apiKey}`
      },
      cache: "no-store",
      signal: AbortSignal.timeout(60_000)
    });

    if (!response.ok) {
      if (RETRYABLE_HTTP_STATUSES.has(response.status)) {
        return { state: "processing" };
      }
      const detail = (await response.text()).slice(0, 400);
      return {
        state: "failed",
        errorCode: `WAVESPEED_VIDEO_STATUS_FAILED:${response.status}:${detail}`
      };
    }

    const payload = await response.json().catch(() => null);
    if (Number(payload?.code ?? 200) !== 200) {
      return {
        state: "failed",
        errorCode: String(payload?.message ?? "WAVESPEED_VIDEO_STATUS_FAILED").slice(
          0,
          200
        )
      };
    }

    const task = unwrapTask(payload);
    const status = String(task.status ?? "processing").toLowerCase();

    if (status === "created" || status === "processing") {
      return { state: "processing" };
    }

    if (status === "completed") {
      const outputs = Array.isArray(task.outputs) ? task.outputs : [];
      const outputUrl =
        typeof outputs[0] === "string" ? outputs[0].trim() : "";
      if (!outputUrl) {
        return {
          state: "failed",
          errorCode: "WAVESPEED_VIDEO_OUTPUT_MISSING"
        };
      }
      return downloadWaveSpeedVideo(outputUrl);
    }

    if (
      status === "failed" ||
      status === "cancelled" ||
      status === "timeout" ||
      status === "deleted"
    ) {
      return {
        state: "failed",
        errorCode: String(
          task.error ?? task.message ?? `WAVESPEED_VIDEO_${status.toUpperCase()}`
        ).slice(0, 200)
      };
    }

    return { state: "processing" };
  } catch (error) {
    if (isRetryableNetworkError(error)) {
      return { state: "processing" };
    }
    return {
      state: "failed",
      errorCode:
        error instanceof Error
          ? error.message.slice(0, 200)
          : "WAVESPEED_VIDEO_STATUS_FAILED"
    };
  }
}
