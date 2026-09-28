"use client";

import { CharacterProfileShell } from "@/components/character/CharacterProfileShell";
import styles from "@/components/character/DesktopCharacterLayout.module.css";
import { useLocalizedCharacter } from "@/components/character/useLocalizedCharacter";
import { FINAL_LOCALIZATION_COPY } from "@/lib/final-localization-language";
import type { Character } from "@/types/character";

export function LocalizedCharacterProfileShell({
  character: baseCharacter
}: {
  character: Character;
}) {
  const { character, language, loading, localized } =
    useLocalizedCharacter(baseCharacter);
  const copy = FINAL_LOCALIZATION_COPY[language] ?? FINAL_LOCALIZATION_COPY.EN;

  if (language !== "EN" && (loading || !localized)) {
    return (
      <main className="min-h-[calc(100vh-64px)] px-4 py-10 md:px-6">
        <section className="mx-auto max-w-2xl rounded-[2rem] border border-bond-rose/35 bg-white/[0.035] p-8 text-center shadow-[0_0_34px_rgba(255,92,168,0.08)]">
          <p className={loading ? "animate-pulse text-bond-muted" : "text-bond-muted"}>
            {loading ? copy.translatingCharacter : copy.translationUnavailable}
          </p>
        </section>
      </main>
    );
  }

  return (
    <div className={styles.profilePage}>
      <CharacterProfileShell
        key={`${character.id}:${language}`}
        character={character}
      />
    </div>
  );
}
