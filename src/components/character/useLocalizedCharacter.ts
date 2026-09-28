"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSiteLanguage } from "@/lib/site-language";
import type { Character } from "@/types/character";

const CHARACTER_LOCALIZATION_TIMEOUT_MS = 15_000;

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

export function isLocalizedCharacterContent(
  baseCharacter: Character,
  candidate: Character
) {
  return localizationComparable(baseCharacter) !== localizationComparable(candidate);
}

export function useLocalizedCharacter(baseCharacter: Character) {
  const { language } = useSiteLanguage();
  const { session, authReady } = useAuth();
  const baseCharacterRef = useRef(baseCharacter);
  baseCharacterRef.current = baseCharacter;

  const [character, setCharacter] = useState(baseCharacter);
  const [loading, setLoading] = useState(language !== "EN");
  const [localized, setLocalized] = useState(language === "EN");
  const characterKey = useMemo(
    () => `${baseCharacter.id}:${baseCharacter.slug}`,
    [baseCharacter.id, baseCharacter.slug]
  );

  useEffect(() => {
    const currentBaseCharacter = baseCharacterRef.current;
    setCharacter(currentBaseCharacter);

    if (language === "EN") {
      setLocalized(true);
      setLoading(false);
      return;
    }

    setLocalized(false);

    if (!authReady) {
      setLoading(true);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);

    const timeout = window.setTimeout(
      () => controller.abort(),
      CHARACTER_LOCALIZATION_TIMEOUT_MS
    );

    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    void fetch(
      `/api/characters/${encodeURIComponent(
        currentBaseCharacter.slug
      )}?language=${encodeURIComponent(language)}`,
      {
        headers,
        cache: "no-store",
        signal: controller.signal
      }
    )
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload?.character) {
          throw new Error("CHARACTER_LOCALIZATION_FAILED");
        }

        const candidate = payload.character as Character;
        const translated = isLocalizedCharacterContent(
          currentBaseCharacter,
          candidate
        );

        if (!cancelled && translated) {
          setCharacter(candidate);
          setLocalized(true);
        }
      })
      .catch((error) => {
        if (
          error instanceof DOMException &&
          error.name === "AbortError" &&
          cancelled
        ) {
          return;
        }

        if (!cancelled) {
          setCharacter(currentBaseCharacter);
          setLocalized(false);
        }
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [authReady, characterKey, language, session?.access_token]);

  return {
    character,
    language,
    loading,
    localized
  };
}
