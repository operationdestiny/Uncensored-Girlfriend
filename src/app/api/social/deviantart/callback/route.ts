import { NextRequest, NextResponse } from "next/server";
import { exchangeDeviantArtAuthorizationCode } from "@/lib/deviantart-publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function finishPage(message: string, ok: boolean) {
  const safe = message.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char] || char);

  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>EverBond DeviantArt</title></head><body style="font-family:system-ui;padding:40px;background:#111;color:#fff"><h1>${ok ? "DeviantArt connected" : "DeviantArt connection failed"}</h1><p>${safe}</p></body></html>`,
    {
      status: ok ? 200 : 400,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
    }
  );
}

export async function GET(request: NextRequest) {
  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) {
    return finishPage(
      request.nextUrl.searchParams.get("error_description") || oauthError,
      false
    );
  }

  const code = request.nextUrl.searchParams.get("code")?.trim();
  const state = request.nextUrl.searchParams.get("state")?.trim();
  const expectedState = request.cookies.get("everbond_da_oauth_state")?.value;
  const verifier = request.cookies.get("everbond_da_oauth_verifier")?.value;

  if (!code || !state || !expectedState || !verifier || state !== expectedState) {
    return finishPage("The OAuth callback state was missing or invalid. Start the connection again.", false);
  }

  try {
    await exchangeDeviantArtAuthorizationCode(code, verifier);
    const response = finishPage(
      "Authorization is saved. You can close this tab. Automatic posting will begin only when DEVIANTART_PUBLISHER_ENABLED is set to true.",
      true
    );
    response.cookies.delete("everbond_da_oauth_state");
    response.cookies.delete("everbond_da_oauth_verifier");
    return response;
  } catch (error) {
    return finishPage(error instanceof Error ? error.message : "OAuth exchange failed.", false);
  }
}
