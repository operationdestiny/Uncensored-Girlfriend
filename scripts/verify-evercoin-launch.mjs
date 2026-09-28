import fs from "node:fs";
import path from "node:path";

const retiredRuntimePaths = [
  "src/app/api/ad-free",
  "src/app/api/ads",
  "src/app/api/free-chat/ad-access",
  "src/components/chat/AdFreeToggle.tsx",
  "src/components/chat/AdSupportRequiredCard.tsx",
  "src/components/chat/AdsterraChatAd.tsx",
  "src/components/chat/ExoClickChatAd.tsx",
  "src/components/chat/RewardedChatGate.tsx",
  "src/components/chat/TrafficStarsInterstitialGate.tsx",
  "src/components/chat/TrafficStarsMasterSpot.tsx",
  "src/components/money/AdsterraRevenueCard.tsx",
  "src/components/money/TrafficStarsFinancePanel.tsx",
  "src/lib/adsterra-publisher.ts",
  "src/lib/rewarded-chat.ts",
  "src/lib/trafficstars-ad-access.ts",
  "src/lib/trafficstars-finance.ts"
];
for (const rel of retiredRuntimePaths) {
  if (fs.existsSync(rel)) throw new Error(`Retired ad runtime path exists: ${rel}`);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

for (const file of walk("src")) {
  if (!/\.(?:ts|tsx|js|jsx)$/.test(file)) continue;
  const source = fs.readFileSync(file, "utf8");
  if (/exoclick|trafficstars|adsterra|REWARDED_AD_REQUIRED|\/api\/ads|\/api\/ad-free|free-chat\/ad-access/i.test(source)) {
    throw new Error(`Retired ad vendor/runtime wiring restored in ${file}`);
  }
}

const chat = fs.readFileSync("src/components/chat/ChatShell.tsx", "utf8");
if (!chat.includes('data?.error === "INSUFFICIENT_EVERCOIN"') || !chat.includes('data?.error === "EVERCOIN_DEBT"')) {
  throw new Error("Chat gate is not tied to insufficient EverCoin/debt responses.");
}

const gate = fs.readFileSync("src/components/chat/EverCoinChatGate.tsx", "utf8");
if (!gate.includes("Continue with KissCoins") || /watch\s+ad|advert/i.test(gate)) {
  throw new Error("EverCoin gate contains retired ad copy or is missing EverCoin CTA.");
}

/*
 * The Buy EverCoin page is marketing copy, so it does not need to repeat the
 * introductory 20-message trial. Verify only the approved public copy/rate.
 * The actual 20-free + 3-EC/19-message billing invariants are verified below
 * against the launch SQL, which is the charging source of truth.
 */
const coins = fs.readFileSync("src/lib/evercoin-page-language.ts", "utf8");
for (const required of [
  "Use KissCoins for uncensored live calls, gifts, companion images, companion videos, chat and more.",
  'messagesTitle: "Chat"',
  "Unlock uncensored private chat with 1000s of premium companions.",
  'messageRate: "≈ 15 EC / 100 messages"',
  'messageRate: "≈ 15 EC / 100 mensajes"',
  'messageRate: "≈ 15 EC / 100 Nachrichten"',
  'messageRate: "≈ 15 EC / 100メッセージ"',
  'messageRate: "≈ 15 EC / 메시지 100개"'
]) {
  if (!coins.includes(required)) {
    throw new Error(`EverCoin page copy/rate is missing approved public wording: ${required}`);
  }
}

const money = fs.readFileSync("src/app/money/page.tsx", "utf8");
if (!money.includes("paidChatMessagesRemaining") || !money.includes("chatBlockProviderReserveUsd")) {
  throw new Error("Money page is missing paid-chat obligation reserves.");
}

const sql = fs.readFileSync("supabase/manual/evercoin-chat-launch.sql", "utf8");
for (const required of [
  "trial_message_limit=20",
  "coins<3",
  "left_paid:=19",
  "chatBlockProviderReserveUsd",
  "paidChatMessagesRemaining"
]) {
  if (!sql.includes(required)) throw new Error(`Launch SQL missing invariant: ${required}`);
}

if (!/charge_evercoin\([\s\S]*?p_user_id,[\s\S]*?\b3\b,[\s\S]*?'chat_message'/.test(sql)) {
  throw new Error("Launch SQL no longer charges exactly 3 EC for a chat block.");
}

console.log("EverCoin-only launch verified: 20 free in billing, 3 EC/19 paid messages, ≈15 EC/100-message public display rate, approved Buy EverCoin copy, no ad runtime, Money chat reserve present.");
