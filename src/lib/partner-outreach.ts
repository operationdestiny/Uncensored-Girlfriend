import { sendResendEmail } from "@/lib/resend-email";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { hashToken, randomToken } from "@/lib/partner-engine";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
}

function platformLabel(value: string | null | undefined) {
  const platform = (value ?? "creator").trim().toLowerCase();
  if (platform === "tiktok") return "TikTok";
  if (platform === "instagram") return "Instagram";
  if (platform === "youtube") return "YouTube";
  if (platform === "pinterest") return "Pinterest";
  if (platform === "seo") return "website/blog";
  if (platform === "review") return "review";
  if (platform === "discord") return "community";
  if (!platform || platform === "other") return "creator";
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

export type PartnerOutreachInput = {
  partnerId: string;
  origin: string;
  followUp?: boolean;
  // Retained for API compatibility. Universal campaign copy is intentionally fixed.
  customSubject?: string;
  customIntro?: string;
};

export async function sendPartnerOutreach(input: PartnerOutreachInput) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.PARTNER_OUTREACH_FROM_EMAIL?.trim();
  const postalAddress = process.env.PARTNER_BUSINESS_POSTAL_ADDRESS?.trim();
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  if (!apiKey || !from || !postalAddress || !supportEmail || /@everbond\.ai$/i.test(from) || /@everbond\.ai$/i.test(supportEmail)) {
    return { ok: false as const, setupRequired: true, error: "OUTREACH_EMAIL_ENV_MISSING" };
  }

  const supabase = getSupabaseServiceClient();
  const { data: partner } = await supabase
    .from("partners")
    .select("id,slug,public_name,contact_email,contact_handle,source_platform,status,metadata")
    .eq("id", input.partnerId)
    .maybeSingle();
  if (!partner?.contact_email) return { ok: false as const, error: "PARTNER_EMAIL_REQUIRED" };

  const email = partner.contact_email.trim().toLowerCase();
  const { data: suppressed } = await supabase
    .from("partner_outreach_suppressions")
    .select("contact_email")
    .eq("contact_email", email)
    .maybeSingle();
  if (suppressed) return { ok: false as const, error: "CONTACT_SUPPRESSED" };

  const { count: initialCount } = await supabase
    .from("partner_outreach_events")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partner.id)
    .eq("channel", "email")
    .eq("event_type", "initial_sent");
  const { count: followCount } = await supabase
    .from("partner_outreach_events")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partner.id)
    .eq("channel", "email")
    .eq("event_type", "followup_sent");

  if (!input.followUp && (initialCount ?? 0) > 0) return { ok: false as const, error: "INITIAL_ALREADY_SENT" };
  if (input.followUp && ((initialCount ?? 0) === 0 || (followCount ?? 0) > 0)) return { ok: false as const, error: "FOLLOWUP_NOT_ALLOWED" };

  const inviteToken = randomToken(32);
  const inviteExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const { error: inviteError } = await supabase.from("partner_invites").insert({
    partner_id: partner.id,
    token_hash: hashToken(inviteToken),
    expires_at: inviteExpiresAt
  });
  if (inviteError) return { ok: false as const, error: "INVITE_CREATE_FAILED" };

  const unsubscribeToken = randomToken(32);
  const { error: unsubError } = await supabase.from("partner_outreach_unsubscribe_tokens").insert({
    contact_email: email,
    token_hash: hashToken(unsubscribeToken)
  });
  if (unsubError) return { ok: false as const, error: "UNSUBSCRIBE_CREATE_FAILED" };

  const shareUrl = `${input.origin}/r/${partner.slug}`;
  const inviteUrl = `${input.origin}/partner/invite/${inviteToken}`;
  const unsubscribeUrl = `${input.origin}/partners/unsubscribe/${unsubscribeToken}`;
  const name = partner.public_name || partner.contact_handle || "there";
  const platform = platformLabel(partner.source_platform);
  const siteUrl = "https://uncensoredgirlfriend.chat";

  // Fixed universal subjects. Automatic discovery cannot override these.
  const subject = input.followUp
    ? "Your Uncensored Girlfriend partner link is still ready"
    : "Our Affiliate Offer — 100% Earnings For First 30 Days, Lifetime Earnings";

  const initialText = `${name},\n\nWe came across your ${platform} content while browsing creators, and your audience looks like a great match for Uncensored Girlfriend.\nSite link: ${siteUrl}\n\nHere’s the part you’ll care about most:\n\nYou earn 100% of the profit you bring for your first 30 earning days,\n80% through day 180,\nand 50% for life.\n\nNo subscription requirement. No application. No waiting.\n\nUncensored Girlfriend is an uncensored AI companion + roleplay platform with thousands of characters, private chats, persistent memory, and image/video generation.\n\nYour partner setup is already done:\n\nReferral link:\n${shareUrl}\n\nYour earnings dashboard:\nActivate my partnership: ${inviteUrl}\n\nYour earning clock starts when you generate your first earning so there's no pressure to activate early. Just open your pre‑made dashboard, confirm you’re 18+, accept the Partner Agreement, and you can start promoting immediately. Payout/KYC only happens when you withdraw.\n\nYour dashboard shows clicks, signups, buyers, and earnings live.\n\nYou can promote Uncensored Girlfriend however you want, in your own style.\nIf you have any questions, contact: ${supportEmail}\n\nUncensored Girlfriend`;

  const followUpText = `${name},\n\nJust following up one time because your Uncensored Girlfriend referral link and private earnings dashboard are still reserved for you.\n\nHere are your details again:\n\nReferral link:\n${shareUrl}\n\nYour dashboard:\nActivate my partnership: ${inviteUrl}\n\nAnd the commission terms:\n\n100% of the profit you bring for your first 30 earning days,\n80% through day 180,\n50% for life.\n\nYour earning clock only starts when you generate your first earning, so there’s no pressure to activate early. Once you open your dashboard, confirm you’re 18+, and accept the Partner Agreement, you can start promoting anytime how you want. Payout/KYC only happens when you withdraw.\n\nYour dashboard tracks clicks, signups, buyers, and earnings live.\n\nIf you have any questions, contact: ${supportEmail}\n\nUncensored Girlfriend`;

  // Keep the compliance footer underneath the user's approved campaign copy.
  const footerText = `\n\nThis is a commercial partner invitation from Uncensored Girlfriend.\n${postalAddress}\nUnsubscribe: ${unsubscribeUrl}`;
  const text = `${input.followUp ? followUpText : initialText}${footerText}`;

  const initialHtml = `<p>${escapeHtml(name)},</p><p>We came across your ${escapeHtml(platform)} content while browsing creators, and your audience looks like a great match for Uncensored Girlfriend.<br><strong>Site link:</strong> <a href="${escapeHtml(siteUrl)}">${escapeHtml(siteUrl)}</a></p><p>Here’s the part you’ll care about most:</p><p><strong>You earn 100% of the profit you bring for your first 30 earning days,<br>80% through day 180,<br>and 50% for life.</strong></p><p><strong>No subscription requirement. No application. No waiting.</strong></p><p>Uncensored Girlfriend is an uncensored AI companion + roleplay platform with thousands of characters, private chats, persistent memory, and image/video generation.</p><p><strong>Your partner setup is already done:</strong></p><p><strong>Referral link:</strong><br><a href="${escapeHtml(shareUrl)}">${escapeHtml(shareUrl)}</a></p><p><strong>Your earnings dashboard:</strong><br><a href="${escapeHtml(inviteUrl)}"><strong>Activate my partnership</strong></a></p><p>Your earning clock starts when you generate your first earning so there's no pressure to activate early. Just open your pre‑made dashboard, confirm you’re 18+, accept the Partner Agreement, and you can start promoting immediately. Payout/KYC only happens when you withdraw.</p><p>Your dashboard shows clicks, signups, buyers, and earnings live.</p><p>You can promote Uncensored Girlfriend however you want, in your own style.<br>If you have any questions, contact: <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a></p><p><strong>Uncensored Girlfriend</strong></p>`;

  const followUpHtml = `<p>${escapeHtml(name)},</p><p>Just following up one time because your Uncensored Girlfriend referral link and private earnings dashboard are still reserved for you.</p><p>Here are your details again:</p><p><strong>Referral link:</strong><br><a href="${escapeHtml(shareUrl)}">${escapeHtml(shareUrl)}</a></p><p><strong>Your dashboard:</strong><br><a href="${escapeHtml(inviteUrl)}"><strong>Activate my partnership</strong></a></p><p>And the commission terms:</p><p><strong>100% of the profit you bring for your first 30 earning days,<br>80% through day 180,<br>50% for life.</strong></p><p>Your earning clock only starts when you generate your first earning, so there’s no pressure to activate early. Once you open your dashboard, confirm you’re 18+, and accept the Partner Agreement, you can start promoting anytime how you want. Payout/KYC only happens when you withdraw.</p><p>Your dashboard tracks clicks, signups, buyers, and earnings live.</p><p>If you have any questions, contact: <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a></p><p><strong>Uncensored Girlfriend</strong></p>`;

  const footerHtml = `<hr style="border:0;border-top:1px solid #eee"><p style="font-size:12px;color:#8b7d84">Uncensored Girlfriend · Commercial partner invitation · ${escapeHtml(postalAddress)} · <a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe from partner outreach</a></p>`;
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d1519">${input.followUp ? followUpHtml : initialHtml}${footerHtml}</div>`;

  const sent = await sendResendEmail({ apiKey, from, to: email, subject, text, html });
  if (!sent.ok) {
    return { ok: false as const, error: "OUTREACH_SEND_FAILED", message: sent.message };
  }

  const metadata = (partner.metadata ?? {}) as { prospectId?: string };
  await supabase.from("partner_outreach_events").insert({
    prospect_id: metadata.prospectId ?? null,
    partner_id: partner.id,
    channel: "email",
    event_type: input.followUp ? "followup_sent" : "initial_sent",
    destination: email,
    message_subject: subject,
    message_body: text,
    provider_message_id: sent.id
  });
  if (metadata.prospectId) {
    await supabase.from("partner_prospects").update({ status: "contacted", updated_at: new Date().toISOString() }).eq("id", metadata.prospectId);
  }

  return { ok: true as const, providerMessageId: sent.id, shareUrl, inviteUrl };
}
