#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const relativePath = "src/lib/dropp-payments.ts";
const absolutePath = path.join(root, relativePath);

const FINAL_BUNDLES = [
  {
    code: "ec500",
    coins: 500,
    amountMinor: 499,
    linkName: "500 EverCoin",
    shareLinkId: "link_uC6mIKmFxIR6lmy9Rekx",
    shareUrl:
      "https://app.dropp.fans/en/external/share/link/link_uC6mIKmFxIR6lmy9Rekx/?c=ocjJPyjE"
  },
  {
    code: "ec1000",
    coins: 1000,
    amountMinor: 999,
    linkName: "1000 EverCoin",
    shareLinkId: "link_LDIW1x1ZWFgebBf9Dqit",
    shareUrl:
      "https://app.dropp.fans/en/external/share/link/link_LDIW1x1ZWFgebBf9Dqit/?c=kJt4n9Cy"
  },
  {
    code: "ec5000",
    coins: 5000,
    amountMinor: 4999,
    linkName: "5000 EverCoin",
    shareLinkId: "link_H41eGpEcC7ov838WDqaF",
    shareUrl:
      "https://app.dropp.fans/en/external/share/link/link_H41eGpEcC7ov838WDqaF/?c=hcZvCLIh"
  }
];

if (!fs.existsSync(absolutePath)) {
  throw new Error(`DROPP_PAYMENT_FILE_MISSING:${relativePath}`);
}

let source = fs.readFileSync(absolutePath, "utf8");

const bundleBlock =
  "export const DROPP_EVERCOIN_BUNDLES = [\n" +
  FINAL_BUNDLES.map(
    (bundle) => `  {
    code: ${JSON.stringify(bundle.code)},
    coins: ${bundle.coins},
    amountMinor: ${bundle.amountMinor},
    linkName: ${JSON.stringify(bundle.linkName)},
    shareLinkId: ${JSON.stringify(bundle.shareLinkId)},
    shareUrl: ${JSON.stringify(bundle.shareUrl)}
  }`
  ).join(",\n") +
  "\n] as const;";

const pattern =
  /export const DROPP_EVERCOIN_BUNDLES = \[[\s\S]*?\n\] as const;/;

if (!pattern.test(source)) {
  throw new Error("DROPP_BUNDLE_BLOCK_NOT_FOUND");
}

source = source.replace(pattern, bundleBlock);

for (const bundle of FINAL_BUNDLES) {
  if (!source.includes(`amountMinor: ${bundle.amountMinor}`)) {
    throw new Error(`DROPP_PRICE_PATCH_FAILED:${bundle.code}`);
  }
  if (!source.includes(`linkName: ${JSON.stringify(bundle.linkName)}`)) {
    throw new Error(`DROPP_LINK_NAME_PATCH_FAILED:${bundle.code}`);
  }
  if (!source.includes(bundle.shareLinkId)) {
    throw new Error(`DROPP_SHARE_LINK_ID_PATCH_FAILED:${bundle.code}`);
  }
  if (!source.includes(bundle.shareUrl)) {
    throw new Error(`DROPP_SHARE_URL_PATCH_FAILED:${bundle.code}`);
  }
}

fs.writeFileSync(absolutePath, source, "utf8");

console.log(
  "EVERBOND_DROPP_FINAL 500EC=$4.99 1000EC=$9.99 5000EC=$49.99 new-payment-links=preserved"
);
