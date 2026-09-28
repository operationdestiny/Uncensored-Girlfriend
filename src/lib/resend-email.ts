export type ResendEmailInput = {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type ResendEmailResult =
  | { ok: true; id: string }
  | { ok: false; message: string; status: number };

export async function sendResendEmail(input: ResendEmailInput): Promise<ResendEmailResult> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000)
  });

  const payload = (await response.json().catch(() => null)) as
    | { id?: string; message?: string; error?: { message?: string } }
    | null;

  if (!response.ok || !payload?.id) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      `Resend email request failed with HTTP ${response.status}.`;
    return { ok: false, message: String(message).slice(0, 500), status: response.status };
  }

  return { ok: true, id: payload.id };
}
