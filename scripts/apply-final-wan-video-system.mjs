#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const templateRoot = path.join(
  root,
  "scripts",
  "video-final-templates"
);

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    "utf8"
  );
}

function write(relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), {
    recursive: true
  });
  fs.writeFileSync(target, content, "utf8");
}

function copyTemplate(relativePath) {
  const source = path.join(
    templateRoot,
    relativePath
  );

  if (!fs.existsSync(source)) {
    throw new Error(
      `VIDEO_FINAL_TEMPLATE_MISSING:${relativePath}`
    );
  }

  write(
    relativePath,
    fs.readFileSync(source, "utf8")
  );
}

// This file deliberately keeps the existing filename because package.json
// already runs it LAST in predev/prebuild. It is now the final Grok -> Wan
// source of truth rather than a Wan-only finalizer.

copyTemplate("src/lib/video-pricing.ts");
copyTemplate("src/lib/video-routing.ts");
copyTemplate(
  "src/app/api/character-video-gallery/[slug]/route.ts"
);
copyTemplate(
  "src/app/api/cron/finalize-character-videos/route.ts"
);
copyTemplate(
  "src/app/api/evercoin/pricing/route.ts"
);

// Add the fallback billing RPC wrapper to the existing EverCoin library without
// replacing the rest of that file.
const evercoinPath = "src/lib/evercoin.ts";
let evercoin = read(evercoinPath);

if (
  !evercoin.includes(
    "export async function beginCharacterVideoFallback("
  )
) {
  const marker =
    "export async function completeCharacterVideoRequest(values: {";

  const index = evercoin.indexOf(marker);
  if (index < 0) {
    throw new Error(
      "VIDEO_FINALIZER_MISSING:evercoin video helper anchor"
    );
  }

  const helper = `export async function beginCharacterVideoFallback(values: {
  userId: string;
  requestId: string;
  expectedProviderModel: string;
  fallbackProviderModel: string;
  newAmount: number;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "begin_character_video_fallback",
    {
      p_user_id: values.userId,
      p_request_id: values.requestId,
      p_expected_provider_model: values.expectedProviderModel,
      p_fallback_provider_model: values.fallbackProviderModel,
      p_new_amount: Math.max(Math.trunc(values.newAmount), 1)
    }
  );

  if (error) throw error;

  const row = firstRow(data as {
    fallback_status: string;
    balance: number | string;
    debt: number | string;
    previous_amount: number | string;
    new_amount: number | string;
    error_code: string | null;
  } | Array<{
    fallback_status: string;
    balance: number | string;
    debt: number | string;
    previous_amount: number | string;
    new_amount: number | string;
    error_code: string | null;
  }> | null);

  return {
    status: row?.fallback_status ?? "unavailable",
    balance: Number(row?.balance ?? 0),
    debt: Number(row?.debt ?? 0),
    previousAmount: Number(row?.previous_amount ?? 0),
    newAmount: Number(row?.new_amount ?? 0),
    errorCode: row?.error_code ?? null
  };
}

`;

  evercoin =
    evercoin.slice(0, index) +
    helper +
    evercoin.slice(index);
}

write(evercoinPath, evercoin);

// Keep the Video Studio on the single 10-second product.
// The API response also supplies [10], so this is only the initial client value.
const clientPath =
  "src/components/media/CharacterGalleryClient.tsx";
let client = read(clientPath);

client = client.replace(
  /const \[videoDuration, setVideoDuration\] = useState\(\d+\);/,
  "const [videoDuration, setVideoDuration] = useState(10);"
);

// The Generate button advertises the approximate product price. The exact
// charge is calculated server-side from a fresh live quote at Generate time.
client = client
  .split(
    "`${copy.generateVideo} · ${videoData.videoCost} EverCoin`"
  )
  .join(
    "`${copy.generateVideo} · ~${videoData.videoCost} EverCoin`"
  );

write(clientPath, client);

for (const required of [
  "grok-imagine-reference-to-video",
  "wan-2-7-reference-to-video",
  'VIDEO_RESOLUTION = "720p"',
  "beginCharacterVideoFallback",
  "fallbackToWan",
  "ADVERTISED_VIDEO_EVERCOIN = 155",
  'duration: `${inputs.durationSeconds}s`',
  'duration: `${values.durationSeconds}s`',
  "reference_image_urls",
  "RETRYABLE_PROVIDER_HTTP_STATUSES",
  "VIDEO_DOWNLOAD_RETRYABLE"
]) {
  const combined =
    read("src/lib/video-pricing.ts") +
    read("src/lib/video-routing.ts") +
    read("src/app/api/character-video-gallery/[slug]/route.ts");

  if (!combined.includes(required)) {
    throw new Error(
      `VIDEO_FINAL_VALIDATION_FAILED:${required}`
    );
  }
}

const finalRouting = read("src/lib/video-routing.ts");
if (finalRouting.includes("referenceImageUrls")) {
  throw new Error(
    "VIDEO_FINAL_VALIDATION_FAILED:legacy Grok referenceImageUrls payload"
  );
}

console.log(
  "EVERBOND_VIDEO_FINAL primary=grok-imagine-reference-to-video fallback=wan-2-7-reference-to-video duration=10s resolution=720p pricing=live-proportional-1.12-to-199 display=approx-155 grok-queue-schema=10s+reference_image_urls transient-retrieve-errors=retry fallback=automatic-on-any-primary-failure+content-rejection canonical-routing=on"
);
