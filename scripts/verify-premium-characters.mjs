#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles, CATEGORY_OUTPUTS, TOTAL_EXPECTED } from "./_premium-raw-library.mjs";

loadEnvFiles();

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function countCategory(category) {
  const { count, error } = await supabase
    .from("characters")
    .select("id", { count: "exact", head: true })
    .eq("category", category);

  if (error) throw error;
  return count || 0;
}

async function main() {
  let total = 0;

  for (const cfg of CATEGORY_OUTPUTS) {
    const count = await countCategory(cfg.category);
    total += count;
    console.log(`${count === cfg.expected ? "OK" : "CHECK"} ${cfg.category}: ${count} / expected ${cfg.expected}`);
  }

  console.log(`${total === TOTAL_EXPECTED ? "OK" : "CHECK"} total: ${total} / expected ${TOTAL_EXPECTED}`);

  const { data, error } = await supabase
    .from("characters")
    .select("id,title,image_url,display_order,ai_profile,quality_control")
    .eq("category", "everbond-girls")
    .order("display_order", { ascending: true })
    .limit(12);

  if (error) throw error;

  console.log("\nFirst 12 EverBond Girls by display_order:");
  for (const row of data || []) {
    console.log(`${row.display_order}: ${row.id} — ${row.title}`);
    console.log(`  image: ${row.image_url}`);
  }

  const { data: sample, error: sampleError } = await supabase
    .from("characters")
    .select("id,title,opening_scenario,first_message,ai_profile,feature_flags,generated_seo,quality_control")
    .limit(1)
    .maybeSingle();

  if (sampleError) throw sampleError;
  console.log("\nPremium field sample:");
  console.log({
    id: sample?.id,
    hasOpeningScenario: Boolean(sample?.opening_scenario),
    hasFirstMessage: Boolean(sample?.first_message),
    hasAiProfile: Boolean(sample?.ai_profile && Object.keys(sample.ai_profile).length),
    hasQualityControl: Boolean(sample?.quality_control)
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
