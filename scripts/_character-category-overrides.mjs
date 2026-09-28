import fs from "node:fs";
import path from "node:path";

export function normalizeCharacterText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function readCategoryOverrides(root = process.cwd()) {
  const filePath = path.join(
    root,
    "data",
    "characters",
    "category-overrides.json"
  );

  if (!fs.existsSync(filePath)) return [];

  const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(value)) {
    throw new Error("category-overrides.json must contain an array.");
  }

  const seen = new Set();

  for (const item of value) {
    for (const key of [
      "name",
      "title",
      "from_category",
      "to_category",
      "to_section"
    ]) {
      if (typeof item?.[key] !== "string" || !item[key].trim()) {
        throw new Error(`Every category override needs ${key}.`);
      }
    }

    const identity = `${normalizeCharacterText(item.name)}\u0000${normalizeCharacterText(item.title)}`;
    if (seen.has(identity)) {
      throw new Error(`Duplicate category override: ${item.name}`);
    }
    seen.add(identity);
  }

  return value;
}

export function matchesCategoryOverride(record, override) {
  return (
    normalizeCharacterText(record?.name) ===
      normalizeCharacterText(override.name) &&
    normalizeCharacterText(record?.title) ===
      normalizeCharacterText(override.title)
  );
}

export function findCategoryOverride(record, overrides) {
  return overrides.find((override) =>
    matchesCategoryOverride(record, override)
  );
}

export function applyCategoryOverride(record, override) {
  if (!override) return record;

  record.category = override.to_category;
  record.section = override.to_section;
  return record;
}

export function categoryOverrideDelta(category, overrides) {
  let delta = 0;

  for (const override of overrides) {
    if (override.from_category === category) delta -= 1;
    if (override.to_category === category) delta += 1;
  }

  return delta;
}
