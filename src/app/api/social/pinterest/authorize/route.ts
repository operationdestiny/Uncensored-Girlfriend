import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  pinterestClientId,
  pinterestRedirectUri,
  pinterestSetupSecret
} from "@/lib/pinterest-publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function setupAuthorized(request: NextRequest) {
  const expected = pinterestSetupSecret();
  const supplied = request.nextUrl.searchParams.get("key")?.trim();
  return Boolean(expected && supplied && supplied === expected);
}

export async function GET(request: NextRequest) {
  if (!setupAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const state = randomBytes(32).toString("base64url");
  const url = new URL("https://www.pinterest.com/oauth/");
  url.searchParams.set("client_id", pinterestClientId());
  url.searchParams.set("redirect_uri", pinterestRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    "boards:read,boards:write,pins:read,pins:write"
  );
  url.searchParams.set("state", state);

  const response = NextResponse.redirect(url);
  response.cookies.set("everbond_pinterest_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60
  });
  return response;
}
