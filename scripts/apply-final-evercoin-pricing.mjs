import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, relativePath), source, "utf8");
}

function replaceRequired(source, pattern, replacement, label) {
  const next = source.replace(pattern, replacement);
  if (next === source && !source.includes(replacement)) {
    throw new Error(`FINAL_EVERCOIN_PRICING_MISSING:${label}`);
  }
  return next;
}

// One exact application source of truth for live-call billing.
// call-start and the server-authoritative minute boundary monitor both consume
// everCoinCallCostPerMinute(), and /api/evercoin/pricing exposes the same value.
{
  const relativePath = "src/lib/evercoin.ts";
  let source = read(relativePath);

  source = replaceRequired(
    source,
    /export function everCoinCallCostPerMinute\(\) \{[\s\S]*?\n\}/,
    `export function everCoinCallCostPerMinute() {
  return 69;
}`,
    "call-cost-per-minute"
  );

  source = replaceRequired(
    source,
    /export const EVERCOIN_IMAGE_COST = \d+;/,
    "export const EVERCOIN_IMAGE_COST = 20;",
    "image-cost"
  );

  source = replaceRequired(
    source,
    /export const EVERCOIN_VIDEO_COST = \d+;/,
    "export const EVERCOIN_VIDEO_COST = 90;",
    "legacy-video-cost"
  );

  write(relativePath, source);
}

// The final WaveSpeed video installer creates this runtime file immediately
// before this script. Patch the single production video charge after install.
{
  const relativePath = "src/lib/wavespeed-video.ts";
  let source = read(relativePath);

  source = replaceRequired(
    source,
    /export const VIDEO_EVERCOIN_COST = \d+;/,
    "export const VIDEO_EVERCOIN_COST = 90;",
    "wavespeed-video-cost"
  );

  write(relativePath, source);
}

// The older exact-video-wording prebuild step intentionally removed public
// voice-call marketing when voice calls were not a live feature. Voice calls
// are live again, so repair only the Buy EverCoin source that old step touches.
// This runs after apply-exact-video-wording.mjs in package.json.
{
  const relativePath = "src/app/coins/page.tsx";
  let source = read(relativePath);

  // The old cleanup regex removes the "Phone" prefix from PhoneCall and can
  // concatenate the remainder onto the preceding MessageCircleMore import.
  source = source.replace(
    "MessageCircleMoreCall",
    "MessageCircleMore,\n  PhoneCall"
  );

  write(relativePath, source);
}

{
  const relativePath = "src/lib/evercoin-page-language.ts";
  let source = read(relativePath);

  // Restore the three voice-call localization keys renamed by the old cleanup.
  source = source
    .split("removedVoiceCallsTitle")
    .join("voiceCallsTitle")
    .split("removedVoiceCallsBody")
    .join("voiceCallsBody")
    .split("removedMinuteUnit")
    .join("minuteUnit");

  write(relativePath, source);
}

// Buy EverCoin defaults. The pricing API is still the live source of truth;
// these defaults prevent stale values from flashing before the request finishes.
{
  const relativePath = "src/app/coins/page.tsx";
  let source = read(relativePath);

  source = replaceRequired(
    source,
    /const \[callCost, setCallCost\] = useState\(\d+\);/,
    "const [callCost, setCallCost] = useState(69);",
    "coins-call-default"
  );

  source = replaceRequired(
    source,
    /const \[imageCost, setImageCost\] = useState\(\d+\);/,
    "const [imageCost, setImageCost] = useState(20);",
    "coins-image-default"
  );

  source = replaceRequired(
    source,
    /const \[videoCost, setVideoCost\] = useState\(\d+\);/,
    "const [videoCost, setVideoCost] = useState(90);",
    "coins-video-default"
  );

  source = source.replace(
    /rate:\s*\n\s*`\$\{pageCopy\.about\} \$\{videoCost\} EverCoin \/ \$\{pageCopy\.videoUnit\}`/,
    "rate: `${videoCost} EverCoin / ${pageCopy.videoUnit}`"
  );

  write(relativePath, source);
}

const evercoin = read("src/lib/evercoin.ts");
const wavespeedVideo = read("src/lib/wavespeed-video.ts");
const coins = read("src/app/coins/page.tsx");
const evercoinCopy = read("src/lib/evercoin-page-language.ts");

for (const [label, ok] of [
  ["call=69", evercoin.includes("everCoinCallCostPerMinute() {\n  return 69;")],
  ["coins-phone-import", coins.includes("PhoneCall")],
  ["coins-bad-phone-import-absent", !coins.includes("MessageCircleMoreCall")],
  ["coins-five-columns", coins.includes("lg:grid-cols-5")],
  ["copy-call-title-key", evercoinCopy.includes("voiceCallsTitle")],
  ["copy-call-body-key", evercoinCopy.includes("voiceCallsBody")],
  ["copy-minute-key", evercoinCopy.includes("minuteUnit")],
  [
    "copy-obsolete-keys-absent",
    !evercoinCopy.includes("removedVoiceCalls") &&
      !evercoinCopy.includes("removedMinuteUnit")
  ],
  ["image=20", evercoin.includes("EVERCOIN_IMAGE_COST = 20")],
  ["video=90", wavespeedVideo.includes("VIDEO_EVERCOIN_COST = 90")],
  ["coins-call=69", coins.includes("useState(69)")],
  ["coins-image=20", coins.includes("useState(20)")],
  ["coins-video=90", coins.includes("useState(90)")],
  [
    "coins-call-card",
    coins.includes("`${callCost} EverCoin / ${pageCopy.minuteUnit}`")
  ],
  [
    "coins-video-exact",
    coins.includes("`${videoCost} EverCoin / ${pageCopy.videoUnit}`")
  ],
  [
    "message-price-unchanged",
    coins.includes("`1 EverCoin / ${pageCopy.messageUnit}`")
  ]
]) {
  if (!ok) {
    throw new Error(`FINAL_EVERCOIN_PRICING_VALIDATION_FAILED:${label}`);
  }
}

console.log(
  "EVERBOND_FINAL_PRICING message=1EC call=69EC/min image=20EC video=90EC buy-evercoin=updated"
);
