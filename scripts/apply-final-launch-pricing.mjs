import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(path.join(root, relativePath), source, "utf8");
}

function replaceRegex(source, pattern, replacement, label) {
  const next = source.replace(pattern, replacement);
  if (next === source && !source.includes(replacement)) {
    throw new Error(`FINAL_LAUNCH_PRICING_MISSING:${label}`);
  }
  return next;
}

function replaceText(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`FINAL_LAUNCH_PRICING_MISSING:${label}`);
  }
  return source.replace(before, after);
}

// FINAL RUNTIME SOURCE OF TRUTH.
// This script intentionally runs LAST in predev/prebuild so older migration
// scripts cannot restore previous EverCoin prices.
{
  const relativePath = "src/lib/evercoin.ts";
  let source = read(relativePath);

  source = replaceRegex(
    source,
    /export function everCoinCallCostPerMinute\(\) \{[\s\S]*?\n\}/,
    `export function everCoinCallCostPerMinute() {
  return 69;
}`,
    "call-rate"
  );

  source = replaceRegex(
    source,
    /export const EVERCOIN_IMAGE_COST = \d+;/,
    "export const EVERCOIN_IMAGE_COST = 10;",
    "image-cost"
  );

  source = replaceRegex(
    source,
    /export const EVERCOIN_VIDEO_COST = \d+;/,
    "export const EVERCOIN_VIDEO_COST = 40;",
    "video-cost"
  );

  write(relativePath, source);
}

// The final WaveSpeed installer creates this file earlier in the same build.
// Patch the actual Video Studio charge after every earlier installer.
{
  const relativePath = "src/lib/wavespeed-video.ts";
  let source = read(relativePath);

  source = replaceRegex(
    source,
    /export const VIDEO_EVERCOIN_COST = \d+;/,
    "export const VIDEO_EVERCOIN_COST = 40;",
    "wavespeed-video-cost"
  );

  write(relativePath, source);
}

// Buy EverCoin defaults. The pricing API remains the live source of truth;
// these values also prevent old prices flashing before the API request returns.
{
  const relativePath = "src/app/coins/page.tsx";
  let source = read(relativePath);

  source = replaceRegex(
    source,
    /const \[callCost, setCallCost\] = useState\(\d+\);/,
    "const [callCost, setCallCost] = useState(69);",
    "coins-call-default"
  );

  source = replaceRegex(
    source,
    /const \[imageCost, setImageCost\] = useState\(\d+\);/,
    "const [imageCost, setImageCost] = useState(10);",
    "coins-image-default"
  );

  source = replaceRegex(
    source,
    /const \[videoCost, setVideoCost\] = useState\(\d+\);/,
    "const [videoCost, setVideoCost] = useState(40);",
    "coins-video-default"
  );

  write(relativePath, source);
}

// Make the user-facing call explanation match the actual proration behavior.
{
  const relativePath = "src/lib/evercoin-page-language.ts";
  let source = read(relativePath);

  const replacements = [
    [
      `    voiceCallsBody:
      "Say what you actually mean. Explore romance, intimacy, fantasy, comfort, conflict, and roleplay without refusals or watered-down replies.",`,
      `    voiceCallsBody:
      "Calls are 69 EverCoin per minute, prorated to the actual call time, so short calls only cost their share of a minute.",`
    ],
    [
      `    voiceCallsBody:
      "Di lo que realmente quieres decir. Explora romance, intimidad, fantasía, consuelo, conflicto y rol sin rechazos ni respuestas diluidas.",`,
      `    voiceCallsBody:
      "Las llamadas cuestan 69 EverCoin por minuto y se prorratean según el tiempo real de la llamada, por lo que las llamadas cortas solo cuestan su parte del minuto.",`
    ],
    [
      `    voiceCallsBody:
      "Dites ce que vous pensez vraiment. Explorez la romance, l’intimité, la fantaisie, le réconfort, le conflit et le jeu de rôle sans refus ni réponses édulcorées.",`,
      `    voiceCallsBody:
      "Les appels coûtent 69 EverCoin par minute et sont facturés au prorata de la durée réelle de l’appel, de sorte qu’un appel court ne coûte que sa part de minute.",`
    ],
    [
      `    voiceCallsBody:
      "Sag, was du wirklich meinst. Erlebe Romantik, Intimität, Fantasie, Trost, Konflikte und Rollenspiel ohne Ablehnungen oder verwässerte Antworten.",`,
      `    voiceCallsBody:
      "Anrufe kosten 69 EverCoin pro Minute und werden nach der tatsächlichen Anrufdauer anteilig berechnet, sodass kurze Anrufe nur ihren Minutenanteil kosten.",`
    ],
    [
      `    voiceCallsBody:
      "本当に言いたいことを伝えましょう。拒否や薄められた返答なしで、ロマンス、親密さ、ファンタジー、癒やし、対立、ロールプレイを楽しめます。",`,
      `    voiceCallsBody:
      "通話は1分あたり69 EverCoinで、実際の通話時間に応じて按分されるため、短い通話は利用した時間分だけ課金されます。",`
    ],
    [
      `    voiceCallsBody:
      "정말 하고 싶은 말을 하세요. 거절이나 약해진 답변 없이 로맨스, 친밀함, 판타지, 위로, 갈등, 역할극을 즐길 수 있습니다.",`,
      `    voiceCallsBody:
      "통화는 분당 69 EverCoin이며 실제 통화 시간에 따라 비례 청구되므로 짧은 통화는 사용한 시간만큼만 청구됩니다.",`
    ]
  ];

  replacements.forEach(([before, after], index) => {
    source = replaceText(source, before, after, `call-copy-${index}`);
  });

  write(relativePath, source);
}

// Keep the legal billing description aligned with actual final billing.
{
  const relativePath = "src/app/legal/page.tsx";
  let source = read(relativePath);

  const replacements = [
    [
      `  EN: "Voice calls are charged in EverCoin on a per-minute basis at the rate displayed for the call, with charges applied as the call begins and continues.",`,
      `  EN: "Voice calls are priced in EverCoin at the displayed per-minute rate and are prorated according to the actual call duration. EverBond may reserve up to the current minute’s amount while a call is active and automatically reconcile the final charge after the call ends.",`
    ],
    [
      `  ES: "Las llamadas de voz se cobran en EverCoin por minuto a la tarifa mostrada para la llamada, y los cargos se aplican al comenzar la llamada y mientras continúa.",`,
      `  ES: "Las llamadas de voz tienen un precio en EverCoin según la tarifa por minuto mostrada y se prorratean según la duración real de la llamada. EverBond puede reservar hasta el importe del minuto actual mientras la llamada está activa y conciliar automáticamente el cargo final al terminar.",`
    ],
    [
      `  FR: "Les appels vocaux sont facturés en EverCoin à la minute, au tarif affiché pour l’appel, les frais étant appliqués au début de l’appel et pendant sa poursuite.",`,
      `  FR: "Les appels vocaux sont tarifés en EverCoin selon le tarif par minute affiché et sont facturés au prorata de la durée réelle de l’appel. EverBond peut réserver jusqu’au montant de la minute en cours pendant l’appel et rapprocher automatiquement le montant final après la fin de l’appel.",`
    ],
    [
      `  DE: "Sprachanrufe werden pro Minute in EverCoin zu dem für den Anruf angezeigten Tarif berechnet; die Gebühren fallen mit Beginn des Anrufs und während seiner Fortsetzung an.",`,
      `  DE: "Sprachanrufe werden in EverCoin zum angezeigten Minutenpreis berechnet und nach der tatsächlichen Anrufdauer anteilig abgerechnet. EverBond kann während eines aktiven Anrufs bis zum Betrag der laufenden Minute reservieren und die endgültige Gebühr nach dem Anruf automatisch abgleichen.",`
    ],
    [
      `  JA: "音声通話は、通話に表示される料金に基づき、1分ごとにEverCoinで課金され、通話の開始時および継続中に料金が適用されます。",`,
      `  JA: "音声通話は表示された1分あたりのEverCoin料金に基づき、実際の通話時間に応じて按分されます。通話中は現在の1分分までの金額をEverBondが一時的に確保し、通話終了後に最終料金を自動的に精算する場合があります。",`
    ],
    [
      `  KO: "음성 통화는 통화에 표시된 요율에 따라 분 단위로 EverCoin이 청구되며, 통화가 시작되고 계속되는 동안 요금이 적용됩니다."`,
      `  KO: "음성 통화는 표시된 분당 EverCoin 요율에 따라 가격이 책정되며 실제 통화 시간에 비례해 청구됩니다. 통화 중에는 EverBond가 현재 1분에 해당하는 금액까지 임시로 예약하고 통화 종료 후 최종 요금을 자동 정산할 수 있습니다."`
    ]
  ];

  replacements.forEach(([before, after], index) => {
    source = replaceText(source, before, after, `legal-call-copy-${index}`);
  });

  write(relativePath, source);
}


// Money dashboard wording: call-minute rows are temporary safety-reserve blocks.
// Final user EverCoin billing is prorated to the authoritative Retell duration.
{
  const relativePath = "src/app/money/page.tsx";
  let source = read(relativePath);

  source = replaceText(
    source,
    `                Live calls reserve money immediately. Finished calls replace that safety reserve with Retell's actual reported call cost plus a conservative Venice custom-LLM reserve.`,
    `                Live calls temporarily reserve each started minute for safety. Final EverCoin billing is prorated to the actual call duration, while finished calls replace the provider safety reserve with Retell's actual reported call cost plus a conservative Venice custom-LLM reserve.`,
    "money-voice-description"
  );

  source = replaceText(
    source,
    `            <Metric icon={PhoneCall} label="Billed call minutes" value={whole(voice.billedMinutes)} compact />`,
    `            <Metric icon={PhoneCall} label="Reserved call-minute blocks" value={whole(voice.billedMinutes)} compact />`,
    "money-reserved-call-minutes"
  );

  source = replaceText(
    source,
    `            An unreconciled call is not treated as free. Every started minute stays on the higher temporary safety reserve until Retell's completed-call cost is available, so a delayed Retell response cannot inflate Safe to withdraw.`,
    `            An unreconciled call is not treated as free. Every started minute stays on the higher temporary provider-cost safety reserve until Retell's completed-call cost is available. The user's EverCoin charge is separately reconciled to actual call duration, so a delayed Retell response cannot inflate Safe to withdraw.`,
    "money-unreconciled-call-copy"
  );

  source = replaceText(
    source,
    `            <p>• Every billed call minute creates a provider-cost safety reserve.</p>`,
    `            <p>• Every started call minute creates a temporary provider-cost safety reserve; user EverCoin is prorated to actual call duration.</p>`,
    "money-safeguard-call-copy"
  );

  write(relativePath, source);
}

const evercoin = read("src/lib/evercoin.ts");
const wavespeedVideo = read("src/lib/wavespeed-video.ts");
const coins = read("src/app/coins/page.tsx");
const pageCopy = read("src/lib/evercoin-page-language.ts");
const legal = read("src/app/legal/page.tsx");
const moneyPage = read("src/app/money/page.tsx");

for (const [label, ok] of [
  ["call=69", evercoin.includes("everCoinCallCostPerMinute() {\n  return 69;")],
  ["image=10", evercoin.includes("EVERCOIN_IMAGE_COST = 10")],
  ["video=40", evercoin.includes("EVERCOIN_VIDEO_COST = 40")],
  ["wavespeed-video=40", wavespeedVideo.includes("VIDEO_EVERCOIN_COST = 40")],
  ["coins-call=69", coins.includes("useState(69)")],
  ["coins-image=10", coins.includes("useState(10)")],
  ["coins-video=40", coins.includes("useState(40)")],
  ["coins-call-dynamic", coins.includes("`${callCost} EverCoin / ${pageCopy.minuteUnit}`")],
  ["coins-image-dynamic", coins.includes("`${imageCost} EverCoin / ${pageCopy.imageUnit}`")],
  ["coins-video-dynamic", coins.includes("`${videoCost} EverCoin / ${pageCopy.videoUnit}`")],
  ["call-proration-visible", pageCopy.includes("prorated to the actual call time")],
  ["call-proration-legal", legal.includes("prorated according to the actual call duration")],
  ["money-proration-copy", moneyPage.includes("Reserved call-minute blocks") && moneyPage.includes("user EverCoin is prorated to actual call duration")]
]) {
  if (!ok) {
    throw new Error(`FINAL_LAUNCH_PRICING_VALIDATION_FAILED:${label}`);
  }
}

console.log(
  "EVERBOND_LAUNCH_PRICING message=1EC call=69EC/min-prorated image=10EC video=40EC visual-copy=updated"
);
