import { Character } from "@/types/character";
import { MemoryState } from "@/types/memory";
import { buildMemoryModePrompt } from "@/lib/ai/prompts";
import { callEverBondModel } from "@/lib/ai/provider";

export async function compressConversationMemory({
  character,
  transcript,
  previousMemory
}: {
  character: Character;
  transcript: string;
  previousMemory: MemoryState;
}): Promise<MemoryState> {
  const prompt = buildMemoryModePrompt(character, transcript, previousMemory);

  const result = await callEverBondModel([
    { role: "system", content: prompt },
    { role: "user", content: "Return the updated memory JSON now." }
  ]);

  try {
    return JSON.parse(result.content) as MemoryState;
  } catch {
    return previousMemory;
  }
}
