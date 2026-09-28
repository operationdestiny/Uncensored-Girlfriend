import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinanceAdmin } from "@/lib/partner-engine";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({ action: z.literal("reconcile_all") }).strict();

export async function GET(request: Request) {
  const auth = await requireFinanceAdmin(request);
  if (auth.response) return auth.response;
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc("partner_traffic_engine_summary");
  if (error) {
    console.error("Partner traffic summary failed", error);
    return NextResponse.json({ error: "PARTNER_SUMMARY_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ summary: data });
}

export async function POST(request: Request) {
  const auth = await requireFinanceAdmin(request);
  if (auth.response) return auth.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.rpc("partner_reconcile_all");
  if (error) return NextResponse.json({ error: "PARTNER_RECONCILE_FAILED" }, { status: 500 });
  const { data } = await supabase.rpc("partner_traffic_engine_summary");
  return NextResponse.json({ ok: true, summary: data });
}
