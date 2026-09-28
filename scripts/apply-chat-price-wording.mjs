import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "src/lib/evercoin-page-language.ts");
let source = fs.readFileSync(target, "utf8");

const replacements = [
  ['messageRate: "1 EverCoin / 2 messages"', 'messageRate: "2 messages / 1 EverCoin"'],
  ['messageRate: "1 EverCoin / 2 mensajes"', 'messageRate: "2 mensajes / 1 EverCoin"'],
  ['messageRate: "1 EverCoin / 2 Nachrichten"', 'messageRate: "2 Nachrichten / 1 EverCoin"'],
  ['messageRate: "1 EverCoin / 2メッセージ"', 'messageRate: "2メッセージ / 1 EverCoin"'],
  ['messageRate: "1 EverCoin / 메시지 2개"', 'messageRate: "메시지 2개 / 1 EverCoin"'],
  ['messageRate: "1 EverCoin / 5 messages"', 'messageRate: "2 messages / 1 EverCoin"'],
  ['messageRate: "1 EverCoin / 5 mensajes"', 'messageRate: "2 mensajes / 1 EverCoin"'],
  ['messageRate: "1 EverCoin / 5 Nachrichten"', 'messageRate: "2 Nachrichten / 1 EverCoin"'],
  ['messageRate: "1 EverCoin / 5メッセージ"', 'messageRate: "2メッセージ / 1 EverCoin"'],
  ['messageRate: "1 EverCoin / 메시지 5개"', 'messageRate: "메시지 2개 / 1 EverCoin"'],
  ['messageRate: "5 messages / 1 EverCoin"', 'messageRate: "2 messages / 1 EverCoin"'],
  ['messageRate: "5 mensajes / 1 EverCoin"', 'messageRate: "2 mensajes / 1 EverCoin"'],
  ['messageRate: "5 Nachrichten / 1 EverCoin"', 'messageRate: "2 Nachrichten / 1 EverCoin"'],
  ['messageRate: "5メッセージ / 1 EverCoin"', 'messageRate: "2メッセージ / 1 EverCoin"'],
  ['messageRate: "메시지 5개 / 1 EverCoin"', 'messageRate: "메시지 2개 / 1 EverCoin"']
];

for (const [before, after] of replacements) {
  source = source.split(before).join(after);
}

const expected = [
  'messageRate: "2 messages / 1 EverCoin"',
  'messageRate: "2 mensajes / 1 EverCoin"',
  'messageRate: "2 Nachrichten / 1 EverCoin"',
  'messageRate: "2メッセージ / 1 EverCoin"',
  'messageRate: "메시지 2개 / 1 EverCoin"'
];

for (const value of expected) {
  if (!source.includes(value)) {
    throw new Error(`EVERBOND_CHAT_PRICE_WORDING_FAILED:${value}`);
  }
}

fs.writeFileSync(target, source, "utf8");
console.log("EVERBOND_CHAT_PRICE_WORDING buy-evercoin=2-messages-per-1-evercoin");
