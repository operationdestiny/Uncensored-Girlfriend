#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const write = (p, s) => fs.writeFileSync(path.join(root, p), s, "utf8");

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) {
    throw new Error(`Final video business patch could not find: ${label}`);
  }
  return source.replace(from, to);
}

function replaceRegexRequired(source, pattern, replacement, present, label) {
  if (present && source.includes(present)) return source;
  if (!pattern.test(source)) {
    throw new Error(`Final video business patch could not find: ${label}`);
  }
  return source.replace(pattern, replacement);
}

// ---------------------------------------------------------------------------
// PRICING
// The previous finalizer locks H3 Enhanced R2V to 8 seconds and 768-class output.
// Venice MiniMax H3 requires the exact resolution enum token "768P" (capital P).
// This finalizer normalizes that provider token, then applies the business economics.
// ---------------------------------------------------------------------------
const pricingPath = "src/lib/video-pricing.ts";
let pricing = read(pricingPath);

// MiniMax H3's Venice schema is case-sensitive:
// accepted: "768P" | "2K"
// rejected: "768p"
pricing = replaceRequired(
  pricing,
  'const DEFAULT_RESOLUTION = "768p";',
  'const DEFAULT_RESOLUTION = "768P";',
  "MiniMax H3 exact 768P resolution enum"
);

// H3 Enhanced does not expose configurable audio in Venice.
// Venice requires the field to be omitted entirely; even `audio: false`
// is rejected by /video/queue for this exact model.
pricing = pricing
  .replace(/\n        audio: false,?/g, "")
  .replace(/\n        audio: inputs\.audio,?/g, "");

pricing = replaceRequired(
  pricing,
  "const DISPLAY_ROUNDING_INCREMENT = 10;",
  `const DISPLAY_ROUNDING_INCREMENT = 10;
const ADVERTISED_VIDEO_EVERCOIN = 155;
const MAX_VIDEO_EVERCOIN = 199;
const VIDEO_PROVIDER_COST_RECOVERY_EVERCOIN_PER_USD = 125;
const VIDEO_TARGET_CONTRIBUTION_EVERCOIN = 43;
const VIDEO_CHARGE_ROUNDING_INCREMENT = 5;`,
  "video business constants"
);

pricing = replaceRegexRequired(
  pricing,
  /export function everCoinVideoCostFromQuote\(quoteUsd: number\) \{[\s\S]*?\n\}\s*\nexport function roundedVideoDisplayCost/,
  `export function advertisedVideoEverCoinCost() {
  return ADVERTISED_VIDEO_EVERCOIN;
}

export function maxVideoEverCoinCost() {
  return MAX_VIDEO_EVERCOIN;
}

export function everCoinVideoCostFromQuote(quoteUsd: number) {
  if (!Number.isFinite(quoteUsd) || quoteUsd <= 0) return 0;

  const required = Math.max(
    Math.ceil(
      quoteUsd * VIDEO_PROVIDER_COST_RECOVERY_EVERCOIN_PER_USD +
        VIDEO_TARGET_CONTRIBUTION_EVERCOIN
    ),
    1
  );

  if (required > MAX_VIDEO_EVERCOIN) return required;

  const rounded =
    Math.ceil(required / VIDEO_CHARGE_ROUNDING_INCREMENT) *
    VIDEO_CHARGE_ROUNDING_INCREMENT;

  return Math.min(rounded, MAX_VIDEO_EVERCOIN);
}

export function roundedVideoDisplayCost`,
  "export function advertisedVideoEverCoinCost()",
  "fixed-profit video charge"
);

pricing = replaceRegexRequired(
  pricing,
  /export function roundedVideoDisplayCost\(everCoinCost: number\) \{[\s\S]*?\n\}/,
  `export function roundedVideoDisplayCost(_everCoinCost: number) {
  return ADVERTISED_VIDEO_EVERCOIN;
}`,
  "export function roundedVideoDisplayCost(_everCoinCost: number)",
  "stable advertised video cost"
);

if (
  !pricing.includes('const DEFAULT_VIDEO_MODEL = "minimax-h3-enhanced-reference-to-video";') ||
  !pricing.includes('const DEFAULT_RESOLUTION = "768P";') ||
  !pricing.includes("resolution: inputs.resolution") ||
  !pricing.includes("ADVERTISED_VIDEO_EVERCOIN = 155") ||
  !pricing.includes("MAX_VIDEO_EVERCOIN = 199") ||
  pricing.includes("audio: false") ||
  pricing.includes("audio: inputs.audio")
) {
  throw new Error("Final H3 pricing validation failed.");
}
write(pricingPath, pricing);

// ---------------------------------------------------------------------------
// VIDEO ROUTE
// Page load shows ~155 EC without depending on a live quote. Generate itself
// always requires a fresh Venice quote and rejects any charge above 199 EC
// before the existing atomic reservation RPC can debit the user.
// ---------------------------------------------------------------------------
const videoRoutePath = "src/app/api/character-video-gallery/[slug]/route.ts";
let videoRoute = read(videoRoutePath);

videoRoute = replaceRequired(
  videoRoute,
  'import { quoteEverCoinVideoCost } from "@/lib/video-pricing";',
  `import {
  advertisedVideoEverCoinCost,
  maxVideoEverCoinCost,
  quoteEverCoinVideoCost
} from "@/lib/video-pricing";`,
  "video pricing imports"
);

videoRoute = replaceRequired(
  videoRoute,
  `    const pricing = await quoteEverCoinVideoCost(
      VIDEO_DURATIONS[0]
    );
    const cost = pricing.everCoinCost;
    const pricingConfigured = pricing.source === "venice";
    return NextResponse.json(`,
  `    const advertisedCost = advertisedVideoEverCoinCost();
    const pricingConfigured = Boolean(
      process.env.VENICE_API_KEY?.trim()
    );
    return NextResponse.json(`,
  "stable gallery price"
);

videoRoute = replaceRequired(
  videoRoute,
  `        videoCost: pricingConfigured ? cost : null,
        videoDisplayCost: pricingConfigured ? pricing.displayCost : null,
        pricingConfigured,`,
  `        videoCost: advertisedCost,
        videoDisplayCost: advertisedCost,
        pricingConfigured,`,
  "gallery display price"
);

videoRoute = replaceRequired(
  videoRoute,
  `    const pricing = await quoteEverCoinVideoCost(
      parsed.data.durationSeconds
    );
    const cost = pricing.everCoinCost;

    if (pricing.source !== "venice") {
      return NextResponse.json(
        { error: "VIDEO_PRICING_NOT_CONFIGURED" },
        { status: 503 }
      );
    }

    const { slug } = await params;`,
  `    const pricing = await quoteEverCoinVideoCost(
      parsed.data.durationSeconds
    );

    if (pricing.source !== "venice") {
      return NextResponse.json(
        { error: "VIDEO_PRICING_NOT_CONFIGURED" },
        { status: 503 }
      );
    }

    const cost = pricing.everCoinCost;
    const maxCost = maxVideoEverCoinCost();

    if (cost <= 0 || cost > maxCost) {
      console.error("H3 video quote exceeds EverBond ceiling:", {
        quoteUsd: pricing.quoteUsd,
        requiredEverCoin: cost,
        maxEverCoin: maxCost,
        resolution: pricing.resolution
      });
      return NextResponse.json(
        { error: "VIDEO_PRICE_ABOVE_LIMIT" },
        { status: 503 }
      );
    }

    console.info("H3 video price locked:", {
      quoteUsd: pricing.quoteUsd,
      everCoinCost: cost,
      model: pricing.model,
      resolution: pricing.resolution
    });

    const { slug } = await params;`,
  "live quote ceiling"
);

// H3 Enhanced queue hardening.
// Keep only provider-supported generation fields. Do not send audio at all.
videoRoute = videoRoute
  .replace(/\n\s+audio: false,?/g, "")
  .replace(/\n\s+audio: pricing\.audio,?/g, "");

// The existing H3 queue already reached Venice's model validator successfully.
// Keep its duration/reference/prompt structure unchanged. Only unsupported
// provider configuration fields are removed here.

if (
  !videoRoute.includes("videoCost: advertisedCost") ||
  !videoRoute.includes("cost > maxCost") ||
  !videoRoute.includes("amount: cost,") ||
  !videoRoute.includes("required: cost") ||
  !videoRoute.includes("resolution: pricing.resolution") ||
  !videoRoute.includes("reference_image_urls:") ||
  !videoRoute.includes("parsed.data.prompt") ||
  videoRoute.includes("audio: false") ||
  videoRoute.includes("audio: pricing.audio")
) {
  throw new Error("Final H3 video route validation failed.");
}
write(videoRoutePath, videoRoute);

// ---------------------------------------------------------------------------
// GENERAL EVERCOIN PRICING API
// ---------------------------------------------------------------------------
const pricingApiPath = "src/app/api/evercoin/pricing/route.ts";
let pricingApi = read(pricingApiPath);

pricingApi = replaceRequired(
  pricingApi,
  'import { quoteEverCoinVideoCost } from "@/lib/video-pricing";',
  'import { advertisedVideoEverCoinCost } from "@/lib/video-pricing";',
  "pricing API import"
);

pricingApi = replaceRequired(
  pricingApi,
  `export async function GET() {
  const videoPricing = await quoteEverCoinVideoCost();
  const videoCost = videoPricing.everCoinCost;
  const videoPricingConfigured = videoPricing.source === "venice";`,
  `export async function GET() {
  const videoCost = advertisedVideoEverCoinCost();
  const videoPricingConfigured = Boolean(
    process.env.VENICE_API_KEY?.trim()
  );`,
  "pricing API stable price"
);

pricingApi = replaceRequired(
  pricingApi,
  `      videoCost: videoPricingConfigured ? videoCost : null,
      videoDisplayCost: videoPricingConfigured
        ? videoPricing.displayCost
        : null,
      videoDurationSeconds: videoPricing.durationSeconds,
      videoAudioEnabled: videoPricing.audio,
      videoPricingConfigured,`,
  `      videoCost,
      videoDisplayCost: videoCost,
      videoDurationSeconds: 8,
      videoAudioEnabled: false,
      videoPricingConfigured,`,
  "pricing API response"
);

if (pricingApi.includes("await quoteEverCoinVideoCost()")) {
  throw new Error("Pricing API still depends on a page-load Venice quote.");
}
write(pricingApiPath, pricingApi);

// ---------------------------------------------------------------------------
// VIDEO STUDIO CLIENT
// ---------------------------------------------------------------------------
const clientPath = "src/components/media/CharacterGalleryClient.tsx";
let client = read(clientPath);

client = replaceRequired(
  client,
  `  const canGenerateVideo =
    Boolean(videoData?.pricingConfigured) &&
    !videoAtLimit &&
    videoPrompt.trim().length >= 3 &&
    !videoBusy;`,
  `  const canGenerateVideo =
    Boolean(videoData) &&
    !videoAtLimit &&
    videoPrompt.trim().length >= 3 &&
    !videoBusy;`,
  "video button gate"
);

client = client.replace(
  `                {!videoData.pricingConfigured && (
                  <p className="mt-4 rounded-xl border border-bond-gold/25 bg-bond-gold/10 px-4 py-3 text-sm font-semibold text-bond-gold">
                    {copy.pricingPendingBody}
                  </p>
                )}
`,
  ""
);

client = replaceRequired(
  client,
  `                  {videoBusy
                    ? copy.creatingVideo
                    : videoData.pricingConfigured
                      ? \`\${copy.generateVideo} · \${videoData.videoCost} EverCoin\`
                      : copy.pricingPending}`,
  `                  {videoBusy
                    ? copy.creatingVideo
                    : \`\${copy.generateVideo} · ~\${videoData.videoCost} EverCoin\`}`,
  "advertised video button"
);

client = replaceRequired(
  client,
  `      if (payload?.error === "VIDEO_PRICING_NOT_CONFIGURED") {
        setVideoError(copy.pricingPendingBody);
        return;
      }`,
  `      if (
        payload?.error === "VIDEO_PRICING_NOT_CONFIGURED" ||
        payload?.error === "VIDEO_PRICE_ABOVE_LIMIT"
      ) {
        setVideoError(copy.pricingPendingBody);
        return;
      }`,
  "video quote error handling"
);

if (
  client.includes("Boolean(videoData?.pricingConfigured) &&") ||
  client.includes("!videoData.pricingConfigured &&") ||
  !client.includes("~${videoData.videoCost} EverCoin")
) {
  throw new Error("Final video client validation failed.");
}
write(clientPath, client);

// ---------------------------------------------------------------------------
// USER COPY — pricingPendingBody now means a temporary provider-price issue,
// never "video is disabled until a price is set".
// ---------------------------------------------------------------------------
const copyPath = "src/lib/media-gallery-language.ts";
let copy = read(copyPath);
const replacements = [
  ["Video generation is fully wired but remains disabled until the EverCoin price is set.", "Video generation is temporarily unavailable. No EverCoin was charged. Please try again shortly."],
  ["La generación de video está conectada, pero permanecerá desactivada hasta fijar el precio en EverCoin.", "La generación de video no está disponible temporalmente. No se cobraron EverCoin. Inténtalo de nuevo en breve."],
  ["La génération vidéo est entièrement intégrée, mais reste désactivée jusqu’à la définition du tarif EverCoin.", "La génération vidéo est temporairement indisponible. Aucun EverCoin n’a été débité. Réessayez dans un instant."],
  ["Die Videogenerierung ist vollständig verbunden, bleibt aber deaktiviert, bis der EverCoin-Preis festgelegt ist.", "Die Videogenerierung ist vorübergehend nicht verfügbar. Es wurden keine EverCoin berechnet. Bitte versuche es gleich erneut."],
  ["動画生成は接続済みですが、EverCoin価格が設定されるまで無効です。", "動画生成は一時的に利用できません。EverCoinは消費されていません。しばらくしてからもう一度お試しください。"],
  ["영상 생성은 연결되었지만 EverCoin 가격을 설정할 때까지 비활성화됩니다.", "영상 생성을 일시적으로 사용할 수 없습니다. EverCoin은 차감되지 않았습니다. 잠시 후 다시 시도해 주세요."]
];
for (const [from, to] of replacements) copy = copy.split(from).join(to);
write(copyPath, copy);

console.log(
  "EverBond video fully wired: H3 Enhanced R2V, 8s 768P, provider-safe payload, active reference image + user prompt, ~155 EC advertised, exact live quote charge, 199 EC ceiling, existing atomic refunds preserved."
);
