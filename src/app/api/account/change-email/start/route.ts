import { NextResponse } from "next/server";
import {
  createEmailChangeToken,
  currentEmailVerificationMessage,
  getEmailChangeBaseUrl,
  normalizeEmail,
  normalizeEmailChangeLanguage
} from "@/lib/account-email-change";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { sendEmail } from "@/lib/resend";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user?.email) {
      return NextResponse.json(
        { error: "SIGNUP_REQUIRED" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const language = normalizeEmailChangeLanguage(
      body?.language
    );
    const currentEmail = normalizeEmail(user.email);

    const token = createEmailChangeToken({
      purpose: "verify_current",
      userId: user.id,
      currentEmail
    });

    const verifyUrl = new URL(
      "/api/account/change-email/verify-current",
      getEmailChangeBaseUrl(request)
    );
    verifyUrl.searchParams.set("token", token);

    const message = currentEmailVerificationMessage(
      language,
      verifyUrl.toString()
    );

    await sendEmail({
      to: currentEmail,
      subject: message.subject,
      html: message.html
    });

    return NextResponse.json(
      { sent: true },
      {
        headers: {
          "Cache-Control": "private, no-store"
        }
      }
    );
  } catch (error) {
    console.error(
      "Current email verification failed:",
      error
    );

    return NextResponse.json(
      { error: "EMAIL_CHANGE_FAILED" },
      { status: 500 }
    );
  }
}
