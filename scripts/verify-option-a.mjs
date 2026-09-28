#!/usr/bin/env node
import fs from "node:fs";

const checks = [
  ["scripts/import-characters.mjs", /onConflict:\s*["']id["']/],
  ["scripts/import-characters.mjs", /id:\s*character\.id/],
  ["src/app/page.tsx", /getCharactersFromSupabase\(100/],
  ["src/app/characters/page.tsx", /getCharactersFromSupabase\(100/],
  ["src/app/api/chat/route.ts", /from\(["']ever_memory["']\)/],
  ["src/app/api/chat/route.ts", /from\(["']relationship_states["']\)/]
];

let failed = false;
for (const [file, pattern] of checks) {
  if (!fs.existsSync(file)) {
    console.error(`MISSING ${file}`);
    failed = true;
    continue;
  }
  const text = fs.readFileSync(file, "utf8");
  if (!pattern.test(text)) {
    console.error(`FAILED ${file}: ${pattern}`);
    failed = true;
  } else {
    console.log(`OK ${file}`);
  }
}

if (failed) process.exit(1);
console.log("Option A runtime consistency checks passed.");
