import { NextResponse } from "next/server";
import { z } from "zod";
import { getCheckbookStatus } from "@/lib/checkbook";
import { submitCheckbookPayout } from "@/lib/partner-payouts";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  hashToken,
  randomToken,
  requestOrigin,
  requireFinanceAdmin,
  sanitizePartnerDestination,
  uniquePartnerSlug
} from "@/lib/partner-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CreateBody = z.object({
  publicName: z.string().trim().min(1).max(120),
  preferredSlug: z.string().trim().max(80).optional(),
  partnerType: z.string().trim().min(1).max(40).default("creator"),
  sourcePlatform: z.string().trim().max(60).optional(),
  contactHandle: z.string().trim().max(160).optional(),
  contactEmail: z.string().trim().email().max(320).optional(),
  destinationPath: z.string().trim().max(500).optional(),
  campaign: z.string().trim().max(80).optional(),
  prospectId: z.string().uuid().optional()
}).strict();

const PatchBody = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("reissue_invite"),
    partnerId: z.string().uuid()
  }).strict(),
  z.object({
    action: z.literal("set_status"),
    partnerId: z.string().uuid(),
    status: z.enum(["invited", "active", "suspended", "terminated"])
  }).strict(),
  z.object({
    action: z.literal("set_contact_email"),
    partnerId: z.string().uuid(),
    contactEmail: z.string().trim().email().max(320)
  }).strict(),
  z.object({
    action: z.literal("retry_payout"),
    payoutId: z.string().uuid()
  }).strict(),
  z.object({
    action: z.literal("mark_payout_paid"),
    payoutId: z.string().uuid(),
    providerPayoutId: z.string().trim().min(3).max(240)
  }).strict(),
  z.object({
    action: z.literal("cancel_payout"),
    payoutId: z.string().uuid(),
    reason: z.string().trim().max(240).optional()
  }).strict()
]);

async function createInvite(partnerId: string, origin: string) {
  const supabase = getSupabaseServiceClient();
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("partner_invites").insert({
    partner_id: partnerId,
    token_hash: hashToken(token),
    expires_at: expiresAt
  });
  if (error) throw new Error(error.message);
  return { inviteUrl: `${origin}/partner/invite/${token}`, expiresAt };
}

export async function GET(request: Request) {
  const auth = await requireFinanceAdmin(request);
  if (auth.response) return auth.response;
  const supabase = getSupabaseServiceClient();
  const [partnerRows, payoutRows] = await Promise.all([
    supabase
      .from("partners")
      .select("id,slug,public_name,partner_type,source_platform,contact_handle,contact_email,status,activated_at,first_eligible_earning_at,created_at,partner_finance_state(current_commission_usd,negative_carry_usd),partner_payout_accounts(provider,onboarding_status,payout_enabled)")
      .order("created_at", { ascending: false })
      .limit(250),
    supabase
      .from("partner_payouts")
      .select("id,partner_id,amount_minor,recipient_amount_minor,provider_fee_minor,status,provider,provider_payout_id,payout_reference,requested_at,processing_at,paid_at,failed_at,failure_code,failure_message,provider_metadata")
      .in("status", ["reserved", "processing", "paid", "failed", "cancelled"])
      .order("requested_at", { ascending: false })
      .limit(250)
  ]);
  if (partnerRows.error || payoutRows.error) {
    console.error("Partner list failed", partnerRows.error ?? payoutRows.error);
    return NextResponse.json({ error: "PARTNER_LIST_FAILED" }, { status: 500 });
  }
  return NextResponse.json({
    partners: partnerRows.data ?? [],
    payouts: payoutRows.data ?? [],
    payoutProvider: getCheckbookStatus(),
    webhookUrl: `${requestOrigin(request)}/api/webhooks/checkbook`
  });
}

export async function POST(request: Request) {
  const auth = await requireFinanceAdmin(request);
  if (auth.response) return auth.response;
  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_PARTNER", details: parsed.error.flatten() }, { status: 400 });

  const supabase = getSupabaseServiceClient();
  const input = parsed.data;
  if (input.contactEmail) {
    const { data: existing } = await supabase.from("partners").select("id,slug").ilike("contact_email", input.contactEmail).maybeSingle();
    if (existing) return NextResponse.json({ error: "PARTNER_ALREADY_EXISTS", partner: existing }, { status: 409 });
  }

  const [{ data: terms }, slug] = await Promise.all([
    supabase.from("partner_terms_versions").select("id").eq("is_default", true).maybeSingle(),
    uniquePartnerSlug(input.preferredSlug || input.contactHandle || input.publicName)
  ]);
  if (!terms?.id) return NextResponse.json({ error: "PARTNER_TERMS_NOT_CONFIGURED" }, { status: 500 });

  const destination = sanitizePartnerDestination(input.destinationPath, "/");
  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .insert({
      slug,
      public_name: input.publicName,
      partner_type: input.partnerType,
      source_platform: input.sourcePlatform ?? null,
      contact_handle: input.contactHandle ?? null,
      contact_email: input.contactEmail ?? null,
      terms_version_id: terms.id,
      metadata: input.prospectId ? { prospectId: input.prospectId } : {}
    })
    .select("id,slug,public_name,status")
    .single();
  if (partnerError || !partner) {
    if (partnerError?.code === "23505") {
      return NextResponse.json({ error: "PARTNER_ALREADY_EXISTS" }, { status: 409 });
    }
    return NextResponse.json({ error: "PARTNER_CREATE_FAILED" }, { status: 500 });
  }

  const { data: link, error: linkError } = await supabase
    .from("partner_links")
    .insert({
      partner_id: partner.id,
      code: partner.slug,
      campaign_key: input.campaign?.trim().toLowerCase() || null,
      destination_path: destination
    })
    .select("id,code")
    .single();
  if (linkError || !link) {
    await supabase.from("partners").delete().eq("id", partner.id);
    return NextResponse.json({ error: "PARTNER_LINK_CREATE_FAILED" }, { status: 500 });
  }

  const origin = requestOrigin(request);
  let invite: Awaited<ReturnType<typeof createInvite>>;
  try {
    invite = await createInvite(partner.id, origin);
  } catch (error) {
    console.error("Partner invite creation failed", error);
    await supabase.from("partners").delete().eq("id", partner.id);
    return NextResponse.json({ error: "PARTNER_INVITE_CREATE_FAILED" }, { status: 500 });
  }

  const { error: financeStateError } = await supabase
    .from("partner_finance_state")
    .insert({ partner_id: partner.id });
  if (financeStateError) {
    await supabase.from("partners").delete().eq("id", partner.id);
    return NextResponse.json({ error: "PARTNER_FINANCE_STATE_CREATE_FAILED" }, { status: 500 });
  }

  await supabase.from("partner_payout_accounts").upsert({
    partner_id: partner.id,
    provider: "checkbook",
    provider_creator_id: null,
    onboarding_status: input.contactEmail ? "ready" : "not_started",
    payout_enabled: Boolean(input.contactEmail),
    provider_metadata: { providerPurpose: "external-email-payout" },
    updated_at: new Date().toISOString()
  });

  if (input.prospectId) {
    await supabase.from("partner_prospects").update({ partner_id: partner.id, status: "prepared", updated_at: new Date().toISOString() }).eq("id", input.prospectId);
  }

  return NextResponse.json({
    ok: true,
    partner,
    shareUrl: `${origin}/r/${partner.slug}`,
    dashboardUrl: `${origin}/partner/${partner.slug}`,
    privateInviteUrl: invite.inviteUrl,
    inviteExpiresAt: invite.expiresAt
  });
}

export async function PATCH(request: Request) {
  const auth = await requireFinanceAdmin(request);
  if (auth.response) return auth.response;
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_UPDATE" }, { status: 400 });
  const supabase = getSupabaseServiceClient();

  if (parsed.data.action === "retry_payout") {
    const result = await submitCheckbookPayout(parsed.data.payoutId);
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  }

  // Emergency ledger recovery only. Normal Checkbook payouts are marked paid by signed webhooks.
  if (parsed.data.action === "mark_payout_paid") {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("partner_payouts")
      .update({
        status: "paid",
        provider_payout_id: parsed.data.providerPayoutId,
        processing_at: now,
        paid_at: now,
        failure_code: "OWNER_MANUAL_SETTLEMENT",
        failure_message: "Finance admin manually confirmed this payout outside the automatic provider flow.",
        updated_at: now
      })
      .eq("id", parsed.data.payoutId)
      .eq("status", "reserved")
      .is("provider_payout_id", null)
      .select("id,partner_id,amount_minor,status,provider_payout_id,paid_at")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "PAYOUT_REFERENCE_ALREADY_USED" }, { status: 409 });
      return NextResponse.json({ error: "PARTNER_PAYOUT_UPDATE_FAILED" }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "PARTNER_PAYOUT_NOT_SAFE_FOR_MANUAL_SETTLEMENT" }, { status: 409 });
    return NextResponse.json({ ok: true, payout: data });
  }

  if (parsed.data.action === "cancel_payout") {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("partner_payouts")
      .update({
        status: "cancelled",
        failure_code: "OWNER_CANCELLED",
        failure_message: parsed.data.reason || "Cancelled by finance admin before provider submission",
        failed_at: now,
        updated_at: now
      })
      .eq("id", parsed.data.payoutId)
      .eq("status", "reserved")
      .is("provider_payout_id", null)
      .select("id,partner_id,amount_minor,status")
      .maybeSingle();
    if (error) return NextResponse.json({ error: "PARTNER_PAYOUT_UPDATE_FAILED" }, { status: 500 });
    if (!data) return NextResponse.json({ error: "PARTNER_PAYOUT_NOT_CANCELLABLE" }, { status: 409 });
    return NextResponse.json({ ok: true, payout: data });
  }

  if (parsed.data.action === "set_contact_email") {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("partners")
      .update({ contact_email: parsed.data.contactEmail, updated_at: now })
      .eq("id", parsed.data.partnerId);
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "PARTNER_EMAIL_ALREADY_USED" }, { status: 409 });
      return NextResponse.json({ error: "PARTNER_EMAIL_UPDATE_FAILED" }, { status: 500 });
    }
    await supabase.from("partner_payout_accounts").upsert({
      partner_id: parsed.data.partnerId,
      provider: "checkbook",
      provider_creator_id: null,
      onboarding_status: "ready",
      payout_enabled: true,
      provider_metadata: { providerPurpose: "external-email-payout" },
      updated_at: now
    });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "set_status") {
    const { error } = await supabase.from("partners").update({ status: parsed.data.status, updated_at: new Date().toISOString() }).eq("id", parsed.data.partnerId);
    if (error) return NextResponse.json({ error: "PARTNER_STATUS_UPDATE_FAILED" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { data: partner } = await supabase.from("partners").select("slug").eq("id", parsed.data.partnerId).maybeSingle();
  if (!partner) return NextResponse.json({ error: "PARTNER_NOT_FOUND" }, { status: 404 });
  const invite = await createInvite(parsed.data.partnerId, requestOrigin(request));
  return NextResponse.json({ ok: true, ...invite, dashboardUrl: `${requestOrigin(request)}/partner/${partner.slug}` });
}
