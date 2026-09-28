#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  loadEnvFiles,
  readRawRecords,
  validatePremiumRecord,
  csvEscape
} from "./_premium-raw-library.mjs";

loadEnvFiles();

const root = process.cwd();
const outDir = path.join(root, "output", "clean-character-reset");
fs.mkdirSync(outDir, { recursive: true });

const proposalsPath = path.join(outDir, "title-trim-proposals.json");
const reviewPath = path.join(outDir, "title-trim-review.txt");
const changedCsvPath = path.join(outDir, "title-trim-changed-only.csv");
const failuresPath = path.join(outDir, "title-trim-failures.json");

const API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
const API_BASE = (process.env.AI_API_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const MODEL = process.env.TITLE_TRIM_MODEL_ID || "gpt-5.1";
const BATCH_SIZE = Number(process.env.TITLE_TRIM_BATCH_SIZE || 30);
const LIMIT = process.env.TITLE_TRIM_LIMIT ? Number(process.env.TITLE_TRIM_LIMIT) : null;
const START_OFFSET = Number(process.env.TITLE_TRIM_START_OFFSET || 0);
const FORCE_RESTART = String(process.env.TITLE_TRIM_FORCE_RESTART || "false").toLowerCase() === "true";

if (!API_KEY) throw new Error("Missing AI_API_KEY or OPENAI_API_KEY");

if (FORCE_RESTART) {
  for (const p of [proposalsPath, reviewPath, changedCsvPath, failuresPath]) {
    if (fs.existsSync(p)) fs.rmSync(p, { force: true });
  }
}

const raw = readRawRecords();
for (const record of raw.records) validatePremiumRecord(record);

function normalizeTitle(title) {
  return String(title || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

function words(text) {
  return String(text || "").toLowerCase().match(/[a-z0-9-']+/g) || [];
}

const clothingColorWords = [
  "black", "white", "red", "blue", "green", "pink", "purple", "yellow", "gold", "silver", "gray", "grey", "orange",
  "dress", "gown", "suit", "shirt", "tank", "hoodie", "sweater", "jacket", "coat", "lingerie", "lace", "corset",
  "satin", "skirt", "bikini", "swimsuit", "uniform", "outfit", "heels", "boots", "robe"
];

function likelyContainsClothingDescriptor(title) {
  const t = String(title || "").toLowerCase();
  return clothingColorWords.some((w) => new RegExp(`\\b${w}\\b`).test(t)) ||
    /\bin (red|blue|white|black|green|pink|purple|yellow|gold|silver|gray|grey|orange)\b/.test(t) ||
    /\b(red|blue|white|black|green|pink|purple|yellow|gold|silver|gray|grey|orange)[ -]?(dress|gown|shirt|tank|hoodie|sweater|jacket|coat|lingerie|lace|corset|satin|skirt|bikini|swimsuit|uniform|outfit|robe)\b/.test(t);
}

const hardPreserveTerms = [
  "ex","roommate","neighbor","rival","friend","coworker","boss","wife","girlfriend","crush","guardian","bodyguard",
  "couch","balcony","rooftop","hotel","beach","studio","mirror","camera","party","woods","forest","path",
  "lake","bar","club","bed","doorway","window","rental","wedding","reception","office","conference",
  "gallery","garden","desert","selfie","cosplay","painter","muse","streamer","cop","witch","vampire",
  "elf","princess","queen","maid","nurse","artist","model","spell","moon","moonlit","starlit"
];

const identityColorTerms = [
  "red-haired", "redhead", "blonde", "brunette", "pink-haired", "blue-haired", "green-eyed", "green eyes", "pale"
];

function promptForBatch(batch) {
  const rows = batch.map((r) => ({
    id: r.id,
    old_title: r.title,
    role: r.role,
    opening_scenario: r.opening_scenario,
    first_message: r.first_message
  }));

  return `
You are doing a very small title-only cleanup for EverBond AI premium character cards.

SOURCE OF TRUTH:
These are the NEW premium raw titles. Do not compare against old site titles.

ONLY JOB:
Remove unnecessary clothing/color/outfit description from the title when it is not important.

Examples of removable wording:
- in red
- in white
- in black
- in blue
- in the black dress
- in a red dress
- girl in blue
- woman in white
- black dress
- white dress
- red dress
- blue outfit
- black tank
- lace-clad
- satin dress
- sheer gown
- white robe
- red bikini

Allowed:
- Remove only clothing/color/outfit words.
- Lightly adjust tiny grammar around the removed words so the title still reads naturally.

Not allowed:
- Do not make the title more creative.
- Do not make broad clickbait rewrites.
- Do not change relationship meaning.
- Do not change setting.
- Do not remove important scene nouns: couch, balcony, hotel, beach, rooftop, studio, camera, mirror, wedding, party, office, path.
- Do not change relationship nouns: ex, roommate, neighbor, rival, friend, coworker, crush, guardian, bodyguard.
- Do not remove atmosphere/identity words like moonlit, starlit, red-haired, redhead, blonde, brunette, blue-haired, green-eyed.
- If there is no unnecessary clothing/color/outfit descriptor, return the exact same title.

Good:
OLD: Your ex in the black dress asks if you still want her
NEW: Your ex asks if you still want her

Good:
OLD: The model in lace tests how bold you are
NEW: The model tests how bold you are

Good:
OLD: The woman in red pulls you into the doorway light
NEW: The woman pulls you into the doorway light

Bad:
OLD: Your ex in the black dress asks if you still want her
BAD: Your ex wants you back
Reason: changed meaning.

Bad:
OLD: The red-haired rival calls you out first
BAD: Your rival calls you out first
Reason: red-haired is identity, not clothing.

Return ONLY valid JSON:
{
  "proposals": [
    {
      "id": "character id",
      "old_title": "exact old title",
      "new_title": "same title or clothing/color-trimmed title",
      "changed": true,
      "removed_clothing_or_color_only": true,
      "meaning_preserved": true,
      "reason": "short reason"
    }
  ]
}

Rows:
${JSON.stringify(rows, null, 2)}
`.trim();
}

function extractJson(text) {
  const clean = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object found in model response");
  return JSON.parse(clean.slice(start, end + 1));
}

async function callModel(batch) {
  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You only remove unnecessary clothing/color/outfit descriptors from titles. Preserve meaning. Return JSON only." },
        { role: "user", content: promptForBatch(batch) }
      ]
    })
  });

  const body = await response.text();
  if (!response.ok) throw new Error(`Model API failed ${response.status}: ${body.slice(0, 500)}`);

  const parsed = JSON.parse(body);
  const content = parsed.choices?.[0]?.message?.content;
  if (!content) throw new Error(`No model content: ${body.slice(0, 500)}`);

  const obj = extractJson(content);
  if (!Array.isArray(obj.proposals)) throw new Error("Model JSON missing proposals array");
  return obj.proposals;
}

function validateProposal(row, proposal) {
  if (!proposal || typeof proposal !== "object") throw new Error(`${row.id}: bad proposal object`);
  if (proposal.id !== row.id) throw new Error(`${row.id}: proposal id mismatch`);
  if (proposal.old_title !== row.title) throw new Error(`${row.id}: old title mismatch`);

  const oldTitle = normalizeTitle(row.title);
  const newTitle = normalizeTitle(proposal.new_title);
  if (!newTitle) throw new Error(`${row.id}: empty new title`);
  if (newTitle.length > oldTitle.length + 2) throw new Error(`${row.id}: new title got longer`);
  if (/[—:]/.test(newTitle)) throw new Error(`${row.id}: colon/em dash not allowed`);

  const oldLower = oldTitle.toLowerCase();
  const newLower = newTitle.toLowerCase();

  for (const term of hardPreserveTerms) {
    if (oldLower.includes(term) && !newLower.includes(term)) {
      throw new Error(`${row.id}: dropped important non-clothing term "${term}"`);
    }
  }

  for (const term of identityColorTerms) {
    if (oldLower.includes(term) && !newLower.includes(term)) {
      throw new Error(`${row.id}: dropped identity descriptor "${term}"`);
    }
  }

  if (words(newTitle).length > words(oldTitle).length) {
    throw new Error(`${row.id}: new title has more words`);
  }

  const changed = newTitle !== oldTitle;

  if (changed) {
    if (proposal.removed_clothing_or_color_only !== true) {
      throw new Error(`${row.id}: model did not confirm clothing/color-only removal`);
    }
    if (proposal.meaning_preserved !== true) {
      throw new Error(`${row.id}: model did not confirm meaning preserved`);
    }
    if (!likelyContainsClothingDescriptor(oldTitle)) {
      throw new Error(`${row.id}: changed title but original title has no clear clothing/color/outfit descriptor`);
    }
  }

  return {
    id: row.id,
    category: row.category,
    old_title: oldTitle,
    new_title: newTitle,
    changed,
    removed_clothing_or_color_only: changed,
    meaning_preserved: true,
    reason: String(proposal.reason || "").slice(0, 200)
  };
}

function readExisting() {
  if (!fs.existsSync(proposalsPath)) return [];
  const parsed = JSON.parse(fs.readFileSync(proposalsPath, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

function writeOutputs(proposals, failures) {
  proposals.sort((a, b) => a.id.localeCompare(b.id));
  failures.sort((a, b) => a.id.localeCompare(b.id));

  fs.writeFileSync(proposalsPath, JSON.stringify(proposals, null, 2) + "\n", "utf8");
  fs.writeFileSync(failuresPath, JSON.stringify(failures, null, 2) + "\n", "utf8");

  const changed = proposals.filter((p) => p.changed);

  const changedCsv = [
    ["id","category","old_title","new_title","reason"].join(","),
    ...changed.map((p) => [p.id, p.category, p.old_title, p.new_title, p.reason].map(csvEscape).join(","))
  ].join("\n") + "\n";
  fs.writeFileSync(changedCsvPath, changedCsv, "utf8");

  const review = [
    "CHANGED TITLES ONLY",
    "===================",
    "",
    ...changed.map((p) => [
      `${p.id} (${p.category})`,
      `OLD: ${p.old_title}`,
      `NEW: ${p.new_title}`,
      `REASON: ${p.reason}`,
      ""
    ].join("\n"))
  ].join("\n");

  fs.writeFileSync(reviewPath, review, "utf8");
}

async function main() {
  const existing = readExisting();
  const done = new Set(existing.map((p) => p.id));

  let targets = raw.records.filter((r) => !done.has(r.id));
  if (START_OFFSET > 0) targets = targets.slice(START_OFFSET);
  if (LIMIT && LIMIT > 0) targets = targets.slice(0, LIMIT);

  const proposals = [...existing];
  const failures = fs.existsSync(failuresPath) ? JSON.parse(fs.readFileSync(failuresPath, "utf8")) : [];

  console.log(`Raw records: ${raw.records.length}`);
  console.log(`Existing proposals: ${existing.length}`);
  console.log(`Targets this run: ${targets.length}`);
  console.log(`Model: ${MODEL}`);
  console.log(`Batch size: ${BATCH_SIZE}`);

  let processed = 0;

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);

    try {
      const rawProposals = await callModel(batch);
      const byId = new Map(batch.map((r) => [r.id, r]));

      for (const proposal of rawProposals) {
        const row = byId.get(proposal.id);
        if (!row) throw new Error(`Unexpected proposal id ${proposal.id}`);
        proposals.push(validateProposal(row, proposal));
      }

      processed += batch.length;
      writeOutputs(proposals, failures);
      console.log(`Processed ${processed}/${targets.length}; proposals ${proposals.length}; changed ${proposals.filter((p) => p.changed).length}`);
    } catch (err) {
      console.error(`Batch failed at offset ${i}: ${err.message}`);
      for (const row of batch) failures.push({ id: row.id, title: row.title, error: err.message });
      writeOutputs(proposals, failures);
    }
  }

  writeOutputs(proposals, failures);
  console.log(`Done. Total proposals: ${proposals.length}. Changed: ${proposals.filter((p) => p.changed).length}. Failures: ${failures.length}.`);
  console.log(`Review changed titles only: ${reviewPath}`);
  console.log(`CSV changed titles only: ${changedCsvPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
