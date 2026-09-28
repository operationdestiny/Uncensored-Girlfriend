/**
 * Prevent a copied deployment from silently connecting to another company's
 * Supabase project. A buyer can provision their own new Supabase instance by
 * changing NEXT_PUBLIC_SUPABASE_PROJECT_REF alongside the URL and both keys.
 */
export const expectedSupabaseProjectRef =
  process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF?.trim() ||
  "pdmjokvqrzqwjnhdejbb";

export function assertIndependentSupabaseUrl(input: string): void {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }

  const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);

  if (isLocal && process.env.NODE_ENV !== "production") return;

  if (
    url.protocol !== "https:" ||
    url.hostname !== `${expectedSupabaseProjectRef}.supabase.co`
  ) {
    throw new Error(
      "Supabase project mismatch: refusing to use a database other than " +
        "NEXT_PUBLIC_SUPABASE_PROJECT_REF. Check this platform's own environment."
    );
  }
}
