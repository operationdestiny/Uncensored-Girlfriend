import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getCharacterBySlugForUser } from "@/lib/user-characters";
import { createRetellCallContextToken } from "@/lib/retell-context";
import type { SupportedLanguage } from "@/lib/ai/prompts";
import {
  endVoiceCall,
  everCoinCallCostPerMinute,
  refundEverCoin,
  startVoiceCall
} from "@/lib/evercoin";
import { selectRetellVoiceForCall } from "@/lib/retell-voice-router";
import { persistRetellCallId } from "@/lib/retell-finance";

export const runtime = "nodejs";

const MAX_CALL_MINUTES = 30;

const RequestSchema = z.object({
  characterSlug: z.string().trim().min(1).max(120),
  language: z
    .enum(["English", "Spanish", "French", "German", "Japanese", "Korean"])
    .default("English")
});

export async function POST(request: Request) {
  let billingCallId: string | null = null;
  let firstMinuteCost = 0;
  let billingCleanedUp = false;
  let userIdForCleanup = "";

  async function cleanupFailedStart() {
    if (!billingCallId || billingCleanedUp) return;
    billingCleanedUp = true;

    await endVoiceCall({
      userId: userIdForCleanup,
      callId: billingCallId,
      reason: "retell_start_failed"
    }).catch(() => false);

    if (firstMinuteCost > 0) {
      await refundEverCoin({
        userId: userIdForCleanup,
        amount: firstMinuteCost,
        reason: "voice_call_start_refund",
        referenceId: `${billingCallId}:1`
      }).catch(() => 0);
    }
  }

  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "SIGNUP_REQUIRED" }, { status: 401 });
    }

    userIdForCleanup = user.id;

    const body = RequestSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const character = await getCharacterBySlugForUser(
      body.data.characterSlug,
      user.id
    );

    if (!character) {
      return NextResponse.json({ error: "CHARACTER_NOT_FOUND" }, { status: 404 });
    }

    const apiKey = process.env.RETELL_API_KEY?.trim();
    const agentId = process.env.RETELL_AGENT_ID?.trim();

    if (!apiKey || !agentId) {
      return NextResponse.json({ error: "RETELL_NOT_CONFIGURED" }, { status: 503 });
    }

    const voice = await selectRetellVoiceForCall({
      apiKey,
      character,
      language: body.data.language as SupportedLanguage
    });

    firstMinuteCost = everCoinCallCostPerMinute();

    const billing = await startVoiceCall({
      userId: user.id,
      characterId: character.id,
      amount: firstMinuteCost,
      maxMinutes: MAX_CALL_MINUTES
    });

    if (!billing.started || !billing.callId) {
      const errorCode =
        billing.errorCode ||
        (billing.debt > 0 ? "EVERCOIN_DEBT" : "INSUFFICIENT_EVERCOIN");

      return NextResponse.json(
        {
          error: errorCode,
          everCoinBalance: billing.balance,
          debt: billing.debt,
          callCostPerMinute: firstMinuteCost
        },
        {
          status:
            errorCode === "INSUFFICIENT_EVERCOIN" || errorCode === "EVERCOIN_DEBT"
              ? 402
              : 409,
          headers: { "Cache-Control": "private, no-store" }
        }
      );
    }

    billingCallId = billing.callId;

    const contextToken = createRetellCallContextToken({
      userId: user.id,
      characterSlug: character.slug,
      language: body.data.language as SupportedLanguage,
      billingCallId,
      callCostPerMinute: firstMinuteCost
    });

    const retellResponse = await fetch("https://api.retellai.com/v2/create-web-call", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        agent_id: agentId,
        agent_version: "latest_published",
        agent_override: {
          agent: {
            voice_id: voice.voiceId,
            voice_model: "eleven_v3",
            language: voice.locale,
            voice_temperature: voice.voiceTemperature,
            voice_speed: voice.voiceSpeed,
            enable_dynamic_voice_speed: true,
            enable_dynamic_responsiveness: true,
            responsiveness: voice.responsiveness,
            interruption_sensitivity: voice.interruptionSensitivity,
            stt_mode: "fast",
            denoising_mode: "noise-cancellation"
          }
        },
        metadata: {
          everbond_context: contextToken,
          everbond_character_slug: character.slug,
          everbond_billing_call_id: billingCallId,
          everbond_voice_id: voice.voiceId,
          everbond_voice_name: voice.voiceName,
          everbond_voice_locale: voice.locale,
          everbond_voice_personality: voice.personalityProfile
        },
        retell_llm_dynamic_variables: {
          character_name: character.name,
          character_slug: character.slug,
          language: body.data.language,
          voice_locale: voice.locale,
          voice_profile: voice.personalityProfile
        }
      }),
      signal: AbortSignal.timeout(15_000)
    });

    const payload = await retellResponse.json().catch(() => null);

    if (!retellResponse.ok) {
      console.error("RETELL_CREATE_WEB_CALL_FAILED", retellResponse.status, payload);
      await cleanupFailedStart();
      return NextResponse.json(
        { error: "RETELL_CREATE_WEB_CALL_FAILED" },
        { status: 502 }
      );
    }

    const accessToken = payload?.access_token;
    const callId = payload?.call_id;

    if (typeof accessToken !== "string" || typeof callId !== "string") {
      await cleanupFailedStart();
      return NextResponse.json({ error: "RETELL_INVALID_RESPONSE" }, { status: 502 });
    }

    // Store the Retell ID before the browser receives its access token. This
    // makes every new production call recoverable and cost-reconcilable even
    // when the user closes the tab before /call-end can run.
    try {
      await persistRetellCallId({
        userId: user.id,
        billingCallId,
        retellCallId: callId
      });
    } catch (error) {
      console.error("RETELL_FINANCE_CALL_MAPPING_FAILED", error);
      await cleanupFailedStart();
      return NextResponse.json(
        { error: "RETELL_FINANCE_CALL_MAPPING_FAILED" },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        accessToken,
        callId,
        billingCallId,
        everCoinBalance: billing.balance,
        callCostPerMinute: firstMinuteCost,
        maxMinutes: MAX_CALL_MINUTES
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    await cleanupFailedStart().catch(() => undefined);
    console.error("RETELL_CALL_START_FAILED", error);
    return NextResponse.json({ error: "RETELL_CALL_START_FAILED" }, { status: 500 });
  }
}
