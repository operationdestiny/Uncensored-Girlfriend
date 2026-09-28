#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

function replaceRequired(source, from, to, label) {
  if (source.includes(from)) return source.replace(from, to);
  if (source.includes(to)) return source;
  throw new Error(`Final chat/video reliability patch could not find: ${label}`);
}

function insertBeforeRequired(source, marker, insertion, alreadyPresent, label) {
  if (source.includes(alreadyPresent)) return source;
  const index = source.indexOf(marker);
  if (index < 0) {
    throw new Error(`Final chat/video reliability patch could not find: ${label}`);
  }
  return source.slice(0, index) + insertion + source.slice(index);
}

// ===========================================================================
// VIDEO: use a documented identity-locking reference-to-video model.
//
// Kling O3 Standard R2V treats frontal_image_url as the primary identity
// anchor. Keep one real character image as @Element1 and let the user's prompt
// control movement, pose, clothing, scene, framing, and camera.
//
// Restore 8 seconds because:
// - Kling O3 supports 8s.
// - the existing normal-user Supabase billing function already validates 8s.
// - this avoids changing production billing semantics for every ordinary user.
// ===========================================================================

const pricingPath = "src/lib/video-pricing.ts";
let videoPricing = read(pricingPath);

videoPricing = replaceRequired(
  videoPricing,
  'const DEFAULT_VIDEO_MODEL = "wan-2-7-reference-to-video";',
  'const DEFAULT_VIDEO_MODEL = "kling-o3-standard-reference-to-video";',
  "Kling O3 Standard R2V model"
);

videoPricing = replaceRequired(
  videoPricing,
  "const DEFAULT_DURATION_SECONDS = 10;",
  "const DEFAULT_DURATION_SECONDS = 8;",
  "8-second video duration"
);

videoPricing = replaceRequired(
  videoPricing,
  `    model:
      process.env.VENICE_VIDEO_MODEL?.trim() ||
      DEFAULT_VIDEO_MODEL,`,
  `    model: DEFAULT_VIDEO_MODEL,`,
  "fixed documented reference-video model"
);

videoPricing = replaceRequired(
  videoPricing,
  `      body: JSON.stringify({
        model: inputs.model,
        duration: inputs.duration,
        resolution: inputs.resolution
      }),`,
  `      body: JSON.stringify({
        model: inputs.model,
        duration: inputs.duration,
        aspect_ratio: "9:16",
        audio: false
      }),`,
  "Kling O3 video quote fields"
);

if (
  !videoPricing.includes(
    'const DEFAULT_VIDEO_MODEL = "kling-o3-standard-reference-to-video";'
  ) ||
  !videoPricing.includes("const DEFAULT_DURATION_SECONDS = 8;") ||
  !videoPricing.includes("model: DEFAULT_VIDEO_MODEL") ||
  !videoPricing.includes('aspect_ratio: "9:16"') ||
  !videoPricing.includes("audio: false")
) {
  throw new Error("Kling O3 video pricing validation failed.");
}

write(pricingPath, videoPricing);

const videoRoutePath =
  "src/app/api/character-video-gallery/[slug]/route.ts";
let videoRoute = read(videoRoutePath);

videoRoute = replaceRequired(
  videoRoute,
  "const VIDEO_DURATIONS = [10] as const;",
  "const VIDEO_DURATIONS = [8] as const;",
  "video route duration"
);

videoRoute = replaceRequired(
  videoRoute,
  `        prompt:
          \`@Image1 is the exact fictional adult character \${character.name}. \` +
          \`Preserve the same face, identity, age, body, and recognizable appearance throughout the video. \` +
          parsed.data.prompt,
        duration: pricing.duration,
        resolution: pricing.resolution,
        reference_image_urls: [referenceImage],
        negative_prompt:
          "identity drift, different person, face distortion, low resolution, blur, watermark, text, duplicate body parts"`,
  `        prompt:
          \`@Element1 is the exact fictional adult character \${character.name}. \` +
          "Keep @Element1's recognizable face, identity, adult age, body, skin tone, hair, and defining appearance consistent throughout the video. " +
          "The user's request controls the action, pose, expression, clothing, scene, framing, and camera movement. " +
          parsed.data.prompt,
        duration: pricing.duration,
        aspect_ratio: "9:16",
        audio: false,
        elements: [
          {
            frontal_image_url: referenceImage
          }
        ]`,
  "Kling O3 identity element request"
);

if (
  !videoRoute.includes("const VIDEO_DURATIONS = [8] as const;") ||
  !videoRoute.includes("@Element1 is the exact fictional adult character") ||
  !videoRoute.includes("frontal_image_url: referenceImage") ||
  !videoRoute.includes('aspect_ratio: "9:16"') ||
  !videoRoute.includes("audio: false") ||
  videoRoute.includes("reference_image_urls: [referenceImage]") ||
  videoRoute.includes("resolution: pricing.resolution") ||
  videoRoute.includes("negative_prompt:")
) {
  throw new Error("Kling O3 video route validation failed.");
}

write(videoRoutePath, videoRoute);

const galleryClientPath =
  "src/components/media/CharacterGalleryClient.tsx";
let galleryClient = read(galleryClientPath);

galleryClient = replaceRequired(
  galleryClient,
  "const [videoDuration, setVideoDuration] = useState(10);",
  "const [videoDuration, setVideoDuration] = useState(8);",
  "video client duration"
);

write(galleryClientPath, galleryClient);

// ===========================================================================
// TEXT CHAT: reject an empty provider reply so the route can retry/refund
// instead of returning HTTP 200 with an invisible assistant message.
// ===========================================================================

const voiceChatPath = "src/lib/voice-chat.ts";
let voiceChat = read(voiceChatPath);

voiceChat = replaceRequired(
  voiceChat,
  `  ]);

  let memoryInputTokens = 0;
  let memoryOutputTokens = 0;`,
  `  ]);

  if (!result.content.trim()) {
    throw new Error("EMPTY_TEXT_REPLY");
  }

  let memoryInputTokens = 0;
  let memoryOutputTokens = 0;`,
  "empty text reply guard"
);

write(voiceChatPath, voiceChat);

// ===========================================================================
// CHAT API
// - Retry empty replies through the existing retry path.
// - Add a real DELETE reset endpoint.
// - Reset clears message history and pending request locks for this character,
//   but preserves relationship_states / ever_memory and conversation memory.
// ===========================================================================

const chatRoutePath = "src/app/api/chat/route.ts";
let chatRoute = read(chatRoutePath);

if (!chatRoute.includes('export const runtime = "nodejs";')) {
  const actualMarker = `import {
  beginGiftSend,
  completeGiftSend,
  failGiftSend
} from "@/lib/evershop/server";
`;

  chatRoute = replaceRequired(
    chatRoute,
    actualMarker,
    actualMarker +
      `\nexport const runtime = "nodejs";\nexport const maxDuration = 60;\n`,
    "chat runtime configuration"
  );
}

chatRoute = replaceRequired(
  chatRoute,
  `/fetch failed|econnreset|etimedout|enotfound|socket hang up|und_err/i.test(
      details
    )`,
  `/fetch failed|econnreset|etimedout|enotfound|socket hang up|und_err|timeout|timed out|aborted|empty_text_reply/i.test(
      details
    )`,
  "chat retryable timeout and empty reply errors"
);

const deleteHandler = `export async function DELETE(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "SIGNUP_REQUIRED" }, { status: 401 });
    }

    const characterSlug = new URL(request.url).searchParams.get(
      "characterSlug"
    );
    if (!characterSlug) {
      return NextResponse.json(
        { error: "Missing characterSlug" },
        { status: 400 }
      );
    }

    const character = await getCharacterBySlugForUser(
      characterSlug,
      user.id
    );
    if (!character) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 }
      );
    }

    const supabase = getSupabaseServiceClient();

    const { data: pendingRequests, error: pendingError } =
      await supabase
        .from("chat_requests")
        .select("request_id")
        .eq("user_id", user.id)
        .eq("character_id", character.id)
        .eq("status", "pending");

    if (pendingError) throw pendingError;

    for (const pending of pendingRequests ?? []) {
      const pendingRequestId = String(pending.request_id || "");
      if (!pendingRequestId) continue;

      await failChatRequest({
        userId: user.id,
        requestId: pendingRequestId,
        errorCode: "CHAT_RESET"
      }).catch(() => undefined);

      await refundChatMessageCredit({
        userId: user.id,
        requestId: pendingRequestId
      }).catch(() => undefined);
    }

    const { data: conversations, error: conversationError } =
      await supabase
        .from("conversations")
        .select("id,updated_at")
        .eq("user_id", user.id)
        .eq("character_id", character.id)
        .order("updated_at", { ascending: false });

    if (conversationError) throw conversationError;

    const conversationIds = (conversations ?? [])
      .map((conversation) => String(conversation.id || ""))
      .filter(Boolean);

    if (conversationIds.length) {
      const { error: messageDeleteError } = await supabase
        .from("messages")
        .delete()
        .in("conversation_id", conversationIds);

      if (messageDeleteError) throw messageDeleteError;

      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .in("id", conversationIds);
    }

    return NextResponse.json({
      reset: true,
      conversationId: conversationIds[0] ?? null
    });
  } catch (error) {
    console.error("Chat reset failed:", error);
    return NextResponse.json(
      { error: "CHAT_RESET_FAILED" },
      { status: 500 }
    );
  }
}

`;

chatRoute = insertBeforeRequired(
  chatRoute,
  "export async function POST(request: Request) {",
  deleteHandler,
  "export async function DELETE(request: Request)",
  "chat DELETE reset endpoint"
);

if (
  !chatRoute.includes("export async function DELETE(request: Request)") ||
  !chatRoute.includes('errorCode: "CHAT_RESET"') ||
  !chatRoute.includes("empty_text_reply")
) {
  throw new Error("Chat route reliability validation failed.");
}

write(chatRoutePath, chatRoute);

// ===========================================================================
// CHAT CLIENT
//
// Patch by stable anchors instead of one large exact state block. Earlier
// prebuild scripts can insert additional ChatShell state, so large multiline
// replacements are intentionally avoided here.
// ===========================================================================

const chatShellPath = "src/components/chat/ChatShell.tsx";
let chatShell = read(chatShellPath);

// Add reliability state directly after the existing gift-error state.
if (!chatShell.includes('const [chatError, setChatError] = useState("");')) {
  const stateMarker =
    '  const [giftError, setGiftError] = useState("");';

  const stateIndex = chatShell.indexOf(stateMarker);
  if (stateIndex < 0) {
    throw new Error(
      "Final chat/video reliability patch could not find: giftError state anchor"
    );
  }

  const stateInsertAt = stateIndex + stateMarker.length;
  chatShell =
    chatShell.slice(0, stateInsertAt) +
    '\n  const [chatError, setChatError] = useState("");' +
    '\n  const [refreshingChat, setRefreshingChat] = useState(false);' +
    chatShell.slice(stateInsertAt);
}

// Add abort/generation refs directly after the existing in-flight ref.
if (
  !chatShell.includes(
    "const chatAbortRef = useRef<AbortController | null>(null);"
  )
) {
  const refMarker =
    "  const sendInFlightRef = useRef(false);";

  const refIndex = chatShell.indexOf(refMarker);
  if (refIndex < 0) {
    throw new Error(
      "Final chat/video reliability patch could not find: sendInFlightRef anchor"
    );
  }

  const refInsertAt = refIndex + refMarker.length;
  chatShell =
    chatShell.slice(0, refInsertAt) +
    "\n  const chatAbortRef = useRef<AbortController | null>(null);" +
    "\n  const chatGenerationRef = useRef(0);" +
    chatShell.slice(refInsertAt);
}

// Replace the complete reset function by function-name anchors.
if (!chatShell.includes("async function resetConversation()")) {
  const resetStart = chatShell.indexOf(
    "  function resetConversation() {"
  );
  const shareStart = chatShell.indexOf(
    "  function shareCompanion() {",
    resetStart
  );

  if (resetStart < 0 || shareStart < 0 || shareStart <= resetStart) {
    throw new Error(
      "Final chat/video reliability patch could not find: resetConversation anchors"
    );
  }

  const fixedReset = `  async function resetConversation() {
    if (refreshingChat) return;

    chatGenerationRef.current += 1;
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    sendInFlightRef.current = false;

    setRefreshingChat(true);
    setIsTyping(false);
    setGiftError("");
    setChatError("");

    try {
      if (session?.access_token) {
        const response = await fetch(
          \`/api/chat?characterSlug=\${encodeURIComponent(
            character.slug
          )}\`,
          {
            method: "DELETE",
            headers: {
              Authorization: \`Bearer \${session.access_token}\`
            }
          }
        );

        const data = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data?.error || "CHAT_RESET_FAILED"
          );
        }

        setConversationId(
          data.conversationId ?? null
        );
      } else {
        setConversationId(null);
      }

      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(
          pendingMessageStorageKey
        );
      }

      setMessages([
        {
          role: "character",
          content: initialCharacterMessage
        }
      ]);
      setInput("");
    } catch (error) {
      console.error("Chat reset failed:", error);
      setChatError(finalCopy.errors.chat);
    } finally {
      setRefreshingChat(false);
      focusChatInput();
    }
  }

`;

  chatShell =
    chatShell.slice(0, resetStart) +
    fixedReset +
    chatShell.slice(shareStart);
}

// Work only inside sendMessage so similarly named fetch/data blocks elsewhere
// in the component cannot be patched accidentally.
const sendStart = chatShell.indexOf(
  "  async function sendMessage("
);
const sendEnd = chatShell.indexOf(
  "  const displayTags = character.tags",
  sendStart
);

if (sendStart < 0 || sendEnd < 0 || sendEnd <= sendStart) {
  throw new Error(
    "Final chat/video reliability patch could not locate sendMessage."
  );
}

let sendBlock = chatShell.slice(sendStart, sendEnd);

// Clear any previous chat error when a new request starts.
if (!sendBlock.includes('    setChatError("");')) {
  const startMarker = `    sendInFlightRef.current = true;
    setGiftError("");`;

  if (!sendBlock.includes(startMarker)) {
    throw new Error(
      "Final chat/video reliability patch could not find: send start anchor"
    );
  }

  sendBlock = sendBlock.replace(
    startMarker,
    `${startMarker}
    setChatError("");`
  );
}

// Create one AbortController/generation token per outgoing chat request.
if (!sendBlock.includes("const sendGeneration = chatGenerationRef.current;")) {
  const requestMarker = `    if (gift) setSendingGiftId(gift.id);

    const requestId = crypto.randomUUID();`;

  if (!sendBlock.includes(requestMarker)) {
    throw new Error(
      "Final chat/video reliability patch could not find: requestId anchor"
    );
  }

  sendBlock = sendBlock.replace(
    requestMarker,
    `    if (gift) setSendingGiftId(gift.id);

    const sendGeneration = chatGenerationRef.current;
    const controller = new AbortController();
    chatAbortRef.current = controller;
    const requestId = crypto.randomUUID();`
  );
}

// Attach the abort signal only to the POST /api/chat fetch.
if (!sendBlock.includes("signal: controller.signal")) {
  const postFetchStart = sendBlock.indexOf(
    '      const response = await fetch("/api/chat", {'
  );
  const postFetchEnd = sendBlock.indexOf(
    "\n      });",
    postFetchStart
  );

  if (postFetchStart < 0 || postFetchEnd < 0) {
    throw new Error(
      "Final chat/video reliability patch could not find: POST /api/chat fetch"
    );
  }

  const fetchBlock = sendBlock.slice(
    postFetchStart,
    postFetchEnd
  );

  const bodyClose = fetchBlock.lastIndexOf(
    "\n        })"
  );

  if (bodyClose < 0) {
    throw new Error(
      "Final chat/video reliability patch could not find: chat JSON body close"
    );
  }

  const bodyCloseAbsolute =
    postFetchStart + bodyClose;

  sendBlock =
    sendBlock.slice(0, bodyCloseAbsolute) +
    "\n        }),\n        signal: controller.signal" +
    sendBlock.slice(
      bodyCloseAbsolute + "\n        })".length
    );
}

// Ignore a response from a request that Refresh Chat has already invalidated.
if (
  !sendBlock.includes(
    "sendGeneration !== chatGenerationRef.current"
  )
) {
  const dataMarker =
    "      const data = await response.json().catch(() => ({}));";

  if (!sendBlock.includes(dataMarker)) {
    throw new Error(
      "Final chat/video reliability patch could not find: chat response JSON anchor"
    );
  }

  sendBlock = sendBlock.replace(
    dataMarker,
    `${dataMarker}

      if (sendGeneration !== chatGenerationRef.current) {
        return;
      }`
  );
}

// Never accept HTTP 200 with an empty assistant reply.
if (!sendBlock.includes('throw new Error("EMPTY_CHAT_REPLY");')) {
  const conversationMarker =
    "      setConversationId(data.conversationId ?? conversationId);";

  if (!sendBlock.includes(conversationMarker)) {
    throw new Error(
      "Final chat/video reliability patch could not find: conversationId success anchor"
    );
  }

  sendBlock = sendBlock.replace(
    conversationMarker,
    `      if (
        typeof data.reply !== "string" ||
        !data.reply.trim()
      ) {
        throw new Error("EMPTY_CHAT_REPLY");
      }

      setChatError("");
${conversationMarker}`
  );
}

// Replace the sendMessage catch/finally tail as one bounded section.
const catchStart = sendBlock.lastIndexOf(
  "    } catch (error) {"
);

if (catchStart < 0) {
  throw new Error(
    "Final chat/video reliability patch could not find: sendMessage catch"
  );
}

const fixedCatchTail = `    } catch (error) {
      if (
        sendGeneration !==
        chatGenerationRef.current
      ) {
        return;
      }

      console.error("Chat request failed:", error);
      setMessages(previousMessages);
      setInput(trimmed);
      setChatError(finalCopy.errors.chat);

      if (gift) {
        setGiftError(shopCopy.noGiftsToSend);
        setGiftPickerOpen(true);
      }
    } finally {
      if (
        sendGeneration ===
        chatGenerationRef.current
      ) {
        sendInFlightRef.current = false;
        chatAbortRef.current = null;
        setSendingGiftId(null);
        setIsTyping(false);
        focusChatInput();
      }
    }
  }

`;

sendBlock =
  sendBlock.slice(0, catchStart) +
  fixedCatchTail;

chatShell =
  chatShell.slice(0, sendStart) +
  sendBlock +
  chatShell.slice(sendEnd);

// Make the existing Refresh button call the async server reset.
// Keep its existing visual styling so this change is minimally invasive.
if (!chatShell.includes("onClick={() => void resetConversation()}")) {
  if (!chatShell.includes("onClick={resetConversation}")) {
    throw new Error(
      "Final chat/video reliability patch could not find: Refresh button"
    );
  }

  chatShell = chatShell.replace(
    "onClick={resetConversation}",
    "onClick={() => void resetConversation()}"
  );
}

// Show chat failures above the composer instead of silently rolling back.
if (!chatShell.includes("{chatError && (")) {
  const composerMarker =
    '            <div className="mx-auto flex max-w-4xl items-center gap-2 rounded-full bg-white/[0.04] p-1.5 bond-chat-input">';

  const composerIndex = chatShell.indexOf(
    composerMarker
  );

  if (composerIndex < 0) {
    throw new Error(
      "Final chat/video reliability patch could not find: chat composer anchor"
    );
  }

  const chatErrorUi = `            {chatError && (
              <div className="mx-auto mb-2 flex max-w-4xl justify-end">
                <p className="text-xs text-red-200">
                  {chatError}
                </p>
              </div>
            )}

`;

  chatShell =
    chatShell.slice(0, composerIndex) +
    chatErrorUi +
    chatShell.slice(composerIndex);
}

if (
  !chatShell.includes(
    'const [chatError, setChatError] = useState("");'
  ) ||
  !chatShell.includes(
    "const chatAbortRef = useRef<AbortController | null>(null);"
  ) ||
  !chatShell.includes(
    "async function resetConversation()"
  ) ||
  !chatShell.includes('method: "DELETE"') ||
  !chatShell.includes("signal: controller.signal") ||
  !chatShell.includes("EMPTY_CHAT_REPLY") ||
  !chatShell.includes("finalCopy.errors.chat")
) {
  throw new Error(
    "Chat client reliability validation failed."
  );
}

write(chatShellPath, chatShell);

console.log(
  "EverBond final chat reset, chat reliability, and Kling O3 R2V patch applied."
);
