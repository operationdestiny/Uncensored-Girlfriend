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
  throw new Error(`EVERBOND_STREAM_BACKGROUND_PATCH_FAILED:${label}`);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) fail(label);
  return source.replace(before, after);
}

function insertBefore(source, marker, insertion, alreadyPresent, label) {
  if (source.includes(alreadyPresent)) return source;
  const index = source.indexOf(marker);
  if (index < 0) fail(label);
  return source.slice(0, index) + insertion + source.slice(index);
}

// ===========================================================================
// REAL TEXT STREAMING: Venice -> server -> browser while the reply is generated.
// Final text is still reconciled through the existing cleaner, anti-repeat logic,
// language retry, persistence, charging, and Ever Memory flow.
// ===========================================================================

{
  const relativePath = "src/lib/ai/provider.ts";
  let source = read(relativePath);

  const helperMarker = "EVERBOND_REALTIME_TEXT_STREAM";
  if (!source.includes(helperMarker)) {
    const insertion = `// ${helperMarker}\nfunction streamingVisibleText(content: string) {\n  let text = content\n    .replace(/^[A-Za-zÀ-ÖØ-öø-ÿ' -]{1,40}:\\s*/, \"\")\n    .replace(/\\n{3,}/g, \"\\n\\n\")\n    .replace(/[ \\t]+/g, \" \")\n    .trimStart();\n\n  const tokens = splitTokens(text);\n  if (tokens.length > AI_REPLY_MAX_TOKENS) {\n    text = textFromFirstTokens(text, AI_REPLY_MAX_TOKENS);\n  }\n\n  return text;\n}\n\nasync function postChatCompletionStream(\n  endpoint: string,\n  apiKey: string,\n  body: Record<string, unknown>,\n  onText: (text: string) => void\n) {\n  const response = await fetch(endpoint, {\n    method: \"POST\",\n    headers: {\n      Authorization: \`Bearer \${apiKey}\`,\n      \"Content-Type\": \"application/json\"\n    },\n    body: JSON.stringify({ ...body, stream: true }),\n    signal: AbortSignal.timeout(60_000)\n  });\n\n  if (!response.ok) {\n    const text = await response.text();\n    throw new Error(\n      \`EverBond AI provider request failed: \${response.status} \${text.slice(0, 500)}\`\n    );\n  }\n\n  if (!response.body) {\n    throw new Error(\"EVERBOND_STREAM_BODY_MISSING\");\n  }\n\n  const reader = response.body.getReader();\n  const decoder = new TextDecoder();\n  let buffer = \"\";\n  let rawContent = \"\";\n  let lastVisible = \"\";\n  let finishReason: string | undefined;\n  let usage: Record<string, unknown> = {};\n\n  function consumeLine(line: string) {\n    const trimmed = line.trim();\n    if (!trimmed.startsWith(\"data:\")) return;\n\n    const payload = trimmed.slice(5).trim();\n    if (!payload || payload === \"[DONE]\") return;\n\n    let parsed: any;\n    try {\n      parsed = JSON.parse(payload);\n    } catch {\n      return;\n    }\n\n    if (parsed?.usage && typeof parsed.usage === \"object\") {\n      usage = parsed.usage;\n    }\n\n    const choice = parsed?.choices?.[0];\n    const delta = choice?.delta?.content;\n    if (typeof delta === \"string\" && delta) {\n      rawContent += delta;\n      const visible = streamingVisibleText(rawContent);\n      if (visible && visible !== lastVisible) {\n        lastVisible = visible;\n        onText(visible);\n      }\n    }\n\n    if (typeof choice?.finish_reason === \"string\") {\n      finishReason = choice.finish_reason;\n    }\n  }\n\n  while (true) {\n    const { done, value } = await reader.read();\n    if (done) break;\n\n    buffer += decoder.decode(value, { stream: true });\n    const lines = buffer.split(/\\r?\\n/);\n    buffer = lines.pop() ?? \"\";\n    for (const line of lines) consumeLine(line);\n  }\n\n  buffer += decoder.decode();\n  if (buffer) consumeLine(buffer);\n\n  return {\n    choices: [\n      {\n        message: { content: rawContent },\n        finish_reason: finishReason\n      }\n    ],\n    usage\n  };\n}\n\n`;

    source = insertBefore(
      source,
      "export async function callEverBondModel(",
      insertion,
      helperMarker,
      "provider-stream-helper-anchor"
    );
  }

  source = source.replace(
    /export async function callEverBondModel\(\n  messages: EverBondMessage\[\]\n\): Promise<EverBondModelResult> \{/,
    `export async function callEverBondModel(\n  messages: EverBondMessage[],\n  onText?: (text: string) => void\n): Promise<EverBondModelResult> {`
  );

  const firstCallPattern = /  const firstData: any = await postChatCompletion\(\n    endpoint,\n    config\.apiKey,\n    buildRequestBody\(messages\)\n  \);/;
  if (firstCallPattern.test(source)) {
    source = source.replace(
      firstCallPattern,
      `  const firstData: any = onText\n    ? await postChatCompletionStream(\n        endpoint,\n        config.apiKey,\n        buildRequestBody(messages),\n        onText\n      )\n    : await postChatCompletion(\n        endpoint,\n        config.apiKey,\n        buildRequestBody(messages)\n      );`
    );
  }

  if (
    !source.includes(helperMarker) ||
    !source.includes("onText?: (text: string) => void") ||
    !source.includes("postChatCompletionStream(") ||
    !source.includes("stream: true")
  ) {
    fail("provider-stream-validation");
  }

  write(relativePath, source);
}

{
  const relativePath = "src/lib/voice-chat.ts";
  let source = read(relativePath);
  const functionStart = source.indexOf(
    "export async function generateTextCharacterTurn(values: {"
  );
  if (functionStart < 0) fail("text-turn-function");

  const functionHeadEnd = source.indexOf("}) {", functionStart);
  if (functionHeadEnd < 0) fail("text-turn-head-end");

  let head = source.slice(functionStart, functionHeadEnd + 4);
  if (!head.includes("onText?: (text: string) => void;")) {
    head = replaceRequired(
      head,
      "  giftEvent?: GiftTurnEvent;\n",
      "  giftEvent?: GiftTurnEvent;\n  onText?: (text: string) => void;\n  onReplace?: (text: string) => void;\n",
      "text-turn-callback-type"
    );
    source =
      source.slice(0, functionStart) +
      head +
      source.slice(functionHeadEnd + 4);
  }

  source = replaceRequired(
    source,
    "  let result = await callEverBondModel(baseModelMessages);",
    "  let result = await callEverBondModel(baseModelMessages, values.onText);",
    "stream-first-model-call"
  );

  const emptyGuard = `  if (!result.content.trim()) {\n    throw new Error(\"EMPTY_TEXT_REPLY\");\n  }`;
  if (!source.includes("values.onReplace?.(result.content);")) {
    source = replaceRequired(
      source,
      emptyGuard,
      `${emptyGuard}\n\n  values.onReplace?.(result.content);`,
      "final-stream-reconcile"
    );
  }

  if (
    !source.includes("callEverBondModel(baseModelMessages, values.onText)") ||
    !source.includes("values.onReplace?.(result.content)")
  ) {
    fail("voice-chat-stream-validation");
  }

  write(relativePath, source);
}

{
  const relativePath = "src/app/api/chat/route.ts";
  let source = read(relativePath);

  const generatedStart = source.indexOf(
    "    const generated = await generateCharacterTurnWithRetry({"
  );
  if (generatedStart < 0) fail("chat-route-generation-start");

  const outerCatch = source.indexOf("\n  } catch (error) {", generatedStart);
  if (outerCatch < 0) fail("chat-route-outer-catch");

  const streamingBlock = `    const encoder = new TextEncoder();\n    const stream = new ReadableStream<Uint8Array>({\n      start(controller) {\n        const send = (payload: Record<string, unknown>) => {\n          controller.enqueue(\n            encoder.encode(JSON.stringify(payload) + \"\\n\")\n          );\n        };\n\n        void (async () => {\n          try {\n            const generated = await generateCharacterTurnWithRetry({\n              userId: user.id,\n              character: visibleCharacter,\n              language: body.data.language as SupportedLanguage,\n              conversationId: conversation.id,\n              giftEvent,\n              onText: (text) => {\n                if (text) send({ type: \"text\", text });\n              },\n              onReplace: (text) => {\n                if (text) send({ type: \"replace\", text });\n              }\n            });\n\n            await completeChatRequest({\n              userId: user.id,\n              requestId,\n              conversationId: generated.conversationId,\n              reply: generated.reply,\n              inputTokens: generated.inputTokens,\n              outputTokens: generated.outputTokens,\n              provider: generated.provider,\n              model: generated.model,\n              language: body.data.language as SupportedLanguage\n            });\n            requestCompleted = true;\n\n            if (gift) {\n              giftReserved = false;\n\n              await Promise.all([\n                completeGiftSend({\n                  userId: user.id,\n                  requestId,\n                  conversationId: generated.conversationId,\n                  reply: generated.reply\n                }).catch((error) => {\n                  console.error(\"Gift send completion failed:\", error);\n                  return false;\n                }),\n                markGiftReply({\n                  conversationId: generated.conversationId,\n                  reply: generated.reply,\n                  requestId,\n                  giftId: gift.id\n                }).catch((error) => {\n                  console.error(\"Gift reply metadata update failed:\", error);\n                })\n              ]);\n            }\n\n            await completeChatMessageCredit({\n              userId: user.id,\n              requestId\n            }).catch((error) => {\n              console.error(\"Message credit completion failed:\", error);\n            });\n\n            send({\n              type: \"done\",\n              reply: generated.reply,\n              conversationId: generated.conversationId,\n              gift: gift\n                ? {\n                    id: gift.id,\n                    title: gift.title,\n                    image: gift.image\n                  }\n                : undefined,\n              credits: {\n                source: credit.source,\n                trialRemaining: credit.trialRemaining,\n                everCoinRemaining: credit.everCoinRemaining\n              },\n              usage: {\n                inputTokens: generated.inputTokens,\n                outputTokens: generated.outputTokens,\n                provider: generated.provider,\n                model: generated.model,\n                language: body.data.language\n              }\n            });\n          } catch (error) {\n            if (giftReserved && !requestCompleted) {\n              await failGiftSend({\n                userId: user.id,\n                requestId,\n                errorCode: \"GIFT_CHAT_FAILED\"\n              }).catch(() => undefined);\n            }\n\n            if (insertedGiftMessageId) {\n              try {\n                await getSupabaseServiceClient()\n                  .from(\"messages\")\n                  .delete()\n                  .eq(\"id\", insertedGiftMessageId);\n              } catch {\n                // The failed gift request is still refunded by failGiftSend.\n              }\n            }\n\n            if (!requestCompleted) {\n              await failChatRequest({\n                userId: user.id,\n                requestId,\n                errorCode: \"CHAT_FAILED\"\n              }).catch(() => undefined);\n\n              if (creditReserved) {\n                await refundChatMessageCredit({\n                  userId: user.id,\n                  requestId\n                }).catch(() => undefined);\n              }\n            }\n\n            console.error(\"Streaming chat failed:\", error);\n            try {\n              send({ type: \"error\", error: \"CHAT_FAILED\" });\n            } catch {\n              // The browser may already have left the page.\n            }\n          } finally {\n            try {\n              controller.close();\n            } catch {\n              // Stream already closed/cancelled.\n            }\n          }\n        })();\n      }\n    });\n\n    return new Response(stream, {\n      status: 200,\n      headers: {\n        \"Content-Type\": \"application/x-ndjson; charset=utf-8\",\n        \"Cache-Control\": \"private, no-store, no-transform\",\n        \"X-Accel-Buffering\": \"no\"\n      }\n    });`;

  source =
    source.slice(0, generatedStart) +
    streamingBlock +
    source.slice(outerCatch);

  if (
    !source.includes('"application/x-ndjson; charset=utf-8"') ||
    !source.includes('type: "text"') ||
    !source.includes('type: "replace"') ||
    !source.includes('type: "done"')
  ) {
    fail("chat-route-stream-validation");
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
  if (sendStart < 0 || sendEnd < 0) fail("chat-shell-send-bounds");

  let sendBlock = source.slice(sendStart, sendEnd);
  const tryStart = sendBlock.indexOf(
    '    try {\n      const response = await fetch("/api/chat", {'
  );
  const catchStart = sendBlock.lastIndexOf("    } catch (error) {");
  if (tryStart < 0 || catchStart < 0 || catchStart <= tryStart) {
    fail("chat-shell-stream-try-bounds");
  }

  const streamedTry = `    try {\n      const response = await fetch(\"/api/chat\", {\n        method: \"POST\",\n        headers: {\n          \"Content-Type\": \"application/json\",\n          Authorization: \`Bearer \${activeSession.access_token}\`\n        },\n        body: JSON.stringify({\n          requestId,\n          characterSlug: character.slug,\n          language: getApiLanguage(language),\n          conversationId: conversationId ?? undefined,\n          giftId: gift?.id,\n          messages: [\n            {\n              role: \"user\",\n              content: trimmed\n            }\n          ]\n        }),\n        signal: controller.signal\n      });\n\n      const contentType = response.headers.get(\"content-type\") ?? \"\";\n      const isRealtimeStream =\n        response.ok && contentType.includes(\"application/x-ndjson\");\n\n      if (!isRealtimeStream) {\n        const data = await response.json().catch(() => ({}));\n\n        if (sendGeneration !== chatGenerationRef.current) {\n          return;\n        }\n\n        if (!response.ok) {\n          setMessages(previousMessages);\n\n          if (data?.error === \"SIGNUP_REQUIRED\") {\n            openSignupGate(trimmed);\n            return;\n          }\n\n          if (\n            data?.error === \"TRIAL_ENDED\" ||\n            data?.error === \"INSUFFICIENT_EVERCOIN\" ||\n            data?.error === \"EVERCOIN_DEBT\"\n          ) {\n            setInput(trimmed);\n            window.location.assign(\"/coins?reason=chat\");\n            return;\n          }\n\n          if (data?.error === \"GIFT_NOT_OWNED\") {\n            setInput(trimmed);\n            setGiftError(shopCopy.noGiftsToSend);\n            setGiftPickerOpen(true);\n            return;\n          }\n\n          throw new Error(data?.message || data?.error || \"Chat failed\");\n        }\n\n        if (\n          typeof data.reply !== \"string\" ||\n          !data.reply.trim()\n        ) {\n          throw new Error(\"EMPTY_CHAT_REPLY\");\n        }\n\n        setChatError(\"\");\n        setConversationId(data.conversationId ?? conversationId);\n        setGiftPickerOpen(false);\n        setMessages((current) => [\n          ...current,\n          { role: \"character\", content: data.reply }\n        ]);\n        return;\n      }\n\n      if (!response.body) {\n        throw new Error(\"CHAT_STREAM_BODY_MISSING\");\n      }\n\n      const reader = response.body.getReader();\n      const decoder = new TextDecoder();\n      let buffer = \"\";\n      let streamedCharacterStarted = false;\n      let finalReply = \"\";\n      let finalConversationId: string | null = conversationId;\n\n      const applyCharacterText = (text: string) => {\n        if (!text || sendGeneration !== chatGenerationRef.current) return;\n\n        setIsTyping(false);\n\n        if (!streamedCharacterStarted) {\n          streamedCharacterStarted = true;\n          setMessages((current) => [\n            ...current,\n            { role: \"character\", content: text }\n          ]);\n          return;\n        }\n\n        setMessages((current) => {\n          const next = [...current];\n          const lastIndex = next.length - 1;\n          if (lastIndex >= 0 && next[lastIndex]?.role === \"character\") {\n            next[lastIndex] = {\n              ...next[lastIndex],\n              content: text\n            };\n          } else {\n            next.push({ role: \"character\", content: text });\n          }\n          return next;\n        });\n      };\n\n      const consumeLine = (line: string) => {\n        const trimmedLine = line.trim();\n        if (!trimmedLine) return;\n\n        let event: Record<string, unknown>;\n        try {\n          event = JSON.parse(trimmedLine) as Record<string, unknown>;\n        } catch {\n          return;\n        }\n\n        const type = typeof event.type === \"string\" ? event.type : \"\";\n        if (type === \"text\" || type === \"replace\") {\n          if (typeof event.text === \"string\") {\n            applyCharacterText(event.text);\n          }\n          return;\n        }\n\n        if (type === \"done\") {\n          if (typeof event.reply === \"string\") {\n            finalReply = event.reply;\n            applyCharacterText(finalReply);\n          }\n          if (typeof event.conversationId === \"string\") {\n            finalConversationId = event.conversationId;\n          }\n          return;\n        }\n\n        if (type === \"error\") {\n          throw new Error(\n            typeof event.error === \"string\"\n              ? event.error\n              : \"CHAT_FAILED\"\n          );\n        }\n      };\n\n      while (true) {\n        const { done, value } = await reader.read();\n        if (done) break;\n\n        buffer += decoder.decode(value, { stream: true });\n        const lines = buffer.split(/\\r?\\n/);\n        buffer = lines.pop() ?? \"\";\n        for (const line of lines) consumeLine(line);\n      }\n\n      buffer += decoder.decode();\n      if (buffer.trim()) consumeLine(buffer);\n\n      if (sendGeneration !== chatGenerationRef.current) {\n        return;\n      }\n\n      if (!finalReply.trim()) {\n        throw new Error(\"EMPTY_CHAT_REPLY\");\n      }\n\n      setChatError(\"\");\n      setConversationId(finalConversationId ?? conversationId);\n      setGiftPickerOpen(false);\n`;

  sendBlock =
    sendBlock.slice(0, tryStart) +
    streamedTry +
    sendBlock.slice(catchStart);

  source = source.slice(0, sendStart) + sendBlock + source.slice(sendEnd);

  source = source.replace(
    "max-w-[720px] whitespace-pre-line rounded-[1.3rem] px-4 py-3 leading-7",
    "max-w-[720px] whitespace-pre-line rounded-[1.3rem] px-4 py-3 leading-7 transition-all duration-150 ease-out"
  );

  if (
    !source.includes("application/x-ndjson") ||
    !source.includes("applyCharacterText") ||
    !source.includes("streamedCharacterStarted") ||
    !source.includes("transition-all duration-150 ease-out")
  ) {
    fail("chat-shell-stream-validation");
  }

  write(relativePath, source);
}

// ===========================================================================
// BACKGROUND IMAGE JOBS: mirror the persistent WaveSpeed queue pattern already
// used by videos. Once WaveSpeed accepts an image job, navigating away no longer
// owns the job lifecycle. Reopening the gallery resumes/finalizes it.
// ===========================================================================

{
  const relativePath = "src/app/api/character-gallery/[slug]/route.ts";
  let source = read(relativePath);

  source = replaceRequired(
    source,
    `  downloadWaveSpeedOutput,\n  submitWaveSpeedPrediction,\n  waitForWaveSpeedPrediction,\n  wavespeedApiKey`,
    `  downloadWaveSpeedOutput,\n  getWaveSpeedPrediction,\n  submitWaveSpeedPrediction,\n  wavespeedApiKey`,
    "image-route-imports"
  );

  const helperMarker = "EVERBOND_BACKGROUND_IMAGE_QUEUE";
  if (!source.includes(helperMarker)) {
    const typeAnchor = `type GalleryRow = {\n  id: string;\n  storage_path: string;\n  prompt: string;\n  created_at: string;\n};\n`;
    const extraType = `${typeAnchor}\ntype ImageRequestRow = {\n  request_id: string;\n  user_id: string;\n  character_id: string;\n  prompt: string;\n  status: \"processing\" | \"completed\" | \"failed\";\n  image_id: string | null;\n  evercoin_charge: number | string;\n  provider_model: string | null;\n  provider_queue_id: string | null;\n  provider_download_url: string | null;\n  error_code: string | null;\n};\n\ntype ProviderImageResult =\n  | { state: \"processing\" }\n  | { state: \"failed\"; errorCode: string }\n  | { state: \"completed\"; bytes: Buffer; contentType: string };\n`;
    source = replaceRequired(source, typeAnchor, extraType, "image-request-types");

    const getAnchor = "export async function GET(\n";
    const helpers = `// ${helperMarker}\nasync function imageRequestRow(values: {\n  userId: string;\n  characterId: string;\n  requestId: string;\n}) {\n  const { data, error } = await getSupabaseServiceClient()\n    .from(\"character_image_requests\")\n    .select(\n      \"request_id,user_id,character_id,prompt,status,image_id,evercoin_charge,provider_model,provider_queue_id,provider_download_url,error_code\"\n    )\n    .eq(\"request_id\", values.requestId)\n    .eq(\"user_id\", values.userId)\n    .eq(\"character_id\", values.characterId)\n    .maybeSingle();\n\n  if (error) throw error;\n  return (data as ImageRequestRow | null) ?? null;\n}\n\nasync function retrieveProviderImage(values: {\n  apiKey: string;\n  queueId: string;\n}): Promise<ProviderImageResult> {\n  try {\n    const prediction = await getWaveSpeedPrediction({\n      apiKey: values.apiKey,\n      predictionId: values.queueId,\n      timeoutMs: 25_000\n    });\n\n    if (prediction.status === \"completed\") {\n      const outputUrl = prediction.outputs[0];\n      if (!outputUrl) {\n        return {\n          state: \"failed\",\n          errorCode: \"IMAGE_PROVIDER_OUTPUT_MISSING\"\n        };\n      }\n\n      try {\n        const downloaded = await downloadWaveSpeedOutput({\n          url: outputUrl,\n          maximumBytes: MAX_GENERATED_IMAGE_BYTES,\n          allowedContentTypes: ALLOWED_SOURCE_MIME_TYPES,\n          fallbackContentType: \"image/jpeg\",\n          timeoutMs: 45_000\n        });\n        return {\n          state: \"completed\",\n          bytes: downloaded.bytes,\n          contentType: downloaded.contentType\n        };\n      } catch (error) {\n        return {\n          state: \"failed\",\n          errorCode:\n            error instanceof Error ? error.message : \"IMAGE_DOWNLOAD_FAILED\"\n        };\n      }\n    }\n\n    if (\n      prediction.status === \"failed\" ||\n      prediction.status === \"cancelled\" ||\n      prediction.status === \"timeout\"\n    ) {\n      return {\n        state: \"failed\",\n        errorCode:\n          prediction.error ||\n          \`IMAGE_PROVIDER_\${prediction.status.toUpperCase()}\`\n      };\n    }\n\n    return { state: \"processing\" };\n  } catch (error) {\n    const message = error instanceof Error ? error.message : \"\";\n    if (/WAVESPEED_RESULT_FAILED:(400|401|402|403|404|410|422):/.test(message)) {\n      return { state: \"failed\", errorCode: message.slice(0, 200) };\n    }\n\n    return { state: \"processing\" };\n  }\n}\n\nasync function finalizeQueuedImage(\n  requestRow: ImageRequestRow,\n  bytes: Buffer,\n  contentType: string\n) {\n  const imageId = requestRow.request_id;\n  const extension =\n    contentType === \"image/png\"\n      ? \"png\"\n      : contentType === \"image/webp\"\n        ? \"webp\"\n        : \"jpg\";\n  const storagePath =\n    \`\${requestRow.user_id}/\${requestRow.character_id}/\${imageId}.\${extension}\`;\n  const supabase = getSupabaseServiceClient();\n\n  const upload = await supabase.storage\n    .from(\"character-gallery\")\n    .upload(storagePath, bytes, {\n      contentType,\n      upsert: true,\n      cacheControl: \"31536000\"\n    });\n  if (upload.error) throw upload.error;\n\n  const { error: upsertError } = await supabase\n    .from(\"character_gallery_images\")\n    .upsert(\n      {\n        id: imageId,\n        user_id: requestRow.user_id,\n        character_id: requestRow.character_id,\n        storage_path: storagePath,\n        prompt: requestRow.prompt,\n        provider: \"wavespeed\",\n        model: requestRow.provider_model || DEFAULT_IMAGE_MODEL,\n        evercoin_charge: Number(requestRow.evercoin_charge)\n      },\n      { onConflict: \"id\" }\n    );\n  if (upsertError) throw upsertError;\n\n  const completed = await completeCharacterImageRequest({\n    userId: requestRow.user_id,\n    requestId: requestRow.request_id,\n    imageId\n  });\n\n  if (!completed) {\n    await supabase\n      .from(\"character_gallery_images\")\n      .delete()\n      .eq(\"id\", imageId)\n      .eq(\"user_id\", requestRow.user_id);\n    await supabase.storage\n      .from(\"character-gallery\")\n      .remove([storagePath])\n      .catch(() => undefined);\n    throw new Error(\"IMAGE_REQUEST_COMPLETION_FAILED\");\n  }\n\n  const image = await galleryImageResponse(imageId, requestRow.user_id);\n  if (!image) throw new Error(\"IMAGE_NOT_FOUND_AFTER_COMPLETION\");\n  return image;\n}\n\n`;
    source = insertBefore(
      source,
      getAnchor,
      helpers,
      helperMarker,
      "image-helper-anchor"
    );
  }

  const characterGuard = `    if (!character) {\n      return NextResponse.json(\n        { error: \"CHARACTER_NOT_FOUND\" },\n        { status: 404 }\n      );\n    }\n\n`;
  const firstGet = source.indexOf("export async function GET(");
  const getCharacterGuard = source.indexOf(characterGuard, firstGet);
  if (getCharacterGuard < 0) fail("image-get-character-guard");
  const getInsertAt = getCharacterGuard + characterGuard.length;

  const requestLookupMarker = "const requestedId = new URL(request.url).searchParams.get(\"requestId\")";
  if (!source.slice(firstGet, source.indexOf("export async function POST(", firstGet)).includes(requestLookupMarker)) {
    const requestLookup = `    const requestedId = new URL(request.url).searchParams.get(\"requestId\");\n    if (requestedId) {\n      const parsedId = z.string().uuid().safeParse(requestedId);\n      if (!parsedId.success) {\n        return NextResponse.json({ error: \"INVALID_REQUEST\" }, { status: 400 });\n      }\n\n      const current = await imageRequestRow({\n        userId: user.id,\n        characterId: character.id,\n        requestId: parsedId.data\n      });\n      if (!current) {\n        return NextResponse.json(\n          { error: \"IMAGE_REQUEST_NOT_FOUND\" },\n          { status: 404 }\n        );\n      }\n\n      if (current.status === \"completed\" && current.image_id) {\n        return NextResponse.json({\n          status: \"completed\",\n          image: await galleryImageResponse(current.image_id, user.id)\n        });\n      }\n\n      if (current.status === \"failed\") {\n        return NextResponse.json({\n          status: \"failed\",\n          error: current.error_code || \"IMAGE_GENERATION_FAILED\"\n        });\n      }\n\n      if (!current.provider_queue_id) {\n        return NextResponse.json({ status: \"processing\" });\n      }\n\n      const apiKey = wavespeedApiKey();\n      if (!apiKey) throw new Error(\"WAVESPEED_NOT_CONFIGURED\");\n\n      const retrieved = await retrieveProviderImage({\n        apiKey,\n        queueId: current.provider_queue_id\n      });\n\n      if (retrieved.state === \"processing\") {\n        return NextResponse.json(\n          { status: \"processing\" },\n          { headers: { \"Cache-Control\": \"private, no-store\" } }\n        );\n      }\n\n      if (retrieved.state === \"failed\") {\n        await failCharacterImageRequest({\n          userId: user.id,\n          requestId: current.request_id,\n          errorCode: retrieved.errorCode\n        });\n        return NextResponse.json({\n          status: \"failed\",\n          error: \"IMAGE_GENERATION_FAILED\"\n        });\n      }\n\n      const image = await finalizeQueuedImage(\n        current,\n        retrieved.bytes,\n        retrieved.contentType\n      );\n\n      return NextResponse.json(\n        { status: \"completed\", image },\n        { headers: { \"Cache-Control\": \"private, no-store\" } }\n      );\n    }\n\n`;
    source = source.slice(0, getInsertAt) + requestLookup + source.slice(getInsertAt);
  }

  const preferenceErrorAnchor = `    if (imagesError) throw imagesError;\n    if (preferenceError) throw preferenceError;\n\n`;
  if (!source.includes("pendingRequestId: pendingRequest?.request_id ?? null")) {
    const pendingLookup = `${preferenceErrorAnchor}    const { data: pendingRequest, error: pendingError } = await supabase\n      .from(\"character_image_requests\")\n      .select(\"request_id\")\n      .eq(\"user_id\", user.id)\n      .eq(\"character_id\", character.id)\n      .eq(\"status\", \"processing\")\n      .order(\"created_at\", { ascending: false })\n      .limit(1)\n      .maybeSingle();\n    if (pendingError) throw pendingError;\n\n`;
    source = replaceRequired(
      source,
      preferenceErrorAnchor,
      pendingLookup,
      "image-pending-lookup"
    );

    source = replaceRequired(
      source,
      `        selectedImageId: preference?.selected_gallery_image_id ?? null,\n        limit: GALLERY_LIMIT,\n        imageCost: everCoinImageCost()`,
      `        selectedImageId: preference?.selected_gallery_image_id ?? null,\n        limit: GALLERY_LIMIT,\n        imageCost: everCoinImageCost(),\n        pendingRequestId: pendingRequest?.request_id ?? null`,
      "image-pending-response"
    );
  }

  const waitStart = source.indexOf(
    "    const prediction = await waitForWaveSpeedPrediction({"
  );
  if (waitStart >= 0) {
    const postCatch = source.indexOf("\n  } catch (error) {", waitStart);
    if (postCatch < 0) fail("image-post-catch");

    const queueReturn = `    const { error: queueError } = await getSupabaseServiceClient()\n      .from(\"character_image_requests\")\n      .update({\n        provider_model: submitted.model,\n        provider_queue_id: submitted.id,\n        provider_download_url: null,\n        updated_at: new Date().toISOString()\n      })\n      .eq(\"request_id\", requestId)\n      .eq(\"user_id\", user.id)\n      .eq(\"status\", \"processing\");\n    if (queueError) throw queueError;\n\n    return NextResponse.json(\n      {\n        status: \"processing\",\n        requestId,\n        queueId: submitted.id\n      },\n      {\n        status: 202,\n        headers: { \"Cache-Control\": \"private, no-store\" }\n      }\n    );`;

    source = source.slice(0, waitStart) + queueReturn + source.slice(postCatch);
  }

  if (
    source.includes("waitForWaveSpeedPrediction") ||
    !source.includes(helperMarker) ||
    !source.includes("provider_queue_id: submitted.id") ||
    !source.includes("pendingRequestId: pendingRequest?.request_id ?? null")
  ) {
    fail("image-route-background-validation");
  }

  write(relativePath, source);
}

{
  const relativePath = "src/components/media/CharacterGalleryClient.tsx";
  let source = read(relativePath);

  source = replaceRequired(
    source,
    `  imageCost: number;\n};`,
    `  imageCost: number;\n  pendingRequestId: string | null;\n};`,
    "image-client-type"
  );

  if (!source.includes("const IMAGE_POLL_DELAY_MS = 3_000;")) {
    source = replaceRequired(
      source,
      "const VIDEO_POLL_DELAY_MS = 6_000;",
      "const IMAGE_POLL_DELAY_MS = 3_000;\nconst VIDEO_POLL_DELAY_MS = 6_000;",
      "image-poll-delay"
    );
  }

  if (!source.includes("pendingImageRequestId")) {
    source = replaceRequired(
      source,
      `  const [pendingImageCard, setPendingImageCard] = useState(false);\n  const [pendingVideoRequestId, setPendingVideoRequestId] = useState<string | null>(null);`,
      `  const [pendingImageCard, setPendingImageCard] = useState(false);\n  const [pendingImageRequestId, setPendingImageRequestId] = useState<string | null>(null);\n  const [pendingVideoRequestId, setPendingVideoRequestId] = useState<string | null>(null);`,
      "image-pending-state"
    );
  }

  source = replaceRequired(
    source,
    `  const videoBusy = Boolean(pendingVideoRequestId || submittingVideo);\n\n  const canGenerateImage =\n    Boolean(imageData) &&\n    !imageAtLimit &&\n    imagePrompt.trim().length >= 3 &&\n    !generatingImage;`,
    `  const imageBusy = Boolean(pendingImageRequestId || generatingImage);\n  const videoBusy = Boolean(pendingVideoRequestId || submittingVideo);\n\n  const canGenerateImage =\n    Boolean(imageData) &&\n    !imageAtLimit &&\n    imagePrompt.trim().length >= 3 &&\n    !imageBusy;`,
    "image-busy-state"
  );

  if (!source.includes("setPendingImageRequestId(nextImages.pendingRequestId);")) {
    source = replaceRequired(
      source,
      `      setImageData(nextImages);\n      setVideoData(nextVideos);\n      setPendingVideoRequestId(nextVideos.pendingRequestId);`,
      `      setImageData(nextImages);\n      setVideoData(nextVideos);\n      setPendingImageRequestId(nextImages.pendingRequestId);\n      setPendingImageCard(Boolean(nextImages.pendingRequestId));\n      setPendingVideoRequestId(nextVideos.pendingRequestId);`,
      "image-load-pending"
    );
  }

  const videoEffectAnchor = `  useEffect(() => {\n    if (!session?.access_token || !pendingVideoRequestId) return;`;
  const imageEffectMarker = "if (!session?.access_token || !pendingImageRequestId) return;";
  if (!source.includes(imageEffectMarker)) {
    const imageEffect = `  useEffect(() => {\n    if (!session?.access_token || !pendingImageRequestId) return;\n\n    let cancelled = false;\n    let timer: ReturnType<typeof setTimeout> | null = null;\n\n    async function poll() {\n      try {\n        const response = await fetch(\n          \`/api/character-gallery/\${encodeURIComponent(slug)}?requestId=\${encodeURIComponent(pendingImageRequestId!)}\`,\n          {\n            headers: {\n              Authorization: \`Bearer \${session!.access_token}\`\n            },\n            cache: \"no-store\"\n          }\n        );\n        const payload = await response.json().catch(() => ({}));\n        if (cancelled) return;\n\n        if (!response.ok) {\n          throw new Error(\n            localizedErrorMessage(\n              payload?.message ?? payload?.error,\n              language,\n              copy.mediaError,\n              \"media\"\n            )\n          );\n        }\n\n        if (payload?.status === \"completed\" && payload?.image) {\n          const nextImage = payload.image as GalleryImage;\n          setImageData((current) =>\n            current\n              ? {\n                  ...current,\n                  images: [\n                    nextImage,\n                    ...current.images.filter((image) => image.id !== nextImage.id)\n                  ],\n                  pendingRequestId: null\n                }\n              : current\n          );\n          setImagePrompt(\"\");\n          setPendingImageRequestId(null);\n          setPendingImageCard(false);\n          setImageError(\"\");\n          return;\n        }\n\n        if (payload?.status === \"failed\") {\n          setImageError(\n            localizedErrorMessage(\n              payload?.message ?? payload?.error,\n              language,\n              copy.mediaError,\n              \"media\"\n            )\n          );\n          setPendingImageRequestId(null);\n          setPendingImageCard(false);\n          return;\n        }\n\n        timer = setTimeout(() => void poll(), IMAGE_POLL_DELAY_MS);\n      } catch (pollError) {\n        if (cancelled) return;\n        setImageError(\n          pollError instanceof Error ? pollError.message : copy.mediaError\n        );\n        timer = setTimeout(() => void poll(), IMAGE_POLL_DELAY_MS * 2);\n      }\n    }\n\n    void poll();\n\n    return () => {\n      cancelled = true;\n      if (timer) clearTimeout(timer);\n    };\n  }, [copy.mediaError, language, pendingImageRequestId, session?.access_token, slug]);\n\n`;
    source = insertBefore(
      source,
      videoEffectAnchor,
      imageEffect,
      imageEffectMarker,
      "image-poll-effect-anchor"
    );
  }

  const generateStart = source.indexOf("  async function generateImage() {");
  const generateEnd = source.indexOf("  async function generateVideo() {", generateStart);
  if (generateStart < 0 || generateEnd < 0) fail("image-client-generate-bounds");

  const newGenerateImage = `  async function generateImage() {\n    if (!session?.access_token || !canGenerateImage) return;\n\n    const requestId = crypto.randomUUID();\n    setGeneratingImage(true);\n    setPendingImageCard(true);\n    setImageError(\"\");\n\n    try {\n      const response = await fetch(\n        \`/api/character-gallery/\${encodeURIComponent(slug)}\`,\n        {\n          method: \"POST\",\n          headers: {\n            \"Content-Type\": \"application/json\",\n            Authorization: \`Bearer \${session.access_token}\`\n          },\n          body: JSON.stringify({\n            requestId,\n            prompt: imagePrompt.trim()\n          })\n        }\n      );\n      const payload = await response.json().catch(() => ({}));\n\n      if (\n        response.status === 402 ||\n        payload?.error === \"INSUFFICIENT_EVERCOIN\" ||\n        payload?.error === \"EVERCOIN_DEBT\"\n      ) {\n        setPendingImageCard(false);\n        setCoinModal(true);\n        return;\n      }\n      if (payload?.error === \"IMAGE_LIMIT_REACHED\") {\n        setPendingImageCard(false);\n        setImageError(copy.imageLimitReached);\n        return;\n      }\n      if (payload?.error === \"IMAGE_REQUEST_IN_PROGRESS\") {\n        setPendingImageCard(false);\n        setImageError(copy.imageRequestBusy);\n        return;\n      }\n      if (!response.ok) {\n        throw new Error(\n          localizedErrorMessage(\n            payload?.message ?? payload?.error,\n            language,\n            copy.mediaError,\n            \"media\"\n          )\n        );\n      }\n\n      if (payload?.status === \"completed\" && payload?.image) {\n        const nextImage = payload.image as GalleryImage;\n        setImageData((current) =>\n          current\n            ? {\n                ...current,\n                images: [\n                  nextImage,\n                  ...current.images.filter((image) => image.id !== nextImage.id)\n                ],\n                pendingRequestId: null\n              }\n            : current\n        );\n        setImagePrompt(\"\");\n        setPendingImageRequestId(null);\n        setPendingImageCard(false);\n        return;\n      }\n\n      const queuedRequestId =\n        typeof payload?.requestId === \"string\"\n          ? payload.requestId\n          : requestId;\n      setPendingImageRequestId(queuedRequestId);\n      setImageData((current) =>\n        current\n          ? { ...current, pendingRequestId: queuedRequestId }\n          : current\n      );\n    } catch (generateError) {\n      setPendingImageRequestId(null);\n      setPendingImageCard(false);\n      setImageError(\n        generateError instanceof Error ? generateError.message : copy.mediaError\n      );\n    } finally {\n      setGeneratingImage(false);\n    }\n  }\n\n`;

  source =
    source.slice(0, generateStart) +
    newGenerateImage +
    source.slice(generateEnd);

  source = source.replace(
    `{generatingImage ? (\n                    <LoaderCircle size={17} className=\"animate-spin\" />`,
    `{imageBusy ? (\n                    <LoaderCircle size={17} className=\"animate-spin\" />`
  );
  source = source.replace(
    `{generatingImage\n                    ? copy.generatingImage`,
    `{imageBusy\n                    ? copy.generatingImage`
  );

  if (
    !source.includes("pendingImageRequestId") ||
    !source.includes("IMAGE_POLL_DELAY_MS") ||
    !source.includes("pendingRequestId: null") ||
    !source.includes("const imageBusy = Boolean(")
  ) {
    fail("image-client-background-validation");
  }

  write(relativePath, source);
}

console.log(
  "EVERBOND_REALTIME_CHAT_AND_BACKGROUND_IMAGES chat=venice-streaming image=queued-resumable video=unchanged"
);
