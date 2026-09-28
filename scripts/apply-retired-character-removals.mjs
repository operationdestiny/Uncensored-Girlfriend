#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  applyCategoryOverride,
  matchesCategoryOverride,
  readCategoryOverrides
} from "./_character-category-overrides.mjs";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const localOnly = args.has("--local-only");
const remoteOnly = args.has("--remote-only");

if (localOnly && remoteOnly) {
  throw new Error("Use either --local-only or --remote-only, not both.");
}

const runLocal = !remoteOnly;
const runRemote = !localOnly;
const retiredPath = path.join(
  root,
  "data",
  "characters",
  "retired-official-characters.json"
);

function loadEnvFiles() {
  for (const filename of [".env.local", ".env"]) {
    const filePath = path.join(root, filename);
    if (!fs.existsSync(filePath)) continue;

    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;

      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

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

function readRetiredCharacters() {
  if (!fs.existsSync(retiredPath)) {
    throw new Error(`Missing retirement manifest: ${retiredPath}`);
  }

  const value = JSON.parse(fs.readFileSync(retiredPath, "utf8"));
  if (!Array.isArray(value)) {
    throw new Error("retired-official-characters.json must contain an array.");
  }

  const seen = new Set();

  for (const item of value) {
    if (
      !item ||
      typeof item.category !== "string" ||
      typeof item.name !== "string" ||
      typeof item.title !== "string"
    ) {
      throw new Error("Every retired character needs category, name, and title.");
    }

    const key = retirementKey(item.category, item.name);
    if (seen.has(key)) {
      throw new Error(
        `Duplicate retired character: ${item.category} / ${item.name}`
      );
    }
    seen.add(key);
  }

  return value;
}

const retired = readRetiredCharacters();
const retiredByKey = new Map(
  retired.map((item) => [retirementKey(item.category, item.name), item])
);
const categoryOverrides = readCategoryOverrides(root);

function removeLocalCatalogRecords() {
  const categories = [...new Set(retired.map((item) => item.category))];
  const removed = [];

  for (const category of categories) {
    const filePath = path.join(root, "data", "characters", `${category}.json`);
    if (!fs.existsSync(filePath)) {
      console.warn(`Catalog file not present, skipping: ${filePath}`);
      continue;
    }

    const rows = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(rows)) {
      throw new Error(`${filePath} must contain a JSON array.`);
    }

    const kept = [];
    const removedFromCategory = [];

    for (const row of rows) {
      const retiredItem = retiredByKey.get(
        retirementKey(row.category ?? category, row.name)
      );

      if (!retiredItem) {
        kept.push(row);
        continue;
      }

      removed.push(row);
      removedFromCategory.push(row);

      if (
        retiredItem.title &&
        row.title &&
        normalizeText(retiredItem.title) !== normalizeText(row.title)
      ) {
        console.warn(
          `Title wording differs but category/name matched: ${category} / ${row.name}`
        );
      }
    }

    const keptImages = new Set(
      kept.map((row) => String(row.image_file ?? "").trim()).filter(Boolean)
    );

    for (const row of removedFromCategory) {
      const imageFile = String(row.image_file ?? "").trim();
      if (!imageFile || keptImages.has(imageFile)) continue;

      const localImage = path.join(
        root,
        "public",
        "character-assets",
        category,
        imageFile
      );

      if (fs.existsSync(localImage)) {
        fs.rmSync(localImage, { force: true });
        console.log(
          `Removed local image: ${path.relative(root, localImage)}`
        );
      }
    }

    if (kept.length !== rows.length) {
      fs.writeFileSync(filePath, `${JSON.stringify(kept, null, 2)}\n`, "utf8");
      console.log(
        `Removed ${rows.length - kept.length} records from ${path.relative(
          root,
          filePath
        )}`
      );
    }
  }

  const removedKeys = new Set(
    removed.map((row) => retirementKey(row.category, row.name))
  );
  const alreadyAbsent = retired.filter(
    (item) => !removedKeys.has(retirementKey(item.category, item.name))
  );

  console.log(
    `Local catalog cleanup complete: ${removed.length} removed, ${alreadyAbsent.length} already absent.`
  );

  return removed;
}

function readCatalog(category) {
  const filePath = path.join(root, "data", "characters", `${category}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing category catalog: ${filePath}`);
  }

  const rows = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(rows)) {
    throw new Error(`${filePath} must contain a JSON array.`);
  }

  return { filePath, rows };
}

function writeCatalog(filePath, rows) {
  fs.writeFileSync(filePath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
}

function moveLocalCategoryOverrideImage(record, override) {
  const imageFile = String(record.image_file ?? "").trim();
  if (!imageFile) return;

  const sourcePath = path.join(
    root,
    "public",
    "character-assets",
    override.from_category,
    imageFile
  );
  const destinationPath = path.join(
    root,
    "public",
    "character-assets",
    override.to_category,
    imageFile
  );

  if (!fs.existsSync(sourcePath)) {
    if (!fs.existsSync(destinationPath)) {
      console.warn(
        `Category override image was not found locally: ${path.relative(root, sourcePath)}`
      );
    }
    return;
  }

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });

  if (fs.existsSync(destinationPath)) {
    const sourceBytes = fs.readFileSync(sourcePath);
    const destinationBytes = fs.readFileSync(destinationPath);

    if (!sourceBytes.equals(destinationBytes)) {
      throw new Error(
        `Cannot move ${imageFile}: a different destination image already exists.`
      );
    }

    fs.rmSync(sourcePath, { force: true });
  } else {
    fs.renameSync(sourcePath, destinationPath);
  }

  console.log(
    `Moved category image: ${path.relative(root, sourcePath)} -> ${path.relative(root, destinationPath)}`
  );
}

function applyLocalCategoryOverrides() {
  for (const override of categoryOverrides) {
    const source = readCatalog(override.from_category);
    const destination = readCatalog(override.to_category);

    const sourceMatches = source.rows.filter((row) =>
      matchesCategoryOverride(row, override)
    );
    const destinationMatches = destination.rows.filter((row) =>
      matchesCategoryOverride(row, override)
    );
    const totalMatches = sourceMatches.length + destinationMatches.length;

    if (totalMatches !== 1) {
      throw new Error(
        `Expected exactly one category override match for ${override.name}; found ${totalMatches}.`
      );
    }

    const original = structuredClone(
      sourceMatches[0] ?? destinationMatches[0]
    );
    const moved = applyCategoryOverride(structuredClone(original), override);

    const nextSourceRows = source.rows.filter(
      (row) => !matchesCategoryOverride(row, override)
    );
    const nextDestinationRows = destination.rows
      .filter((row) => !matchesCategoryOverride(row, override))
      .concat(moved)
      .sort(
        (a, b) =>
          (Number(a.display_order) || 0) - (Number(b.display_order) || 0) ||
          String(a.id).localeCompare(String(b.id))
      );

    const sourceChanged =
      JSON.stringify(nextSourceRows) !== JSON.stringify(source.rows);
    const destinationChanged =
      JSON.stringify(nextDestinationRows) !== JSON.stringify(destination.rows);

    if (sourceChanged) writeCatalog(source.filePath, nextSourceRows);
    if (destinationChanged) {
      writeCatalog(destination.filePath, nextDestinationRows);
    }

    moveLocalCategoryOverrideImage(original, override);

    console.log(
      sourceMatches.length
        ? `Moved ${override.name} from ${override.from_category} to ${override.to_category}.`
        : `${override.name} is already in ${override.to_category}.`
    );
  }
}

function chunks(values, size = 100) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

function isMissingRelationError(error) {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return (
    text.includes("42p01") ||
    text.includes("does not exist") ||
    text.includes("schema cache")
  );
}

async function removeRemoteCharacters() {
  loadEnvFiles();

  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.warn(
      "Supabase service credentials are unavailable. The deployed runtime cleanup was skipped."
    );
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false }
  });

  const remoteRows = [];

  for (const category of [...new Set(retired.map((item) => item.category))]) {
    const names = retired
      .filter((item) => item.category === category)
      .map((item) => item.name);

    for (const nameBatch of chunks(names, 75)) {
      const { data, error } = await supabase
        .from("characters")
        .select(
          "id,name,title,category,image_storage_bucket,image_storage_path,image_file"
        )
        .eq("category", category)
        .in("name", nameBatch);

      if (error) {
        throw new Error(
          `Could not load retired ${category} characters: ${error.message}`
        );
      }

      remoteRows.push(...(data ?? []));
    }

    for (const nameBatch of chunks(names, 75)) {
      const { error } = await supabase
        .from("characters")
        .update({
          is_public: false,
          is_active: false,
          visibility: "private",
          updated_at: new Date().toISOString()
        })
        .eq("category", category)
        .in("name", nameBatch);

      if (error) {
        throw new Error(
          `Could not hide retired ${category} characters: ${error.message}`
        );
      }
    }
  }

  const uniqueRows = [
    ...new Map(remoteRows.map((row) => [String(row.id), row])).values()
  ];
  const ids = uniqueRows.map((row) => row.id);

  const storageByBucket = new Map();
  for (const row of uniqueRows) {
    const bucket = String(
      row.image_storage_bucket || "character-assets"
    ).trim();
    const storagePath = String(
      row.image_storage_path ||
        `${row.category}/${row.image_file || ""}`
    ).trim();

    if (!storagePath || storagePath.endsWith("/")) continue;
    if (!storageByBucket.has(bucket)) storageByBucket.set(bucket, []);
    storageByBucket.get(bucket).push(storagePath);
  }

  for (const [bucket, paths] of storageByBucket) {
    for (const pathBatch of chunks([...new Set(paths)], 100)) {
      const { error } = await supabase.storage.from(bucket).remove(pathBatch);
      if (error) {
        console.warn(
          `Storage cleanup warning for ${bucket}: ${error.message}`
        );
      }
    }
  }

  if (ids.length) {
    const directCharacterTables = [
      "character_localizations",
      "character_favorites",
      "character_reports",
      "character_share_events",
      "ever_memory",
      "relationship_states",
      "image_unlocks",
      "character_gallery_images",
      "character_gallery_videos",
      "user_character_preferences"
    ];

    for (const table of directCharacterTables) {
      for (const idBatch of chunks(ids, 75)) {
        const { error } = await supabase
          .from(table)
          .delete()
          .in("character_id", idBatch);

        if (error && !isMissingRelationError(error)) {
          console.warn(`${table} cleanup warning: ${error.message}`);
        }
      }
    }

    for (const idBatch of chunks(ids, 75)) {
      const { data: conversations, error: conversationLookupError } =
        await supabase
          .from("conversations")
          .select("id")
          .in("character_id", idBatch);

      if (
        conversationLookupError &&
        !isMissingRelationError(conversationLookupError)
      ) {
        console.warn(
          `Conversation lookup warning: ${conversationLookupError.message}`
        );
        continue;
      }

      const conversationIds = (conversations ?? []).map((row) => row.id);
      for (const conversationBatch of chunks(conversationIds, 75)) {
        const { error: messageError } = await supabase
          .from("messages")
          .delete()
          .in("conversation_id", conversationBatch);
        if (messageError && !isMissingRelationError(messageError)) {
          console.warn(`Message cleanup warning: ${messageError.message}`);
        }

        const { error: conversationError } = await supabase
          .from("conversations")
          .delete()
          .in("id", conversationBatch);
        if (
          conversationError &&
          !isMissingRelationError(conversationError)
        ) {
          console.warn(
            `Conversation cleanup warning: ${conversationError.message}`
          );
        }
      }
    }

    let hardDeleteFailed = false;
    for (const idBatch of chunks(ids, 75)) {
      const { error } = await supabase
        .from("characters")
        .delete()
        .in("id", idBatch);

      if (error) {
        hardDeleteFailed = true;
        console.warn(
          `Hard-delete warning: ${error.message}. The affected rows remain permanently hidden by the retirement migration and cleanup.`
        );
      }
    }

    console.log(
      hardDeleteFailed
        ? `Remote cleanup hid ${ids.length} matching characters; hard deletion was partially blocked by dependent data.`
        : `Remote cleanup permanently deleted ${ids.length} matching characters.`
    );
  } else {
    console.log("Remote cleanup found no remaining matching character rows.");
  }

  const remoteKeys = new Set(
    uniqueRows.map((row) => retirementKey(row.category, row.name))
  );
  const missing = retired.filter(
    (item) => !remoteKeys.has(retirementKey(item.category, item.name))
  );

  console.log(
    `Remote verification: ${uniqueRows.length} matched, ${missing.length} already absent.`
  );
}

async function main() {
  console.log(`Retirement manifest entries: ${retired.length}`);
  console.log(`Category override entries: ${categoryOverrides.length}`);

  if (runLocal) {
    removeLocalCatalogRecords();
    applyLocalCategoryOverrides();
  }
  if (runRemote) await removeRemoteCharacters();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
