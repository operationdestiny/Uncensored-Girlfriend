import { veniceApiUrl } from "@/lib/venice-media";

export const PRIMARY_VIDEO_MODEL = "grok-imagine-reference-to-video";
export const FALLBACK_VIDEO_MODEL = "wan-2-7-reference-to-video";
export const VIDEO_DURATION_SECONDS = 10;
export const VIDEO_RESOLUTION = "720p";
export const VIDEO_ASPECT_RATIO = "9:16";

const DEFAULT_BASELINE_QUOTE_USD = 1.12;
const DEFAULT_BASELINE_EVERCOIN = 199;
export const ADVERTISED_VIDEO_EVERCOIN = 155;

export type VideoPricingSource = "venice" | "unavailable";

function positiveNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function positiveIntegerEnv(name: string, fallback: number) {
  return Math.max(Math.trunc(positiveNumberEnv(name, fallback)), 1);
}

export function videoPricingInputs(
  model = PRIMARY_VIDEO_MODEL,
  durationSeconds = VIDEO_DURATION_SECONDS
) {
  const normalizedDuration = Math.max(Math.trunc(durationSeconds), 1);

  return {
    model,
    durationSeconds: normalizedDuration,
    duration:
      model === PRIMARY_VIDEO_MODEL
        ? String(normalizedDuration)
        : `${normalizedDuration}s`,
    resolution: VIDEO_RESOLUTION,
    aspectRatio: VIDEO_ASPECT_RATIO
  };
}

export function everCoinVideoCostFromQuote(quoteUsd: number) {
  if (!Number.isFinite(quoteUsd) || quoteUsd <= 0) return 0;

  const baselineQuoteUsd = positiveNumberEnv(
    "VENICE_VIDEO_BASELINE_QUOTE_USD",
    DEFAULT_BASELINE_QUOTE_USD
  );
  const baselineEverCoin = positiveIntegerEnv(
    "EVERCOIN_VIDEO_BASELINE_COST",
    DEFAULT_BASELINE_EVERCOIN
  );

  // Restore the original EverBond relationship exactly:
  // $1.12 provider cost -> 199 EverCoin, moving proportionally with live cost.
  return Math.max(
    Math.ceil((quoteUsd * baselineEverCoin) / baselineQuoteUsd),
    1
  );
}

export function advertisedVideoEverCoinCost() {
  return ADVERTISED_VIDEO_EVERCOIN;
}

export function roundedVideoDisplayCost(everCoinCost: number) {
  // Internal/live calculations stay exact. The public button uses the
  // separate ~155 EC advertised estimate.
  return Number.isFinite(everCoinCost) && everCoinCost > 0
    ? Math.trunc(everCoinCost)
    : 0;
}

function quotePayload(
  model: string,
  durationSeconds: number
): Record<string, unknown> {
  const inputs = videoPricingInputs(model, durationSeconds);

  if (model === PRIMARY_VIDEO_MODEL) {
    return {
      model: inputs.model,
      // Venice uses different Grok duration enums by endpoint:
      // /video/quote requires "10s" while /video/queue requires "10".
      duration: `${inputs.durationSeconds}s`,
      resolution: inputs.resolution,
      aspect_ratio: inputs.aspectRatio
    };
  }

  return {
    model: inputs.model,
    duration: inputs.duration,
    resolution: inputs.resolution
  };
}

export async function quoteEverCoinVideoCost(
  model = PRIMARY_VIDEO_MODEL,
  durationSeconds = VIDEO_DURATION_SECONDS
) {
  const inputs = videoPricingInputs(model, durationSeconds);

  function result(
    quoteUsd: number,
    source: VideoPricingSource
  ) {
    const everCoinCost = everCoinVideoCostFromQuote(quoteUsd);

    return {
      ...inputs,
      quoteUsd,
      everCoinCost,
      displayCost: roundedVideoDisplayCost(everCoinCost),
      source
    };
  }

  const apiKey = process.env.VENICE_API_KEY?.trim();
  if (!apiKey) return result(0, "unavailable");

  try {
    const response = await fetch(veniceApiUrl("video/quote"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(
        quotePayload(model, inputs.durationSeconds)
      ),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000)
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(
        `VIDEO_QUOTE_FAILED:${response.status}:${detail}`
      );
    }

    const payload = await response.json().catch(() => null);
    const quoteUsd = Number(payload?.quote);

    if (!Number.isFinite(quoteUsd) || quoteUsd <= 0) {
      throw new Error("VIDEO_QUOTE_INVALID");
    }

    return result(quoteUsd, "venice");
  } catch (error) {
    console.error("Venice video quote unavailable:", {
      model,
      error
    });
    return result(0, "unavailable");
  }
}
