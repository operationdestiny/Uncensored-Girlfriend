const DEFAULT_VIDEO_MODEL = "bytedance/seedance-v1.5-pro/image-to-video-spicy";
const DEFAULT_DURATION_SECONDS = 8;
const DEFAULT_RESOLUTION = "720p";
const DEFAULT_ASPECT_RATIO = "9:16";
const DEFAULT_AUDIO_ENABLED = false;
const DEFAULT_BASELINE_QUOTE_USD = 1.12;
const DEFAULT_BASELINE_EVERCOIN = 199;
const DISPLAY_ROUNDING_INCREMENT = 10;

// Keep the existing EverCoin pricing floor during the provider migration.
// WaveSpeed's selected Seedance model is cheaper than the previous baseline,
// but switching providers should not silently change customer-facing pricing.
const VIDEO_PROVIDER_COST_RECOVERY_EVERCOIN_PER_USD = 125;
const VIDEO_TARGET_CONTRIBUTION_EVERCOIN = 59;
const VIDEO_CHARGE_ROUNDING_INCREMENT = 5;

function positiveNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function positiveIntegerEnv(name: string, fallback: number) {
  return Math.max(Math.trunc(positiveNumberEnv(name, fallback)), 1);
}

export function videoPricingInputs(
  durationSeconds = DEFAULT_DURATION_SECONDS
) {
  const configuredResolution =
    process.env.WAVESPEED_VIDEO_RESOLUTION?.trim().toLowerCase();
  const resolution = new Set(["480p", "720p", "1080p"]).has(
    configuredResolution || ""
  )
    ? configuredResolution!
    : DEFAULT_RESOLUTION;

  const configuredAspectRatio =
    process.env.WAVESPEED_VIDEO_ASPECT_RATIO?.trim();
  const aspectRatio = new Set([
    "1:1",
    "3:4",
    "4:3",
    "9:16",
    "16:9",
    "21:9"
  ]).has(configuredAspectRatio || "")
    ? configuredAspectRatio!
    : DEFAULT_ASPECT_RATIO;

  return {
    model:
      process.env.WAVESPEED_VIDEO_MODEL?.trim() ||
      DEFAULT_VIDEO_MODEL,
    durationSeconds: Math.min(
      Math.max(Math.trunc(durationSeconds), 4),
      12
    ),
    duration: `${Math.min(Math.max(Math.trunc(durationSeconds), 4), 12)}s`,
    resolution,
    aspectRatio,
    audio: DEFAULT_AUDIO_ENABLED
  };
}

function seedanceQuoteUsd(values: {
  resolution: string;
  durationSeconds: number;
  audio: boolean;
}) {
  const fiveSecondAudioOff: Record<string, number> = {
    "480p": 0.06,
    "720p": 0.13,
    "1080p": 0.26
  };

  const baseFiveSecond = fiveSecondAudioOff[values.resolution];
  if (!baseFiveSecond) return null;

  const audioMultiplier = values.audio ? 2 : 1;
  return (
    baseFiveSecond *
    (values.durationSeconds / 5) *
    audioMultiplier
  );
}

export function everCoinVideoCostFromQuote(quoteUsd: number) {
  const baselineQuoteUsd = positiveNumberEnv(
    "WAVESPEED_VIDEO_BASELINE_QUOTE_USD",
    DEFAULT_BASELINE_QUOTE_USD
  );
  const baselineEverCoin = positiveIntegerEnv(
    "EVERCOIN_VIDEO_BASELINE_COST",
    DEFAULT_BASELINE_EVERCOIN
  );
  const normalizedQuote =
    Number.isFinite(quoteUsd) && quoteUsd > 0
      ? quoteUsd
      : baselineQuoteUsd;

  const proportionalCost = Math.ceil(
    (normalizedQuote * baselineEverCoin) / baselineQuoteUsd
  );
  const contributionProtectedCost =
    Math.ceil(
      normalizedQuote * VIDEO_PROVIDER_COST_RECOVERY_EVERCOIN_PER_USD
    ) + VIDEO_TARGET_CONTRIBUTION_EVERCOIN;

  const protectedCost = Math.max(
    baselineEverCoin,
    proportionalCost,
    contributionProtectedCost,
    1
  );

  return (
    Math.ceil(protectedCost / VIDEO_CHARGE_ROUNDING_INCREMENT) *
    VIDEO_CHARGE_ROUNDING_INCREMENT
  );
}

export function roundedVideoDisplayCost(everCoinCost: number) {
  const normalized = Math.max(Math.trunc(everCoinCost), 1);
  return (
    Math.ceil(normalized / DISPLAY_ROUNDING_INCREMENT) *
    DISPLAY_ROUNDING_INCREMENT
  );
}

export async function quoteEverCoinVideoCost(
  durationSeconds = DEFAULT_DURATION_SECONDS
) {
  const inputs = videoPricingInputs(durationSeconds);
  const fallbackQuoteUsd = positiveNumberEnv(
    "WAVESPEED_VIDEO_FALLBACK_QUOTE_USD",
    DEFAULT_BASELINE_QUOTE_USD
  );
  const quoteUsd =
    inputs.model === DEFAULT_VIDEO_MODEL
      ? seedanceQuoteUsd({
          resolution: inputs.resolution,
          durationSeconds: inputs.durationSeconds,
          audio: inputs.audio
        }) ?? fallbackQuoteUsd
      : fallbackQuoteUsd;
  const everCoinCost = everCoinVideoCostFromQuote(quoteUsd);

  return {
    ...inputs,
    quoteUsd,
    everCoinCost,
    displayCost: roundedVideoDisplayCost(everCoinCost),
    source: inputs.model === DEFAULT_VIDEO_MODEL ? "wavespeed" : "fallback"
  } as const;
}
