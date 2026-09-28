import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinanceAdmin } from "@/lib/partner-engine";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateBody = z.object({
  platform: z.string().trim().max(60).optional(),
  handle: z.string().trim().max(160).optional(),
  publicName: z.string().trim().max(160).optional(),
  contactEmail: z.string().trim().email().max(320).optional(),
  publicContactUrl: z.string().trim().url().max(1000).optional(),
  niche: z.string().trim().max(120).optional(),
  fitScore: z.number().int().min(0).max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
}).strict();

const EventBody = z.object({
  prospectId: z.string().uuid(),
  partnerId: z.string().uuid().optional(),
  channel: z.string().trim().min(1).max(40),
  eventType: z.string().trim().min(1).max(40),
  destination: z.string().trim().max(500).optional(),
  messageSubject: z.string().max(300).optional(),
  messageBody: z.string().max(20000).optional(),
  providerMessageId: z.string().max(300).optional()
}).strict();

export async function GET(request: Request) {
  const auth = await requireFinanceAdmin(request);
  if (auth.response) return auth.response;
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.from("partner_prospects").select("*").order("discovered_at", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: "PROSPECT_LIST_FAILED" }, { status: 500 });
  return NextResponse.json({ prospects: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireFinanceAdmin(request);
  if (auth.response) return auth.response;
  const raw = await request.json().catch(() => null);
  const event = EventBody.safeParse(raw);
  const supabase = getSupabaseServiceClient();
  if (event.success) {
    const { error } = await supabase.from("partner_outreach_events").insert({
      prospect_id: event.data.prospectId,
      partner_id: event.data.partnerId ?? null,
      channel: event.data.channel,
      event_type: event.data.eventType,
      destination: event.data.destination ?? null,
      message_subject: event.data.messageSubject ?? null,
      message_body: event.data.messageBody ?? null,
      provider_message_id: event.data.providerMessageId ?? null
    });
    if (error) return NextResponse.json({ error: "OUTREACH_EVENT_FAILED" }, { status: 500 });
    if (event.data.eventType === "sent" || event.data.eventType === "contacted") {
      await supabase.from("partner_prospects").update({ status: "contacted", updated_at: new Date().toISOString() }).eq("id", event.data.prospectId);
    }
    return NextResponse.json({ ok: true });
  }

  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_PROSPECT" }, { status: 400 });
  const { data, error } = await supabase.from("partner_prospects").insert({
    platform: parsed.data.platform ?? null,
    handle: parsed.data.handle ?? null,
    public_name: parsed.data.publicName ?? null,
    contact_email: parsed.data.contactEmail ?? null,
    public_contact_url: parsed.data.publicContactUrl ?? null,
    niche: parsed.data.niche ?? null,
    fit_score: parsed.data.fitScore ?? null,
    metadata: parsed.data.metadata ?? {}
  }).select("*").single();
  if (error) return NextResponse.json({ error: "PROSPECT_CREATE_FAILED" }, { status: 500 });
  return NextResponse.json({ ok: true, prospect: data });
}
