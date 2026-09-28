import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getSupabaseServiceClient
} from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getPublicAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase public auth variables.");
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}

function redirectBase(request: Request) {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");

  if (configured) return configured;

  const origin = request.headers.get("origin");
  if (origin) return origin.replace(/\/+$/, "");

  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email =
      typeof body?.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json(
        { error: "INVALID_EMAIL" },
        { status: 400 }
      );
    }

    const service = getSupabaseServiceClient();
    const { data: accountExists, error: lookupError } =
      await service.rpc(
        "everbond_account_email_exists",
        {
          candidate_email: email
        }
      );

    if (lookupError) throw lookupError;

    if (accountExists !== true) {
      return NextResponse.json(
        { error: "ACCOUNT_NOT_FOUND" },
        {
          status: 404,
          headers: {
            "Cache-Control": "no-store"
          }
        }
      );
    }

    const { error: resetError } =
      await getPublicAuthClient().auth.resetPasswordForEmail(
        email,
        {
          redirectTo:
            `${redirectBase(request)}/auth/reset-password`
        }
      );

    if (resetError) {
      console.error(
        "Password-reset email request failed:",
        resetError
      );

      return NextResponse.json(
        { error: "PASSWORD_RESET_FAILED" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { sent: true },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("Public password reset failed:", error);

    return NextResponse.json(
      { error: "PASSWORD_RESET_FAILED" },
      { status: 500 }
    );
  }
}
