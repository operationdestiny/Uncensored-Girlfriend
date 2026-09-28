const WAVESPEED_API_BASE_URL = "https://api.wavespeed.ai/api/v3";
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "timeout"]);

export type WaveSpeedPrediction = {
  id: string;
  status: string;
  outputs: string[];
  error: string | null;
  timings: Record<string, unknown> | null;
};

function cleanBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function apiBaseUrl() {
  return cleanBaseUrl(
    process.env.WAVESPEED_API_BASE_URL?.trim() || WAVESPEED_API_BASE_URL
  );
}

export function wavespeedApiKey() {
  return process.env.WAVESPEED_API_KEY?.trim() || "";
}

export function wavespeedModelUrl(model: string) {
  const cleanModel = model.trim().replace(/^\/+/, "");
  return `${apiBaseUrl()}/${cleanModel}`;
}

export function wavespeedPredictionUrl(predictionId: string) {
  return `${apiBaseUrl()}/predictions/${encodeURIComponent(predictionId)}/result`;
}

export function wavespeedHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

function unwrapPayload(payload: any) {
  if (payload?.code !== undefined && Number(payload.code) !== 200) {
    throw new Error(
      `WAVESPEED_API_ERROR:${String(payload?.message ?? payload?.code).slice(0, 400)}`
    );
  }

  return payload?.data ?? payload;
}

export async function submitWaveSpeedPrediction(values: {
  apiKey: string;
  model: string;
  input: Record<string, unknown>;
  timeoutMs?: number;
}) {
  const response = await fetch(wavespeedModelUrl(values.model), {
    method: "POST",
    headers: wavespeedHeaders(values.apiKey),
    body: JSON.stringify(values.input),
    cache: "no-store",
    signal: AbortSignal.timeout(values.timeoutMs ?? 60_000)
  });

  const text = await response.text();
  let payload: any = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { message: text };
  }

  if (!response.ok) {
    throw new Error(
      `WAVESPEED_SUBMIT_FAILED:${response.status}:${String(payload?.message ?? text).slice(0, 500)}`
    );
  }

  const task = unwrapPayload(payload);
  const id = typeof task?.id === "string" ? task.id.trim() : "";
  if (!id) throw new Error("WAVESPEED_PREDICTION_ID_MISSING");

  return {
    id,
    model:
      typeof task?.model === "string" && task.model.trim()
        ? task.model.trim()
        : values.model
  };
}

export async function getWaveSpeedPrediction(values: {
  apiKey: string;
  predictionId: string;
  timeoutMs?: number;
}): Promise<WaveSpeedPrediction> {
  const response = await fetch(wavespeedPredictionUrl(values.predictionId), {
    method: "GET",
    headers: { Authorization: `Bearer ${values.apiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(values.timeoutMs ?? 30_000)
  });

  const text = await response.text();
  let payload: any = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { message: text };
  }

  if (!response.ok) {
    throw new Error(
      `WAVESPEED_RESULT_FAILED:${response.status}:${String(payload?.message ?? text).slice(0, 500)}`
    );
  }

  const result = unwrapPayload(payload);
  const status = String(result?.status ?? "created").trim().toLowerCase();
  const outputs = Array.isArray(result?.outputs)
    ? result.outputs.filter((value: unknown): value is string =>
        typeof value === "string" && value.length > 0
      )
    : [];

  return {
    id:
      typeof result?.id === "string" && result.id.trim()
        ? result.id.trim()
        : values.predictionId,
    status,
    outputs,
    error:
      typeof result?.error === "string"
        ? result.error.slice(0, 500)
        : typeof result?.message === "string" && status !== "completed"
          ? result.message.slice(0, 500)
          : null,
    timings:
      result?.timings && typeof result.timings === "object"
        ? result.timings
        : null
  };
}

export async function waitForWaveSpeedPrediction(values: {
  apiKey: string;
  predictionId: string;
  maximumWaitMs: number;
  pollIntervalMs?: number;
}) {
  const startedAt = Date.now();
  const interval = Math.max(values.pollIntervalMs ?? 2_000, 2_000);

  while (Date.now() - startedAt < values.maximumWaitMs) {
    const result = await getWaveSpeedPrediction({
      apiKey: values.apiKey,
      predictionId: values.predictionId
    });

    if (result.status === "completed") return result;

    if (TERMINAL_STATUSES.has(result.status)) {
      throw new Error(
        `WAVESPEED_PREDICTION_${result.status.toUpperCase()}:${result.error ?? "unknown error"}`
      );
    }

    if (result.status !== "created" && result.status !== "processing") {
      throw new Error(`WAVESPEED_PREDICTION_STATUS_UNKNOWN:${result.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error("WAVESPEED_PREDICTION_WAIT_TIMEOUT");
}

export async function downloadWaveSpeedOutput(values: {
  url: string;
  maximumBytes: number;
  allowedContentTypes: Set<string>;
  fallbackContentType: string;
  timeoutMs?: number;
}) {
  const url = new URL(values.url);
  if (url.protocol !== "https:") {
    throw new Error("WAVESPEED_OUTPUT_URL_INVALID");
  }

  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(values.timeoutMs ?? 120_000)
  });

  if (!response.ok) {
    throw new Error(`WAVESPEED_OUTPUT_DOWNLOAD_FAILED:${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > values.maximumBytes
  ) {
    throw new Error("WAVESPEED_OUTPUT_TOO_LARGE");
  }

  let contentType =
    response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ||
    values.fallbackContentType;

  if (contentType === "application/octet-stream") {
    contentType = values.fallbackContentType;
  }

  if (!values.allowedContentTypes.has(contentType)) {
    throw new Error(`WAVESPEED_OUTPUT_TYPE_INVALID:${contentType}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > values.maximumBytes) {
    throw new Error("WAVESPEED_OUTPUT_INVALID");
  }

  return { bytes, contentType };
}
