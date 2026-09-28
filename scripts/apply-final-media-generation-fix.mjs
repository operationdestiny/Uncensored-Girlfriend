#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

function replaceRequired(source, from, to, label) {
  // Check the OLD block first. Some replacements intentionally remove
  // trailing fields, so the new text can already be a substring of the old
  // text. Checking `to` first would falsely treat that old block as patched.
  if (source.includes(from)) {
    return source.replace(from, to);
  }

  if (source.includes(to)) return source;

  throw new Error(`Identity-reference media fix could not find: ${label}`);
}

// ===========================================================================
// IMAGE: identity-preserving image generation using the actual character image
// as the source reference via seedream-v5-pro-edit.
//
// This keeps the real character image as the identity anchor, while the user
// prompt controls the new pose, outfit, framing, scene, body visibility, etc.
// ===========================================================================

const imagePath = "src/app/api/character-gallery/[slug]/route.ts";
let imageRoute = read(imagePath);

if (!imageRoute.includes('from "@/lib/character-media-reference"')) {
  imageRoute = replaceRequired(
    imageRoute,
    'import { getSupabaseServiceClient } from "@/lib/supabase/server";',
    'import { getSupabaseServiceClient } from "@/lib/supabase/server";\nimport { activeCharacterReferenceDataUrl } from "@/lib/character-media-reference";',
    "image reference import"
  );
}

if (imageRoute.includes('export const maxDuration = 60;')) {
  imageRoute = imageRoute.replace(
    'export const maxDuration = 60;',
    'export const maxDuration = 180;'
  );
}

const imageStartMarkers = [
  '    const model = "seedream-v5-pro";',
  '    const model = "seedream-v5-pro-edit";',
  '    const model = process.env.VENICE_IMAGE_MODEL || "seedream-v5-pro-edit";'
];

let imageStart = -1;
for (const marker of imageStartMarkers) {
  const idx = imageRoute.indexOf(marker);
  if (idx >= 0) {
    imageStart = idx;
    break;
  }
}

const imageEndMarker = '    const imageId = crypto.randomUUID();';
const imageEnd = imageRoute.indexOf(imageEndMarker, Math.max(imageStart, 0));

if (imageStart < 0 || imageEnd < 0 || imageEnd <= imageStart) {
  throw new Error(
    "Identity-reference media fix could not locate the image provider block."
  );
}

const fixedImageBlock = `    const model = "seedream-v5-pro-edit";
    const referenceImage =
      await activeCharacterReferenceDataUrl({
        request,
        userId: user.id,
        characterId: character.id,
        fallbackImage: character.image
      });

    const referenceMatch = referenceImage.match(
      /^data:image\\/(?:png|jpeg|webp);base64,([\\s\\S]+)$/i
    );
    const imageInput = referenceMatch?.[1] ?? referenceImage;

    const imagePayload = {
      model,
      image: imageInput,
      prompt:
        \`Use the supplied source image as the exact identity reference for the fictional adult character \${character.name}. \` +
        "Preserve the same recognizable face, adult age, body, skin tone, hair, and overall appearance. " +
        "Create a new image based on the user's request rather than preserving the same composition. " +
        "The user's request controls the pose, expression, camera angle, framing, outfit, body visibility, action, environment, lighting, and background. " +
        "You may change the composition completely while keeping the same person recognizable. " +
        "When the user requests a full-body image, show the character clearly from head to feet. " +
        "Keep anatomy coherent and preserve identity strongly. " +
        \`User request: \${parsed.data.prompt}\`,
      aspect_ratio: "auto",
      resolution: "1K",
      output_format: "png",
      safe_mode: false
    };

    let providerResponse = await fetch(
      veniceApiUrl("image/edit"),
      {
        method: "POST",
        headers: {
          Authorization: \`Bearer \${apiKey}\`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(imagePayload),
        signal: AbortSignal.timeout(150_000)
      }
    );

    if (
      providerResponse.status === 429 ||
      providerResponse.status === 503
    ) {
      const retryAfterHeader = Number(
        providerResponse.headers.get("retry-after")
      );
      const retryDelay = Number.isFinite(retryAfterHeader)
        ? Math.min(Math.max(retryAfterHeader * 1000, 1000), 8000)
        : 2500;

      await providerResponse.arrayBuffer().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));

      providerResponse = await fetch(
        veniceApiUrl("image/edit"),
        {
          method: "POST",
          headers: {
            Authorization: \`Bearer \${apiKey}\`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(imagePayload),
          signal: AbortSignal.timeout(150_000)
        }
      );
    }

    if (!providerResponse.ok) {
      const detail = (await providerResponse.text()).slice(0, 500);
      const providerCode =
        providerResponse.status === 401
          ? "IMAGE_PROVIDER_AUTH_FAILED"
          : providerResponse.status === 402
            ? "IMAGE_PROVIDER_PAYMENT_REQUIRED"
            : providerResponse.status === 403
              ? "IMAGE_PROVIDER_REGION_BLOCKED"
              : providerResponse.status === 400 ||
                  providerResponse.status === 415 ||
                  providerResponse.status === 422
                ? "IMAGE_PROVIDER_REJECTED"
                : providerResponse.status === 429 ||
                    providerResponse.status === 503
                  ? "IMAGE_PROVIDER_BUSY"
                  : "IMAGE_PROVIDER_FAILED";

      throw new Error(
        \`\${providerCode}:\${providerResponse.status}:\${detail}\`
      );
    }

    const providerContentType =
      providerResponse.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() || "";

    let contentType = "image/png";
    let imageBytes;

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
        payload?.images?.[0] ??
        payload?.data?.[0]?.b64_json ??
        payload?.data?.[0]?.url ??
        payload?.image;

      if (typeof output !== "string" || !output.trim()) {
        throw new Error(
          "IMAGE_PROVIDER_RETURNED_INVALID_FILE"
        );
      }

      if (output.startsWith("https://")) {
        const download = await fetch(output, {
          cache: "no-store",
          signal: AbortSignal.timeout(60_000)
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
        imageBytes = Buffer.from(
          await download.arrayBuffer()
        );
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
    }

`;

imageRoute =
  imageRoute.slice(0, imageStart) +
  fixedImageBlock +
  imageRoute.slice(imageEnd);

if (
  !imageRoute.includes('const model = "seedream-v5-pro-edit";') ||
  !imageRoute.includes('veniceApiUrl("image/edit")') ||
  !imageRoute.includes('image: imageInput') ||
  !imageRoute.includes('resolution: "1K"') ||
  !imageRoute.includes('aspect_ratio: "auto"') ||
  !imageRoute.includes('safe_mode: false') ||
  imageRoute.includes('style_references: [')
) {
  throw new Error(
    "Identity-reference image validation failed."
  );
}

write(imagePath, imageRoute);

// ===========================================================================
// VIDEO: keep the actual character image as the reference image, while
// adjusting request fields to what Venice accepted in the logs.
// ===========================================================================

const pricingPath = "src/lib/video-pricing.ts";
let videoPricing = read(pricingPath);

videoPricing = replaceRequired(
  videoPricing,
  "const DEFAULT_DURATION_SECONDS = 8;",
  "const DEFAULT_DURATION_SECONDS = 10;",
  "video default duration"
);

videoPricing = replaceRequired(
  videoPricing,
  `        duration: inputs.duration,
        resolution: inputs.resolution,
        aspect_ratio: inputs.aspectRatio,
        audio: inputs.audio`,
  `        duration: inputs.duration,
        resolution: inputs.resolution`,
  "video quote supported fields"
);

if (
  !videoPricing.includes("const DEFAULT_DURATION_SECONDS = 10;") ||
  !videoPricing.includes("duration: inputs.duration") ||
  videoPricing.includes("aspect_ratio: inputs.aspectRatio") ||
  videoPricing.includes("audio: inputs.audio")
) {
  throw new Error(
    "Identity-reference video quote validation failed."
  );
}

write(pricingPath, videoPricing);

const videoPath =
  "src/app/api/character-video-gallery/[slug]/route.ts";
let videoRoute = read(videoPath);

videoRoute = replaceRequired(
  videoRoute,
  "const VIDEO_DURATIONS = [8] as const;",
  "const VIDEO_DURATIONS = [10] as const;",
  "video duration option"
);

videoRoute = replaceRequired(
  videoRoute,
  `        duration: pricing.duration,
        resolution: pricing.resolution,
        aspect_ratio: pricing.aspectRatio,
        audio: pricing.audio,
        reference_image_urls: [referenceImage],`,
  `        duration: pricing.duration,
        resolution: pricing.resolution,
        reference_image_urls: [referenceImage],`,
  "video queue supported fields"
);

if (
  !videoRoute.includes("const VIDEO_DURATIONS = [10] as const;") ||
  !videoRoute.includes("duration: pricing.duration") ||
  !videoRoute.includes("reference_image_urls: [referenceImage]") ||
  videoRoute.includes("aspect_ratio: pricing.aspectRatio") ||
  videoRoute.includes("audio: pricing.audio")
) {
  throw new Error(
    "Identity-reference video queue validation failed."
  );
}

write(videoPath, videoRoute);

// Keep the browser default aligned.
const galleryClientPath =
  "src/components/media/CharacterGalleryClient.tsx";
let galleryClient = read(galleryClientPath);

galleryClient = replaceRequired(
  galleryClient,
  "const [videoDuration, setVideoDuration] = useState(8);",
  "const [videoDuration, setVideoDuration] = useState(10);",
  "video client duration"
);

write(galleryClientPath, galleryClient);

console.log(
  "EverBond identity-reference image/video fix applied."
);
