import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { deviantArtClientId, deviantArtRedirectUri } from "@/lib/deviantart-publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function setupAuthorized(request: NextRequest) {
  const expected = process.env.DEVIANTART_SETUP_SECRET?.trim();
  const supplied = request.nextUrl.searchParams.get("key")?.trim();
  return Boolean(expected && supplied && supplied === expected);
}

export async function GET(request: NextRequest) {
  if (!setupAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const verifier = randomBytes(64).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(32).toString("base64url");

  const url = new URL("https://www.deviantart.com/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", deviantArtClientId());
  url.searchParams.set("redirect_uri", deviantArtRedirectUri());
  url.searchParams.set("scope", "stash publish");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(url);
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 10 * 60
  };
  response.cookies.set("everbond_da_oauth_state", state, cookieOptions);
  response.cookies.set("everbond_da_oauth_verifier", verifier, cookieOptions);
  return response;
}
