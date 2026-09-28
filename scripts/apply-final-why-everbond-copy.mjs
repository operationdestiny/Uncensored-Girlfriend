#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const relativePath = "src/app/why-everbond/page.tsx";
const absolutePath = path.join(root, relativePath);

if (!fs.existsSync(absolutePath)) {
  throw new Error(`WHY_EVERBOND_FINAL_COPY_MISSING:${relativePath}`);
}

let source = fs.readFileSync(absolutePath, "utf8");

const LANGUAGES = ["EN", "ES", "FR", "DE", "JA", "KO"];

const COPY = {
  EN: {
    hero:
      "EverBond brings 100% private uncensored private chats, uncensored live calls, uncensored image and video creation, meaningful gifts, and lasting memory into one connected bond—for those who want more freedom, control, depth and quality.",
    unrestrictedTitle:
      "Unrestricted chats through live calls and messages",
    bondTitle: "One bond across every feature",
    bondBody:
      "Chat, calls, images, videos, gifts, and memory all belong to the same companion instead of feeling like disconnected tools.",
    everCoinQuestion: "What is EverCoin?",
    everCoinAnswer:
      "EverCoin is the official EverBond currency for live calls, image generation, video generation, in-chat gifts, and premium character chats."
  },
  ES: {
    hero:
      "EverBond reúne chats 100 % privados y sin censura, llamadas en directo sin censura, creación de imágenes y vídeos sin censura, regalos significativos y memoria duradera en un único vínculo conectado, para quienes quieren más libertad, control, profundidad y calidad.",
    unrestrictedTitle:
      "Chats sin restricciones mediante llamadas en directo y mensajes",
    bondTitle: "Un vínculo en todas las funciones",
    bondBody:
      "Chat, llamadas, imágenes, vídeos, regalos y memoria pertenecen al mismo compañero en lugar de sentirse como herramientas desconectadas.",
    everCoinQuestion: "¿Qué es EverCoin?",
    everCoinAnswer:
      "EverCoin es la moneda oficial de EverBond para llamadas en directo, generación de imágenes, generación de vídeos, regalos dentro del chat y chats premium con personajes."
  },
  FR: {
    hero:
      "EverBond réunit des discussions 100 % privées et non censurées, des appels en direct non censurés, la création d’images et de vidéos non censurées, des cadeaux significatifs et une mémoire durable dans un lien unique, pour ceux qui veulent plus de liberté, de contrôle, de profondeur et de qualité.",
    unrestrictedTitle:
      "Discussions sans restrictions par appels en direct et messages",
    bondTitle: "Un lien dans toutes les fonctions",
    bondBody:
      "Chat, appels, images, vidéos, cadeaux et mémoire appartiennent au même compagnon au lieu de ressembler à des outils séparés.",
    everCoinQuestion: "Qu’est-ce qu’EverCoin ?",
    everCoinAnswer:
      "EverCoin est la monnaie officielle d’EverBond pour les appels en direct, la génération d’images, la génération de vidéos, les cadeaux dans le chat et les discussions premium avec les personnages."
  },
  DE: {
    hero:
      "EverBond verbindet zu 100 % private, unzensierte Chats, unzensierte Live-Anrufe, unzensierte Bild- und Videoerstellung, bedeutungsvolle Geschenke und dauerhaftes Erinnern in einer zusammenhängenden Bindung – für alle, die mehr Freiheit, Kontrolle, Tiefe und Qualität wollen.",
    unrestrictedTitle:
      "Uneingeschränkte Chats über Live-Anrufe und Nachrichten",
    bondTitle: "Eine Bindung über alle Funktionen",
    bondBody:
      "Chat, Anrufe, Bilder, Videos, Geschenke und Erinnerung gehören zum selben Begleiter, statt sich wie getrennte Werkzeuge anzufühlen.",
    everCoinQuestion: "Was ist EverCoin?",
    everCoinAnswer:
      "EverCoin ist die offizielle EverBond-Währung für Live-Anrufe, Bilderstellung, Videoerstellung, Geschenke im Chat und Premium-Charakter-Chats."
  },
  JA: {
    hero:
      "EverBondは、100%非公開で無検閲のプライベートチャット、無検閲のライブ通話、無検閲の画像・動画生成、心のこもったギフト、そして続いていく記憶を一つのつながった絆にまとめます。より多くの自由、コントロール、深さ、品質を求める人のための体験です。",
    unrestrictedTitle:
      "ライブ通話とメッセージで制限のないチャット",
    bondTitle: "すべての機能で一つの絆",
    bondBody:
      "チャット、通話、画像、動画、ギフト、記憶が同じコンパニオンに結びつき、別々のツールにはなりません。",
    everCoinQuestion: "EverCoinとは何ですか？",
    everCoinAnswer:
      "EverCoinは、ライブ通話、画像生成、動画生成、チャット内ギフト、プレミアムキャラクターチャットに使うEverBond公式通貨です。"
  },
  KO: {
    hero:
      "EverBond는 100% 비공개 무검열 채팅, 무검열 실시간 통화, 무검열 이미지 및 영상 생성, 의미 있는 선물, 오래 이어지는 기억을 하나의 연결된 관계로 만듭니다. 더 많은 자유, 통제, 깊이, 품질을 원하는 사람들을 위한 경험입니다.",
    unrestrictedTitle:
      "실시간 통화와 메시지로 제한 없는 채팅",
    bondTitle: "모든 기능에서 하나의 관계",
    bondBody:
      "채팅, 통화, 이미지, 영상, 선물, 기억이 같은 컴패니언에 연결되어 따로 떨어진 도구처럼 느껴지지 않습니다.",
    everCoinQuestion: "EverCoin이란 무엇인가요?",
    everCoinAnswer:
      "EverCoin은 실시간 통화, 이미지 생성, 영상 생성, 채팅 내 선물, 프리미엄 캐릭터 채팅에 사용하는 EverBond 공식 통화입니다."
  }
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceLanguageBlock(container, language, nextLanguage, updater) {
  const marker = `  "${language}": {`;
  const start = container.indexOf(marker);

  if (start < 0) {
    throw new Error(`WHY_EVERBOND_LANGUAGE_MISSING:${language}`);
  }

  let end = container.length;

  if (nextLanguage) {
    const nextMarker = `  "${nextLanguage}": {`;
    const next = container.indexOf(nextMarker, start + marker.length);
    if (next < 0) {
      throw new Error(`WHY_EVERBOND_LANGUAGE_BOUNDARY_MISSING:${language}`);
    }
    end = next;
  }

  const before = container.slice(0, start);
  const block = container.slice(start, end);
  const after = container.slice(end);

  return before + updater(block) + after;
}

function replaceRequired(block, pattern, replacement, label) {
  const next = block.replace(pattern, replacement);

  if (next === block && !block.includes(replacement)) {
    throw new Error(`WHY_EVERBOND_FINAL_COPY_ANCHOR_MISSING:${label}`);
  }

  return next;
}

const whyStart = source.indexOf(
  "const WHY_COPY: Record<LanguageCode, WhyCopy> = {"
);
const faqTypeStart = source.indexOf("type FaqCopy = {");

if (whyStart < 0 || faqTypeStart < 0 || faqTypeStart <= whyStart) {
  throw new Error("WHY_EVERBOND_COPY_SECTION_MISSING");
}

let whySection = source.slice(whyStart, faqTypeStart);

for (let index = 0; index < LANGUAGES.length; index += 1) {
  const language = LANGUAGES[index];
  const nextLanguage = LANGUAGES[index + 1] ?? null;
  const copy = COPY[language];

  whySection = replaceLanguageBlock(
    whySection,
    language,
    nextLanguage,
    (originalBlock) => {
      let block = originalBlock;

      block = replaceRequired(
        block,
        /"heroDescription": "[^"]*"/,
        `"heroDescription": ${JSON.stringify(copy.hero)}`,
        `${language}:hero`
      );

      block = replaceRequired(
        block,
        /("key": "unrestricted-chat",\s*"title": ")[^"]*(")/,
        `$1${copy.unrestrictedTitle}$2`,
        `${language}:unrestricted-title`
      );

      const bondTitle = escapeRegExp(copy.bondTitle);
      block = replaceRequired(
        block,
        new RegExp(
          `("title": "${bondTitle}",\\s*"description": ")[^"]*(")`
        ),
        `$1${copy.bondBody}$2`,
        `${language}:bond-body`
      );

      return block;
    }
  );
}

source =
  source.slice(0, whyStart) +
  whySection +
  source.slice(faqTypeStart);

const faqStart = source.indexOf(
  "const FAQ_COPY: Record<LanguageCode, FaqCopy> = {"
);
const imageLanguageStart = source.indexOf(
  "const IMAGE_LANGUAGE: Record<LanguageCode, string> = {"
);

if (
  faqStart < 0 ||
  imageLanguageStart < 0 ||
  imageLanguageStart <= faqStart
) {
  throw new Error("WHY_EVERBOND_FAQ_SECTION_MISSING");
}

let faqSection = source.slice(faqStart, imageLanguageStart);

for (let index = 0; index < LANGUAGES.length; index += 1) {
  const language = LANGUAGES[index];
  const nextLanguage = LANGUAGES[index + 1] ?? null;
  const copy = COPY[language];

  faqSection = replaceLanguageBlock(
    faqSection,
    language,
    nextLanguage,
    (originalBlock) => {
      let block = originalBlock;
      const question = escapeRegExp(copy.everCoinQuestion);

      block = replaceRequired(
        block,
        new RegExp(
          `("question": "${question}",\\s*"answer": ")[^"]*(")`
        ),
        `$1${copy.everCoinAnswer}$2`,
        `${language}:evercoin-answer`
      );

      return block;
    }
  );
}

source =
  source.slice(0, faqStart) +
  faqSection +
  source.slice(imageLanguageStart);

for (const language of LANGUAGES) {
  const copy = COPY[language];

  for (const [label, expected] of Object.entries({
    hero: copy.hero,
    unrestrictedTitle: copy.unrestrictedTitle,
    bondBody: copy.bondBody,
    everCoinAnswer: copy.everCoinAnswer
  })) {
    if (!source.includes(expected)) {
      throw new Error(
        `WHY_EVERBOND_FINAL_COPY_VALIDATION_FAILED:${language}:${label}`
      );
    }
  }
}

if (
  source.includes(
    "EverCoin is the official EverBond currency for live , image generation"
  )
) {
  throw new Error("WHY_EVERBOND_BROKEN_LIVE_COPY_REMAINS");
}

fs.writeFileSync(absolutePath, source, "utf8");

console.log(
  "EVERBOND_WHY_FINAL_COPY localized=EN,ES,FR,DE,JA,KO hero=updated unrestricted=live-calls+messages bond=calls-included evercoin=live-calls"
);
