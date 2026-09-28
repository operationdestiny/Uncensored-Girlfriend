import {
  createHmac,
  timingSafeEqual
} from "node:crypto";

export const EMAIL_CHANGE_COOKIE =
  "ug_email_change_verified";

export type EmailChangeLanguage =
  | "EN"
  | "ES"
  | "FR"
  | "DE"
  | "JA"
  | "KO";

export type EmailChangePurpose =
  | "verify_current"
  | "current_verified"
  | "verify_new";

export type EmailChangeTokenPayload = {
  purpose: EmailChangePurpose;
  userId: string;
  currentEmail: string;
  newEmail?: string;
  expiresAt: number;
};

const EMAIL_CHANGE_TTL_SECONDS = 30 * 60;

const EMAIL_COPY: Record<
  EmailChangeLanguage,
  {
    currentSubject: string;
    currentHeading: string;
    currentBody: string;
    currentButton: string;
    newSubject: string;
    newHeading: string;
    newBody: string;
    newButton: string;
    expiry: string;
  }
> = {
  EN: {
    currentSubject: "Verify your current Uncensored Girlfriend email",
    currentHeading: "Verify your current email",
    currentBody:
      "Open this link to confirm that you requested an Uncensored Girlfriend account email change.",
    currentButton: "Verify current email",
    newSubject: "Verify your new Uncensored Girlfriend email",
    newHeading: "Verify your new email",
    newBody:
      "Open this link to confirm your new Uncensored Girlfriend account email and finish the change.",
    newButton: "Verify new email",
    expiry: "This link expires in 30 minutes."
  },
  ES: {
    currentSubject: "Verifica tu correo actual de Uncensored Girlfriend",
    currentHeading: "Verifica tu correo actual",
    currentBody:
      "Abre este enlace para confirmar que solicitaste cambiar el correo de tu cuenta Uncensored Girlfriend.",
    currentButton: "Verificar correo actual",
    newSubject: "Verifica tu nuevo correo de Uncensored Girlfriend",
    newHeading: "Verifica tu nuevo correo",
    newBody:
      "Abre este enlace para confirmar el nuevo correo de tu cuenta Uncensored Girlfriend y completar el cambio.",
    newButton: "Verificar nuevo correo",
    expiry: "Este enlace caduca en 30 minutos."
  },
  FR: {
    currentSubject: "Vérifiez votre adresse Uncensored Girlfriend actuelle",
    currentHeading: "Vérifiez votre adresse actuelle",
    currentBody:
      "Ouvrez ce lien pour confirmer que vous avez demandé le changement d’adresse de votre compte Uncensored Girlfriend.",
    currentButton: "Vérifier l’adresse actuelle",
    newSubject: "Vérifiez votre nouvelle adresse Uncensored Girlfriend",
    newHeading: "Vérifiez votre nouvelle adresse",
    newBody:
      "Ouvrez ce lien pour confirmer la nouvelle adresse de votre compte Uncensored Girlfriend et terminer le changement.",
    newButton: "Vérifier la nouvelle adresse",
    expiry: "Ce lien expire dans 30 minutes."
  },
  DE: {
    currentSubject: "Bestätige deine aktuelle Uncensored Girlfriend-E-Mail",
    currentHeading: "Aktuelle E-Mail bestätigen",
    currentBody:
      "Öffne diesen Link, um zu bestätigen, dass du die Änderung deiner Uncensored Girlfriend-Konto-E-Mail angefordert hast.",
    currentButton: "Aktuelle E-Mail bestätigen",
    newSubject: "Bestätige deine neue Uncensored Girlfriend-E-Mail",
    newHeading: "Neue E-Mail bestätigen",
    newBody:
      "Öffne diesen Link, um deine neue Uncensored Girlfriend-Konto-E-Mail zu bestätigen und die Änderung abzuschließen.",
    newButton: "Neue E-Mail bestätigen",
    expiry: "Dieser Link läuft in 30 Minuten ab."
  },
  JA: {
    currentSubject: "現在のUncensored Girlfriendメールを確認してください",
    currentHeading: "現在のメールを確認",
    currentBody:
      "Uncensored Girlfriendアカウントのメール変更をリクエストしたことを確認するには、このリンクを開いてください。",
    currentButton: "現在のメールを確認",
    newSubject: "新しいUncensored Girlfriendメールを確認してください",
    newHeading: "新しいメールを確認",
    newBody:
      "新しいUncensored Girlfriendアカウントメールを確認して変更を完了するには、このリンクを開いてください。",
    newButton: "新しいメールを確認",
    expiry: "このリンクは30分で期限切れになります。"
  },
  KO: {
    currentSubject: "현재 Uncensored Girlfriend 이메일을 확인하세요",
    currentHeading: "현재 이메일 확인",
    currentBody:
      "Uncensored Girlfriend 계정 이메일 변경을 요청했음을 확인하려면 이 링크를 여세요.",
    currentButton: "현재 이메일 확인",
    newSubject: "새 Uncensored Girlfriend 이메일을 확인하세요",
    newHeading: "새 이메일 확인",
    newBody:
      "새 Uncensored Girlfriend 계정 이메일을 확인하고 변경을 완료하려면 이 링크를 여세요.",
    newButton: "새 이메일 확인",
    expiry: "이 링크는 30분 후 만료됩니다."
  }
};

function getSigningSecret() {
  const secret =
    process.env.ACCOUNT_EMAIL_CHANGE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error("Missing account email-change signing secret.");
  }

  return secret;
}

function sign(encodedPayload: string) {
  return createHmac("sha256", getSigningSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function normalizeEmail(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}

export function normalizeEmailChangeLanguage(
  value: unknown
): EmailChangeLanguage {
  return value === "ES" ||
    value === "FR" ||
    value === "DE" ||
    value === "JA" ||
    value === "KO"
    ? value
    : "EN";
}

export function createEmailChangeToken(
  payload: Omit<EmailChangeTokenPayload, "expiresAt">
) {
  const completePayload: EmailChangeTokenPayload = {
    ...payload,
    currentEmail: normalizeEmail(payload.currentEmail),
    newEmail: payload.newEmail
      ? normalizeEmail(payload.newEmail)
      : undefined,
    expiresAt:
      Math.floor(Date.now() / 1000) +
      EMAIL_CHANGE_TTL_SECONDS
  };

  const encodedPayload = Buffer.from(
    JSON.stringify(completePayload),
    "utf8"
  ).toString("base64url");

  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyEmailChangeToken(
  token: string,
  purpose: EmailChangePurpose
) {
  const [encodedPayload, suppliedSignature] =
    token.split(".");

  if (!encodedPayload || !suppliedSignature) {
    return null;
  }

  const expectedSignature = sign(encodedPayload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);

  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(
        encodedPayload,
        "base64url"
      ).toString("utf8")
    ) as EmailChangeTokenPayload;

    if (
      payload.purpose !== purpose ||
      typeof payload.userId !== "string" ||
      !payload.userId ||
      typeof payload.currentEmail !== "string" ||
      !payload.currentEmail ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    if (
      purpose === "verify_new" &&
      (!payload.newEmail ||
        normalizeEmail(payload.newEmail) ===
          normalizeEmail(payload.currentEmail))
    ) {
      return null;
    }

    return {
      ...payload,
      currentEmail: normalizeEmail(payload.currentEmail),
      newEmail: payload.newEmail
        ? normalizeEmail(payload.newEmail)
        : undefined
    };
  } catch {
    return null;
  }
}

export function getEmailChangeBaseUrl(request: Request) {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");

  if (configured) return configured;

  return new URL(request.url).origin;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return entities[character] ?? character;
  });
}

function emailHtml({
  heading,
  body,
  button,
  href,
  expiry
}: {
  heading: string;
  body: string;
  button: string;
  href: string;
  expiry: string;
}) {
  return `
    <div style="background:#08060b;padding:32px 18px;font-family:Arial,sans-serif;color:#ffffff">
      <div style="max-width:560px;margin:0 auto;border:1px solid rgba(255,92,168,.45);border-radius:24px;background:#120d16;padding:32px">
        <p style="margin:0;color:#ff5ca8;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Uncensored Girlfriend</p>
        <h1 style="margin:14px 0 0;font-size:28px;line-height:1.2">${escapeHtml(heading)}</h1>
        <p style="margin:18px 0 0;color:#d3c7d8;font-size:15px;line-height:1.7">${escapeHtml(body)}</p>
        <p style="margin:24px 0">
          <a href="${escapeHtml(href)}" style="display:inline-block;border-radius:999px;background:#ff5ca8;color:#ffffff;padding:13px 22px;text-decoration:none;font-size:14px;font-weight:700">${escapeHtml(button)}</a>
        </p>
        <p style="margin:0;color:#8f8295;font-size:12px;line-height:1.6">${escapeHtml(expiry)}</p>
      </div>
    </div>
  `;
}

export function currentEmailVerificationMessage(
  language: EmailChangeLanguage,
  href: string
) {
  const copy = EMAIL_COPY[language];

  return {
    subject: copy.currentSubject,
    html: emailHtml({
      heading: copy.currentHeading,
      body: copy.currentBody,
      button: copy.currentButton,
      href,
      expiry: copy.expiry
    })
  };
}

export function newEmailVerificationMessage(
  language: EmailChangeLanguage,
  href: string
) {
  const copy = EMAIL_COPY[language];

  return {
    subject: copy.newSubject,
    html: emailHtml({
      heading: copy.newHeading,
      body: copy.newBody,
      button: copy.newButton,
      href,
      expiry: copy.expiry
    })
  };
}

export function emailChangeCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/api/account/change-email",
    maxAge: EMAIL_CHANGE_TTL_SECONDS
  };
}
