#!/usr/bin/env node
import { loadEnvFiles, readRawRecords, validatePremiumRecord, sectionToCategory, TOTAL_EXPECTED } from "./_premium-raw-library.mjs";

loadEnvFiles();
const raw = readRawRecords();

console.log(`Raw source folder: ${raw.sourceDir}`);
console.log(`Raw files found: ${raw.files.length}`);
console.log(`Raw records parsed: ${raw.records.length}`);
console.log(`Skipped files: ${raw.skipped.length}`);

const counts = {};
const errors = [];

for (const record of raw.records) {
  try {
    validatePremiumRecord(record);
  } catch (err) {
    errors.push(err.message);
  }
  const category = sectionToCategory(record.section, record.id);
  counts[category] = (counts[category] || 0) + 1;
}

console.log("Category counts:", counts);
console.log(`Expected total: ${TOTAL_EXPECTED}`);

console.log("\nFirst 8 parsed raw records:");
for (const record of raw.records.slice(0, 8)) {
  console.log(`${record.id}: ${record.title}`);
  console.log(`  image: ${record.image_url}`);
  console.log(`  source: ${record.source_file}`);
}

if (raw.skipped.length) {
  console.log("\nFirst skipped files:");
  for (const item of raw.skipped.slice(0, 20)) {
    console.log(`${item.file}`);
    console.log(`  ${item.error}`);
  }
}

if (errors.length) {
  console.log("\nValidation errors:");
  for (const err of errors.slice(0, 50)) console.log(`- ${err}`);
  throw new Error(`Raw validation failed with ${errors.length} errors.`);
}

if (raw.records.length !== TOTAL_EXPECTED) {
  throw new Error(`Expected ${TOTAL_EXPECTED} raw records, found ${raw.records.length}`);
}

console.log("\nRaw premium character source looks valid.");
