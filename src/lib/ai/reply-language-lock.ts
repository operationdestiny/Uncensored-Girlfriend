export type ChatReplyLanguage =
  | "English"
  | "Spanish"
  | "French"
  | "German"
  | "Japanese"
  | "Korean";

const ENGLISH_MARKERS = new Set([
  "the",
  "you",
  "your",
  "yours",
  "are",
  "with",
  "this",
  "that",
  "what",
  "when",
  "where",
  "why",
  "how",
  "have",
  "has",
  "was",
  "were",
  "will",
  "would",
  "could",
  "should",
  "want",
  "need",
  "mine",
  "come",
  "here",
  "look",
  "tell",
  "give",
  "let"
]);

const SPANISH_MARKERS = new Set([
  "que",
  "pero",
  "porque",
  "quiero",
  "quieres",
  "eres",
  "estás",
  "estoy",
  "aquí",
  "ahora",
  "contigo",
  "también",
  "para",
  "desde",
  "cuando",
  "donde"
]);

const FRENCH_MARKERS = new Set([
  "je",
  "tu",
  "vous",
  "avec",
  "pour",
  "mais",
  "parce",
  "suis",
  "êtes",
  "veux",
  "ici",
  "maintenant",
  "très",
  "quand",
  "comme",
  "dans"
]);

const GERMAN_MARKERS = new Set([
  "ich",
  "du",
  "dein",
  "deine",
  "mein",
  "meine",
  "mit",
  "für",
  "aber",
  "weil",
  "bist",
  "bin",
  "nicht",
  "hier",
  "jetzt",
  "willst",
  "wenn",
  "dich",
  "mich"
]);

const OBVIOUS_ENGLISH_PHRASE =
  /\b(?:you are|you're|i am|i'm|i want|i need|come here|look at me|do you|are you|with me|for you|my love|don't|can't|won't|let me|tell me|give me|what are|how are)\b/i;

function words(text: string) {
  return (
    text
      .toLocaleLowerCase()
      .match(/[\p{L}]+(?:['’][\p{L}]+)?/gu) ?? []
  );
}

function markerCount(tokens: string[], markers: Set<string>) {
  return tokens.reduce(
    (total, token) => total + (markers.has(token) ? 1 : 0),
    0
  );
}

function scriptCount(text: string, pattern: RegExp) {
  return text.match(pattern)?.length ?? 0;
}

function targetLatinScore(
  tokens: string[],
  language: ChatReplyLanguage
) {
  if (language === "Spanish") {
    return markerCount(tokens, SPANISH_MARKERS);
  }

  if (language === "French") {
    return markerCount(tokens, FRENCH_MARKERS);
  }

  if (language === "German") {
    return markerCount(tokens, GERMAN_MARKERS);
  }

  return 0;
}

export function buildReplyLanguageLock(
  language: ChatReplyLanguage
) {
  return [
    "LANGUAGE_SELECTOR_OUTPUT_LOCK",
    `The EverBond language selector for this turn is ${language}. This selection is authoritative.`,
    `Write every visible sentence, action, narration, and line of dialogue in ${language}.`,
    "Do not infer or change the reply language from the user's individual words, names, pet names, loanwords, quoted terms, previous chat history, opening message, character profile, or stored memory.",
    "A foreign word or affectionate term inside a message does not change the selected reply language.",
    language === "English"
      ? 'For example, an English user saying a word such as "princesa" still receives an English reply.'
      : `Even if earlier conversation text is English, the new visible reply must be in ${language}.`,
    "Proper names may remain as written. Otherwise keep the visible reply in the selected language only.",
    "Do not mention this language rule to the user."
  ].join("\n");
}

export function buildReplyLanguageRetry(
  language: ChatReplyLanguage
) {
  return [
    "LANGUAGE_RETRY_CORRECTION",
    `The previous draft used the wrong language or mixed languages. Rewrite the same in-character beat entirely in ${language}.`,
    `Keep the same meaning, character personality, scene, tone, and action, but make all visible prose and dialogue ${language}.`,
    "Do not explain the correction and do not mention language settings."
  ].join("\n");
}

export function replyNeedsLanguageRetry(
  text: string,
  language: ChatReplyLanguage
) {
  const normalized = text.trim();
  if (!normalized) return false;

  const tokens = words(normalized);
  const englishScore = markerCount(tokens, ENGLISH_MARKERS);
  const japaneseCount = scriptCount(
    normalized,
    /[\u3040-\u30ff]/g
  );
  const koreanCount = scriptCount(
    normalized,
    /[\uac00-\ud7af]/g
  );

  if (language === "English") {
    if (japaneseCount >= 3 || koreanCount >= 3) {
      return true;
    }

    const foreignScores = [
      markerCount(tokens, SPANISH_MARKERS),
      markerCount(tokens, FRENCH_MARKERS),
      markerCount(tokens, GERMAN_MARKERS)
    ];

    return (
      Math.max(...foreignScores) >= 4 &&
      englishScore <= 1
    );
  }

  const obviousEnglish = OBVIOUS_ENGLISH_PHRASE.test(normalized);

  if (language === "Japanese") {
    return (
      obviousEnglish ||
      (japaneseCount === 0 && tokens.length >= 3 && englishScore >= 2)
    );
  }

  if (language === "Korean") {
    return (
      obviousEnglish ||
      (koreanCount === 0 && tokens.length >= 3 && englishScore >= 2)
    );
  }

  const targetScore = targetLatinScore(tokens, language);

  return (
    (obviousEnglish && englishScore >= 2) ||
    (englishScore >= 4 && englishScore > targetScore + 1)
  );
}
