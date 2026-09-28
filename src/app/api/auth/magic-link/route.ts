import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { assertIndependentSupabaseUrl } from "@/lib/supabase/project";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MagicLinkRequest = z.object({ email: z.string().email() }).strict();

/**
 * Supabase admin.generateLink only generates a URL and does not email it.
 * Use public passwordless Auth so Supabase actually sends the one-time link.
 * No service-role credentials are necessary for this route.
 */
export async function POST(request: Request) {
  const parsed = MagicLinkRequest.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "AUTH_NOT_CONFIGURED" },
      { status: 503 }
    );
  }
  assertIndependentSupabaseUrl(url);

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    "http://localhost:3000";
  const client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });

  const { error } = await client.auth.signInWithOtp({
    email: parsed.data.email.trim().toLowerCase(),
    options: {
      emailRedirectTo: `${siteUrl}/account`,
      shouldCreateUser: true
    }
  });

  if (error) {
    console.error("Uncensored Girlfriend magic-link delivery failed:", error);
    return NextResponse.json(
      { error: "MAGIC_LINK_DELIVERY_FAILED" },
      { status: 503 }
    );
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
