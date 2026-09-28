import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "src/lib/voice-chat.ts");
let source = fs.readFileSync(target, "utf8");

const voicePromptImport =
  'import { buildChatModePrompt as buildVoiceChatModePrompt } from "@/lib/ai/voice-prompts";\n';

if (!source.includes(voicePromptImport.trim())) {
  const marker = 'import { getSupabaseServiceClient } from "@/lib/supabase/server";\n';
  if (!source.includes(marker)) {
    throw new Error("EVERBOND_VOICE_ISOLATION_FAILED:voice-prompt-import-anchor");
  }
  source = source.replace(marker, voicePromptImport + marker);
}

if (!source.includes("callEverBondVoiceModel,")) {
  const before = `import {
  callEverBondMemoryModel,
  callEverBondModel,
  type EverBondMessage
} from "@/lib/ai/provider";`;

  const after = `import {
  callEverBondMemoryModel,
  callEverBondModel,
  callEverBondVoiceModel,
  type EverBondMessage
} from "@/lib/ai/provider";`;

  if (!source.includes(before)) {
    throw new Error("EVERBOND_VOICE_ISOLATION_FAILED:provider-import");
  }
  source = source.replace(before, after);
}

const voiceFunctionStart = source.indexOf(
  "export async function generateVoiceCharacterDraft(values: {"
);
const voiceFunctionEnd = source.indexOf(
  "export async function updateVoiceMemoryAfterCommit(values: {",
  voiceFunctionStart
);

if (voiceFunctionStart < 0 || voiceFunctionEnd < 0) {
  throw new Error("EVERBOND_VOICE_ISOLATION_FAILED:voice-function-bounds");
}

let voiceBlock = source.slice(voiceFunctionStart, voiceFunctionEnd);

if (voiceBlock.includes("buildChatModePrompt(")) {
  voiceBlock = voiceBlock.replace(
    "buildChatModePrompt(",
    "buildVoiceChatModePrompt("
  );
}

if (voiceBlock.includes("callEverBondModel(modelMessages)")) {
  voiceBlock = voiceBlock.replace(
    "callEverBondModel(modelMessages)",
    "callEverBondVoiceModel(modelMessages)"
  );
}

if (
  !voiceBlock.includes("buildVoiceChatModePrompt(") ||
  !voiceBlock.includes("callEverBondVoiceModel(modelMessages)") ||
  voiceBlock.includes("callEverBondModel(modelMessages)")
) {
  throw new Error("EVERBOND_VOICE_ISOLATION_FAILED:validation");
}

source =
  source.slice(0, voiceFunctionStart) +
  voiceBlock +
  source.slice(voiceFunctionEnd);

fs.writeFileSync(target, source, "utf8");
