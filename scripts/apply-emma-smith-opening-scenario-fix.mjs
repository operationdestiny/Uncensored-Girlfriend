#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const localOnly = args.has("--local-only");
const remoteOnly = args.has("--remote-only");

if (localOnly && remoteOnly) {
  throw new Error("Use either --local-only or --remote-only, not both.");
}

const runLocal = !remoteOnly;
const runRemote = !localOnly;

const target = {
  id: "everbond-girls-0001",
  slug: "emma-smith-your-campus-crush-finally-lets-you-get-close",
  name: "Emma Smith",
  category: "everbond-girls"
};

const oldScenario = "You’ve seen Emma across lecture halls and in the student union, always composed in her black tops and bold red lipstick, surrounded by people but oddly untouchable. Today, after a long seminar, you find her waiting just outside the building, fingers brushing the silver pendant at her throat as if she’s steadying herself. When she spots you, her bright blue eyes soften in a way you’ve never seen, like she’s decided something. The crowd thins until it’s just the two of you and the warm hum of campus in the background, and Emma quietly asks if you’ll walk her back, as if it matters more than she’s willing to admit.";
const newScenario = "You’ve seen Emma across lecture halls and in the student union, always composed in her black tops and bold red lipstick, surrounded by people but oddly untouchable. Today, after a long seminar, you find her waiting just outside the building, fingers brushing the silver pendant at her throat as if she’s steadying herself. When she spots you, her bright blue eyes soften in a way you’ve never seen, like she’s decided something. The crowd thins until it’s just the two of you and the warm hum of campus in the background.";

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

function findEmma(rows) {
  const matches = rows.filter(
    (row) =>
      row?.id === target.id &&
      row?.slug === target.slug &&
      row?.name === target.name &&
      row?.category === target.category
  );

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one Emma Smith catalog record; found ${matches.length}.`
    );
  }

  return matches[0];
}

function applyLocalFix() {
  const filePath = path.join(
    root,
    "data",
    "characters",
    "everbond-girls.json"
  );

  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing character catalog: ${filePath}`);
  }

  const source = fs.readFileSync(filePath, "utf8");
  const rowsBefore = JSON.parse(source);

  if (!Array.isArray(rowsBefore)) {
    throw new Error(`${filePath} must contain a JSON array.`);
  }

  const emmaBefore = findEmma(rowsBefore);
  const firstMessageBefore = emmaBefore.first_message;

  if (emmaBefore.opening_scenario === newScenario) {
    console.log("Emma Smith opening scenario is already correct locally.");
    return;
  }

  if (emmaBefore.opening_scenario !== oldScenario) {
    throw new Error(
      "Emma Smith opening scenario does not match the expected original text."
    );
  }

  const occurrences = source.split(oldScenario).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `Expected the original Emma Smith scenario once; found ${occurrences} occurrences.`
    );
  }

  const nextSource = source.replace(oldScenario, newScenario);
  const rowsAfter = JSON.parse(nextSource);
  const emmaAfter = findEmma(rowsAfter);

  if (emmaAfter.opening_scenario !== newScenario) {
    throw new Error("Emma Smith opening scenario verification failed.");
  }

  if (emmaAfter.first_message !== firstMessageBefore) {
    throw new Error("Emma Smith first message changed unexpectedly.");
  }

  fs.writeFileSync(filePath, nextSource, "utf8");
  console.log("Updated Emma Smith opening scenario locally.");
}

async function applyRemoteFix() {
  loadEnvFiles();

  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.warn(
      "Supabase service credentials are unavailable. Emma Smith remote update was skipped."
    );
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false }
  });

  const { data: before, error: loadError } = await supabase
    .from("characters")
    .select("id,slug,name,category,opening_scenario,first_message")
    .eq("id", target.id)
    .eq("slug", target.slug)
    .eq("name", target.name)
    .eq("category", target.category)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Could not load Emma Smith: ${loadError.message}`);
  }

  if (!before) {
    throw new Error("Emma Smith was not found in Supabase.");
  }

  const firstMessageBefore = before.first_message;

  if (before.opening_scenario === newScenario) {
    console.log("Emma Smith opening scenario is already correct in Supabase.");
    return;
  }

  if (before.opening_scenario !== oldScenario) {
    throw new Error(
      "Emma Smith Supabase scenario does not match the expected original text."
    );
  }

  const { data: after, error: updateError } = await supabase
    .from("characters")
    .update({ opening_scenario: newScenario })
    .eq("id", before.id)
    .eq("opening_scenario", oldScenario)
    .select("opening_scenario,first_message")
    .single();

  if (updateError) {
    throw new Error(`Could not update Emma Smith: ${updateError.message}`);
  }

  if (after.opening_scenario !== newScenario) {
    throw new Error("Emma Smith Supabase scenario verification failed.");
  }

  if (after.first_message !== firstMessageBefore) {
    throw new Error("Emma Smith first message changed unexpectedly in Supabase.");
  }

  console.log("Updated Emma Smith opening scenario in Supabase.");
}

async function main() {
  if (runLocal) applyLocalFix();
  if (runRemote) await applyRemoteFix();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
