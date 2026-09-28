import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, source) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source, "utf8");
}

function fail(label) {
  throw new Error(`EVERBOND_CHAT_PACK_FINANCE_FAILED:${label}`);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) fail(label);
  return source.replace(before, after);
}

// ===========================================================================
// TEXT CHAT ONLY: after the free trial, 1 EverCoin is charged every two chat messages.
// Voice pricing/model/accounting is intentionally untouched.
// ===========================================================================
{
  const relativePath = "src/app/api/chat/route.ts";
  let source = read(relativePath);

  const financeImport =
    'import { reconcileVisibleChatFinance } from "@/lib/chat-finance";';
  if (!source.includes(financeImport)) {
    const marker = 'import { getEverShopGift } from "@/lib/evershop/catalog";';
    const index = source.indexOf(marker);
    if (index < 0) fail("chat-route-finance-import-anchor");
    source =
      source.slice(0, index) + financeImport + "\n" + source.slice(index);
  }

  source = replaceRequired(
    source,
    '  "You need EverCoin to continue chatting. Each message costs 1 EverCoin.";',
    '  "You need EverCoin to continue chatting. 1 EverCoin covers 2 messages.";',
    "chat-route-price-copy"
  );

  const generationStart = source.indexOf(
    "    const generated = await generateCharacterTurnWithRetry({"
  );
  if (generationStart < 0) fail("chat-route-generation-start");
  const generationEnd = source.indexOf("    });", generationStart);
  if (generationEnd < 0) fail("chat-route-generation-end");

  let generationBlock = source.slice(generationStart, generationEnd + 7);
  if (!generationBlock.includes("financeRequestId: requestId")) {
    if (!generationBlock.includes("      giftEvent\n")) {
      fail("chat-route-generation-gift-anchor");
    }
    generationBlock = generationBlock.replace(
      "      giftEvent\n",
      "      giftEvent,\n      financeRequestId: requestId\n"
    );
    source =
      source.slice(0, generationStart) +
      generationBlock +
      source.slice(generationEnd + 7);
  }

  const creditBlock = `    await completeChatMessageCredit({
      userId: user.id,
      requestId
    }).catch((error) => {
      console.error("Message credit completion failed:", error);
    });`;

  const reconciliationBlock = `${creditBlock}

    await reconcileVisibleChatFinance({
      requestId,
      inputTokens: generated.inputTokens,
      outputTokens: generated.outputTokens,
      model: generated.model
    }).catch((error) => {
      console.error("Chat finance visible-cost reconciliation failed:", error);
    });`;

  source = replaceRequired(
    source,
    creditBlock,
    reconciliationBlock,
    "chat-route-visible-finance"
  );

  if (
    !source.includes(financeImport) ||
    !source.includes("financeRequestId: requestId") ||
    !source.includes("reconcileVisibleChatFinance({") ||
    !source.includes("1 EverCoin covers 2 messages")
  ) {
    fail("chat-route-validation");
  }

  write(relativePath, source);
}

// ===========================================================================
// EVER MEMORY: keep the exact existing memory model/prompt/behavior, but report
// its real token usage to finance after the background memory call completes.
// This modifies only the text-chat memory block, never the voice-call block.
// ===========================================================================
{
  const relativePath = "src/lib/voice-chat.ts";
  let source = read(relativePath);

  const financeImport =
    'import { reconcileMemoryChatFinance } from "@/lib/chat-finance";';
  if (!source.includes(financeImport)) {
    const marker = 'import { getSupabaseServiceClient } from "@/lib/supabase/server";';
    const index = source.indexOf(marker);
    if (index < 0) fail("voice-chat-finance-import-anchor");
    source =
      source.slice(0, index) + financeImport + "\n" + source.slice(index);
  }

  const textStart = source.indexOf(
    "export async function generateTextCharacterTurn(values: {"
  );
  const voiceStart = source.indexOf(
    "export async function generateVoiceCharacterDraft(values: {"
  );
  if (textStart < 0 || voiceStart < 0) fail("voice-chat-function-starts");

  const headEnd = source.indexOf("}) {", textStart);
  if (headEnd < 0) fail("voice-chat-text-head-end");

  let head = source.slice(textStart, headEnd + 4);
  if (!head.includes("financeRequestId?: string;")) {
    if (!head.includes("  giftEvent?: GiftTurnEvent;\n")) {
      fail("voice-chat-text-finance-id-anchor");
    }
    head = head.replace(
      "  giftEvent?: GiftTurnEvent;\n",
      "  giftEvent?: GiftTurnEvent;\n  financeRequestId?: string;\n"
    );
    source = source.slice(0, textStart) + head + source.slice(headEnd + 4);
  }

  const refreshedTextStart = source.indexOf(
    "export async function generateTextCharacterTurn(values: {"
  );
  let textBlock = source.slice(refreshedTextStart);

  const memoryNeedle =
    "const memoryResult = await callEverBondMemoryModel(\n";
  const memoryIndex = textBlock.indexOf(memoryNeedle);
  if (memoryIndex < 0) fail("voice-chat-text-memory-call");

  const memoryCallEnd = textBlock.indexOf("    );", memoryIndex);
  if (memoryCallEnd < 0) fail("voice-chat-text-memory-call-end");
  const insertionPoint = memoryCallEnd + "    );".length;

  if (!textBlock.includes("reconcileMemoryChatFinance({")) {
    const insertion = `

    if (values.financeRequestId) {
      await reconcileMemoryChatFinance({
        requestId: values.financeRequestId,
        inputTokens: memoryResult.inputTokens,
        outputTokens: memoryResult.outputTokens,
        model: memoryResult.model
      }).catch((error) => {
        console.error("Chat finance memory-cost reconciliation failed:", error);
      });
    }`;

    textBlock =
      textBlock.slice(0, insertionPoint) +
      insertion +
      textBlock.slice(insertionPoint);

    source = source.slice(0, refreshedTextStart) + textBlock;
  }

  // Voice isolation must already have run before this final patch.
  const voiceBlockStart = source.indexOf(
    "export async function generateVoiceCharacterDraft(values: {"
  );
  const voiceBlockEnd = source.indexOf(
    "export async function updateVoiceMemoryAfterCommit(values: {",
    voiceBlockStart
  );
  const voiceBlock = source.slice(voiceBlockStart, voiceBlockEnd);

  if (
    !source.includes(financeImport) ||
    !source.includes("financeRequestId?: string;") ||
    !source.includes("reconcileMemoryChatFinance({") ||
    !voiceBlock.includes("buildVoiceChatModePrompt(") ||
    !voiceBlock.includes("callEverBondVoiceModel(modelMessages)") ||
    voiceBlock.includes("reconcileMemoryChatFinance")
  ) {
    fail("voice-chat-validation");
  }

  write(relativePath, source);
}

// ===========================================================================
// BUY EVERCOIN: show the real chat price in every supported language.
// ===========================================================================
{
  const relativePath = "src/lib/evercoin-page-language.ts";
  let source = read(relativePath);

  if (!source.includes("  messageRate: string;")) {
    source = replaceRequired(
      source,
      "  messageUnit: string;\n",
      "  messageUnit: string;\n  messageRate: string;\n",
      "evercoin-copy-type"
    );
  }

  const rates = [
    ['    messageUnit: "message",\n', '    messageUnit: "message",\n    messageRate: "1 EverCoin / 2 messages",\n'],
    ['    messageUnit: "mensaje",\n', '    messageUnit: "mensaje",\n    messageRate: "1 EverCoin / 2 mensajes",\n'],
    ['    messageUnit: "Nachricht",\n', '    messageUnit: "Nachricht",\n    messageRate: "1 EverCoin / 2 Nachrichten",\n'],
    ['    messageUnit: "メッセージ",\n', '    messageUnit: "メッセージ",\n    messageRate: "1 EverCoin / 2メッセージ",\n'],
    ['    messageUnit: "메시지",\n', '    messageUnit: "메시지",\n    messageRate: "1 EverCoin / 메시지 2개",\n']
  ];

  for (const [before, after] of rates) {
    if (!source.includes(after)) {
      if (!source.includes(before)) fail(`evercoin-copy-rate:${before}`);
      source = source.replace(before, after);
    }
  }

  const frenchRate = '    messageRate: "1 EverCoin / 2 messages",\n';
  const frenchRateCount = source.split(frenchRate).length - 1;
  if (frenchRateCount < 2) {
    const frenchAnchor =
      '    messagesTitle: "Messages non censurés",';
    const frenchStart = source.indexOf(frenchAnchor);
    if (frenchStart < 0) fail("evercoin-copy-french-anchor");
    const frenchUnit = source.indexOf('    messageUnit: "message",\n', frenchStart);
    if (frenchUnit < 0) fail("evercoin-copy-french-unit");
    const insertAt = frenchUnit + '    messageUnit: "message",\n'.length;
    source =
      source.slice(0, insertAt) +
      frenchRate +
      source.slice(insertAt);
  }

  const expectedRates = [
    "1 EverCoin / 2 messages",
    "1 EverCoin / 2 mensajes",
    "1 EverCoin / 2 Nachrichten",
    "1 EverCoin / 2メッセージ",
    "1 EverCoin / 메시지 2개"
  ];
  for (const rate of expectedRates) {
    if (!source.includes(rate)) fail(`evercoin-copy-validation:${rate}`);
  }

  write(relativePath, source);
}

{
  const relativePath = "src/app/coins/page.tsx";
  let source = read(relativePath);

  source = replaceRequired(
    source,
    "        rate: `1 EverCoin / ${pageCopy.messageUnit}`",
    "        rate: pageCopy.messageRate",
    "coins-message-rate"
  );

  if (!source.includes("rate: pageCopy.messageRate")) {
    fail("coins-message-rate-validation");
  }

  write(relativePath, source);
}

// ===========================================================================
// MONEY PAGE: profit math comes from provider-cost events. Clarify that text
// chat uses a two-message paid-stage meter while every generated message still
// reconciles Gemma reply + unchanged Ever Memory actual token cost.
// Voice wording/accounting is deliberately not changed here.
// ===========================================================================
{
  const relativePath = "src/app/money/page.tsx";
  let source = read(relativePath);

  source = replaceRequired(
    source,
    "            Accounting checks passed. Paid spend, free-trial provider cost, and voice reserves are fail-closed.",
    "            Accounting checks passed. Every-second-message chat charges, included chat messages, free-trial provider cost, and voice reserves are fail-closed.",
    "money-health-copy"
  );

  source = replaceRequired(
    source,
    "            <p>• Paid feature spend and free-trial AI costs are checked fail-closed.</p>",
    "            <p>• Every completed text chat is provider-cost tracked; Gemma reply tokens and unchanged Ever Memory tokens reconcile to actual Venice cost while a conservative fallback remains if reconciliation is missing.</p>\n            <p>• Paid feature spend, included two-message-pack chats, and free-trial AI costs are checked fail-closed.</p>",
    "money-chat-cost-copy"
  );

  if (
    !source.includes("Gemma reply tokens") ||
    !source.includes("included two-message-pack chats")
  ) {
    fail("money-copy-validation");
  }

  write(relativePath, source);
}

console.log(
  "EVERBOND_CHAT_PACK_FINANCE text=1EC-per-2-paid-messages chat-cost=actual-gemma-plus-existing-ever-memory voice=unchanged"
);
