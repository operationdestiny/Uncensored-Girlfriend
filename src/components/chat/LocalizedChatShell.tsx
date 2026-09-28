"use client";

import { useEffect, useState } from "react";
import { ChatShell } from "@/components/chat/ChatShell";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  isLocalizedCharacterContent,
  useLocalizedCharacter
} from "@/components/character/useLocalizedCharacter";
import styles from "@/components/character/DesktopCharacterLayout.module.css";
import { FINAL_LOCALIZATION_COPY } from "@/lib/final-localization-language";
import type { Character } from "@/types/character";

export function LocalizedChatShell({
  character: baseCharacter
}: {
  character: Character;
}) {
  const {
    character: localizedCharacter,
    language,
    loading,
    localized
  } = useLocalizedCharacter(baseCharacter);
  const { session, authReady } = useAuth();
  const [character, setCharacter] = useState(localizedCharacter);
  const copy = FINAL_LOCALIZATION_COPY[language] ?? FINAL_LOCALIZATION_COPY.EN;

  useEffect(() => {
    if (language === "EN" || localized) {
      setCharacter(localizedCharacter);
    }

    if (
      !authReady ||
      !session?.access_token ||
      (language !== "EN" && !localized)
    ) {
      return;
    }

    const controller = new AbortController();

    void fetch(
      `/api/characters/${encodeURIComponent(
        localizedCharacter.slug
      )}?language=${encodeURIComponent(language)}`,
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        },
        cache: "no-store",
        signal: controller.signal
      }
    )
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload?.character) return;
        const candidate = payload.character as Character;

        if (
          language === "EN" ||
          isLocalizedCharacterContent(baseCharacter, candidate)
        ) {
          setCharacter(candidate);
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      });

    return () => controller.abort();
  }, [
    authReady,
    baseCharacter,
    language,
    localized,
    localizedCharacter,
    session?.access_token
  ]);

  if (language !== "EN" && (loading || !localized)) {
    return (
      <main className="flex h-[calc(100dvh-64px)] items-center justify-center px-4">
        <section className="w-full max-w-2xl rounded-[2rem] border border-bond-rose/35 bg-white/[0.035] p-8 text-center shadow-[0_0_34px_rgba(255,92,168,0.08)]">
          <p
            className={
              loading
                ? "animate-pulse text-bond-muted"
                : "text-bond-muted"
            }
          >
            {loading ? copy.translatingCharacter : copy.translationUnavailable}
          </p>
        </section>
      </main>
    );
  }

  return (
    <div className={`${styles.chatPage} everbond-chat-page`}>
      <ChatShell
        key={`${character.id}:${language}:${character.tagline}`}
        character={character}
      />
    </div>
  );
}
