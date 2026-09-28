export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();

  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV EMAIL] To: ${to} | Subject: ${subject}`);
      return { id: "dev-email" };
    }
    throw new Error("New-project RESEND_API_KEY is not configured.");
  }
  if (!from || /@everbond\.ai$/i.test(from)) {
    throw new Error("Configure RESEND_FROM_EMAIL with a verified Uncensored Girlfriend sender.");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html })
  });
  if (!response.ok) throw new Error(`Resend failed: ${response.status}`);
  return response.json();
}
