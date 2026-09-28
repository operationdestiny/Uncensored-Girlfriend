import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const voiceChatPath = "src/lib/voice-chat.ts";
const target = path.join(root, voiceChatPath);

function fail(message) {
  throw new Error(`CHAT_LANGUAGE_LOCK_PATCH_FAILED:${message}`);
}

let source = fs.readFileSync(target, "utf8");

const importBlock = `import {
  buildReplyLanguageLock,
  buildReplyLanguageRetry,
  replyNeedsLanguageRetry
} from "@/lib/ai/reply-language-lock";`;

if (!source.includes(importBlock)) {
  const importAnchor =
    'import { limitVoiceReply } from "@/lib/voice-call";';

  const anchorIndex = source.indexOf(importAnchor);
  if (anchorIndex < 0) fail("language import anchor missing");

  const insertAt = anchorIndex + importAnchor.length;
  source =
    source.slice(0, insertAt) +
    `\n${importBlock}` +
    source.slice(insertAt);
}

if (!source.includes("// LANGUAGE_SELECTOR_OUTPUT_LOCK")) {
  const functionStart = source.indexOf(
    "export async function generateTextCharacterTurn"
  );

  if (functionStart < 0) fail("text chat function missing");

  const callStart = source.indexOf(
    "  const result = await callEverBondModel([",
    functionStart
  );

  if (callStart < 0) fail("text model call missing");

  const possibleEnds = [
    source.indexOf("\n\n  if (!result.content.trim()) {", callStart),
    source.indexOf("\n\n  let memoryInputTokens", callStart)
  ].filter((value) => value > callStart);

  if (!possibleEnds.length) fail("text model call end missing");

  const blockEnd = Math.min(...possibleEnds);
  const originalCall = source.slice(callStart, blockEnd);

  if (!originalCall.trimEnd().endsWith("]);")) {
    fail("unexpected text model call shape");
  }

  let baseMessages = originalCall.replace(
    "  const result = await callEverBondModel([",
    "  // LANGUAGE_SELECTOR_OUTPUT_LOCK\n  const baseModelMessages: EverBondMessage[] = ["
  );

  const firstSystem = '    { role: "system", content: prompt },';
  if (!baseMessages.includes(firstSystem)) {
    fail("primary system message missing");
  }

  baseMessages = baseMessages.replace(
    firstSystem,
    `${firstSystem}\n    {\n      role: "system",\n      content: buildReplyLanguageLock(values.language)\n    },`
  );

  baseMessages = baseMessages.replace(/\]\);\s*$/, "];\n");

  const replacement = `${baseMessages}
  let result = await callEverBondModel(baseModelMessages);

  if (
    replyNeedsLanguageRetry(
      result.content,
      values.language
    )
  ) {
    const retryResult = await callEverBondModel([
      ...baseModelMessages.slice(0, 2),
      {
        role: "system",
        content: buildReplyLanguageRetry(values.language)
      },
      ...baseModelMessages.slice(2)
    ]);

    if (retryResult.content.trim()) {
      result = {
        ...retryResult,
        inputTokens:
          result.inputTokens + retryResult.inputTokens,
        outputTokens:
          result.outputTokens + retryResult.outputTokens
      };
    }
  }`;

  source =
    source.slice(0, callStart) +
    replacement +
    source.slice(blockEnd);
}

for (const required of [
  "// LANGUAGE_SELECTOR_OUTPUT_LOCK",
  "buildReplyLanguageLock(values.language)",
  "replyNeedsLanguageRetry(",
  "buildReplyLanguageRetry(values.language)",
  "let result = await callEverBondModel(baseModelMessages)"
]) {
  if (!source.includes(required)) {
    fail(`validation missing ${required}`);
  }
}

fs.writeFileSync(target, source, "utf8");
console.log(
  "EverBond chat language selector lock and wrong-language retry applied."
);
