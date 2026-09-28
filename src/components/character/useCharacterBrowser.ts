"use client";

import { useEffect, useRef, useState } from "react";
import { localizeCharactersProgressively } from "@/lib/client-character-localization";
import type { LanguageCode } from "@/lib/site-language";
import type { Character, CharacterCategory } from "@/types/character";

export type CharacterBrowserOrder = "highest" | "lowest";

type BrowserSnapshot = {
  characters: Character[];
  sourceCharacters: Character[];
  localizedById: Map<string, Character>;
  category: CharacterCategory;
  query: string;
  tag: string;
  order: CharacterBrowserOrder;
  hasMore: boolean;
  scrollY: number;
  restoreScroll: boolean;
};

type StoredBrowserState = {
  version: 2;
  language: LanguageCode;
  category: CharacterCategory;
  query: string;
  tag: string;
  order: CharacterBrowserOrder;
  loadedCount: number;
  scrollY: number;
  restoreScroll: boolean;
};

const PAGE_SIZE = 50;
const browserMemory = new Map<string, BrowserSnapshot>();

function isCharacterCategory(value: unknown): value is CharacterCategory {
  return (
    value === "everbond-girls" ||
    value === "anime-fantasy" ||
    value === "everbond-guys" ||
    value === "public-creations"
  );
}

function isBrowserOrder(value: unknown): value is CharacterBrowserOrder {
  return value === "highest" || value === "lowest";
}

function defaultOrderForCategory(
  category: CharacterCategory
): CharacterBrowserOrder {
  return category === "everbond-girls" ? "lowest" : "highest";
}

function restoreWindowScroll(scrollY: number) {
  const target = Math.max(Math.trunc(scrollY), 0);
  const timers: number[] = [];

  const restore = () => window.scrollTo({ top: target, left: 0 });

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(restore);
  });

  for (const delay of [50, 150, 300]) {
    timers.push(window.setTimeout(restore, delay));
  }

  return () => timers.forEach((timer) => window.clearTimeout(timer));
}

export function useCharacterBrowser(
  initial: Character[],
  initialCategory: CharacterCategory = "everbond-girls",
  language: LanguageCode = "EN",
  persistenceKey?: string
) {
  const cacheKey = persistenceKey ? `${persistenceKey}:${language}` : "";
  const storedSnapshot = cacheKey ? browserMemory.get(cacheKey) : undefined;
  const initialOrder = defaultOrderForCategory(initialCategory);

  // Homepage and /characters now receive their first page from the server in
  // the exact same default order the browser uses. Keep those characters in
  // the server HTML instead of blanking them and refetching after hydration.
  const requiresInitialReverseLoad = false;

  const [characters, setCharacters] = useState(
    storedSnapshot?.characters ?? (requiresInitialReverseLoad ? [] : initial)
  );
  const [category, setCategoryState] = useState<CharacterCategory>(
    storedSnapshot?.category ?? initialCategory
  );
  const [query, setQuery] = useState(storedSnapshot?.query ?? "");
  const [tag, setTag] = useState(storedSnapshot?.tag ?? "");
  const [order, setOrder] = useState<CharacterBrowserOrder>(
    storedSnapshot?.order ?? initialOrder
  );
  const [hasMore, setHasMore] = useState(
    storedSnapshot?.hasMore ?? initial.length === PAGE_SIZE
  );
  const [loading, setLoading] = useState(
    storedSnapshot ? false : language !== "EN" || requiresInitialReverseLoad
  );
  const [restoreSequence, setRestoreSequence] = useState(0);

  const sourceCharactersRef = useRef<Character[]>(
    storedSnapshot?.sourceCharacters ?? (requiresInitialReverseLoad ? [] : initial)
  );
  const localizedByIdRef = useRef(
    storedSnapshot
      ? new Map(storedSnapshot.localizedById)
      : new Map<string, Character>()
  );
  const requestSequence = useRef(0);
  const firstEffect = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const restoreTargetCountRef = useRef(0);
  const restoreScrollTargetRef = useRef<number | null>(
    storedSnapshot?.restoreScroll ? storedSnapshot.scrollY : null
  );
  const hadStoredSnapshotRef = useRef(Boolean(storedSnapshot));
  const requiresInitialReverseLoadRef = useRef(requiresInitialReverseLoad);

  function sessionStorageKey() {
    return persistenceKey
      ? `everbond-character-browser:${persistenceKey}:${language}`
      : "";
  }

  function clearStoredRestoreFlag() {
    const key = sessionStorageKey();
    if (!key || typeof window === "undefined") return;

    try {
      const raw = window.sessionStorage.getItem(key);
      if (!raw) return;
      const current = JSON.parse(raw) as StoredBrowserState;
      window.sessionStorage.setItem(
        key,
        JSON.stringify({ ...current, restoreScroll: false })
      );
    } catch {
      // A damaged optional session cache should never block Discover.
    }
  }

  function scheduleScrollRestore(scrollY: number) {
    restoreScrollTargetRef.current = null;
    clearStoredRestoreFlag();

    if (cacheKey) {
      const snapshot = browserMemory.get(cacheKey);
      if (snapshot) snapshot.restoreScroll = false;
    }

    return restoreWindowScroll(scrollY);
  }

  async function load(reset: boolean) {
    const requestId = ++requestSequence.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    const existing = reset ? [] : sourceCharactersRef.current;
    const restoreTarget = reset ? restoreTargetCountRef.current : 0;
    const targetCount = reset
      ? Math.max(PAGE_SIZE, restoreTarget)
      : existing.length + PAGE_SIZE;
    const fetchedCharacters: Character[] = [];
    let combined = [...existing];
    let nextHasMore = hasMore;

    try {
      while (combined.length < targetCount) {
        const offset = combined.length;
        const limit = Math.min(PAGE_SIZE, targetCount - offset);
        const params = new URLSearchParams({
          category,
          limit: String(limit),
          offset: String(offset)
        });

        if (query.trim()) params.set("q", query.trim());
        if (tag) params.set("tag", tag);

        const endpoint =
          order === "lowest" ? "/api/characters-lowest" : "/api/characters";
        const response = await fetch(`${endpoint}?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal
        });
        const data = (await response.json().catch(() => ({}))) as {
          characters?: Character[];
          hasMore?: boolean;
        };

        if (
          !response.ok ||
          !Array.isArray(data.characters) ||
          requestId !== requestSequence.current
        ) {
          return;
        }

        const sourcePage = data.characters;
        fetchedCharacters.push(...sourcePage);
        combined = [...combined, ...sourcePage];
        nextHasMore = Boolean(data.hasMore);

        if (!nextHasMore || sourcePage.length === 0) break;
      }

      sourceCharactersRef.current = combined;
      setHasMore(nextHasMore);

      if (reset) localizedByIdRef.current.clear();

      setCharacters(combined);

      if (language !== "EN" && fetchedCharacters.length > 0) {
        const localizedPage = await localizeCharactersProgressively({
          characters: fetchedCharacters,
          language,
          signal: controller.signal,
          onProgress: (localized) => {
            if (requestId !== requestSequence.current) return;

            localized.forEach((character) => {
              localizedByIdRef.current.set(character.id, character);
            });
            setCharacters(
              sourceCharactersRef.current.map(
                (character) =>
                  localizedByIdRef.current.get(character.id) ?? character
              )
            );
          }
        });

        if (requestId !== requestSequence.current) return;

        localizedPage.forEach((character) => {
          localizedByIdRef.current.set(character.id, character);
        });
        setCharacters(
          sourceCharactersRef.current.map(
            (character) =>
              localizedByIdRef.current.get(character.id) ?? character
          )
        );
      }

      if (reset && restoreTarget > 0) {
        restoreTargetCountRef.current = 0;
        const scrollY = restoreScrollTargetRef.current;
        if (scrollY !== null) scheduleScrollRestore(scrollY);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      if (requestId === requestSequence.current) {
        setCharacters(sourceCharactersRef.current);
      }
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!cacheKey) return;

    const previous = browserMemory.get(cacheKey);
    browserMemory.set(cacheKey, {
      characters,
      sourceCharacters: sourceCharactersRef.current,
      localizedById: new Map(localizedByIdRef.current),
      category,
      query,
      tag,
      order,
      hasMore,
      scrollY: previous?.scrollY ?? 0,
      restoreScroll: previous?.restoreScroll ?? false
    });
  }, [cacheKey, category, characters, hasMore, order, query, tag]);

  useEffect(() => {
    if (!persistenceKey || typeof window === "undefined") return;

    if (hadStoredSnapshotRef.current) {
      const scrollY = restoreScrollTargetRef.current;
      if (scrollY !== null) scheduleScrollRestore(scrollY);
      return;
    }

    const key = sessionStorageKey();
    if (!key) return;

    try {
      const raw = window.sessionStorage.getItem(key);
      if (!raw) return;
      const stored = JSON.parse(raw) as Partial<StoredBrowserState>;

      if (
        stored.version !== 2 ||
        stored.language !== language ||
        !stored.restoreScroll ||
        !isCharacterCategory(stored.category) ||
        !isBrowserOrder(stored.order)
      ) {
        return;
      }

      restoreTargetCountRef.current = Math.max(
        Number(stored.loadedCount) || PAGE_SIZE,
        PAGE_SIZE
      );
      restoreScrollTargetRef.current = Math.max(Number(stored.scrollY) || 0, 0);
      setCategoryState(stored.category);
      setQuery(typeof stored.query === "string" ? stored.query : "");
      setTag(typeof stored.tag === "string" ? stored.tag : "");
      setOrder(stored.order);
      setRestoreSequence((current) => current + 1);
    } catch {
      // A damaged optional session cache should never block Discover.
    }
    // This restore is intentionally performed once per mounted browser.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (firstEffect.current) {
      firstEffect.current = false;

      if (hadStoredSnapshotRef.current) return;
      if (
        language === "EN" &&
        restoreSequence === 0 &&
        !requiresInitialReverseLoadRef.current
      ) {
        return;
      }
    }

    const timer = window.setTimeout(() => {
      void load(true);
    }, 250);

    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
    // `load` intentionally reads the latest filter and order state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, query, tag, language, order, restoreSequence]);

  useEffect(() => {
    if (!persistenceKey || typeof window === "undefined") return;

    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    return () => {
      window.history.scrollRestoration = previous;
    };
  }, [persistenceKey]);

  function rememberPosition() {
    if (!persistenceKey || typeof window === "undefined") return;

    const scrollY = window.scrollY;
    const snapshot: BrowserSnapshot = {
      characters,
      sourceCharacters: sourceCharactersRef.current,
      localizedById: new Map(localizedByIdRef.current),
      category,
      query,
      tag,
      order,
      hasMore,
      scrollY,
      restoreScroll: true
    };

    if (cacheKey) browserMemory.set(cacheKey, snapshot);

    const key = sessionStorageKey();
    if (!key) return;

    const stored: StoredBrowserState = {
      version: 2,
      language,
      category,
      query,
      tag,
      order,
      loadedCount: sourceCharactersRef.current.length,
      scrollY,
      restoreScroll: true
    };

    try {
      window.sessionStorage.setItem(key, JSON.stringify(stored));
    } catch {
      // Full session storage should not block navigation to a character.
    }
  }

  function chooseCategory(nextCategory: CharacterCategory) {
    if (cacheKey) {
      const snapshot = browserMemory.get(cacheKey);
      if (snapshot) snapshot.restoreScroll = false;
    }
    clearStoredRestoreFlag();
    restoreTargetCountRef.current = 0;
    restoreScrollTargetRef.current = null;
    setCategoryState(nextCategory);
  }

  function toggleOrder() {
    if (cacheKey) {
      const snapshot = browserMemory.get(cacheKey);
      if (snapshot) snapshot.restoreScroll = false;
    }
    clearStoredRestoreFlag();
    setOrder((current) => (current === "highest" ? "lowest" : "highest"));
  }

  return {
    characters,
    category,
    setCategory: chooseCategory,
    query,
    setQuery,
    tag,
    setTag,
    order,
    toggleOrder,
    hasMore,
    loading,
    loadMore: () => load(false),
    rememberPosition
  };
}
