import { NextResponse } from "next/server";
import {
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
      "verify_new"
    );

    if (!payload?.newEmail) {
      return redirectWithStatus(request, "invalid");
    }

    const supabase = getSupabaseServiceClient();
    const { data, error } =
      await supabase.auth.admin.getUserById(
        payload.userId
      );

    if (error || !data.user?.email) {
      return redirectWithStatus(request, "invalid");
    }

    const storedEmail = normalizeEmail(data.user.email);

    if (storedEmail === payload.newEmail) {
      const alreadyComplete = redirectWithStatus(
        request,
        "complete"
      );
      alreadyComplete.cookies.set(
        EMAIL_CHANGE_COOKIE,
        "",
        {
          ...emailChangeCookieOptions(),
          maxAge: 0
        }
      );
      return alreadyComplete;
    }

    if (storedEmail !== payload.currentEmail) {
      return redirectWithStatus(request, "invalid");
    }

    const updateResult =
      await supabase.auth.admin.updateUserById(
        payload.userId,
        {
          email: payload.newEmail,
          email_confirm: true
        }
      );

    if (updateResult.error) {
      console.error(
        "Supabase account email update failed:",
        updateResult.error
      );
      return redirectWithStatus(request, "failed");
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        email: payload.newEmail,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", payload.userId);

    if (profileError) {
      console.error(
        "Profile email synchronization failed:",
        profileError
      );
    }

    const response = redirectWithStatus(
      request,
      "complete"
    );

    response.cookies.set(
      EMAIL_CHANGE_COOKIE,
      "",
      {
        ...emailChangeCookieOptions(),
        maxAge: 0
      }
    );

    return response;
  } catch (error) {
    console.error(
      "New email verification link failed:",
      error
    );
    return redirectWithStatus(request, "failed");
  }
}
