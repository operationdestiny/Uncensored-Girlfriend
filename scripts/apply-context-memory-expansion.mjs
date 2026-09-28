import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "src/lib/voice-chat.ts");
let source = fs.readFileSync(target, "utf8");

function replaceConstant(name, fromValue, toValue) {
  const before = `const ${name} = ${fromValue};`;
  const after = `const ${name} = ${toValue};`;

  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`EVERBOND_CONTEXT_MEMORY_PATCH_FAILED:${name}`);
  }

  source = source.replace(before, after);
}

replaceConstant("MODEL_HISTORY_MESSAGE_COUNT", 12, 32);
replaceConstant("EVER_MEMORY_LIMIT", 12, 20);

if (
  !source.includes("const MODEL_HISTORY_MESSAGE_COUNT = 32;") ||
  !source.includes("const EVER_MEMORY_LIMIT = 20;")
) {
  throw new Error("EVERBOND_CONTEXT_MEMORY_PATCH_FAILED:validation");
}

fs.writeFileSync(target, source, "utf8");
