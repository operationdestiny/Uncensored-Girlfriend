"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { localizeCharactersProgressively } from "@/lib/client-character-localization";
import { useSiteLanguage } from "@/lib/site-language";
import type { Character } from "@/types/character";

export function useLocalizedCharacters(baseCharacters: Character[]) {
  const { language } = useSiteLanguage();
  const { session, authReady } = useAuth();
  const baseCharactersRef = useRef(baseCharacters);
  baseCharactersRef.current = baseCharacters;

  const [characters, setCharacters] = useState(
    language === "EN" ? baseCharacters : []
  );
  const [loading, setLoading] = useState(language !== "EN");
  const slugsKey = useMemo(
    () => baseCharacters.map((character) => character.slug).join("\u0001"),
    [baseCharacters]
  );

  useEffect(() => {
    const currentBaseCharacters = baseCharactersRef.current;

    if (language === "EN" || !currentBaseCharacters.length) {
      setCharacters(currentBaseCharacters);
      setLoading(false);
      return;
    }

    setCharacters([]);

    if (!authReady) {
      setLoading(true);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    void localizeCharactersProgressively({
      characters: currentBaseCharacters,
      language,
      accessToken: session?.access_token,
      signal: controller.signal,
      onProgress: (localized) => {
        if (!controller.signal.aborted) setCharacters(localized);
      }
    })
      .then((localized) => {
        if (!controller.signal.aborted) setCharacters(localized);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        if (!controller.signal.aborted) {
          setCharacters([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [authReady, language, session?.access_token, slugsKey]);

  return {
    characters,
    language,
    loading
  };
}
