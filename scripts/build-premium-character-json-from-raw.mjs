#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  loadEnvFiles,
  readRawRecords,
  validatePremiumRecord,
  addDisplayOrder,
  normalizeForSiteJson,
  CATEGORY_OUTPUTS,
  TOTAL_EXPECTED
} from "./_premium-raw-library.mjs";
import {
  applyCategoryOverride,
  categoryOverrideDelta,
  findCategoryOverride,
  readCategoryOverrides
} from "./_character-category-overrides.mjs";

loadEnvFiles();

const root = process.cwd();
const outDir = path.join(root, "output", "clean-character-reset");
const proposalsPath = path.join(outDir, "title-trim-proposals.json");
const retiredPath = path.join(
  root,
  "data",
  "characters",
  "retired-official-characters.json"
);
const APPLY_TITLE_TRIM =
  String(process.env.APPLY_TITLE_TRIM || "false").toLowerCase() === "true";

const backupDir = path.join(outDir, "backups");
fs.mkdirSync(backupDir, { recursive: true });

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function retirementKey(category, name) {
  return `${String(category)}\u0000${normalizeText(name)}`;
}

const retired = JSON.parse(fs.readFileSync(retiredPath, "utf8"));
const retiredKeys = new Set(
  retired.map((item) => retirementKey(item.category, item.name))
);
const retiredCountByCategory = new Map();
for (const item of retired) {
  retiredCountByCategory.set(
    item.category,
    (retiredCountByCategory.get(item.category) || 0) + 1
  );
}

const categoryOverrides = readCategoryOverrides(root);
const raw = readRawRecords();
if (raw.records.length !== TOTAL_EXPECTED) {
  throw new Error(
    `Expected ${TOTAL_EXPECTED} raw records, found ${raw.records.length}`
  );
}

const proposalById = new Map();
if (fs.existsSync(proposalsPath)) {
  const proposals = JSON.parse(fs.readFileSync(proposalsPath, "utf8"));
  for (const p of proposals) {
    if (p.changed && p.new_title) proposalById.set(p.id, p);
  }
}

const normalized = [];

for (const record of raw.records) {
  const copy = structuredClone(record);
  const categoryOverride = findCategoryOverride(copy, categoryOverrides);
  applyCategoryOverride(copy, categoryOverride);
  validatePremiumRecord(copy);

  if (
    retiredKeys.has(retirementKey(record.category, record.name)) ||
    retiredKeys.has(retirementKey(copy.category, copy.name))
  ) {
    continue;
  }
  const proposal = proposalById.get(copy.id);

  if (APPLY_TITLE_TRIM && proposal) {
    copy.title = proposal.new_title;
  }

  normalized.push(copy);
}

addDisplayOrder(normalized);

const siteRows = normalized.map(normalizeForSiteJson);
const byCategory = new Map();

for (const row of siteRows) {
  if (!byCategory.has(row.category)) byCategory.set(row.category, []);
  byCategory.get(row.category).push(row);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");

for (const cfg of CATEGORY_OUTPUTS) {
  const targetPath = path.join(root, cfg.file);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  if (fs.existsSync(targetPath)) {
    fs.copyFileSync(
      targetPath,
      path.join(backupDir, `${path.basename(cfg.file)}.${stamp}.bak`)
    );
  }

  const arr = (byCategory.get(cfg.category) || []).sort(
    (a, b) =>
      (a.display_order || 0) - (b.display_order || 0) ||
      a.id.localeCompare(b.id)
  );
  const expected =
    cfg.expected -
    (retiredCountByCategory.get(cfg.category) || 0) +
    categoryOverrideDelta(cfg.category, categoryOverrides);

  if (arr.length !== expected) {
    throw new Error(`${cfg.category}: expected ${expected}, got ${arr.length}`);
  }

  fs.writeFileSync(
    targetPath,
    `${JSON.stringify(arr, null, 2)}\n`,
    "utf8"
  );
  console.log(`Wrote ${arr.length} records: ${cfg.file}`);
}

const manifest = {
  source: raw.sourceDir,
  total: siteRows.length,
  retired_characters_excluded: retired.length,
  category_overrides_applied: categoryOverrides.length,
  title_trim_applied: APPLY_TITLE_TRIM,
  changed_titles_available: proposalById.size,
  categories: Object.fromEntries(
    CATEGORY_OUTPUTS.map((cfg) => [
      cfg.category,
      (byCategory.get(cfg.category) || []).length
    ])
  ),
  everbond_girls_order:
    "mixed deterministic display_order; original 0001-0500 spread through category",
  generated_at: new Date().toISOString()
};

fs.writeFileSync(
  path.join(root, "data", "characters", "PREMIUM_LIBRARY_MANIFEST.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

console.log(`Backups saved in ${backupDir}`);
console.log(`Retired characters excluded: ${retired.length}`);
console.log(`Title trim applied: ${APPLY_TITLE_TRIM}`);
console.log("Fresh premium site JSON is ready.");
