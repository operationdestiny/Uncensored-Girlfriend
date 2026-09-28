#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const localOnly = args.has("--local-only");

const catalogPath = path.join(
  root,
  "data",
  "characters",
  "everbond-girls.json"
);

const placementPairs = [
  ["Kamila Brighton", "Payton Neal"],
  ["Maeve Morales", "Nicole Wise"]
];

function loadEnvFiles() {
  for (const filename of [".env.local", ".env"]) {
    const filePath = path.join(root, filename);
    if (!fs.existsSync(filePath)) continue;

    for (
      const line of fs
        .readFileSync(filePath, "utf8")
        .split(/\r?\n/)
    ) {
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

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

function integerDisplayOrder(row) {
  const value = Number(row?.display_order);

  if (!Number.isSafeInteger(value)) {
    throw new Error(
      `${row?.name ?? "Unknown character"} has an invalid display_order.`
    );
  }

  return value;
}

function loadPlacementTargets() {
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`Missing character catalog: ${catalogPath}`);
  }

  const catalog = JSON.parse(
    fs.readFileSync(catalogPath, "utf8")
  );

  if (!Array.isArray(catalog)) {
    throw new Error(
      `${catalogPath} must contain a JSON array.`
    );
  }

  const byName = new Map();

  for (const row of catalog) {
    if (typeof row?.name !== "string") continue;

    if (byName.has(row.name)) {
      throw new Error(
        `Duplicate character name in catalog: ${row.name}`
      );
    }

    byName.set(row.name, row);
  }

  const targets = [];

  for (const [leftName, rightName] of placementPairs) {
    const left = byName.get(leftName);
    const right = byName.get(rightName);

    if (!left || !right) {
      throw new Error(
        `Could not find placement pair: ${leftName} / ${rightName}`
      );
    }

    for (const row of [left, right]) {
      if (
        typeof row.id !== "string" ||
        !row.id ||
        typeof row.slug !== "string" ||
        !row.slug ||
        typeof row.opening_scenario !== "string" ||
        !row.opening_scenario
      ) {
        throw new Error(
          `${row.name} is missing required catalog identity data.`
        );
      }
    }

    const leftOrder = integerDisplayOrder(left);
    const rightOrder = integerDisplayOrder(right);

    if (leftOrder === rightOrder) {
      throw new Error(
        `${leftName} and ${rightName} already share the same display_order.`
      );
    }

    targets.push(
      {
        id: left.id,
        slug: left.slug,
        name: left.name,
        openingScenario: left.opening_scenario,
        sourceOrder: leftOrder,
        targetOrder: rightOrder
      },
      {
        id: right.id,
        slug: right.slug,
        name: right.name,
        openingScenario: right.opening_scenario,
        sourceOrder: rightOrder,
        targetOrder: leftOrder
      }
    );
  }

  if (new Set(targets.map((item) => item.id)).size !== 4) {
    throw new Error(
      "The placement swap must resolve to four distinct characters."
    );
  }

  if (
    new Set(targets.map((item) => item.targetOrder)).size !== 4
  ) {
    throw new Error(
      "The placement swap must resolve to four distinct target positions."
    );
  }

  return targets;
}

function printTargets(targets) {
  for (const target of targets) {
    console.log(
      `${target.name}: ${target.sourceOrder} -> ${target.targetOrder}`
    );
  }
}

async function applyRemoteTargets(targets) {
  loadEnvFiles();

  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.warn(
      "Supabase service credentials are unavailable. Character placement updates were skipped."
    );
    return;
  }

  const { createClient } = await import(
    "@supabase/supabase-js"
  );

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false }
  });

  const targetIds = targets.map((item) => item.id);

  const { data: beforeRows, error: loadError } =
    await supabase
      .from("characters")
      .select(
        "id,slug,name,opening_scenario,display_order"
      )
      .in("id", targetIds);

  if (loadError) {
    throw new Error(
      `Could not load character placements: ${loadError.message}`
    );
  }

  if ((beforeRows ?? []).length !== targets.length) {
    throw new Error(
      `Expected ${targets.length} placement records in Supabase; found ${(beforeRows ?? []).length}.`
    );
  }

  const remoteById = new Map(
    beforeRows.map((row) => [row.id, row])
  );

  for (const target of targets) {
    const remote = remoteById.get(target.id);

    if (
      !remote ||
      remote.slug !== target.slug ||
      remote.name !== target.name ||
      remote.opening_scenario !== target.openingScenario
    ) {
      throw new Error(
        `${target.name} does not match its catalog identity in Supabase.`
      );
    }
  }

  const alreadyCorrect = targets.every(
    (target) =>
      Number(remoteById.get(target.id)?.display_order) ===
      target.targetOrder
  );

  if (alreadyCorrect) {
    console.log(
      "Character visual placement swaps are already correct in Supabase."
    );
    return;
  }

  const { data: maximumRows, error: maximumError } =
    await supabase
      .from("characters")
      .select("display_order")
      .not("display_order", "is", null)
      .order("display_order", { ascending: false })
      .limit(1);

  if (maximumError) {
    throw new Error(
      `Could not determine a temporary display order: ${maximumError.message}`
    );
  }

  const maximumOrder = Number(
    maximumRows?.[0]?.display_order ?? 0
  );

  if (!Number.isSafeInteger(maximumOrder)) {
    throw new Error(
      "The maximum character display_order is invalid."
    );
  }

  // Move all four records out of their current slots first. This
  // remains safe even when display_order has a uniqueness rule.
  const temporaryBase = maximumOrder + 10_000;

  for (const [index, target] of targets.entries()) {
    const temporaryOrder = temporaryBase + index + 1;

    const { error } = await supabase
      .from("characters")
      .update({ display_order: temporaryOrder })
      .eq("id", target.id)
      .eq("slug", target.slug);

    if (error) {
      throw new Error(
        `Could not temporarily move ${target.name}: ${error.message}`
      );
    }
  }

  // Apply absolute catalog-derived targets. Re-running this script
  // always produces the same result and never toggles the pairs.
  for (const target of targets) {
    const { error } = await supabase
      .from("characters")
      .update({ display_order: target.targetOrder })
      .eq("id", target.id)
      .eq("slug", target.slug);

    if (error) {
      throw new Error(
        `Could not place ${target.name}: ${error.message}`
      );
    }
  }

  const { data: afterRows, error: verifyError } =
    await supabase
      .from("characters")
      .select("id,slug,name,display_order")
      .in("id", targetIds);

  if (verifyError) {
    throw new Error(
      `Could not verify character placements: ${verifyError.message}`
    );
  }

  const afterById = new Map(
    (afterRows ?? []).map((row) => [row.id, row])
  );

  for (const target of targets) {
    const after = afterById.get(target.id);

    if (
      !after ||
      after.slug !== target.slug ||
      after.name !== target.name ||
      Number(after.display_order) !== target.targetOrder
    ) {
      throw new Error(
        `${target.name} placement verification failed.`
      );
    }
  }

  console.log(
    "Swapped Kamila Brighton with Payton Neal and Maeve Morales with Nicole Wise."
  );
}

async function main() {
  const targets = loadPlacementTargets();

  if (localOnly) {
    printTargets(targets);
    return;
  }

  await applyRemoteTargets(targets);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
