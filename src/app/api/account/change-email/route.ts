import {
  NextRequest,
  NextResponse
} from "next/server";
import {
  createEmailChangeToken,
  EMAIL_CHANGE_COOKIE,
  getEmailChangeBaseUrl,
  newEmailVerificationMessage,
  normalizeEmail,
  normalizeEmailChangeLanguage,
  verifyEmailChangeToken
} from "@/lib/account-email-change";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { sendEmail } from "@/lib/resend";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user?.email) {
      return NextResponse.json(
        { error: "SIGNUP_REQUIRED" },
        { status: 401 }
      );
    }

    const grant = verifyEmailChangeToken(
      request.cookies.get(EMAIL_CHANGE_COOKIE)?.value ?? "",
      "current_verified"
    );

    const currentEmail = normalizeEmail(user.email);

    if (
      !grant ||
      grant.userId !== user.id ||
      grant.currentEmail !== currentEmail
    ) {
      return NextResponse.json(
        { error: "CURRENT_EMAIL_NOT_VERIFIED" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const newEmail = normalizeEmail(body?.newEmail);
    const language = normalizeEmailChangeLanguage(
      body?.language
    );

    if (
      !EMAIL_PATTERN.test(newEmail) ||
      newEmail === currentEmail
    ) {
      return NextResponse.json(
        { error: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    const token = createEmailChangeToken({
      purpose: "verify_new",
      userId: user.id,
      currentEmail,
      newEmail
    });

    const verifyUrl = new URL(
      "/api/account/change-email/verify-new",
      getEmailChangeBaseUrl(request)
    );
    verifyUrl.searchParams.set("token", token);

    const message = newEmailVerificationMessage(
      language,
      verifyUrl.toString()
    );

    await sendEmail({
      to: newEmail,
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
    console.error("New email verification failed:", error);

    return NextResponse.json(
      { error: "EMAIL_CHANGE_FAILED" },
      { status: 500 }
    );
  }
}
