#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const write = (p, s) => fs.writeFileSync(path.join(root, p), s, "utf8");

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) {
    throw new Error(`Wan finalizer could not find: ${label}`);
  }
  return source.replace(from, to);
}

// This finalizer is intended to run AFTER apply-video-business-final.mjs.
// It keeps EverBond's existing queue/retrieve/storage/refund/billing flow and
// replaces only the final video provider configuration with Wan 2.7 R2V.

const pricingPath = "src/lib/video-pricing.ts";
let pricing = read(pricingPath);

pricing = pricing
  .replace(
    'const DEFAULT_VIDEO_MODEL = "minimax-h3-enhanced-reference-to-video";',
    'const DEFAULT_VIDEO_MODEL = "wan-2-7-reference-to-video";'
  )
  .replace(
    'const DEFAULT_VIDEO_MODEL = "kling-o3-standard-reference-to-video";',
    'const DEFAULT_VIDEO_MODEL = "wan-2-7-reference-to-video";'
  );

if (!pricing.includes('const DEFAULT_VIDEO_MODEL = "wan-2-7-reference-to-video";')) {
  // The checked-in source may already be Wan before the earlier build scripts run.
  pricing = pricing.replace(
    /const DEFAULT_VIDEO_MODEL = "[^"]+";/,
    'const DEFAULT_VIDEO_MODEL = "wan-2-7-reference-to-video";'
  );
}

// Wan 2.7 R2V supports 720P/1080P, not MiniMax's 768P tier.
pricing = pricing.replace(
  /const DEFAULT_RESOLUTION = "(?:768P|768p|720p|1080p)";/,
  'const DEFAULT_RESOLUTION = "720P";'
);

// Never let environment variables silently put the site back on another model.
pricing = pricing.replace(
  /    model:\n      process\.env\.VENICE_VIDEO_MODEL\?\.trim\(\) \|\|\n      DEFAULT_VIDEO_MODEL,/,
  "    model: DEFAULT_VIDEO_MODEL,"
);

// Lock the low Wan tier as well, so quote and generation always match.
pricing = pricing.replace(
  /  const configuredResolution =[\s\S]*?\n    : DEFAULT_RESOLUTION;/,
  "  const resolution = DEFAULT_RESOLUTION;"
);

if (!pricing.includes("resolution: inputs.resolution")) {
  pricing = replaceRequired(
    pricing,
    "        duration: inputs.duration,\n        aspect_ratio:",
    "        duration: inputs.duration,\n        resolution: inputs.resolution,\n        aspect_ratio:",
    "Wan quote resolution"
  );
}

if (
  !pricing.includes('const DEFAULT_VIDEO_MODEL = "wan-2-7-reference-to-video";') ||
  !pricing.includes('const DEFAULT_RESOLUTION = "720P";') ||
  !pricing.includes("model: DEFAULT_VIDEO_MODEL") ||
  !pricing.includes("resolution: inputs.resolution")
) {
  throw new Error("Wan pricing validation failed.");
}

write(pricingPath, pricing);

const routePath = "src/app/api/character-video-gallery/[slug]/route.ts";
let route = read(routePath);

route = route
  .split("VIDEO_H3_QUEUE_RECOVERY")
  .join("VIDEO_WAN_QUEUE_RECOVERY")
  .split("VIDEO_KLING_QUEUE_RECOVERY")
  .join("VIDEO_WAN_QUEUE_RECOVERY")
  .split("MiniMax H3")
  .join("Wan 2.7 Reference")
  .split("H3 video")
  .join("Wan video")
  .split("H3 Enhanced")
  .join("Wan 2.7 Reference");

// The current generic R2V queue payload already uses reference_image_urls.
// Keep the image as identity input and the user's prompt as the scene/action input.
if (!route.includes("resolution: pricing.resolution")) {
  route = replaceRequired(
    route,
    '                duration: queueDuration,\n                aspect_ratio: "9:16",',
    '                duration: queueDuration,\n                resolution: pricing.resolution,\n                aspect_ratio: "9:16",',
    "Wan queue resolution"
  );
}

route = route.replace(
  "Preserve @Image1's recognizable face, identity, adult age, body, skin tone, hair, and defining appearance throughout the video. ",
  "Preserve @Image1's recognizable face, identity, adult age, skin tone, hair, and defining appearance throughout the video. "
);

if (
  !route.includes("reference_image_urls:") ||
  !route.includes("parsed.data.prompt") ||
  !route.includes("resolution: pricing.resolution") ||
  !route.includes('aspect_ratio: "9:16"')
) {
  throw new Error("Wan route validation failed.");
}

write(routePath, route);

console.log(
  "EverBond video provider finalized as wan-2-7-reference-to-video, 720P, 9:16, 8s, reference image + user prompt."
);
