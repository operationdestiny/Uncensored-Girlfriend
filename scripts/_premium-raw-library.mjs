import fs from "node:fs";
import path from "node:path";

export const CATEGORY_OUTPUTS = [
  { category: "everbond-girls", section: "EverBond Girls", file: "data/characters/everbond-girls.json", expected: 1612 },
  { category: "anime-fantasy", section: "Anime & Fantasy", file: "data/characters/anime-fantasy.json", expected: 668 },
  { category: "everbond-guys", section: "EverBond Guys", file: "data/characters/everbond-guys.json", expected: 200 },
  { category: "public-creations", section: "Public Creations", file: "data/characters/public-creations.json", expected: 384 }
];

export const TOTAL_EXPECTED = 2864;

export function loadEnvFiles(root = process.cwd()) {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;

    const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;

      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();

      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

export function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function sectionToCategory(section = "", id = "") {
  const s = String(section || "").toLowerCase();
  const i = String(id || "").toLowerCase();

  if (s.includes("anime") || s.includes("fantasy") || i.startsWith("everbond-anime-fantasy")) return "anime-fantasy";
  if (s.includes("guys") || i.startsWith("everbond-guys")) return "everbond-guys";
  if (s.includes("public") || i.startsWith("everbond-public-creations")) return "public-creations";
  return "everbond-girls";
}

export function categoryToSection(category) {
  return CATEGORY_OUTPUTS.find((x) => x.category === category)?.section || "EverBond Girls";
}

export function walkRawFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkRawFiles(full));
    else if (/\.(txt|json|jsonl)$/i.test(entry.name)) out.push(full);
  }

  return out.sort();
}

function stripFence(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export function parseJsonFromText(text, sourceFile) {
  const clean = stripFence(text);

  try {
    return JSON.parse(clean);
  } catch {}

  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");

  if (start !== -1 && end > start) {
    const slice = clean.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch (err) {
      throw new Error(`${sourceFile}: found JSON-looking braces but parse failed: ${err.message}`);
    }
  }

  throw new Error(`${sourceFile}: no parseable JSON object found`);
}

export function recordsFromParsed(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    for (const key of ["records", "characters", "data", "items", "results"]) {
      if (Array.isArray(value[key])) return value[key];
    }
    if (value.id) return [value];
  }
  return [];
}

export function readRawRecords(root = process.cwd()) {
  const sourceDir = process.env.CHARACTER_RAW_SOURCE_DIR || process.env.TITLE_SOURCE_DIR || "character output/output/raw";
  const absoluteSource = path.isAbsolute(sourceDir) ? sourceDir : path.join(root, sourceDir);

  if (!fs.existsSync(absoluteSource)) {
    throw new Error(`Raw premium character source folder not found: ${absoluteSource}`);
  }

  const files = walkRawFiles(absoluteSource);
  const byId = new Map();
  const skipped = [];

  for (const file of files) {
    let parsed;
    try {
      const text = fs.readFileSync(file, "utf8");
      parsed = parseJsonFromText(text, file);
    } catch (err) {
      skipped.push({ file, error: err.message });
      continue;
    }

    for (const record of recordsFromParsed(parsed)) {
      if (!record || typeof record !== "object") continue;

      const fallbackId = path.basename(file).replace(/\.(txt|json|jsonl)$/i, "");
      const id = String(record.id || fallbackId);
      if (!id || !record.title) {
        skipped.push({ file, error: "missing id or title" });
        continue;
      }

      if (!byId.has(id)) {
        byId.set(id, {
          ...record,
          id,
          category: record.category || sectionToCategory(record.section, id),
          section: record.section || categoryToSection(sectionToCategory(record.section, id)),
          source_file: file
        });
      }
    }
  }

  return {
    sourceDir: absoluteSource,
    files,
    skipped,
    records: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
    byId
  };
}

export function requiredObject(value, label, id) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${id}: ${label} must be an object`);
  }
}

export function requiredArray(value, label, id) {
  if (!Array.isArray(value)) throw new Error(`${id}: ${label} must be an array`);
}

export function requiredString(value, label, id) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${id}: ${label} must be a non-empty string`);
}

export function validatePremiumRecord(record) {
  const id = record.id || "(missing id)";

  for (const key of [
    "id",
    "name",
    "section",
    "category",
    "image_file",
    "image_url",
    "role",
    "relationship_pace",
    "title",
    "opening_scenario",
    "first_message",
    "relationship_context"
  ]) {
    requiredString(record[key], key, id);
  }

  requiredArray(record.tags, "tags", id);
  requiredObject(record.ai_profile, "ai_profile", id);
  requiredObject(record.feature_flags, "feature_flags", id);
  requiredObject(record.generated_seo, "generated_seo", id);

  // quality_control was part of the premium output. Keep it if present, default it later if not.
  if (record.quality_control !== undefined) requiredObject(record.quality_control, "quality_control", id);

  const category = sectionToCategory(record.section, record.id);
  if (!CATEGORY_OUTPUTS.some((x) => x.category === category)) throw new Error(`${id}: unsupported category ${category}`);

  if (!String(record.image_url || "").startsWith("http")) {
    throw new Error(`${id}: image_url must be an absolute http/https URL from the generated raw output`);
  }
}

export function addDisplayOrder(records) {
  const byCategory = new Map();
  for (const record of records) {
    const category = sectionToCategory(record.section, record.id);
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(record);
  }

  for (const [category, arr] of byCategory.entries()) {
    arr.sort((a, b) => a.id.localeCompare(b.id));

    let ordered = arr;

    // Mix only EverBond Girls so original 0001-0500 are spread through the category.
    if (category === "everbond-girls") {
      const early = arr.slice(0, 500);
      const rest = arr.slice(500);
      ordered = [];

      let earlyIndex = 0;
      let restIndex = 0;
      const pattern = ["rest", "rest", "early", "rest", "rest", "rest", "early"];

      while (earlyIndex < early.length || restIndex < rest.length) {
        for (const token of pattern) {
          if (token === "early") {
            if (earlyIndex < early.length) ordered.push(early[earlyIndex++]);
            else if (restIndex < rest.length) ordered.push(rest[restIndex++]);
          } else {
            if (restIndex < rest.length) ordered.push(rest[restIndex++]);
            else if (earlyIndex < early.length) ordered.push(early[earlyIndex++]);
          }

          if (earlyIndex >= early.length && restIndex >= rest.length) break;
        }
      }
    }

    ordered.forEach((record, index) => {
      record.display_order = index + 1;
    });
  }

  return records;
}

export function normalizeForSiteJson(record) {
  const category = sectionToCategory(record.section, record.id);
  const section = categoryToSection(category);

  const generatedSeo = record.generated_seo && typeof record.generated_seo === "object" ? { ...record.generated_seo } : {};
  if (!generatedSeo.slug || typeof generatedSeo.slug !== "string") {
    generatedSeo.slug = slugify(`${record.name}-${record.title}`);
  }

  return {
    id: String(record.id),
    slug: String(record.slug || generatedSeo.slug),
    name: String(record.name),
    section,
    category,
    image_file: String(record.image_file),
    image_url: String(record.image_url),
    role: String(record.role),
    relationship_pace: String(record.relationship_pace),
    tags: Array.isArray(record.tags) ? record.tags.map(String) : [],
    title: String(record.title),
    opening_scenario: String(record.opening_scenario),
    first_message: String(record.first_message),
    relationship_context: String(record.relationship_context),
    ai_profile: record.ai_profile || {},
    feature_flags: record.feature_flags || {},
    generated_seo: generatedSeo,
    quality_control: record.quality_control || {},
    display_order: Number.isInteger(record.display_order) ? record.display_order : 0
  };
}

export function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
