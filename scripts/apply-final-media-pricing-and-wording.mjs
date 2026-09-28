import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, "utf8");
}

function replaceRequired(content, from, to, label) {
  if (content.includes(to)) return content;

  if (!content.includes(from)) {
    throw new Error(
      `Final media pricing patch could not find: ${label}`
    );
  }

  return content.replace(from, to);
}

function replaceRegexRequired(
  content,
  pattern,
  replacement,
  alreadyPresent,
  label
) {
  if (content.includes(alreadyPresent)) return content;

  if (!pattern.test(content)) {
    throw new Error(
      `Final media pricing patch could not find: ${label}`
    );
  }

  return content.replace(pattern, replacement);
}

function replaceAll(content, from, to) {
  return content.split(from).join(to);
}

const evercoinPath = "src/lib/evercoin.ts";
let evercoin = read(evercoinPath);

evercoin = replaceRequired(
  evercoin,
  `export function everCoinCallCostPerMinute() {
  return Math.max(
    integerEnv("EVERCOIN_CALL_COST_PER_MINUTE", 35, 100_000),
    35
  );
}

export const EVERCOIN_IMAGE_COST = 25;
export const EVERCOIN_VIDEO_COST = 40;`,
  `export function everCoinCallCostPerMinute() {
  return 30;
}

export const EVERCOIN_IMAGE_COST = 15;
export const EVERCOIN_VIDEO_COST = 199;`,
  "EverCoin media prices"
);

write(evercoinPath, evercoin);

const voiceModalPath =
  "src/components/media/VoiceCallModal.tsx";
let voiceModal = read(voiceModalPath);

if (!voiceModal.includes('import { localizedErrorMessage } from "@/lib/final-localization-language";')) {
  voiceModal = replaceRequired(
    voiceModal,
    'import { MEDIA_COPY } from "@/lib/media-language";',
    'import { MEDIA_COPY } from "@/lib/media-language";\nimport { localizedErrorMessage } from "@/lib/final-localization-language";',
    "voice-call localized error import"
  );
}

voiceModal = replaceAll(
  voiceModal,
  'setError(payload?.message || payload?.error || copy.mediaError);',
  `setError(
          localizedErrorMessage(
            payload?.message ?? payload?.error,
            language,
            copy.mediaError,
            "voice"
          )
        );`
);

voiceModal = replaceAll(
  voiceModal,
  `setError(
          connectError instanceof Error
            ? connectError.message
            : copy.microphoneDenied
        );`,
  `setError(
          localizedErrorMessage(
            connectError instanceof Error
              ? connectError.message
              : connectError,
            language,
            copy.microphoneDenied,
            "voice"
          )
        );`
);

voiceModal = replaceAll(
  voiceModal,
  'throw new Error(payload?.message || payload?.error || copy.mediaError);',
  `throw new Error(
          localizedErrorMessage(
            payload?.message ?? payload?.error,
            language,
            copy.mediaError,
            "voice"
          )
        );`
);

voiceModal = replaceAll(
  voiceModal,
  `setError(
        callError instanceof Error ? callError.message : copy.mediaError
      );`,
  `setError(
        localizedErrorMessage(
          callError instanceof Error ? callError.message : callError,
          language,
          copy.mediaError,
          "voice"
        )
      );`
);

voiceModal = replaceAll(
  voiceModal,
  "const [costPerMinute, setCostPerMinute] = useState(35);",
  "const [costPerMinute, setCostPerMinute] = useState(30);"
);
voiceModal = replaceAll(
  voiceModal,
  "setCostPerMinute(Number(payload.costPerMinute ?? 35));",
  "setCostPerMinute(Number(payload.costPerMinute ?? 30));"
);

if (
  !voiceModal.includes(
    "const [costPerMinute, setCostPerMinute] = useState(30);"
  )
) {
  throw new Error(
    "Final media pricing patch could not set the voice-call display price."
  );
}

if (
  !voiceModal.includes("localizedErrorMessage") ||
  voiceModal.includes(
    "payload?.message || payload?.error || copy.mediaError"
  )
) {
  throw new Error(
    "Final media pricing patch could not localize voice-call errors."
  );
}

write(voiceModalPath, voiceModal);

const imageRoutePath =
  "src/app/api/character-gallery/[slug]/route.ts";
let imageRoute = read(imageRoutePath);

imageRoute = replaceRegexRequired(
  imageRoute,
  /    const model = process\.env\.VENICE_IMAGE_MODEL \|\| "seedream-v5-pro-edit";[\s\S]*?    if \(!imageBytes\.length \|\| imageBytes\.length > MAX_GENERATED_IMAGE_BYTES\) \{\n      throw new Error\("IMAGE_PROVIDER_RETURNED_INVALID_FILE"\);\n    \}/,
  `    const model = "seedream-v5-pro";
    const referenceImage =
      await activeCharacterReferenceDataUrl({
        request,
        userId: user.id,
        characterId: character.id,
        fallbackImage: character.image
      });

    const providerResponse = await fetch(
      veniceApiUrl("images/generations"),
      {
        method: "POST",
        headers: {
          Authorization: \`Bearer \${apiKey}\`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          prompt:
            \`Use the supplied image only as the exact identity reference for the fictional adult character \${character.name}. \` +
            "Generate a completely new 1K composition while preserving the same recognizable face, adult age, identity, and defining appearance. " +
            "You may zoom out, change the camera angle, create a new pose, change the outfit, and create a new background. " +
            "When the request asks for a full-body image, show the character clearly from head to feet. " +
            \`User request: \${parsed.data.prompt}\`,
          image: [referenceImage],
          size: "1K",
          aspect_ratio: "3:4",
          response_format: "b64_json",
          output_format: "png",
          n: 1
        }),
        signal: AbortSignal.timeout(55_000)
      }
    );

    if (!providerResponse.ok) {
      const detail = (await providerResponse.text()).slice(
        0,
        500
      );
      throw new Error(
        \`IMAGE_PROVIDER_FAILED:\${providerResponse.status}:\${detail}\`
      );
    }

    const providerContentType =
      providerResponse.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() || "";

    let contentType = "image/png";
    let imageBytes: Buffer;

    if (ALLOWED_SOURCE_MIME_TYPES.has(providerContentType)) {
      contentType = providerContentType;
      imageBytes = Buffer.from(
        await providerResponse.arrayBuffer()
      );
    } else {
      const payload = await providerResponse
        .json()
        .catch(() => null);
      const output =
        payload?.data?.[0]?.b64_json ??
        payload?.data?.[0]?.url ??
        payload?.images?.[0] ??
        payload?.image;

      if (typeof output !== "string" || !output.trim()) {
        throw new Error(
          "IMAGE_PROVIDER_RETURNED_INVALID_FILE"
        );
      }

      if (output.startsWith("https://")) {
        const download = await fetch(output, {
          cache: "no-store",
          signal: AbortSignal.timeout(30_000)
        });

        if (!download.ok) {
          throw new Error(
            \`IMAGE_DOWNLOAD_FAILED:\${download.status}\`
          );
        }

        const downloadedType =
          download.headers
            .get("content-type")
            ?.split(";")[0]
            .trim()
            .toLowerCase() || "image/png";

        if (!ALLOWED_SOURCE_MIME_TYPES.has(downloadedType)) {
          throw new Error(
            "IMAGE_PROVIDER_RETURNED_INVALID_FILE"
          );
        }

        contentType = downloadedType;
        imageBytes = Buffer.from(await download.arrayBuffer());
      } else {
        let encoded = output.trim();
        const dataUrlMatch = encoded.match(
          /^data:(image\\/(?:png|jpeg|webp));base64,([\\s\\S]+)$/
        );

        if (dataUrlMatch) {
          contentType = dataUrlMatch[1].toLowerCase();
          encoded = dataUrlMatch[2];
        }

        imageBytes = Buffer.from(encoded, "base64");
      }
    }

    if (
      !imageBytes.length ||
      imageBytes.length > MAX_GENERATED_IMAGE_BYTES
    ) {
      throw new Error(
        "IMAGE_PROVIDER_RETURNED_INVALID_FILE"
      );
    }`,
  '"seedream-v5-pro";',
  "Seedream V5 Pro reference generation"
);

write(imageRoutePath, imageRoute);

const videoRoutePath =
  "src/app/api/character-video-gallery/[slug]/route.ts";
let videoRoute = read(videoRoutePath);

videoRoute = replaceRequired(
  videoRoute,
  `import {
  completeCharacterVideoRequest,
  everCoinVideoCost,
  failCharacterVideoRequest,
  setCharacterVideoQueue,
  startCharacterVideoRequest
} from "@/lib/evercoin";`,
  `import {
  completeCharacterVideoRequest,
  failCharacterVideoRequest,
  setCharacterVideoQueue,
  startCharacterVideoRequest
} from "@/lib/evercoin";`,
  "video EverCoin imports"
);

videoRoute = replaceRequired(
  videoRoute,
  'import { veniceApiUrl } from "@/lib/venice-media";',
  `import { veniceApiUrl } from "@/lib/venice-media";
import { quoteEverCoinVideoCost } from "@/lib/video-pricing";`,
  "dynamic video pricing import"
);

if (videoRoute.includes("function videoModel()")) {
  const withoutFixedSettings = videoRoute.replace(
    /function videoModel\(\) \{[\s\S]*?\n\}\n\nfunction videoResolution\(\) \{[\s\S]*?\n\}\n\nfunction videoAspectRatio\(\) \{[\s\S]*?\n\}\n\n/,
    ""
  );

  if (withoutFixedSettings === videoRoute) {
    throw new Error(
      "Final media pricing patch could not remove the obsolete fixed video settings."
    );
  }

  videoRoute = withoutFixedSettings;
}

videoRoute = replaceRequired(
  videoRoute,
  `    const cost = everCoinVideoCost();
    return NextResponse.json(`,
  `    const pricing = await quoteEverCoinVideoCost(
      VIDEO_DURATIONS[0]
    );
    const cost = pricing.everCoinCost;
    return NextResponse.json(`,
  "dynamic video gallery price"
);

videoRoute = replaceRequired(
  videoRoute,
  `        videoCost: cost,
        pricingConfigured: cost > 0,`,
  `        videoCost: cost,
        videoDisplayCost: pricing.displayCost,
        pricingConfigured: true,`,
  "video gallery price response"
);

videoRoute = replaceRequired(
  videoRoute,
  `    const cost = everCoinVideoCost();
    if (cost <= 0) {
      return NextResponse.json(
        { error: "VIDEO_PRICING_NOT_CONFIGURED" },
        { status: 503 }
      );
    }

    const { slug } = await params;`,
  `    const pricing = await quoteEverCoinVideoCost(
      parsed.data.durationSeconds
    );
    const cost = pricing.everCoinCost;

    const { slug } = await params;`,
  "quote before video reservation"
);

videoRoute = replaceRequired(
  videoRoute,
  "    const model = videoModel();",
  "    const model = pricing.model;",
  "quoted video model"
);

videoRoute = replaceRequired(
  videoRoute,
  `        duration: \`\${parsed.data.durationSeconds}s\`,
        resolution: videoResolution(),
        aspect_ratio: videoAspectRatio(),
        audio: false,`,
  `        duration: pricing.duration,
        resolution: pricing.resolution,
        aspect_ratio: pricing.aspectRatio,
        audio: pricing.audio,`,
  "quoted video queue inputs"
);

videoRoute = replaceRequired(
  videoRoute,
  `{ status: "processing", requestId },`,
  `{ status: "processing", requestId, everCoinCost: cost },`,
  "video response charge"
);

for (const required of [
  "quoteEverCoinVideoCost(",
  "amount: cost,",
  "required: cost",
  "resolution: pricing.resolution",
  "aspect_ratio: pricing.aspectRatio",
  "audio: pricing.audio"
]) {
  if (!videoRoute.includes(required)) {
    throw new Error(
      `Dynamic video pricing is missing: ${required}`
    );
  }
}

if (videoRoute.includes("everCoinVideoCost()")) {
  throw new Error(
    "The fixed video price is still used in the video route."
  );
}

write(videoRoutePath, videoRoute);

const pricingRoutePath =
  "src/app/api/evercoin/pricing/route.ts";
let pricingRoute = read(pricingRoutePath);

pricingRoute = replaceRequired(
  pricingRoute,
  `  everCoinImageCost,
  everCoinPerDollar,
  everCoinVideoCost
} from "@/lib/evercoin";`,
  `  everCoinImageCost,
  everCoinPerDollar
} from "@/lib/evercoin";
import { quoteEverCoinVideoCost } from "@/lib/video-pricing";`,
  "pricing API imports"
);

pricingRoute = replaceRequired(
  pricingRoute,
  `export async function GET() {
  const videoCost = everCoinVideoCost();`,
  `export async function GET() {
  const videoPricing = await quoteEverCoinVideoCost();
  const videoCost = videoPricing.everCoinCost;`,
  "pricing API video quote"
);

pricingRoute = replaceRequired(
  pricingRoute,
  `      videoCost,
      videoDurationSeconds: 8,`,
  `      videoCost,
      videoDisplayCost: videoPricing.displayCost,
      videoDurationSeconds: videoPricing.durationSeconds,`,
  "pricing API display estimate"
);

pricingRoute = replaceRequired(
  pricingRoute,
  `      videoAudioEnabled: false,
      videoPricingConfigured: videoCost > 0,`,
  `      videoAudioEnabled: videoPricing.audio,
      videoPricingConfigured: true,`,
  "pricing API dynamic configuration"
);

write(pricingRoutePath, pricingRoute);

// Buy EverCoin page copy is maintained directly in source.

const whyPath = "src/app/why-everbond/page.tsx";
let why = read(whyPath);

const wordingReplacements = [
  [
    "unrestricted private chats, uncensored image and video creation, live video calls, meaningful gifts",
    "unrestricted private chats, uncensored image and video creation, live voice calls, meaningful gifts"
  ],
  [
    "Live uncensored video calls",
    "Live uncensored voice calls"
  ],
  [
    "Text, images, generated video, live video calls, gifts",
    "Text, images, generated video, live voice calls, gifts"
  ],
  [
    "videollamadas en directo, regalos",
    "llamadas de voz en directo, regalos"
  ],
  [
    "Videollamadas en directo sin censura",
    "Llamadas de voz en directo sin censura"
  ],
  [
    "vídeo generado, videollamadas, regalos",
    "vídeo generado, llamadas de voz, regalos"
  ],
  [
    "des appels vidéo en direct, des cadeaux",
    "des appels vocaux en direct, des cadeaux"
  ],
  [
    "Appels vidéo en direct non censurés",
    "Appels vocaux en direct non censurés"
  ],
  [
    "vidéos générées, appels vidéo, cadeaux",
    "vidéos générées, appels vocaux, cadeaux"
  ],
  [
    "Live-Videoanrufe, bedeutungsvolle Geschenke",
    "Live-Sprachanrufe, bedeutungsvolle Geschenke"
  ],
  [
    "Unzensierte Live-Videoanrufe",
    "Unzensierte Live-Sprachanrufe"
  ],
  [
    "generierte Videos, Videoanrufe, Geschenke",
    "generierte Videos, Sprachanrufe, Geschenke"
  ],
  [
    "ライブビデオ通話、心のこもったギフト",
    "ライブ音声通話、心のこもったギフト"
  ],
  [
    "無検閲のライブビデオ通話",
    "無検閲のライブ音声通話"
  ],
  [
    "生成動画、ビデオ通話、ギフト",
    "生成動画、音声通話、ギフト"
  ],
  [
    "라이브 영상 통화, 의미 있는 선물",
    "라이브 음성 통화, 의미 있는 선물"
  ],
  [
    "무검열 라이브 영상 통화",
    "무검열 라이브 음성 통화"
  ],
  [
    "생성 영상, 영상 통화, 선물",
    "생성 영상, 음성 통화, 선물"
  ]
];

for (const [from, to] of wordingReplacements) {
  why = replaceAll(why, from, to);
}

const imageAdvertising = [
  [
    "Create private images of your companion in the outfit, pose, setting, lighting, and mood you choose, then keep the results inside your personal gallery.",
    "Generate private 1K full-body images from your companion’s identity reference, then change the pose, outfit, camera angle, background, lighting, and mood without losing who they are."
  ],
  [
    "Crea imágenes privadas de tu compañero con la ropa, pose, escenario, iluminación y ambiente que elijas, y guárdalas en tu galería personal.",
    "Genera imágenes privadas de cuerpo completo en 1K desde la identidad de tu compañero y cambia la pose, ropa, ángulo, fondo, iluminación y ambiente sin perder su apariencia."
  ],
  [
    "Créez des images privées de votre compagnon avec la tenue, la pose, le décor, la lumière et l’ambiance de votre choix, puis gardez-les dans votre galerie personnelle.",
    "Générez des images privées en pied en 1K à partir de l’identité de votre compagnon, puis changez la pose, la tenue, l’angle, l’arrière-plan, la lumière et l’ambiance sans perdre son apparence."
  ],
  [
    "Erstelle private Bilder deines Begleiters mit Kleidung, Pose, Umgebung, Licht und Stimmung deiner Wahl und bewahre sie in deiner persönlichen Galerie auf.",
    "Erstelle private 1K-Ganzkörperbilder aus der Identitätsreferenz deines Begleiters und ändere Pose, Outfit, Kamerawinkel, Hintergrund, Licht und Stimmung, ohne seine Identität zu verlieren."
  ],
  [
    "衣装、ポーズ、場所、照明、雰囲気を自由に指定してコンパニオンのプライベート画像を作り、自分だけのギャラリーに保存できます。",
    "コンパニオンの本人参照画像から非公開の1K全身画像を生成し、本人らしさを保ったままポーズ、衣装、角度、背景、照明、雰囲気を変えられます。"
  ],
  [
    "원하는 의상, 포즈, 장소, 조명, 분위기로 컴패니언의 비공개 이미지를 만들고 개인 갤러리에 보관할 수 있습니다.",
    "컴패니언의 정체성 참조 이미지로 비공개 1K 전신 이미지를 만들고, 같은 인물을 유지하면서 포즈, 의상, 각도, 배경, 조명, 분위기를 바꿀 수 있습니다."
  ]
];

for (const [from, to] of imageAdvertising) {
  why = replaceRequired(
    why,
    from,
    to,
    `Why EverBond image copy: ${from}`
  );
}

if (
  /live video calls|Live uncensored video calls|videollamadas|appels vidéo|Videoanrufe|ライブビデオ通話|라이브 영상 통화/.test(
    why
  )
) {
  throw new Error(
    "A video-call phrase remains on the Why EverBond page."
  );
}

write(whyPath, why);

let finalWhy = read(whyPath);
const voiceVideoWhyReplacements = [
  [
    "Live uncensored voice calls",
    "Live uncensored voice video calls"
  ],
  [
    "live voice calls",
    "live uncensored voice video calls"
  ],
  [
    "Move beyond messages and connect live. Your companion carries the same identity, personality, and relationship into a more immediate experience.",
    "Talk live by voice in a video-call-style companion screen. Your companion carries the same identity, personality, relationship, and Ever Memory™ into the call; the experience uses character artwork rather than a live camera feed."
  ],
  [
    "EverCoin is the official EverBond currency for voice calls, image generation, video generation, in-chat gifts, and premium character chats.",
    "EverCoin is the official EverBond currency for live voice video calls, image generation, video generation, in-chat gifts, and premium character chats."
  ],
  [
    "Yes. EverBond is built around 100% truly private chats.",
    "Yes. Chats are private to your account and are not publicly posted or shared with other users. EverBond and contracted providers still process data as needed to deliver, secure, and legally operate the service."
  ],
  [
    "No. EverBond does not have filters ever.",
    "EverBond does not impose a general NSFW filter on private adult chat. Illegal, exploitative, non-consensual, minor-related, and rights-violating content remains prohibited, and media providers may apply technical or safety limits."
  ],
  [
    "Llamadas de voz en directo sin censura",
    "Videollamadas de voz en directo sin censura"
  ],
  [
    "llamadas de voz en directo, regalos",
    "videollamadas de voz en directo sin censura, regalos"
  ],
  [
    "Ve más allá de los mensajes y conecta en directo. Tu compañero mantiene la misma identidad, personalidad y relación en una experiencia más inmediata.",
    "Habla en directo por voz dentro de una pantalla con estilo de videollamada. Tu compañero mantiene la misma identidad, personalidad, relación y Ever Memory™; la experiencia usa la imagen del personaje, no una cámara en directo."
  ],
  [
    "EverCoin es la moneda oficial de EverBond para llamadas de voz, generación de imágenes, generación de vídeos, regalos dentro del chat y chats premium con personajes.",
    "EverCoin es la moneda oficial de EverBond para videollamadas de voz en directo, generación de imágenes, generación de vídeos, regalos dentro del chat y chats premium con personajes."
  ],
  [
    "Sí. EverBond está diseñado alrededor de chats verdaderamente privados al 100 %.",
    "Sí. Los chats son privados para tu cuenta y no se publican ni se comparten con otros usuarios. EverBond y sus proveedores contratados procesan los datos necesarios para prestar, proteger y operar legalmente el servicio."
  ],
  [
    "No. EverBond no aplica filtros.",
    "EverBond no aplica un filtro NSFW general al chat adulto privado. El contenido ilegal, explotador, no consentido, relacionado con menores o que vulnere derechos sigue prohibido, y los proveedores de medios pueden aplicar límites técnicos o de seguridad."
  ],
  [
    "Appels vocaux en direct non censurés",
    "Appels vidéo vocaux en direct non censurés"
  ],
  [
    "appels vocaux en direct",
    "appels vidéo vocaux en direct non censurés"
  ],
  [
    "Allez au-delà des messages et échangez en direct. Votre compagnon conserve la même identité, personnalité et relation dans une expérience plus immédiate.",
    "Parlez en direct par la voix dans une interface de type appel vidéo. Votre compagnon conserve la même identité, personnalité, relation et Ever Memory™ ; l’expérience utilise l’illustration du personnage et non une caméra en direct."
  ],
  [
    "EverCoin est la monnaie officielle d’EverBond pour les appels vocaux, la génération d’images, la génération de vidéos, les cadeaux dans le chat et les discussions premium avec les personnages.",
    "EverCoin est la monnaie officielle d’EverBond pour les appels vidéo vocaux en direct, la génération d’images, la génération de vidéos, les cadeaux dans le chat et les discussions premium avec les personnages."
  ],
  [
    "Oui. EverBond est conçu autour de discussions véritablement privées à 100 %.",
    "Oui. Les discussions sont privées pour votre compte et ne sont ni publiées ni partagées avec d’autres utilisateurs. EverBond et ses prestataires traitent les données nécessaires pour fournir, sécuriser et exploiter légalement le service."
  ],
  [
    "Non. EverBond n’applique pas de filtres.",
    "EverBond n’applique pas de filtre NSFW général aux discussions privées entre adultes. Les contenus illégaux, exploitants, non consentis, liés aux mineurs ou portant atteinte aux droits restent interdits, et les fournisseurs de médias peuvent appliquer des limites techniques ou de sécurité."
  ],
  [
    "Unzensierte Live-Sprachanrufe",
    "Unzensierte Live-Voice-Videoanrufe"
  ],
  [
    "Live-Sprachanrufe",
    "unzensierte Live-Voice-Videoanrufe"
  ],
  [
    "Gehe über Nachrichten hinaus und verbinde dich live. Dein Begleiter nimmt dieselbe Identität, Persönlichkeit und Beziehung in ein unmittelbares Erlebnis mit.",
    "Sprich live per Stimme in einer Begleiteroberfläche im Videoanruf-Stil. Dein Begleiter behält dieselbe Identität, Persönlichkeit, Beziehung und Ever Memory™; verwendet wird Charaktergrafik statt eines Live-Kamerabilds."
  ],
  [
    "EverCoin ist die offizielle EverBond-Währung für Sprachanrufe, Bilderstellung, Videoerstellung, Geschenke im Chat und Premium-Charakter-Chats.",
    "EverCoin ist die offizielle EverBond-Währung für Live-Voice-Videoanrufe, Bilderstellung, Videoerstellung, Geschenke im Chat und Premium-Charakter-Chats."
  ],
  [
    "Ja. EverBond ist auf vollständig private Chats ausgelegt.",
    "Ja. Chats sind deinem Konto vorbehalten und werden nicht öffentlich veröffentlicht oder mit anderen Nutzern geteilt. EverBond und beauftragte Anbieter verarbeiten die Daten, die zur Bereitstellung, Sicherung und rechtmäßigen Durchführung des Dienstes erforderlich sind."
  ],
  [
    "Nein. EverBond verwendet keine Filter.",
    "EverBond verwendet keinen allgemeinen NSFW-Filter für private Chats zwischen Erwachsenen. Illegale, ausbeuterische, nicht einvernehmliche, minderjährigenbezogene oder rechtsverletzende Inhalte bleiben verboten; Medienanbieter können technische oder sicherheitsbezogene Grenzen anwenden."
  ],
  [
    "無検閲のライブ音声通話",
    "無検閲のライブ音声ビデオ通話"
  ],
  [
    "ライブ音声通話",
    "無検閲のライブ音声ビデオ通話"
  ],
  [
    "メッセージを超えてリアルタイムにつながります。コンパニオンは同じ人格、個性、関係性をより直接的な体験へ引き継ぎます。",
    "ビデオ通話風のコンパニオン画面で、音声によるライブ会話ができます。同じ人格、関係、Ever Memory™が引き継がれますが、ライブカメラ映像ではなくキャラクター画像を使用します。"
  ],
  [
    "EverCoinは、音声通話、画像生成、動画生成、チャット内ギフト、プレミアムキャラクターチャットに使うEverBond公式通貨です。",
    "EverCoinは、ライブ音声ビデオ通話、画像生成、動画生成、チャット内ギフト、プレミアムキャラクターチャットに使うEverBond公式通貨です。"
  ],
  [
    "はい。EverBondは完全にプライベートなチャットを中心に設計されています。",
    "はい。チャットはあなたのアカウント内で非公開となり、他のユーザーに公開または共有されません。EverBondと委託先は、サービスの提供、安全確保、法的運営に必要な範囲でデータを処理します。"
  ],
  [
    "いいえ。EverBondはフィルターを使用しません。",
    "EverBondは成人向けの非公開チャットに一般的なNSFWフィルターを設けません。ただし、違法、搾取的、非同意、未成年関連、権利侵害のコンテンツは禁止され、メディア提供者が技術上または安全上の制限を適用する場合があります。"
  ],
  [
    "무검열 라이브 음성 통화",
    "무검열 라이브 음성 영상 통화"
  ],
  [
    "라이브 음성 통화",
    "무검열 라이브 음성 영상 통화"
  ],
  [
    "메시지를 넘어 실시간으로 연결하세요. 컴패니언은 같은 정체성, 성격, 관계를 더 즉각적인 경험으로 이어갑니다.",
    "영상 통화 스타일의 컴패니언 화면에서 음성으로 실시간 대화하세요. 같은 정체성, 성격, 관계, Ever Memory™가 이어지며, 라이브 카메라 영상 대신 캐릭터 이미지를 사용합니다."
  ],
  [
    "EverCoin은 음성 통화, 이미지 생성, 영상 생성, 채팅 내 선물, 프리미엄 캐릭터 채팅에 사용하는 EverBond 공식 통화입니다.",
    "EverCoin은 라이브 음성 영상 통화, 이미지 생성, 영상 생성, 채팅 내 선물, 프리미엄 캐릭터 채팅에 사용하는 EverBond 공식 통화입니다."
  ],
  [
    "네. EverBond는 완전히 비공개인 채팅을 중심으로 설계되었습니다.",
    "네. 채팅은 사용자 계정에 비공개로 유지되며 다른 사용자에게 공개되거나 공유되지 않습니다. EverBond와 계약된 제공업체는 서비스 제공, 보안, 합법적 운영에 필요한 범위에서 데이터를 처리합니다."
  ],
  [
    "아니요. EverBond는 필터를 사용하지 않습니다.",
    "EverBond는 성인용 비공개 채팅에 일반적인 NSFW 필터를 적용하지 않습니다. 불법, 착취, 비동의, 미성년자 관련, 권리 침해 콘텐츠는 금지되며 미디어 제공업체가 기술적 또는 안전 제한을 적용할 수 있습니다."
  ]
];

for (const [from, to] of voiceVideoWhyReplacements) {
  finalWhy = replaceAll(finalWhy, from, to);
}

if (!finalWhy.includes("Live uncensored voice video calls")) {
  throw new Error(
    "The Why EverBond voice video call wording was not applied."
  );
}

write(whyPath, finalWhy);

const siteLanguagePath = "src/lib/site-language.ts";
let finalSiteLanguage = read(siteLanguagePath);
const siteLanguageReplacements = [
  [
    'voiceCalls: "Voice Calls"',
    'voiceCalls: "Live Uncensored Voice Video Calls"'
  ],
  [
    'voiceCallsBody: "Unlock real-time voice calls with your companion."',
    'voiceCallsBody: "Talk live by voice in a video-call-style companion screen using character artwork."'
  ],
  [
    'privateByDefaultBody: "Your chats are 100% private."',
    'privateByDefaultBody: "Your chats are private to your account and are not publicly posted or shared with other users."'
  ],
  [
    'voiceCalls: "Llamadas de voz"',
    'voiceCalls: "Videollamadas de voz en directo sin censura"'
  ],
  [
    'voiceCallsBody: "Desbloquea llamadas de voz en tiempo real con tu compañero."',
    'voiceCallsBody: "Habla por voz en una pantalla con estilo de videollamada usando la imagen del personaje."'
  ],
  [
    'privateByDefaultBody: "Tus chats son 100% privados."',
    'privateByDefaultBody: "Tus chats son privados para tu cuenta y no se publican ni se comparten con otros usuarios."'
  ],
  [
    'voiceCalls: "Appels vocaux"',
    'voiceCalls: "Appels vidéo vocaux en direct non censurés"'
  ],
  [
    'voiceCallsBody: "Débloquez des appels vocaux en temps réel avec votre compagnon."',
    'voiceCallsBody: "Parlez par la voix dans une interface de type appel vidéo utilisant l’illustration du personnage."'
  ],
  [
    'privateByDefaultBody: "Vos chats sont 100 % privés."',
    'privateByDefaultBody: "Vos discussions sont privées pour votre compte et ne sont ni publiées ni partagées avec d’autres utilisateurs."'
  ],
  [
    'voiceCalls: "Sprachanrufe"',
    'voiceCalls: "Unzensierte Live-Voice-Videoanrufe"'
  ],
  [
    'voiceCallsBody: "Schalte Echtzeit-Sprachanrufe mit deinem Begleiter frei."',
    'voiceCallsBody: "Sprich per Stimme in einer Videoanruf-Oberfläche mit Charaktergrafik."'
  ],
  [
    'privateByDefaultBody: "Deine Chats sind zu 100 % privat."',
    'privateByDefaultBody: "Deine Chats sind deinem Konto vorbehalten und werden nicht öffentlich veröffentlicht oder mit anderen Nutzern geteilt."'
  ],
  [
    'voiceCalls: "音声通話"',
    'voiceCalls: "無検閲のライブ音声ビデオ通話"'
  ],
  [
    'voiceCallsBody: "コンパニオンとのリアルタイム音声通話を解放します。"',
    'voiceCallsBody: "キャラクター画像を使うビデオ通話風画面で、コンパニオンと音声で話せます。"'
  ],
  [
    'privateByDefaultBody: "チャットは 100% 非公開です。"',
    'privateByDefaultBody: "チャットはアカウント内で非公開となり、他のユーザーに公開または共有されません。"'
  ],
  [
    'voiceCalls: "음성 통화"',
    'voiceCalls: "무검열 라이브 음성 영상 통화"'
  ],
  [
    'voiceCallsBody: "컴패니언과의 실시간 음성 통화를 잠금 해제하세요."',
    'voiceCallsBody: "캐릭터 이미지를 사용하는 영상 통화 스타일 화면에서 컴패니언과 음성으로 대화하세요."'
  ],
  [
    'privateByDefaultBody: "채팅은 100% 비공개입니다."',
    'privateByDefaultBody: "채팅은 계정에 비공개로 유지되며 다른 사용자에게 공개되거나 공유되지 않습니다."'
  ]
];

for (const [from, to] of siteLanguageReplacements) {
  finalSiteLanguage = replaceAll(
    finalSiteLanguage,
    from,
    to
  );
}

write(siteLanguagePath, finalSiteLanguage);

console.log(
  "Final media pricing, dynamic video quotes, Seedream V5 Pro, voice video call advertising, and legal-safe privacy wording are applied."
);
