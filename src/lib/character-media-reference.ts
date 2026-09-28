import { isIP } from "node:net";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_REFERENCE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp"
]);

function normalizeImageContentType(value: string | null | undefined) {
  const contentType = value?.split(";")[0]?.trim().toLowerCase() || "";
  return ALLOWED_REFERENCE_MIME_TYPES.has(contentType) ? contentType : null;
}

function isPrivateIpAddress(hostname: string) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "0.0.0.0" ||
    normalized === "::" ||
    normalized === "::1"
  ) {
    return true;
  }

  if (isIP(normalized) === 4) {
    const parts = normalized.split(".").map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0
    );
  }

  if (isIP(normalized) === 6) {
    return (
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }

  return false;
}

function trustedSiteOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;

  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url.origin;
      }
    } catch {
      // Development falls back to the request origin below.
    }
  }

  return new URL(request.url).origin;
}

function allowedReferenceHosts(request: Request) {
  const hosts = new Set<string>();
  hosts.add(new URL(trustedSiteOrigin(request)).hostname.toLowerCase());

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (supabaseUrl) {
    try {
      hosts.add(new URL(supabaseUrl).hostname.toLowerCase());
    } catch {
      // Invalid optional environment values are ignored here and fail elsewhere.
    }
  }

  for (const host of (process.env.IMAGE_REFERENCE_ALLOWED_HOSTS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)) {
    hosts.add(host);
  }

  return hosts;
}

function dataUrl(contentType: string, bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_REFERENCE_IMAGE_BYTES) {
    throw new Error("REFERENCE_IMAGE_TOO_LARGE");
  }

  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

function parseDataImage(image: string) {
  const match = image.match(
    /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\r\n]+)$/i
  );

  if (!match) throw new Error("REFERENCE_IMAGE_INVALID");

  const contentType = normalizeImageContentType(match[1]);
  if (!contentType) throw new Error("REFERENCE_IMAGE_INVALID");

  return dataUrl(contentType, Buffer.from(match[2], "base64"));
}

async function fallbackReferenceDataUrl(request: Request, image: string) {
  if (image.startsWith("data:")) return parseDataImage(image);

  const url = new URL(image, trustedSiteOrigin(request));
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("REFERENCE_IMAGE_INVALID");
  }

  const hostname = url.hostname.toLowerCase();
  if (
    isPrivateIpAddress(hostname) ||
    !allowedReferenceHosts(request).has(hostname)
  ) {
    throw new Error("REFERENCE_IMAGE_HOST_NOT_ALLOWED");
  }

  const response = await fetch(url, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) throw new Error("REFERENCE_IMAGE_LOAD_FAILED");

  const contentLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_REFERENCE_IMAGE_BYTES
  ) {
    throw new Error("REFERENCE_IMAGE_TOO_LARGE");
  }

  const contentType = normalizeImageContentType(
    response.headers.get("content-type")
  );
  if (!contentType) throw new Error("REFERENCE_IMAGE_INVALID");

  return dataUrl(contentType, Buffer.from(await response.arrayBuffer()));
}

async function selectedGalleryImageDataUrl(values: {
  userId: string;
  characterId: string;
}) {
  const supabase = getSupabaseServiceClient();
  const { data: preference, error: preferenceError } = await supabase
    .from("user_character_preferences")
    .select("selected_gallery_image_id")
    .eq("user_id", values.userId)
    .eq("character_id", values.characterId)
    .maybeSingle();

  if (preferenceError) throw preferenceError;
  const selectedId = preference?.selected_gallery_image_id;
  if (!selectedId) return null;

  const { data: image, error: imageError } = await supabase
    .from("character_gallery_images")
    .select("storage_path")
    .eq("id", selectedId)
    .eq("user_id", values.userId)
    .eq("character_id", values.characterId)
    .maybeSingle();

  if (imageError) throw imageError;
  if (!image?.storage_path) return null;

  const { data: file, error: downloadError } = await supabase.storage
    .from("character-gallery")
    .download(image.storage_path);

  if (downloadError) throw downloadError;

  const contentType = normalizeImageContentType(file.type);
  if (!contentType) throw new Error("REFERENCE_IMAGE_INVALID");

  return dataUrl(contentType, Buffer.from(await file.arrayBuffer()));
}

export async function activeCharacterReferenceDataUrl(values: {
  request: Request;
  userId: string;
  characterId: string;
  fallbackImage: string;
}) {
  const selected = await selectedGalleryImageDataUrl(values).catch(() => null);
  if (selected) return selected;

  return fallbackReferenceDataUrl(values.request, values.fallbackImage);
}
