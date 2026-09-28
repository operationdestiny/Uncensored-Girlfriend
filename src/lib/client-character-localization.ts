import type { LanguageCode } from "@/lib/site-language";
import { FINAL_LOCALIZATION_COPY } from "@/lib/final-localization-language";
import type { Character } from "@/types/character";

const CLIENT_BATCH_SIZE = 8;
const CLIENT_CONCURRENCY = 2;
const CLIENT_REQUEST_TIMEOUT_MS = 15_000;

function localizationComparable(character: Character) {
  return JSON.stringify({
    archetype: character.archetype,
    role: character.role,
    tagline: character.tagline,
    title: character.title,
    description: character.description,
    openingScenario: character.openingScenario,
    openingMessage: character.openingMessage,
    firstMessage: character.firstMessage,
    relationshipContext: character.relationshipContext,
    relationshipPace: character.relationshipPace,
    tags: character.tags,
    card: character.card
  });
}

function hasLocalizedContent(source: Character, candidate: Character) {
  return localizationComparable(source) !== localizationComparable(candidate);
}

function chunksOf<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

export function localizedCharacterFallback(
  character: Character,
  language: Exclude<LanguageCode, "EN">
): Character {
  const placeholder = FINAL_LOCALIZATION_COPY[language].translationUnavailable;

  return {
    ...character,
    archetype: placeholder,
    role: placeholder,
    tagline: placeholder,
    title: placeholder,
    description: placeholder,
    openingScenario: placeholder,
    openingMessage: placeholder,
    firstMessage: placeholder,
    relationshipContext: placeholder,
    relationshipPace: placeholder,
    tags: character.tags.includes("Ever Memory™") ? ["Ever Memory™"] : [],
    card: {
      ...character.card,
      personality: placeholder,
      tone: placeholder,
      speechStyle: placeholder,
      motivations: placeholder,
      boundaries: placeholder,
      relationshipStyle: placeholder,
      worldContext: placeholder,
      exampleDialogue: []
    }
  };
}

async function fetchBatch(
  characters: Character[],
  language: Exclude<LanguageCode, "EN">,
  options: {
    accessToken?: string | null;
    signal?: AbortSignal;
  }
) {
  if (options.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();

  options.signal?.addEventListener("abort", abortFromParent, { once: true });

  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, CLIENT_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("/api/character-localizations", {
      method: "POST",
      headers,
      body: JSON.stringify({
        slugs: characters.map((character) => character.slug),
        language
      }),
      cache: "no-store",
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !Array.isArray(payload?.characters)) {
      throw new Error(
        payload?.message || payload?.error || "CHARACTER_LOCALIZATION_FAILED"
      );
    }

    const returned = payload.characters as Character[];
    const returnedById = new Map(
      returned.map((character) => [character.id, character])
    );

    return characters.map((source) => {
      const candidate = returnedById.get(source.id);
      return candidate && hasLocalizedContent(source, candidate)
        ? candidate
        : localizedCharacterFallback(source, language);
    });
  } catch (error) {
    if (timedOut && !options.signal?.aborted) {
      throw new Error("CHARACTER_LOCALIZATION_TIMEOUT");
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromParent);
  }
}

export async function localizeCharactersProgressively(options: {
  characters: Character[];
  language: Exclude<LanguageCode, "EN">;
  accessToken?: string | null;
  signal?: AbortSignal;
  onProgress: (localized: Character[]) => void;
}) {
  const batches = chunksOf(options.characters, CLIENT_BATCH_SIZE);
  const localizedById = new Map<string, Character>();

  for (let index = 0; index < batches.length; index += CLIENT_CONCURRENCY) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const group = batches.slice(index, index + CLIENT_CONCURRENCY);
    const results = await Promise.allSettled(
      group.map((batch) =>
        fetchBatch(batch, options.language, {
          accessToken: options.accessToken,
          signal: options.signal
        })
      )
    );

    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    results.forEach((result, groupIndex) => {
      if (result.status === "fulfilled") {
        result.value.forEach((character) => {
          localizedById.set(character.id, character);
        });
        return;
      }

      for (const character of group[groupIndex] ?? []) {
        localizedById.set(
          character.id,
          localizedCharacterFallback(character, options.language)
        );
      }
    });

    options.onProgress(
      options.characters.map(
        (character) =>
          localizedById.get(character.id) ??
          localizedCharacterFallback(character, options.language)
      )
    );
  }

  return options.characters.map(
    (character) =>
      localizedById.get(character.id) ??
      localizedCharacterFallback(character, options.language)
  );
}
