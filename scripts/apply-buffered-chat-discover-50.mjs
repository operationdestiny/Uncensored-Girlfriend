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
  throw new Error(`EVERBOND_BUFFERED_CHAT_DISCOVER_FAILED:${label}`);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) fail(label);
  return source.replace(before, after);
}

// ===========================================================================
// CHAT: restore the exact buffered interaction model used before streaming.
// The user sees "{character name} is typing..." while the full reply is being
// generated. Only after the final reply is ready is the character bubble added.
// Existing reliability, language-lock, charging, Ever Memory background work,
// gifts, retries, and abort/reset handling remain in place.
// ===========================================================================

{
  const relativePath = "src/lib/ai/provider.ts";
  let source = read(relativePath);

  const helperStart = source.indexOf("// EVERBOND_REALTIME_TEXT_STREAM");
  if (helperStart >= 0) {
    const modelStart = source.indexOf(
      "export async function callEverBondModel(",
      helperStart
    );
    if (modelStart < 0) fail("provider-stream-helper-end");

    source =
      source.slice(0, helperStart) +
      source.slice(modelStart);
  }

  source = source.replace(
    `export async function callEverBondModel(
  messages: EverBondMessage[],
  onText?: (text: string) => void
): Promise<EverBondModelResult> {`,
    `export async function callEverBondModel(
  messages: EverBondMessage[]
): Promise<EverBondModelResult> {`
  );

  const streamedFirstStart = source.indexOf(
    "  const firstData: any = onText"
  );
  if (streamedFirstStart >= 0) {
    const streamedFirstEnd = source.indexOf(
      "\n\n  const firstChoice",
      streamedFirstStart
    );
    if (streamedFirstEnd < 0) fail("provider-stream-first-call-end");

    const bufferedFirstCall = `  const firstData: any = await postChatCompletion(
    endpoint,
    config.apiKey,
    buildRequestBody(messages)
  );`;

    source =
      source.slice(0, streamedFirstStart) +
      bufferedFirstCall +
      source.slice(streamedFirstEnd);
  }

  if (
    source.includes("EVERBOND_REALTIME_TEXT_STREAM") ||
    source.includes("postChatCompletionStream(") ||
    source.includes("onText?: (text: string) => void") ||
    source.includes("const firstData: any = onText")
  ) {
    fail("provider-buffered-validation");
  }

  write(relativePath, source);
}

{
  const relativePath = "src/lib/voice-chat.ts";
  let source = read(relativePath);

  source = source.replace(
    `  giftEvent?: GiftTurnEvent;
  onText?: (text: string) => void;
  onReplace?: (text: string) => void;
}) {`,
    `  giftEvent?: GiftTurnEvent;
}) {`
  );

  source = source.replace(
    "  let result = await callEverBondModel(baseModelMessages, values.onText);",
    "  let result = await callEverBondModel(baseModelMessages);"
  );

  source = source.replace(
    `

  values.onReplace?.(result.content);`,
    ""
  );

  if (
    source.includes("values.onText") ||
    source.includes("values.onReplace") ||
    source.includes("onText?: (text: string) => void") ||
    source.includes("onReplace?: (text: string) => void")
  ) {
    fail("voice-chat-buffered-validation");
  }

  write(relativePath, source);
}

{
  const relativePath = "src/app/api/chat/route.ts";
  let source = read(relativePath);

  const streamStart = source.indexOf(
    "    const encoder = new TextEncoder();"
  );

  if (streamStart >= 0) {
    const outerCatch = source.indexOf(
      "\n  } catch (error) {",
      streamStart
    );
    if (outerCatch < 0) fail("chat-route-stream-end");

    const bufferedGeneration = `    const generated = await generateCharacterTurnWithRetry({
      userId: user.id,
      character: visibleCharacter,
      language: body.data.language as SupportedLanguage,
      conversationId: conversation.id,
      giftEvent
    });

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

    if (gift) {
      // The AI turn is complete and the inventory unit has been consumed.
      // Finalization errors must not refund a successfully delivered gift.
      giftReserved = false;

      await Promise.all([
        completeGiftSend({
          userId: user.id,
          requestId,
          conversationId: generated.conversationId,
          reply: generated.reply
        }).catch((error) => {
          console.error("Gift send completion failed:", error);
          return false;
        }),
        markGiftReply({
          conversationId: generated.conversationId,
          reply: generated.reply,
          requestId,
          giftId: gift.id
        }).catch((error) => {
          console.error("Gift reply metadata update failed:", error);
        })
      ]);
    }

    await completeChatMessageCredit({
      userId: user.id,
      requestId
    }).catch((error) => {
      console.error("Message credit completion failed:", error);
    });

    return NextResponse.json({
      reply: generated.reply,
      conversationId: generated.conversationId,
      gift: gift
        ? {
            id: gift.id,
            title: gift.title,
            image: gift.image
          }
        : undefined,
      credits: {
        source: credit.source,
        trialRemaining: credit.trialRemaining,
        everCoinRemaining: credit.everCoinRemaining
      },
      usage: {
        inputTokens: generated.inputTokens,
        outputTokens: generated.outputTokens,
        provider: generated.provider,
        model: generated.model,
        language: body.data.language
      }
    });`;

    source =
      source.slice(0, streamStart) +
      bufferedGeneration +
      source.slice(outerCatch);
  }

  if (
    source.includes("application/x-ndjson") ||
    source.includes('type: "text"') ||
    source.includes('type: "replace"') ||
    source.includes("Streaming chat failed:")
  ) {
    fail("chat-route-buffered-validation");
  }

  write(relativePath, source);
}

{
  const relativePath = "src/components/chat/ChatShell.tsx";
  let source = read(relativePath);

  const sendStart = source.indexOf("  async function sendMessage(");
  const sendEnd = source.indexOf(
    "  const displayTags = character.tags",
    sendStart
  );
  if (sendStart < 0 || sendEnd < 0 || sendEnd <= sendStart) {
    fail("chat-shell-send-bounds");
  }

  let sendBlock = source.slice(sendStart, sendEnd);
  const tryStart = sendBlock.indexOf("    try {");
  const catchStart = sendBlock.lastIndexOf("    } catch (error) {");

  if (tryStart < 0 || catchStart < 0 || catchStart <= tryStart) {
    fail("chat-shell-try-bounds");
  }

  const bufferedTry = `    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: \`Bearer \${activeSession.access_token}\`
        },
        body: JSON.stringify({
          requestId,
          characterSlug: character.slug,
          language: getApiLanguage(language),
          conversationId: conversationId ?? undefined,
          giftId: gift?.id,
          messages: [
            {
              role: "user",
              content: trimmed
            }
          ]
        }),
        signal: controller.signal
      });

      const data = await response.json().catch(() => ({}));

      if (sendGeneration !== chatGenerationRef.current) {
        return;
      }

      if (!response.ok) {
        setMessages(previousMessages);

        if (data?.error === "SIGNUP_REQUIRED") {
          openSignupGate(trimmed);
          return;
        }

        if (
          data?.error === "TRIAL_ENDED" ||
          data?.error === "INSUFFICIENT_EVERCOIN" ||
          data?.error === "EVERCOIN_DEBT"
        ) {
          setInput(trimmed);
          window.location.assign("/coins?reason=chat");
          return;
        }

        if (data?.error === "GIFT_NOT_OWNED") {
          setInput(trimmed);
          setGiftError(shopCopy.noGiftsToSend);
          setGiftPickerOpen(true);
          return;
        }

        throw new Error(data?.message || data?.error || "Chat failed");
      }

      if (
        typeof data.reply !== "string" ||
        !data.reply.trim()
      ) {
        throw new Error("EMPTY_CHAT_REPLY");
      }

      setChatError("");
      setConversationId(data.conversationId ?? conversationId);
      setGiftPickerOpen(false);

      setMessages((current) => [
        ...current,
        { role: "character", content: data.reply }
      ]);
`;

  sendBlock =
    sendBlock.slice(0, tryStart) +
    bufferedTry +
    sendBlock.slice(catchStart);

  source =
    source.slice(0, sendStart) +
    sendBlock +
    source.slice(sendEnd);

  source = source.replaceAll(
    "max-w-[720px] whitespace-pre-line rounded-[1.3rem] px-4 py-3 leading-7 transition-all duration-150 ease-out",
    "max-w-[720px] whitespace-pre-line rounded-[1.3rem] px-4 py-3 leading-7"
  );

  if (
    source.includes("application/x-ndjson") ||
    source.includes("applyCharacterText") ||
    source.includes("streamedCharacterStarted") ||
    source.includes("transition-all duration-150 ease-out")
  ) {
    fail("chat-shell-buffered-validation");
  }

  if (
    !source.includes("TYPING_COPY") ||
    !source.includes("setIsTyping(true)") ||
    !source.includes("data.reply") ||
    !source.includes('throw new Error("EMPTY_CHAT_REPLY")')
  ) {
    fail("chat-shell-old-behavior-validation");
  }

  write(relativePath, source);
}

// ===========================================================================
// DISCOVER: 50 cards per request/load-more instead of 100.
// ===========================================================================

{
  const relativePath = "src/app/characters/page.tsx";
  let source = read(relativePath);

  source = replaceRequired(
    source,
    'getCharactersFromSupabase(100, 0, "everbond-girls")',
    'getCharactersFromSupabase(50, 0, "everbond-girls")',
    "discover-initial-50"
  );

  write(relativePath, source);
}

{
  const relativePath = "src/components/character/useCharacterBrowser.ts";
  let source = read(relativePath);

  source = replaceRequired(
    source,
    "const PAGE_SIZE = 100;",
    "const PAGE_SIZE = 50;",
    "discover-page-size-50"
  );

  write(relativePath, source);
}

// Keep the existing internal property name to avoid unnecessary component/type
// churn; only the user-facing copy changes from "Translating" to "Finding".
{
  const relativePath = "src/lib/discover-language.ts";
  let source = read(relativePath);

  const replacements = [
    ['translatingCharacters: "Translating companions…"', 'translatingCharacters: "Finding companions…"'],
    ['translatingCharacters: "Traduciendo compañeros…"', 'translatingCharacters: "Buscando compañeros…"'],
    ['translatingCharacters: "Traduction des compagnons…"', 'translatingCharacters: "Recherche de compagnons…"'],
    ['translatingCharacters: "Begleiter werden übersetzt…"', 'translatingCharacters: "Begleiter werden gesucht…"'],
    ['translatingCharacters: "コンパニオンを翻訳中…"', 'translatingCharacters: "コンパニオンを探しています…"'],
    ['translatingCharacters: "컴패니언 번역 중…"', 'translatingCharacters: "컴패니언 찾는 중…"']
  ];

  for (const [before, after] of replacements) {
    source = replaceRequired(
      source,
      before,
      after,
      `discover-finding-copy:${before}`
    );
  }

  write(relativePath, source);
}

const provider = read("src/lib/ai/provider.ts");
const voiceChat = read("src/lib/voice-chat.ts");
const chatRoute = read("src/app/api/chat/route.ts");
const chatShell = read("src/components/chat/ChatShell.tsx");
const discoverPage = read("src/app/characters/page.tsx");
const browser = read("src/components/character/useCharacterBrowser.ts");
const discoverCopy = read("src/lib/discover-language.ts");

if (
  provider.includes("EVERBOND_REALTIME_TEXT_STREAM") ||
  provider.includes("postChatCompletionStream(") ||
  voiceChat.includes("values.onText") ||
  voiceChat.includes("values.onReplace") ||
  chatRoute.includes("application/x-ndjson") ||
  chatShell.includes("application/x-ndjson") ||
  chatShell.includes("applyCharacterText") ||
  !chatShell.includes("TYPING_COPY") ||
  !chatShell.includes("setIsTyping(true)") ||
  !discoverPage.includes('getCharactersFromSupabase(50, 0, "everbond-girls")') ||
  !browser.includes("const PAGE_SIZE = 50;") ||
  !discoverCopy.includes('translatingCharacters: "Finding companions…"')
) {
  fail("final-validation");
}

console.log(
  "EVERBOND_BUFFERED_CHAT_DISCOVER chat=full-reply-with-name-typing discover=50-per-load loading=finding-companions background-images=preserved"
);
