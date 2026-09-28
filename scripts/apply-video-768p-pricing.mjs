#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, "utf8");
}

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (source.includes(from)) return source.replace(from, to);
  throw new Error(`768p video pricing patch could not find: ${label}`);
}

function replaceRegexRequired(source, pattern, replacement, alreadyPresent, label) {
  if (alreadyPresent && source.includes(alreadyPresent)) return source;
  if (!pattern.test(source)) {
    throw new Error(`768p video pricing patch could not find: ${label}`);
  }
  return source.replace(pattern, replacement);
}

// ===========================================================================
// VIDEO PRICING
// - Lock MiniMax H3 video quote inputs to 768p.
// - Restore the original proportional EverCoin relationship:
//     $1.12 provider quote -> 199 EverCoin, moving proportionally with cost.
// - Remove the later worst-case contribution floor.
// - A failed live quote is never presented to the user as a real price.
// ===========================================================================

const pricingPath = "src/lib/video-pricing.ts";
let pricing = read(pricingPath);

pricing = replaceRequired(
  pricing,
  'const DEFAULT_RESOLUTION = "720p";',
  'const DEFAULT_RESOLUTION = "768p";',
  "default video resolution"
);

pricing = replaceRegexRequired(
  pricing,
  /  const configuredResolution =\n    process\.env\.VENICE_VIDEO_RESOLUTION\?\.trim\(\)\.toLowerCase\(\);\n  const resolution = new Set\(\["480p", "720p", "1080p"\]\)\.has\(\n    configuredResolution \|\| ""\n  \)\n    \? configuredResolution!\n    : DEFAULT_RESOLUTION;/,
  '  const resolution = DEFAULT_RESOLUTION;',
  "const resolution = DEFAULT_RESOLUTION;",
  "fixed 768p resolution"
);

pricing = pricing.replace(
  /\n\/\/ Margin protection:[\s\S]*?const VIDEO_CHARGE_ROUNDING_INCREMENT = 5;\n/,
  "\n"
);

pricing = replaceRegexRequired(
  pricing,
  /export function everCoinVideoCostFromQuote\(quoteUsd: number\) \{[\s\S]*?\n\}\n\nexport function roundedVideoDisplayCost/,
  `export function everCoinVideoCostFromQuote(quoteUsd: number) {
  const baselineQuoteUsd = positiveNumberEnv(
    "VENICE_VIDEO_BASELINE_QUOTE_USD",
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

  return Math.max(
    Math.ceil(
      (normalizedQuote * baselineEverCoin) /
        baselineQuoteUsd
    ),
    1
  );
}

export function roundedVideoDisplayCost`,
  "return Math.max(\n    Math.ceil(\n      (normalizedQuote * baselineEverCoin)",
  "original proportional EverCoin pricing"
);

pricing = pricing.replace(
  '"VENICE_VIDEO_FALLBACK_QUOTE_USD",\n    2.5',
  '"VENICE_VIDEO_FALLBACK_QUOTE_USD",\n    DEFAULT_BASELINE_QUOTE_USD'
);

if (!pricing.includes("resolution: inputs.resolution")) {
  pricing = replaceRequired(
    pricing,
    `        model: inputs.model,
        duration: inputs.duration,
        aspect_ratio: "9:16",`,
    `        model: inputs.model,
        duration: inputs.duration,
        resolution: inputs.resolution,
        aspect_ratio: "9:16",`,
    "768p Venice quote input"
  );
}

if (
  !pricing.includes('const DEFAULT_RESOLUTION = "768p";') ||
  !pricing.includes("const resolution = DEFAULT_RESOLUTION;") ||
  !pricing.includes("resolution: inputs.resolution") ||
  pricing.includes("VIDEO_PROVIDER_COST_RECOVERY_EVERCOIN_PER_USD") ||
  pricing.includes("VIDEO_TARGET_CONTRIBUTION_EVERCOIN") ||
  pricing.includes("VIDEO_CHARGE_ROUNDING_INCREMENT")
) {
  throw new Error("Final 768p proportional video pricing validation failed.");
}

write(pricingPath, pricing);

// ===========================================================================
// VIDEO GENERATION ROUTE
// - Send the same 768p resolution used by the quote to MiniMax H3.
// - Only expose/accept a live Venice quote. If lookup is unavailable, pricing
//   is temporarily unavailable instead of showing a worst-case fallback.
// ===========================================================================

const videoRoutePath =
  "src/app/api/character-video-gallery/[slug]/route.ts";
let videoRoute = read(videoRoutePath);

if (!videoRoute.includes("resolution: pricing.resolution")) {
  videoRoute = replaceRequired(
    videoRoute,
    `                duration: queueDuration,
                aspect_ratio: "9:16",`,
    `                duration: queueDuration,
                resolution: pricing.resolution,
                aspect_ratio: "9:16",`,
    "MiniMax H3 768p queue input"
  );
}

videoRoute = replaceRequired(
  videoRoute,
  `    const cost = pricing.everCoinCost;
    return NextResponse.json(`,
  `    const cost = pricing.everCoinCost;
    const pricingConfigured = pricing.source === "venice";
    return NextResponse.json(`,
  "live quote gallery status"
);

videoRoute = replaceRequired(
  videoRoute,
  `        videoCost: cost,
        videoDisplayCost: pricing.displayCost,
        pricingConfigured: true,`,
  `        videoCost: pricingConfigured ? cost : null,
        videoDisplayCost: pricingConfigured ? pricing.displayCost : null,
        pricingConfigured,`,
  "hide fallback price from Generate button"
);

const postQuoteBlock = `    const pricing = await quoteEverCoinVideoCost(
      parsed.data.durationSeconds
    );
    const cost = pricing.everCoinCost;

    const { slug } = await params;`;

const postLiveQuoteBlock = `    const pricing = await quoteEverCoinVideoCost(
      parsed.data.durationSeconds
    );
    const cost = pricing.everCoinCost;

    if (pricing.source !== "venice") {
      return NextResponse.json(
        { error: "VIDEO_PRICING_NOT_CONFIGURED" },
        { status: 503 }
      );
    }

    const { slug } = await params;`;

videoRoute = replaceRequired(
  videoRoute,
  postQuoteBlock,
  postLiveQuoteBlock,
  "require live quote before video charge"
);

if (
  !videoRoute.includes("resolution: pricing.resolution") ||
  !videoRoute.includes('const pricingConfigured = pricing.source === "venice";') ||
  !videoRoute.includes('if (pricing.source !== "venice")') ||
  !videoRoute.includes("videoCost: pricingConfigured ? cost : null")
) {
  throw new Error("Final video route quote/resolution validation failed.");
}

write(videoRoutePath, videoRoute);

// ===========================================================================
// GENERAL EVERCOIN PRICING API
// Keep fallback video estimates out of other UI surfaces too.
// ===========================================================================

const evercoinPricingPath = "src/app/api/evercoin/pricing/route.ts";
let evercoinPricing = read(evercoinPricingPath);

if (!evercoinPricing.includes('videoPricing.source === "venice"')) {
  evercoinPricing = replaceRequired(
    evercoinPricing,
    `  const videoPricing = await quoteEverCoinVideoCost();
  const videoCost = videoPricing.everCoinCost;`,
    `  const videoPricing = await quoteEverCoinVideoCost();
  const videoCost = videoPricing.everCoinCost;
  const videoPricingConfigured = videoPricing.source === "venice";`,
    "general live video quote status"
  );

  evercoinPricing = replaceRequired(
    evercoinPricing,
    `      videoCost,
      videoDisplayCost: videoPricing.displayCost,`,
    `      videoCost: videoPricingConfigured ? videoCost : null,
      videoDisplayCost: videoPricingConfigured
        ? videoPricing.displayCost
        : null,`,
    "general hidden fallback video price"
  );

  evercoinPricing = replaceRequired(
    evercoinPricing,
    `      videoPricingConfigured: true,`,
    `      videoPricingConfigured,`,
    "general video pricing availability"
  );
}

if (
  !evercoinPricing.includes('videoPricing.source === "venice"') ||
  !evercoinPricing.includes("videoPricingConfigured ? videoCost : null")
) {
  throw new Error("Final EverCoin video pricing API validation failed.");
}

write(evercoinPricingPath, evercoinPricing);

console.log(
  "EverBond video generation locked to 768p with original proportional EverCoin pricing and live-quote-only UI pricing."
);
