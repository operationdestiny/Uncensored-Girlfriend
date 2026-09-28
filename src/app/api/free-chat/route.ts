import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { getAnyAuthenticatedUser } from "@/lib/api-auth";
import { getCharacterBySlugForUser } from "@/lib/user-characters";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { MemoryState } from "@/types/memory";
import type { SupportedLanguage } from "@/lib/ai/prompts";
import {
  generateTextCharacterTurn,
  type GiftTurnEvent
} from "@/lib/voice-chat";
import { getEverShopGift } from "@/lib/evershop/catalog";
import {
  beginGiftSend,
  completeGiftSend,
  failGiftSend
} from "@/lib/evershop/server";
import { reconcileVisibleChatFinance } from "@/lib/chat-finance";
import { reserveChatMessage, completeChatMessageCredit, refundChatMessageCredit } from "@/lib/message-credits";
import { turnstileConfigured, verifyTurnstileToken } from "@/lib/turnstile";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const USER_MESSAGE_MAX_TOKENS = 80;
const HUMAN_GRANT_MINUTES = Math.max(
  Math.trunc(Number(process.env.CHAT_HUMAN_GRANT_MINUTES || 120)),
  10
);
const CHALLENGE_PER_MINUTE = Math.max(
  Math.trunc(Number(process.env.CHAT_TURNSTILE_THRESHOLD_PER_MINUTE || 12)),
  3
);
const CHALLENGE_PER_IP_MINUTE = Math.max(
  Math.trunc(Number(process.env.CHAT_TURNSTILE_THRESHOLD_PER_IP_MINUTE || 30)),
  10
);

const SupportedLanguageSchema = z
  .enum(["English", "Spanish", "French", "German", "Japanese", "Korean"])
  .default("English");

const ChatRequest = z
  .object({
    requestId: z.string().uuid(),
    characterSlug: z.string().trim().min(1).max(120),
    language: SupportedLanguageSchema.optional().default("English"),
    messages: z
      .array(
        z
          .object({
            role: z.literal("user"),
            content: z.string().max(320)
          })
          .strict()
      )
      .length(1),
    conversationId: z.string().uuid().optional(),
    giftId: z.number().int().min(1).max(200).optional(),
    turnstileToken: z.string().min(1).max(4096).optional()
  })
  .strict()
  .refine(
    (value) => Boolean(value.giftId || value.messages[0]?.content.trim()),
    { message: "A message or gift is required" }
  );

type ChatRequestClaimRow = {
  request_status:
    | "claimed"
    | "completed"
    | "in_progress"
    | "busy"
    | "rate_limited"
    | "failed";
  existing_reply: string | null;
  existing_conversation_id: string | null;
  existing_input_tokens: number | null;
  existing_output_tokens: number | null;
  existing_provider: string | null;
  existing_model: string | null;
  retry_after_seconds: number | null;
};

type StoredMessageRow = {
  role: string;
  content: string;
  metadata?: unknown;
};

type GiftMetadata = {
  gift?: { id?: unknown; title?: unknown; image?: unknown };
  userText?: unknown;
};

function estimateTokenCount(text: string) {
  const normalized = text.trim();
  if (!normalized) return 0;
  const wordCount = normalized.match(/\S+/g)?.length ?? 0;
  const charCount = normalized.length;
  const cjkCount =
    normalized.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g)?.length ?? 0;
  return Math.max(wordCount, Math.ceil(charCount / 4), cjkCount);
}

function errorDetails(error: unknown) {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== "object") return String(error ?? "");
  const record = error as Record<string, unknown>;
  return [record.code, record.message, record.details, record.hint]
    .filter((value) => typeof value === "string" && value)
    .join(" ");
}

function isMissingMessageMetadataColumn(error: unknown) {
  const details = errorDetails(error).toLowerCase();
  return (
    details.includes("metadata") &&
    (details.includes("column") ||
      details.includes("schema cache") ||
      details.includes("pgrst204") ||
      details.includes("42703"))
  );
}

function isRetryableCharacterTurnError(error: unknown) {
  const details = errorDetails(error);
  return (
    /provider request failed:\s*(408|409|425|429|500|502|503|504)\b/i.test(details) ||
    /fetch failed|econnreset|etimedout|enotfound|socket hang up|und_err|timeout|timed out|aborted|empty_text_reply/i.test(
      details
    )
  );
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function generateCharacterTurnWithRetry(
  values: Parameters<typeof generateTextCharacterTurn>[0]
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await generateTextCharacterTurn(values);
    } catch (error) {
      lastError = error;
      if (attempt === 3 || !isRetryableCharacterTurnError(error)) throw error;
      await wait(attempt === 1 ? 700 : 1600);
    }
  }
  throw lastError;
}

function parseGiftMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = value as GiftMetadata;
  const gift = metadata.gift;
  if (!gift || typeof gift !== "object" || Array.isArray(gift)) return null;
  const id = Number(gift.id);
  const title = typeof gift.title === "string" ? gift.title : "";
  const image = typeof gift.image === "string" ? gift.image : "";
  if (!Number.isInteger(id) || !title || !image) return null;
  return {
    id,
    title,
    image,
    userText:
      typeof metadata.userText === "string" ? metadata.userText.trim() : ""
  };
}

function remoteIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null
  );
}

function networkHash(request: Request) {
  const ip = remoteIp(request);
  if (!ip) return null;
  const secret =
    process.env.GUEST_CLAIM_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "everbond-network-risk";
  return createHmac("sha256", secret).update(ip).digest("hex");
}

async function hasHumanGrant(userId: string, ipHash: string | null) {
  const supabase = getSupabaseServiceClient();
  const userGrant = await supabase
    .from("chat_human_verifications")
    .select("verified_until")
    .eq("user_id", userId)
    .maybeSingle();

  if (
    userGrant.data?.verified_until &&
    Date.parse(userGrant.data.verified_until) > Date.now()
  ) {
    return true;
  }

  if (!ipHash) return false;
  const { data: networkGrant } = await supabase
    .from("chat_human_verifications")
    .select("verified_until")
    .eq("ip_hash", ipHash)
    .gt("verified_until", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  return Boolean(networkGrant?.verified_until);
}

async function suspiciousActivity(userId: string, ipHash: string | null) {
  const supabase = getSupabaseServiceClient();
  const now = new Date().toISOString();
  await supabase.from("chat_abuse_events").insert({
    user_id: userId,
    ip_hash: ipHash,
    created_at: now
  });

  const since = new Date(Date.now() - 60_000).toISOString();
  const [userCount, ipCount] = await Promise.all([
    supabase
      .from("chat_abuse_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since),
    ipHash
      ? supabase
          .from("chat_abuse_events")
          .select("id", { count: "exact", head: true })
          .eq("ip_hash", ipHash)
          .gte("created_at", since)
      : Promise.resolve({ count: 0, error: null })
  ]);

  if (userCount.error || ipCount.error) return false;
  return (
    Number(userCount.count ?? 0) >= CHALLENGE_PER_MINUTE ||
    Number(ipCount.count ?? 0) >= CHALLENGE_PER_IP_MINUTE
  );
}

async function enforceHumanCheck(values: {
  request: Request;
  userId: string;
  turnstileToken?: string;
}) {
  const ipHash = networkHash(values.request);
  if (!(await suspiciousActivity(values.userId, ipHash))) return null;
  if (await hasHumanGrant(values.userId, ipHash)) return null;

  if (!turnstileConfigured()) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfter: 60 },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  if (!values.turnstileToken) {
    return NextResponse.json({ error: "CHALLENGE_REQUIRED" }, { status: 403 });
  }

  const valid = await verifyTurnstileToken({
    token: values.turnstileToken,
    remoteIp: remoteIp(values.request)
  });

  if (!valid) {
    return NextResponse.json({ error: "CHALLENGE_FAILED" }, { status: 403 });
  }

  const verifiedUntil = new Date(
    Date.now() + HUMAN_GRANT_MINUTES * 60_000
  ).toISOString();

  await getSupabaseServiceClient()
    .from("chat_human_verifications")
    .upsert(
      {
        user_id: values.userId,
        ip_hash: ipHash,
        verified_until: verifiedUntil,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );

  return null;
}

async function claimChatRequest(values: {
  userId: string;
  requestId: string;
  characterId: string;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "begin_chat_request",
    {
      p_user_id: values.userId,
      p_request_id: values.requestId,
      p_character_id: values.characterId
    }
  );
  if (error) throw error;
  const claim = (data?.[0] ?? null) as ChatRequestClaimRow | null;
  if (!claim) throw new Error("CHAT_REQUEST_CLAIM_FAILED");
  return claim;
}

async function completeChatRequest(values: {
  userId: string;
  requestId: string;
  conversationId: string;
  reply: string;
  inputTokens: number;
  outputTokens: number;
  provider: string;
  model: string;
  language: SupportedLanguage;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "complete_chat_request",
    {
      p_user_id: values.userId,
      p_request_id: values.requestId,
      p_conversation_id: values.conversationId,
      p_reply: values.reply,
      p_input_tokens: values.inputTokens,
      p_output_tokens: values.outputTokens,
      p_provider: values.provider,
      p_model: values.model,
      p_language: values.language
    }
  );
  if (error) throw error;
  if (data !== true) throw new Error("CHAT_REQUEST_COMPLETION_FAILED");
}

async function failChatRequest(values: {
  userId: string;
  requestId: string;
  errorCode: string;
}) {
  await getSupabaseServiceClient().rpc("fail_chat_request", {
    p_user_id: values.userId,
    p_request_id: values.requestId,
    p_error_code: values.errorCode
  });
}

async function completeChatUsage(userId: string, requestId: string) {
  await completeChatMessageCredit({ userId, requestId });
}

async function failChatUsage(userId: string, requestId: string) {
  await refundChatMessageCredit({ userId, requestId });
}

async function getConversation(values: {
  userId: string;
  characterId: string;
  conversationId?: string;
}): Promise<{ id: string; memory_state: Partial<MemoryState> | null }> {
  const supabase = getSupabaseServiceClient();

  if (values.conversationId) {
    const { data, error } = await supabase
      .from("conversations")
      .select("id,memory_state")
      .eq("id", values.conversationId)
      .eq("user_id", values.userId)
      .eq("character_id", values.characterId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as { id: string; memory_state: Partial<MemoryState> | null };
  }

  const { data: existing, error: existingError } = await supabase
    .from("conversations")
    .select("id,memory_state")
    .eq("user_id", values.userId)
    .eq("character_id", values.characterId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing as { id: string; memory_state: Partial<MemoryState> | null };

  const { data: created, error: createError } = await supabase
    .from("conversations")
    .insert({ user_id: values.userId, character_id: values.characterId })
    .select("id,memory_state")
    .single();
  if (createError) throw createError;
  return created as { id: string; memory_state: Partial<MemoryState> | null };
}

async function markGiftReply(values: {
  conversationId: string;
  requestId: string;
  giftId: number;
}) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id,metadata")
    .eq("conversation_id", values.conversationId)
    .in("role", ["character", "assistant"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.id) return;
  const existingMetadata =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? data.metadata
      : {};
  await supabase
    .from("messages")
    .update({
      metadata: {
        ...existingMetadata,
        giftEvent: {
          requestId: values.requestId,
          giftId: values.giftId,
          excludeFromEverMemory: true
        }
      }
    })
    .eq("id", data.id);
}

export async function GET(request: Request) {
  try {
    const user = await getAnyAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "CHAT_SESSION_REQUIRED" }, { status: 401 });
    }

    const characterSlug = new URL(request.url).searchParams.get("characterSlug");
    if (!characterSlug) {
      return NextResponse.json({ error: "Missing characterSlug" }, { status: 400 });
    }

    const character = await getCharacterBySlugForUser(characterSlug, user.id);
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id")
      .eq("user_id", user.id)
      .eq("character_id", character.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation) {
      return NextResponse.json({ conversationId: null, messages: [] });
    }

    const messageResult = await supabase
      .from("messages")
      .select("role,content,metadata,created_at")
      .eq("conversation_id", conversation.id)
      .in("role", ["user", "character"])
      .order("created_at", { ascending: false })
      .limit(80);

    let rows = messageResult.data as StoredMessageRow[] | null;
    let messagesError = messageResult.error;
    if (messagesError && isMissingMessageMetadataColumn(messagesError)) {
      const fallback = await supabase
        .from("messages")
        .select("role,content,created_at")
        .eq("conversation_id", conversation.id)
        .in("role", ["user", "character"])
        .order("created_at", { ascending: false })
        .limit(80);
      rows = (fallback.data ?? []) as StoredMessageRow[];
      messagesError = fallback.error;
    }
    if (messagesError) throw messagesError;

    const messages = (rows ?? [])
      .reverse()
      .map((message) => {
        const isUser = message.role === "user";
        const gift = isUser ? parseGiftMetadata(message.metadata) : null;
        return {
          role: isUser ? ("user" as const) : ("character" as const),
          content: gift ? gift.userText : message.content,
          gift: gift
            ? { id: gift.id, title: gift.title, image: gift.image }
            : undefined
        };
      })
      .filter((message) => message.content || message.gift);

    return NextResponse.json({ conversationId: conversation.id, messages });
  } catch (error) {
    console.error("Free chat history failed:", error);
    return NextResponse.json({ error: "CHAT_HISTORY_FAILED" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAnyAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "CHAT_SESSION_REQUIRED" }, { status: 401 });
    }
    const characterSlug = new URL(request.url).searchParams.get("characterSlug");
    if (!characterSlug) {
      return NextResponse.json({ error: "Missing characterSlug" }, { status: 400 });
    }
    const character = await getCharacterBySlugForUser(characterSlug, user.id);
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: pending } = await supabase
      .from("chat_requests")
      .select("request_id")
      .eq("user_id", user.id)
      .eq("character_id", character.id)
      .eq("status", "pending");

    for (const row of pending ?? []) {
      if (!row.request_id) continue;
      await failChatRequest({
        userId: user.id,
        requestId: String(row.request_id),
        errorCode: "CHAT_RESET"
      }).catch(() => undefined);
      await failChatUsage(user.id, String(row.request_id)).catch(() => undefined);
    }

    const { data: conversations, error } = await supabase
      .from("conversations")
      .select("id,updated_at")
      .eq("user_id", user.id)
      .eq("character_id", character.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const ids = (conversations ?? []).map((item) => String(item.id)).filter(Boolean);
    if (ids.length) {
      const { error: deleteError } = await supabase
        .from("messages")
        .delete()
        .in("conversation_id", ids);
      if (deleteError) throw deleteError;
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .in("id", ids);
    }

    return NextResponse.json({ reset: true, conversationId: ids[0] ?? null });
  } catch (error) {
    console.error("Free chat reset failed:", error);
    return NextResponse.json({ error: "CHAT_RESET_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > 8192) {
    return NextResponse.json({ error: "REQUEST_TOO_LARGE" }, { status: 413 });
  }

  const body = ChatRequest.safeParse(
    await Promise.resolve()
      .then(() => JSON.parse(rawBody))
      .catch(() => null)
  );
  if (!body.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const user = await getAnyAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "CHAT_SESSION_REQUIRED" }, { status: 401 });
  }

  const publicCharacter = await getCharacterBySlugForUser(body.data.characterSlug, null);
  const visibleCharacter =
    publicCharacter || (await getCharacterBySlugForUser(body.data.characterSlug, user.id));
  if (!visibleCharacter) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }

  const userText = body.data.messages[0].content.replace(/\s+/g, " ").trim();
  const gift = body.data.giftId ? getEverShopGift(body.data.giftId) : null;
  if (body.data.giftId && !gift) {
    return NextResponse.json({ error: "GIFT_NOT_FOUND" }, { status: 404 });
  }
  if ((!userText && !gift) || (userText && estimateTokenCount(userText) > USER_MESSAGE_MAX_TOKENS)) {
    return NextResponse.json({ error: "INVALID_MESSAGE" }, { status: 400 });
  }

  const isAnonymous = Boolean(
    (user as typeof user & { is_anonymous?: boolean }).is_anonymous
  );
  if (gift && isAnonymous) {
    return NextResponse.json({ error: "ACCOUNT_REQUIRED" }, { status: 401 });
  }

  const humanResponse = await enforceHumanCheck({
    request,
    userId: user.id,
    turnstileToken: body.data.turnstileToken
  });
  if (humanResponse) return humanResponse;

  const requestId = body.data.requestId;
  let requestCompleted = false;
  let giftReserved = false;
  let insertedGiftMessageId: string | null = null;
  let usageReserved = false;

  try {
    const claim = await claimChatRequest({
      userId: user.id,
      requestId,
      characterId: visibleCharacter.id
    });

    if (claim.request_status === "completed" && claim.existing_reply) {
      return NextResponse.json({
        reply: claim.existing_reply,
        conversationId: claim.existing_conversation_id,
        usage: {
          inputTokens: claim.existing_input_tokens ?? 0,
          outputTokens: claim.existing_output_tokens ?? 0,
          provider: claim.existing_provider ?? "",
          model: claim.existing_model ?? "",
          language: body.data.language
        }
      });
    }

    if (claim.request_status === "rate_limited") {
      const retryAfter = claim.retry_after_seconds ?? 60;
      return NextResponse.json(
        { error: "RATE_LIMITED", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
    if (claim.request_status === "in_progress" || claim.request_status === "busy") {
      return NextResponse.json({ error: "CHAT_BUSY" }, { status: 409 });
    }
    if (claim.request_status !== "claimed") {
      return NextResponse.json({ error: "REQUEST_FAILED" }, { status: 409 });
    }

    if (!gift) {
      const credit = await reserveChatMessage({ userId: user.id, requestId });
      if (!credit.allowed) {
        const error = credit.errorCode ?? "INSUFFICIENT_EVERCOIN";
        await failChatRequest({ userId: user.id, requestId, errorCode: error });
        return NextResponse.json({ error }, {
          status: error === "INSUFFICIENT_EVERCOIN" || error === "EVERCOIN_DEBT" ? 402 : 409,
          headers: { "Cache-Control": "private, no-store" }
        });
      }
    } else {
      // Gifts retain their separate inventory price and do not consume chat credits.
      usageReserved = false;
    }
    if (!gift) usageReserved = true;

    if (gift) {
      const giftClaim = await beginGiftSend({
        userId: user.id,
        requestId,
        characterId: visibleCharacter.id,
        giftId: gift.id,
        userText
      });
      if (giftClaim.status !== "claimed") {
        await failChatRequest({
          userId: user.id,
          requestId,
          errorCode: giftClaim.errorCode || "GIFT_SEND_FAILED"
        }).catch(() => undefined);
        await failChatUsage(user.id, requestId).catch(() => undefined);
        usageReserved = false;
        return NextResponse.json(
          {
            error: giftClaim.errorCode || "GIFT_NOT_OWNED",
            inventoryQuantity: giftClaim.inventoryQuantity
          },
          { status: giftClaim.status === "in_progress" ? 409 : 400 }
        );
      }
      giftReserved = true;
    }

    const conversation = await getConversation({
      userId: user.id,
      characterId: visibleCharacter.id,
      conversationId: body.data.conversationId
    });
    const storedContent = userText || (gift ? "I give you a gift." : "");
    const supabase = getSupabaseServiceClient();

    const insert = gift
      ? await supabase
          .from("messages")
          .insert({
            conversation_id: conversation.id,
            role: "user",
            content: storedContent,
            metadata: {
              gift: { id: gift.id, title: gift.title, image: gift.image },
              giftEvent: {
                requestId,
                giftId: gift.id,
                excludeFromEverMemory: true
              },
              userText
            }
          })
          .select("id")
          .single()
      : await supabase
          .from("messages")
          .insert({
            conversation_id: conversation.id,
            role: "user",
            content: storedContent
          })
          .select("id")
          .single();

    if (insert.error) throw insert.error;
    if (gift) insertedGiftMessageId = insert.data?.id ?? null;

    const giftEvent: GiftTurnEvent | undefined = gift
      ? {
          eventType: "gift",
          gift: {
            id: gift.id,
            title: gift.title,
            description: gift.description,
            suggestedReaction: gift.reactionPreview
          },
          userMessage: userText || undefined
        }
      : undefined;

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"));
        };

        void (async () => {
          try {
            const generated = await generateCharacterTurnWithRetry({
              userId: user.id,
              character: visibleCharacter,
              language: body.data.language as SupportedLanguage,
              conversationId: conversation.id,
              giftEvent,
              onText: (text: string) => {
                if (text) send({ type: "text", text });
              },
              onReplace: (text: string) => {
                if (text) send({ type: "replace", text });
              },
              financeRequestId: requestId
            } as Parameters<typeof generateTextCharacterTurn>[0]);

            await completeChatRequest({
              userId: user.id,
              requestId,
              conversationId: generated.conversationId,
              reply: generated.reply,
              inputTokens: generated.inputTokens,
              outputTokens: generated.outputTokens,
              provider: generated.provider,
              model: generated.model,
              language: body.data.language as SupportedLanguage
            });
            requestCompleted = true;


            if (!gift) {
              await completeChatUsage(user.id, requestId).catch((error) => {
                console.error("Text chat usage completion failed:", error);
              });
            }
            usageReserved = false;

            await reconcileVisibleChatFinance({
              requestId,
              inputTokens: generated.inputTokens,
              outputTokens: generated.outputTokens,
              model: generated.model
            }).catch((error) => {
              console.error("Text chat visible chat finance reconciliation failed:", error);
            });

            if (gift) {
              giftReserved = false;
              await Promise.all([
                completeGiftSend({
                  userId: user.id,
                  requestId,
                  conversationId: generated.conversationId,
                  reply: generated.reply
                }).catch(() => false),
                markGiftReply({
                  conversationId: generated.conversationId,
                  requestId,
                  giftId: gift.id
                }).catch(() => undefined)
              ]);
            }

            send({
              type: "done",
              reply: generated.reply,
              conversationId: generated.conversationId,
              gift: gift
                ? { id: gift.id, title: gift.title, image: gift.image }
                : undefined,
              usage: {
                inputTokens: generated.inputTokens,
                outputTokens: generated.outputTokens,
                provider: generated.provider,
                model: generated.model,
                language: body.data.language
              }
            });
          } catch (error) {
            if (giftReserved && !requestCompleted) {
              await failGiftSend({
                userId: user.id,
                requestId,
                errorCode: "GIFT_CHAT_FAILED"
              }).catch(() => undefined);
            }
            if (insertedGiftMessageId) {
              try {
                await getSupabaseServiceClient()
                  .from("messages")
                  .delete()
                  .eq("id", insertedGiftMessageId);
              } catch {
                // Gift inventory rollback below remains authoritative.
              }
            }
            if (!requestCompleted) {
              await failChatRequest({
                userId: user.id,
                requestId,
                errorCode: "CHAT_FAILED"
              }).catch(() => undefined);
              if (usageReserved) {
                await failChatUsage(user.id, requestId).catch(() => undefined);
              }
            }
            console.error("Free streaming chat failed:", error);
            try {
              send({ type: "error", error: "CHAT_FAILED" });
            } catch {
              // Browser may already be gone.
            }
          } finally {
            try {
              controller.close();
            } catch {
              // Already closed.
            }
          }
        })();
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "private, no-store, no-transform",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (error) {
    if (!requestCompleted) {
      await failChatRequest({
        userId: user.id,
        requestId,
        errorCode: "CHAT_FAILED"
      }).catch(() => undefined);
      if (usageReserved) {
        await failChatUsage(user.id, requestId).catch(() => undefined);
      }
    }
    console.error("Free chat failed:", error);
    return NextResponse.json({ error: "CHAT_FAILED" }, { status: 500 });
  }
}
