import { NextResponse } from "next/server";
import {
  createEmailChangeToken,
  EMAIL_CHANGE_COOKIE,
  emailChangeCookieOptions,
  getEmailChangeBaseUrl,
  normalizeEmail,
  verifyEmailChangeToken
} from "@/lib/account-email-change";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function redirectWithStatus(
  request: Request,
  status: string
) {
  const url = new URL(
    "/my-bond",
    getEmailChangeBaseUrl(request)
  );
  url.searchParams.set("email-change", status);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  try {
    const token =
      new URL(request.url).searchParams.get("token") ?? "";
    const payload = verifyEmailChangeToken(
      token,
      "verify_current"
    );

    if (!payload) {
      return redirectWithStatus(request, "invalid");
    }

    const { data, error } =
      await getSupabaseServiceClient()
        .auth.admin.getUserById(payload.userId);

    if (
      error ||
      !data.user?.email ||
      normalizeEmail(data.user.email) !==
        payload.currentEmail
    ) {
      return redirectWithStatus(request, "invalid");
    }

    const grant = createEmailChangeToken({
      purpose: "current_verified",
      userId: payload.userId,
      currentEmail: payload.currentEmail
    });

    const response = redirectWithStatus(
      request,
      "current-verified"
    );

    response.cookies.set(
      EMAIL_CHANGE_COOKIE,
      grant,
      emailChangeCookieOptions()
    );

    return response;
  } catch (error) {
    console.error(
      "Current email verification link failed:",
      error
    );
    return redirectWithStatus(request, "invalid");
  }
}
