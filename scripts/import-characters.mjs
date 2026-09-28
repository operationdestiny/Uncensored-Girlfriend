#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  loadEnvFiles,
  CATEGORY_OUTPUTS,
  validatePremiumRecord,
  slugify
} from "./_premium-raw-library.mjs";
import {
  applyCategoryOverride,
  categoryOverrideDelta,
  findCategoryOverride,
  readCategoryOverrides
} from "./_character-category-overrides.mjs";

loadEnvFiles();

const root = process.cwd();

const url =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DRY_RUN =
  String(process.env.CHARACTER_IMPORT_DRY_RUN || "true").toLowerCase() ===
  "true";

const BATCH_SIZE = Number(
  process.env.CHARACTER_IMPORT_BATCH_SIZE || 200
);

const STORAGE_BUCKET =
  process.env.CHARACTER_ASSETS_BUCKET || "character-assets";

const UPLOAD_IMAGES =
  String(process.env.CHARACTER_IMPORT_UPLOAD_IMAGES || "true").toLowerCase() ===
  "true";

const IMAGE_ROOT =
  process.env.CHARACTER_ASSETS_DIR ||
  path.join(root, "public", "character-assets");

const categoryOverrides = readCategoryOverrides(root);

const RETIRED_PATH = path.join(
  root,
  "data",
  "characters",
  "retired-official-characters.json"
);

if (!url || !serviceKey) {
  throw new Error(
    "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
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

const retired = JSON.parse(fs.readFileSync(RETIRED_PATH, "utf8"));
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

function readCategoryFiles() {
  const rows = [];

  for (const cfg of CATEGORY_OUTPUTS) {
    const filePath = path.join(root, cfg.file);

    if (!fs.existsSync(filePath)) {
      throw new Error(
        `Missing ${cfg.file}. Run scripts/build-premium-character-json-from-raw.mjs first.`
      );
    }

    const arr = JSON.parse(fs.readFileSync(filePath, "utf8"));

    if (!Array.isArray(arr)) {
      throw new Error(`${cfg.file} must contain a JSON array`);
    }

    const retiredCount = retiredCountByCategory.get(cfg.category) || 0;
    const activeExpected = cfg.expected - retiredCount;
    const overriddenExpected =
      activeExpected + categoryOverrideDelta(cfg.category, categoryOverrides);

    if (
      arr.length !== cfg.expected &&
      arr.length !== activeExpected &&
      arr.length !== overriddenExpected
    ) {
      throw new Error(
        `${cfg.file}: expected ${cfg.expected} before retirement, ${activeExpected} after retirement, or ${overriddenExpected} after category overrides; got ${arr.length}`
      );
    }

    for (const character of arr) {
      const copy = structuredClone(character);
      const categoryOverride = findCategoryOverride(copy, categoryOverrides);
      applyCategoryOverride(copy, categoryOverride);

      if (
        retiredKeys.has(
          retirementKey(character.category || cfg.category, character.name)
        ) ||
        retiredKeys.has(retirementKey(copy.category, copy.name))
      ) {
        continue;
      }

      rows.push(copy);
    }
  }

  return rows;
}

function contentTypeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";

  return "application/octet-stream";
}

function localImagePathForCharacter(character) {
  const category = character.category;
  return path.join(IMAGE_ROOT, category, character.image_file);
}

function storagePathForCharacter(character) {
  const category = character.category;
  return `${category}/${character.image_file}`;
}

function toDbRow(character, imageUrl) {
  validatePremiumRecord(character);

  const generatedSeo = character.generated_seo || {};
  const slug = String(
    character.slug ||
      generatedSeo.slug ||
      slugify(`${character.name}-${character.title}`)
  );

  const category = character.category;
  const imageStoragePath = storagePathForCharacter(character);

  return {
    id: character.id,
    slug,
    name: character.name,
    section: character.section,
    category,
    role: character.role,
    relationship_pace: character.relationship_pace,
    tags: character.tags,
    title: character.title,
    opening_scenario: character.opening_scenario,
    first_message: character.first_message,
    relationship_context: character.relationship_context,
    ai_profile: character.ai_profile || {},
    feature_flags: character.feature_flags || {},
    generated_seo: generatedSeo,
    quality_control: character.quality_control || {},
    image_file: character.image_file,
    image_storage_bucket: STORAGE_BUCKET,
    image_storage_path: imageStoragePath,
    image_url: imageUrl,
    display_order: Number.isInteger(character.display_order)
      ? character.display_order
      : 0,
    visibility: "public",
    is_public: true,
    official: category !== "public-creations",
    creator_username:
      category === "public-creations" ? null : "everbond",
    is_active: true,
    updated_at: new Date().toISOString()
  };
}

async function ensureBucketExists(supabase) {
  const { data: buckets, error: listError } =
    await supabase.storage.listBuckets();

  if (listError) {
    throw new Error(`Could not list storage buckets: ${listError.message}`);
  }

  const exists = buckets?.some((bucket) => bucket.name === STORAGE_BUCKET);

  if (exists) return;

  const { error } = await supabase.storage.createBucket(STORAGE_BUCKET, {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif"
    ]
  });

  if (error) {
    throw new Error(
      `Could not create storage bucket ${STORAGE_BUCKET}: ${error.message}`
    );
  }

  console.log(`Created storage bucket: ${STORAGE_BUCKET}`);
}

async function uploadCharacterImage(supabase, character) {
  const localPath = localImagePathForCharacter(character);
  const storagePath = storagePathForCharacter(character);

  if (!fs.existsSync(localPath)) {
    throw new Error(
      `Missing image for ${character.id}: ${path.relative(root, localPath)}`
    );
  }

  const fileBuffer = fs.readFileSync(localPath);
  const contentType = contentTypeForFile(localPath);

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType,
      upsert: true,
      cacheControl: "31536000"
    });

  if (uploadError) {
    throw new Error(
      `Image upload failed for ${character.id} (${storagePath}): ${uploadError.message}`
    );
  }

  const { data } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  if (!data?.publicUrl) {
    throw new Error(`Could not get public URL for ${storagePath}`);
  }

  return data.publicUrl;
}

async function main() {
  const sourceRows = readCategoryFiles();

  const ids = new Set();
  const slugs = new Set();

  const sortedSourceRows = sourceRows.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }

    const aOrder = Number.isInteger(a.display_order)
      ? a.display_order
      : 0;
    const bOrder = Number.isInteger(b.display_order)
      ? b.display_order
      : 0;

    return aOrder - bOrder || String(a.id).localeCompare(String(b.id));
  });

  for (const character of sortedSourceRows) {
    validatePremiumRecord(character);

    const generatedSeo = character.generated_seo || {};
    const slug = String(
      character.slug ||
        generatedSeo.slug ||
        slugify(`${character.name}-${character.title}`)
    );

    if (ids.has(character.id)) {
      throw new Error(`Duplicate id: ${character.id}`);
    }
    if (slugs.has(slug)) {
      throw new Error(`Duplicate slug: ${slug}`);
    }

    ids.add(character.id);
    slugs.add(slug);

    const localPath = localImagePathForCharacter(character);
    if (!fs.existsSync(localPath)) {
      throw new Error(
        `Missing image for ${character.id}: ${path.relative(root, localPath)}`
      );
    }
  }

  console.log(
    `Ready to import ${sortedSourceRows.length} active premium characters.`
  );
  console.log(`Retired characters excluded: ${retired.length}`);
  console.log(`Dry run: ${DRY_RUN}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Upload images: ${UPLOAD_IMAGES}`);
  console.log(`Image root: ${IMAGE_ROOT}`);
  console.log(`Storage bucket: ${STORAGE_BUCKET}`);

  const counts = {};
  for (const row of sortedSourceRows) {
    counts[row.category] = (counts[row.category] || 0) + 1;
  }
  console.log("Category counts:", counts);

  if (DRY_RUN) {
    console.log(
      "Dry run complete. Set CHARACTER_IMPORT_DRY_RUN=false to import."
    );
    return;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false }
  });

  await ensureBucketExists(supabase);

  const dbRows = [];

  for (let i = 0; i < sortedSourceRows.length; i += 1) {
    const character = sortedSourceRows[i];

    let imageUrl = character.image_url;

    if (UPLOAD_IMAGES) {
      imageUrl = await uploadCharacterImage(supabase, character);
    }

    dbRows.push(toDbRow(character, imageUrl));

    if ((i + 1) % 100 === 0 || i + 1 === sortedSourceRows.length) {
      console.log(
        `Prepared images/rows ${i + 1}/${sortedSourceRows.length}`
      );
    }
  }

  for (let i = 0; i < dbRows.length; i += BATCH_SIZE) {
    const batch = dbRows.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from("characters")
      .upsert(batch, { onConflict: "id" });

    if (error) throw error;

    console.log(
      `Imported ${Math.min(i + batch.length, dbRows.length)}/${dbRows.length}`
    );
  }

  console.log("Import complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
