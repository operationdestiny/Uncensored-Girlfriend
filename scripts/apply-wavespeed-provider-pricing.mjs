import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "src", "lib", "evercoin.ts");
let source = fs.readFileSync(target, "utf8");

const imagePattern = /export const EVERCOIN_IMAGE_COST = \d+;/;
if (!imagePattern.test(source)) {
  throw new Error("WAVESPEED_PRICING_IMAGE_COST_NOT_FOUND");
}

source = source.replace(
  imagePattern,
  "export const EVERCOIN_IMAGE_COST = 15;"
);

fs.writeFileSync(target, source, "utf8");
console.log("EVERBOND_WAVESPEED_PRICING image=15EC video=managed-by-final-wavespeed-video-system");
