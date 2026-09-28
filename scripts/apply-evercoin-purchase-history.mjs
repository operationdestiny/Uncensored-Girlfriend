import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, relativePath), source, "utf8");
}

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;

  if (!source.includes(from)) {
    throw new Error(`EVERBOND_PURCHASE_HISTORY_MISSING:${label}`);
  }

  return source.replace(from, to);
}

const relativePath = "src/components/my-bond/MyBondDashboard.tsx";
let source = read(relativePath);

const purchaseImport =
  'import { EverCoinPurchaseHistory } from "@/components/my-bond/EverCoinPurchaseHistory";';

if (!source.includes(purchaseImport)) {
  source = replaceRequired(
    source,
    'import { MyCompanionActions, type UpdatedCompanion } from "@/components/my-bond/MyCompanionActions";',
    'import { MyCompanionActions, type UpdatedCompanion } from "@/components/my-bond/MyCompanionActions";\n' + purchaseImport,
    "purchase-history-import"
  );
}

const oldPurchaseBlock = `            <div className="rounded-[2rem] border border-white/10 bg-white/[0.025] p-6 md:p-8">
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-bond-rose">
                {copy.purchaseHistory}
              </p>
              <div className="mt-6 rounded-[1.5rem] border border-dashed border-white/10 p-6 text-center">
                <p className="font-semibold text-white">
                  {copy.noPurchases}
                </p>
                <p className="mt-2 text-sm leading-6 text-bond-muted">
                  {copy.purchasesWillAppear}
                </p>
              </div>
            </div>`;

if (!source.includes("<EverCoinPurchaseHistory session={session} />")) {
  source = replaceRequired(
    source,
    oldPurchaseBlock,
    "            <EverCoinPurchaseHistory session={session} />",
    "purchase-history-placeholder"
  );
}

write(relativePath, source);

const verified = read(relativePath);

if (
  !verified.includes(purchaseImport) ||
  !verified.includes("<EverCoinPurchaseHistory session={session} />")
) {
  throw new Error("EVERBOND_PURCHASE_HISTORY_VALIDATION_FAILED");
}

console.log("EverBond My Bond EverCoin purchase history applied.");
