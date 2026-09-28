#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function file(relativePath) {
  return path.join(root, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(file(relativePath));
}

function read(relativePath) {
  return fs.readFileSync(file(relativePath), "utf8");
}

function write(relativePath, source) {
  fs.mkdirSync(path.dirname(file(relativePath)), { recursive: true });
  fs.writeFileSync(file(relativePath), source, "utf8");
}

function replaceIfPresent(relativePath, from, to) {
  if (!exists(relativePath)) return;
  const source = read(relativePath);
  if (!source.includes(from) || source.includes(to)) return;
  write(relativePath, source.replace(from, to));
}

function removeVoiceMarketingFromWhyEverBond() {
  const relativePath = "src/app/why-everbond/page.tsx";
  if (!exists(relativePath)) return;
  let source = read(relativePath);

  source = source.replace(/\n\s*\| "live-video-calls"/g, "");
  source = source.replace(
    /\n\s*\{\n\s*"key": "live-video-calls",[\s\S]*?\n\s*\},(?=\n\s*\{\n\s*"key": "video-generation")/g,
    ""
  );
  source = source.replace(
    /\n\s*"live-video-calls": "live-video-calls\.webp",/g,
    ""
  );

  const replacements = [
    ["unrestricted private chats, uncensored image and video creation, live uncensored voice video calls, meaningful gifts", "unrestricted private chats, uncensored image and video creation, meaningful gifts"],
    ["unrestricted private chats, uncensored image and video creation, live uncensored voice calls, meaningful gifts", "unrestricted private chats, uncensored image and video creation, meaningful gifts"],
    ["unrestricted private chats, uncensored image and video creation, live voice calls, meaningful gifts", "unrestricted private chats, uncensored image and video creation, meaningful gifts"],
    ["Text, images, generated video, live calls, gifts", "Text, images, generated video, gifts"],
    ["Chat, images, videos, live calls, gifts, and memory", "Chat, images, videos, gifts, and memory"],
    ["chats privados sin restricciones, creación de imágenes y vídeos sin censura, videollamadas de voz en directo sin censura, regalos", "chats privados sin restricciones, creación de imágenes y vídeos sin censura, regalos"],
    ["Chat, imágenes, vídeos, llamadas en directo, regalos y memoria", "Chat, imágenes, vídeos, regalos y memoria"],
    ["discussions privées sans restrictions, la création d’images et de vidéos non censurées, des appels vidéo vocaux en direct non censurés, des cadeaux", "discussions privées sans restrictions, la création d’images et de vidéos non censurées, des cadeaux"],
    ["Chat, images, vidéos, appels en direct, cadeaux et mémoire", "Chat, images, vidéos, cadeaux et mémoire"],
    ["uneingeschränkte private Chats, unzensierte Bild- und Videoerstellung, unzensierte Live-Sprach-Videoanrufe, bedeutungsvolle Geschenke", "uneingeschränkte private Chats, unzensierte Bild- und Videoerstellung, bedeutungsvolle Geschenke"],
    ["Chat, Bilder, Videos, Live-Anrufe, Geschenke und Erinnerung", "Chat, Bilder, Videos, Geschenke und Erinnerung"],
    ["制限のないプライベートチャット、無検閲の画像・動画生成、ライブ音声ビデオ通話、意味のあるギフト", "制限のないプライベートチャット、無検閲の画像・動画生成、意味のあるギフト"],
    ["チャット、画像、動画、ライブ通話、ギフト、記憶", "チャット、画像、動画、ギフト、記憶"],
    ["제한 없는 비공개 채팅, 무검열 이미지 및 영상 생성, 라이브 음성 영상 통화, 의미 있는 선물", "제한 없는 비공개 채팅, 무검열 이미지 및 영상 생성, 의미 있는 선물"],
    ["채팅, 이미지, 영상, 라이브 통화, 선물, 기억", "채팅, 이미지, 영상, 선물, 기억"],
    [", live uncensored voice video calls", ""],
    [", live uncensored voice calls", ""],
    [", live voice calls", ""],
    [", live calls", ""],
    [", voice calls", ""],
    ["voice video calls", ""],
    ["voice calls", ""],
    ["Voice calls", ""],
    ["Live voice calls", ""],
    ["live voice calls", ""],
    ["Live uncensored voice video calls", ""],
    ["Live uncensored voice calls", ""],
    ["videollamadas de voz en directo sin censura", ""],
    ["appels vidéo vocaux en direct non censurés", ""],
    ["unzensierte Live-Sprach-Videoanrufe", ""],
    ["ライブ音声ビデオ通話", ""],
    ["라이브 음성 영상 통화", ""]
  ];

  for (const [before, after] of replacements) {
    source = source.split(before).join(after);
  }

  write(relativePath, source);
}

function removeVoiceFromChatToolbar() {
  const relativePath = "src/components/media/ChatMediaBridge.tsx";
  if (!exists(relativePath)) return;
  let source = read(relativePath);

  source = source.replace(
    'import { ImageIcon, Phone, ShoppingBag } from "lucide-react";',
    'import { ImageIcon, ShoppingBag } from "lucide-react";'
  );
  source = source.replace(/\nimport \{ InsufficientEverCoinModal \} from "@\/components\/media\/InsufficientEverCoinModal";/, "");
  source = source.replace(/\nimport \{ VoiceCallModal \} from "@\/components\/media\/VoiceCallModal";/, "");
  source = source.replace(/\nimport \{ MEDIA_COPY \} from "@\/lib\/media-language";/, "");
  source = source.replace(/\n\s*const copy = MEDIA_COPY\[language\] \?\? MEDIA_COPY\.EN;/, "");
  source = source.replace(/\n\s*const \[callOpen, setCallOpen\] = useState\(false\);/, "");
  source = source.replace(/\n\s*const \[coinModal, setCoinModal\] = useState\(false\);/, "");
  source = source.replace(
    /\n\s*<button\n\s*type="button"\n\s*onClick=\{\(\) => requireSession\(\(\) => setCallOpen\(true\)\)\}[\s\S]*?\n\s*<\/button>\n(?=\n\s*<Link)/,
    "\n"
  );
  source = source.replace(/\n\s*\{session && \(\n\s*<VoiceCallModal[\s\S]*?\n\s*\)\}\n/, "\n");
  source = source.replace(/\n\s*<InsufficientEverCoinModal\n\s*open=\{coinModal\}[\s\S]*?\n\s*\/\>\n/, "\n");

  write(relativePath, source);
}

function removeVoiceFromCoinsPage() {
  const relativePath = "src/app/coins/page.tsx";
  if (!exists(relativePath)) return;
  let source = read(relativePath);

  source = source.replace(/,\n\s*Phone/g, "");
  source = source.replace(/\n\s*const \[callCost, setCallCost\] = useState\(30\);/, "");
  source = source.replace(/\n\s*const nextCallCost = Number\(payload\?\.callCostPerMinute\);/, "");
  source = source.replace(/\n\s*if \(Number\.isFinite\(nextCallCost\) && nextCallCost > 0\) \{\n\s*setCallCost\(Math\.trunc\(nextCallCost\)\);\n\s*\}/, "");
  source = source.replace(/,\n\s*\{\n\s*icon: Phone,\n\s*title: pageCopy\.voiceCallsTitle,[\s\S]*?rate: `\$\{callCost\} EverCoin \/ \$\{pageCopy\.minuteUnit\}`\n\s*\}/, "");
  source = source.replace("2xl:grid-cols-5", "2xl:grid-cols-4");

  write(relativePath, source);
}

function removeVoiceFromKnownCopyFiles() {
  const paths = [
    "src/lib/site-language.ts",
    "src/lib/legal-page-language.ts",
    "src/lib/evercoin-page-language.ts"
  ];

  const replacements = [
    [" for live voice calls, image generation, video generation, gifts inside chat, and premium character chats", " for image generation, video generation, gifts inside chat, and premium character chats"],
    [" for live voice video calls, image generation, video generation, gifts inside chat, and premium character chats", " for image generation, video generation, gifts inside chat, and premium character chats"],
    ["para videollamadas de voz en directo, generación de imágenes, generación de vídeos, regalos dentro del chat y chats premium con personajes", "para generación de imágenes, generación de vídeos, regalos dentro del chat y chats premium con personajes"],
    ["pour les appels vidéo vocaux en direct, la génération d’images, la génération de vidéos, les cadeaux dans le chat et les discussions premium avec les personnages", "pour la génération d’images, la génération de vidéos, les cadeaux dans le chat et les discussions premium avec les personnages"],
    ["für Live-Sprach-Videoanrufe, Bilderstellung, Videoerstellung, Geschenke im Chat und Premium-Charakter-Chats", "für Bilderstellung, Videoerstellung, Geschenke im Chat und Premium-Charakter-Chats"],
    ["ライブ音声ビデオ通話、画像生成、動画生成、チャット内ギフト、プレミアムキャラクターチャット", "画像生成、動画生成、チャット内ギフト、プレミアムキャラクターチャット"],
    ["라이브 음성 영상 통화, 이미지 생성, 영상 생성, 채팅 내 선물, 프리미엄 캐릭터 채팅", "이미지 생성, 영상 생성, 채팅 내 선물, 프리미엄 캐릭터 채팅"],
    ["voiceCallsTitle", "removedVoiceCallsTitle"],
    ["voiceCallsBody", "removedVoiceCallsBody"],
    ["minuteUnit", "removedMinuteUnit"],
    ["Live voice calls", ""],
    ["live voice calls", ""],
    ["voice video calls", ""],
    ["voice calls", ""],
    ["Voice calls", ""],
    ["Live-Sprach-Videoanrufe", ""],
    ["appels vidéo vocaux", ""],
    ["videollamadas de voz", ""],
    ["ライブ音声ビデオ通話", ""],
    ["라이브 음성 영상 통화", ""]
  ];

  for (const relativePath of paths) {
    if (!exists(relativePath)) continue;
    let source = read(relativePath);
    for (const [before, after] of replacements) {
      source = source.split(before).join(after);
    }
    write(relativePath, source);
  }
}

function applyWaveSpeedDirectUploadToTemplate() {
  const paths = [
    "scripts/wavespeed-video-final-templates/src/lib/wavespeed-video.ts",
    "src/lib/wavespeed-video.ts"
  ];

  const replacement = [
    "async function uploadReferenceImage(apiKey: string, dataUrl: string) {",
    "  const reference = parseReferenceDataUrl(dataUrl);",
    "",
    "  const ticketResponse = await fetch(`${WAVESPEED_API_BASE}/media/uploads`, {",
    "    method: \"POST\",",
    "    headers: providerHeaders(apiKey),",
    "    body: JSON.stringify({",
    "      filename: reference.filename,",
    "      size: reference.bytes.length,",
    "      content_type: reference.contentType",
    "    }),",
    "    signal: AbortSignal.timeout(30_000)",
    "  });",
    "",
    "  const ticketPayload = await ticketResponse.json().catch(() => null);",
    "  if (!ticketResponse.ok || Number(ticketPayload?.code ?? 200) !== 200) {",
    "    const detail = String(",
    "      ticketPayload?.message ?? `HTTP_${ticketResponse.status}`",
    "    ).slice(0, 300);",
    "    throw new Error(`WAVESPEED_UPLOAD_TICKET_FAILED:${detail}`);",
    "  }",
    "",
    "  const ticket = ticketPayload?.data;",
    "  const upload = ticket?.upload;",
    "  const uploadUrl = typeof upload?.url === \"string\" ? upload.url : \"\";",
    "  const uploadMethod =",
    "    typeof upload?.method === \"string\" ? upload.method.toUpperCase() : \"PUT\";",
    "  const uploadHeaders =",
    "    upload?.headers && typeof upload.headers === \"object\" ? upload.headers : {};",
    "",
    "  if (!uploadUrl || !uploadUrl.startsWith(\"https://\")) {",
    "    throw new Error(\"WAVESPEED_UPLOAD_URL_MISSING\");",
    "  }",
    "",
    "  const uploadResponse = await fetch(uploadUrl, {",
    "    method: uploadMethod,",
    "    headers: uploadHeaders as HeadersInit,",
    "    body: new Uint8Array(reference.bytes),",
    "    signal: AbortSignal.timeout(180_000)",
    "  });",
    "",
    "  if (!uploadResponse.ok) {",
    "    const detail = (await uploadResponse.text().catch(() => \"\")).slice(0, 300);",
    "    throw new Error(",
    "      `WAVESPEED_DIRECT_UPLOAD_FAILED:${uploadResponse.status}:${detail}`",
    "    );",
    "  }",
    "",
    "  const url =",
    "    typeof ticket?.download_url === \"string\"",
    "      ? ticket.download_url",
    "      : typeof ticket?.url === \"string\"",
    "        ? ticket.url",
    "        : \"\";",
    "",
    "  if (!url || !url.startsWith(\"https://\")) {",
    "    throw new Error(\"WAVESPEED_UPLOAD_URL_MISSING\");",
    "  }",
    "",
    "  return url;",
    "}",
    "",
    "function safetyFieldRejected"
  ].join("\n");

  for (const relativePath of paths) {
    if (!exists(relativePath)) continue;
    let source = read(relativePath);
    source = source.replace(
      /async function uploadReferenceImage\(apiKey: string, dataUrl: string\) \{[\s\S]*?\n\}\n\nfunction safetyFieldRejected/,
      replacement
    );
    write(relativePath, source);
  }
}

// Preserve the exact video copy updates that this existing script already handled.
replaceIfPresent(
  "src/app/why-everbond/page.tsx",
  '"description": "Turn private ideas and scenes into videos of your companion."',
  '"description": "Turn any custom or original companion image into spicy videos exactly how your companion looks."'
);

replaceIfPresent(
  "scripts/apply-final-wavespeed-video-system.mjs",
  `'videoEmpty: "No private videos yet. Click generate video to create a charming video of your companion.",'`,
  `'videoEmpty: "No private videos yet. Click generate video to create a spicy video of your companion from the image currently in use as their chat image.",'`
);

removeVoiceFromChatToolbar();
removeVoiceFromCoinsPage();
removeVoiceMarketingFromWhyEverBond();
removeVoiceFromKnownCopyFiles();
applyWaveSpeedDirectUploadToTemplate();

console.log(
  "EVERBOND_EXACT_VIDEO_WORDING why-everbond=updated gallery-empty=updated voice-public-copy=removed wavespeed-upload=direct"
);
