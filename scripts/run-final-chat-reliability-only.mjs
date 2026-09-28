import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const legacyPath = path.join(
  root,
  "scripts",
  "apply-final-chat-video-reliability.mjs"
);
const runtimePath = path.join(
  root,
  "scripts",
  ".apply-final-chat-reliability-only.runtime.mjs"
);
const languagePatchPath = path.join(
  root,
  "scripts",
  "apply-chat-language-lock.mjs"
);

const legacy = fs.readFileSync(legacyPath, "utf8");
const marker = [
  "// ===========================================================================",
  "// TEXT CHAT: reject an empty provider reply so the route can retry/refund"
].join("\n");
const start = legacy.indexOf(marker);

if (start < 0) {
  throw new Error("CHAT_RELIABILITY_SECTION_NOT_FOUND");
}

let chatOnly = legacy.slice(start);
chatOnly = chatOnly.replace(
  "EverBond final chat reset, chat reliability, and Kling O3 R2V patch applied.",
  "EverBond final chat reset and chat reliability patch applied."
);

const header = `import fs from "node:fs";
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
  throw new Error(\`Final chat reliability patch could not find: \${label}\`);
}

function insertBeforeRequired(source, marker, insertion, alreadyPresent, label) {
  if (source.includes(alreadyPresent)) return source;
  const index = source.indexOf(marker);
  if (index < 0) {
    throw new Error(\`Final chat reliability patch could not find: \${label}\`);
  }
  return source.slice(0, index) + insertion + source.slice(index);
}
`;

fs.writeFileSync(runtimePath, `${header}\n${chatOnly}`, "utf8");

try {
  await import(`${pathToFileURL(runtimePath).href}?build=${Date.now()}`);
} finally {
  fs.rmSync(runtimePath, { force: true });
}

await import(
  `${pathToFileURL(languagePatchPath).href}?build=${Date.now()}`
);

// ===========================================================================
// TEXT CHAT: Ever Memory runs after the visible reply is ready.
// This is deliberately the only behavior changed here. The same memory prompt,
// extraction, persistence, chat generation, charging, and reply text remain in
// place; waitUntil only removes the memory provider call from the response wait.
// ===========================================================================

const voiceChatPath = path.join(root, "src", "lib", "voice-chat.ts");
let voiceChat = fs.readFileSync(voiceChatPath, "utf8");
const backgroundMarker = "EVER_MEMORY_BACKGROUND_AFTER_REPLY";
const waitUntilImport = 'import { waitUntil } from "@vercel/functions";';

if (!voiceChat.includes(backgroundMarker)) {
  if (!voiceChat.includes(waitUntilImport)) {
    const zodImport = 'import { z } from "zod";';
    if (!voiceChat.includes(zodImport)) {
      throw new Error("BACKGROUND_MEMORY_ZOD_IMPORT_NOT_FOUND");
    }
    voiceChat = voiceChat.replace(
      zodImport,
      `${zodImport}\n${waitUntilImport}`
    );
  }

  const memoryStartMarker = "  let memoryInputTokens = 0;\n";
  const conversationTouchMarker =
    '\n  await getSupabaseServiceClient()\n    .from("conversations")';
  const memoryStart = voiceChat.indexOf(memoryStartMarker);
  const memoryEnd = voiceChat.indexOf(
    conversationTouchMarker,
    memoryStart
  );

  if (memoryStart < 0 || memoryEnd < 0 || memoryEnd <= memoryStart) {
    throw new Error("BACKGROUND_MEMORY_BLOCK_NOT_FOUND");
  }

  let memoryWork = voiceChat
    .slice(memoryStart, memoryEnd)
    .replace(memoryStartMarker, "");

  const outputCounterDeclaration = "  let memoryOutputTokens = 0;\n\n";
  if (!memoryWork.includes(outputCounterDeclaration)) {
    throw new Error("BACKGROUND_MEMORY_OUTPUT_COUNTER_NOT_FOUND");
  }
  memoryWork = memoryWork.replace(outputCounterDeclaration, "");

  const usageAssignments =
    "    memoryInputTokens = memoryResult.inputTokens;\n" +
    "    memoryOutputTokens = memoryResult.outputTokens;\n\n";
  if (!memoryWork.includes(usageAssignments)) {
    throw new Error("BACKGROUND_MEMORY_USAGE_ASSIGNMENTS_NOT_FOUND");
  }
  memoryWork = memoryWork.replace(usageAssignments, "");

  const indentedMemoryWork = memoryWork
    .split("\n")
    .map((line) => (line ? `    ${line}` : line))
    .join("\n");

  const backgroundMemoryBlock = `  // ${backgroundMarker}\n  waitUntil(\n    (async () => {\n${indentedMemoryWork}\n    })()\n  );\n`;

  voiceChat =
    voiceChat.slice(0, memoryStart) +
    backgroundMemoryBlock +
    voiceChat.slice(memoryEnd);

  const oldInputUsage =
    "    inputTokens: result.inputTokens + memoryInputTokens,";
  const oldOutputUsage =
    "    outputTokens: result.outputTokens + memoryOutputTokens,";

  if (!voiceChat.includes(oldInputUsage)) {
    throw new Error("BACKGROUND_MEMORY_INPUT_USAGE_NOT_FOUND");
  }
  if (!voiceChat.includes(oldOutputUsage)) {
    throw new Error("BACKGROUND_MEMORY_OUTPUT_USAGE_NOT_FOUND");
  }

  voiceChat = voiceChat
    .replace(oldInputUsage, "    inputTokens: result.inputTokens,")
    .replace(oldOutputUsage, "    outputTokens: result.outputTokens,");
}

if (
  !voiceChat.includes(waitUntilImport) ||
  !voiceChat.includes(backgroundMarker) ||
  !voiceChat.includes("  waitUntil(\n") ||
  voiceChat.includes("let memoryInputTokens = 0") ||
  voiceChat.includes("let memoryOutputTokens = 0") ||
  voiceChat.includes("result.inputTokens + memoryInputTokens") ||
  voiceChat.includes("result.outputTokens + memoryOutputTokens")
) {
  throw new Error("BACKGROUND_MEMORY_FINAL_VALIDATION_FAILED");
}

fs.writeFileSync(voiceChatPath, voiceChat, "utf8");

console.log(
  "EverBond text chat Ever Memory now runs in Vercel background work after the visible reply is ready."
);
