const DEFAULT_VENICE_BASE_URL = "https://api.venice.ai/api/v1";

export function veniceApiUrl(path: string) {
  const base = (process.env.VENICE_BASE_URL || DEFAULT_VENICE_BASE_URL)
    .trim()
    .replace(/\/+$/, "");
  const suffix = path.trim().replace(/^\/+/, "");

  return `${base}/${suffix}`;
}
