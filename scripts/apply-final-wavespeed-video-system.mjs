import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const templateRoot = join(
  root,
  "scripts",
  "wavespeed-video-final-templates",
  "src"
);

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

function copyTemplate(relativePath) {
  const source = join(templateRoot, relativePath);
  const target = join(root, "src", relativePath);
  if (!existsSync(source)) {
    throw new Error(`WAVESPEED_VIDEO_TEMPLATE_MISSING:${relativePath}`);
  }
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

function replaceRequired(source, searchValue, replacement, label) {
  const next = source.replace(searchValue, replacement);
  if (next === source) {
    throw new Error(`WAVESPEED_VIDEO_PATCH_MISSING:${label}`);
  }
  return next;
}

for (const relativePath of [
  "lib/wavespeed-video.ts",
  "app/api/character-video-gallery/[slug]/route.ts",
  "app/api/cron/finalize-character-videos/route.ts",
  "app/api/evercoin/pricing/route.ts"
]) {
  copyTemplate(relativePath);
}

// Remove the retired Venice/Grok/Wan video runtime modules. Venice remains in
// place everywhere else in EverBond; only video generation moves to WaveSpeed.
for (const retired of [
  "src/lib/video-pricing.ts",
  "src/lib/video-routing.ts"
]) {
  rmSync(join(root, retired), { force: true });
}

// Remove the retired Grok/Wan final-template tree entirely. EverBond's
// tsconfig includes every **/*.ts file in the repository, so leaving these
// abandoned templates on disk makes Next.js type-check dead Venice code even
// though the live src/ runtime has already been replaced by WaveSpeed.
rmSync(join(root, "scripts", "video-final-templates"), {
  recursive: true,
  force: true
});
rmSync(join(root, "scripts", "apply-final-wan-video-system.mjs"), {
  force: true
});

// Keep the shared EverCoin helper aligned with the fixed Video Studio charge.
{
  const path = "src/lib/evercoin.ts";
  let source = read(path);
  source = replaceRequired(
    source,
    /export const EVERCOIN_VIDEO_COST = \d+;/,
    "export const EVERCOIN_VIDEO_COST = 80;",
    "evercoin-video-cost"
  );
  write(path, source);
}

// Video Studio: no user prompt, no duration selector/state, fixed server-side
// 10-second generation. Image Studio is deliberately left untouched.
{
  const path = "src/components/media/CharacterGalleryClient.tsx";
  let source = read(path);

  source = replaceRequired(
    source,
    /(type GalleryVideo = \{[\s\S]*?)(\n  prompt: string;)([\s\S]*?\n\};)/,
    "$1$3",
    "gallery-video-prompt-type"
  );

  source = replaceRequired(
    source,
    /\n  durationOptions: number\[\];/,
    "",
    "video-duration-options-type"
  );

  source = replaceRequired(
    source,
    /\nconst VIDEO_PROMPT_MAX_CHARACTERS = 1_000;/,
    "",
    "video-prompt-max"
  );

  source = replaceRequired(
    source,
    /\n  const \[videoPrompt, setVideoPrompt\] = useState\(""\);/,
    "",
    "video-prompt-state"
  );

  source = replaceRequired(
    source,
    /\n  const \[videoDuration, setVideoDuration\] = useState\([^\n]+\);/,
    "",
    "video-duration-state"
  );

  source = replaceRequired(
    source,
    /  const canGenerateVideo =\n    Boolean\(videoData\?\.pricingConfigured\) &&\n    !videoAtLimit &&\n    videoPrompt\.trim\(\)\.length >= 3 &&\n    !videoBusy;/,
    "  const canGenerateVideo =\n    Boolean(videoData?.pricingConfigured) &&\n    !videoAtLimit &&\n    !videoBusy;",
    "video-can-generate"
  );

  source = replaceRequired(
    source,
    /\n\s*if \(nextVideos\.durationOptions\?\.length\) \{\n\s*setVideoDuration\(nextVideos\.durationOptions\[0\]\);\n\s*\}/,
    "",
    "video-duration-load"
  );

  source = source.replace(/\n\s*setVideoPrompt\(""\);/g, "");

  source = replaceRequired(
    source,
    /body: JSON\.stringify\(\{\n\s*requestId,\n\s*prompt: videoPrompt\.trim\(\),\n\s*durationSeconds: videoDuration\n\s*\}\)/,
    "body: JSON.stringify({ requestId })",
    "video-post-body"
  );

  source = replaceRequired(
    source,
    /\n\s*<textarea\n\s*value=\{videoPrompt\}[\s\S]*?\{videoPrompt\.length\} \/ \{VIDEO_PROMPT_MAX_CHARACTERS\}\n\s*<\/p>\n/,
    "\n",
    "video-prompt-ui"
  );

  source = replaceRequired(
    source,
    /\n\s*<p className="line-clamp-2 min-h-\[2\.7rem\] text-sm leading-6 text-bond-muted">\n\s*\{video\.prompt\}\n\s*<\/p>/,
    "",
    "video-card-prompt"
  );

  for (const forbidden of [
    "videoPrompt",
    "setVideoPrompt",
    "videoDuration",
    "setVideoDuration",
    "VIDEO_PROMPT_MAX_CHARACTERS",
    "video.prompt",
    "durationOptions"
  ]) {
    if (source.includes(forbidden)) {
      throw new Error(`WAVESPEED_VIDEO_UI_VALIDATION_FAILED:${forbidden}`);
    }
  }

  write(path, source);
}

// Keep all supported languages truthful now that Video Studio has no prompt.
{
  const path = "src/lib/media-gallery-language.ts";
  let source = read(path);
  const replacements = new Map([
    [
      'videoEmpty: "No private videos yet. Describe one above to create it.",',
      'videoEmpty: "No private videos yet. Click generate video to create a charming video of your companion.",'
    ],
    [
      'videoEmpty: "Aún no hay videos privados. Describe uno arriba para crearlo.",',
      'videoEmpty: "Aún no hay videos privados. Haz clic en Crear video para crear un video encantador de tu compañero.",'
    ],
    [
      'videoEmpty: "Aucune vidéo privée pour le moment. Décrivez-en une ci-dessus.",',
      'videoEmpty: "Aucune vidéo privée pour le moment. Cliquez sur Créer la vidéo pour créer une charmante vidéo de votre compagnon.",'
    ],
    [
      'videoEmpty: "Noch keine privaten Videos. Beschreibe oben dein erstes Video.",',
      'videoEmpty: "Noch keine privaten Videos. Klicke auf Video erstellen, um ein charmantes Video deines Begleiters zu erstellen.",'
    ],
    [
      'videoEmpty: "まだ非公開動画がありません。上で説明して作成してください。",',
      'videoEmpty: "まだ非公開動画がありません。動画を生成をクリックして、コンパニオンの魅力的な動画を作成してください。",'
    ],
    [
      'videoEmpty: "아직 비공개 영상이 없습니다. 위에서 설명해 만들어 보세요.",',
      'videoEmpty: "아직 비공개 영상이 없습니다. 영상 생성을 눌러 컴패니언의 매력적인 영상을 만들어 보세요.",'
    ]
  ]);

  for (const [before, after] of replacements) {
    source = replaceRequired(source, before, after, `video-empty:${before.slice(0, 24)}`);
  }
  write(path, source);
}

const runtimeCombined = [
  read("src/lib/wavespeed-video.ts"),
  read("src/app/api/character-video-gallery/[slug]/route.ts"),
  read("src/app/api/cron/finalize-character-videos/route.ts"),
  read("src/app/api/evercoin/pricing/route.ts")
].join("\n");

for (const required of [
  'bytedance/seedance-v1.5-pro/image-to-video-spicy',
  "VIDEO_DURATION_SECONDS = 10",
  "VIDEO_EVERCOIN_COST = 80",
  'VIDEO_RESOLUTION = "720p"',
  "generate_audio: false",
  "camera_fixed: false",
  "enable_safety_checker = false",
  "WAVESPEED_API_KEY"
]) {
  if (!runtimeCombined.includes(required)) {
    throw new Error(`WAVESPEED_VIDEO_FINAL_VALIDATION_FAILED:${required}`);
  }
}

for (const retired of [
  "grok-imagine-reference-to-video",
  "wan-2-7-reference-to-video",
  "quoteEverCoinVideoCost",
  "beginCharacterVideoFallback",
  "VENICE_VIDEO_MODEL"
]) {
  if (runtimeCombined.includes(retired)) {
    throw new Error(`WAVESPEED_VIDEO_RETIRED_RUNTIME_FOUND:${retired}`);
  }
}

const ui = read("src/components/media/CharacterGalleryClient.tsx");
if (!ui.includes("copy.videoStudio") || !ui.includes("copy.videoEmpty")) {
  throw new Error("WAVESPEED_VIDEO_UI_VALIDATION_FAILED:studio-copy");
}

if (existsSync(join(root, "scripts", "video-final-templates"))) {
  throw new Error("WAVESPEED_VIDEO_RETIRED_TEMPLATE_TREE_STILL_PRESENT");
}

console.log(
  "EVERBOND_VIDEO_FINAL provider=wavespeed model=bytedance/seedance-v1.5-pro/image-to-video-spicy duration=10s resolution=720p audio=off evercoin=80 prompt-ui=removed provider-prompt=omitted gallery-limit=5"
);
