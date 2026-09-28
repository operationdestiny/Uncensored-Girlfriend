"use client";

import { CharacterCard } from "@/components/character/CharacterCard";
import { useLocalizedCharacters } from "@/components/character/useLocalizedCharacters";
import { useSiteLanguage } from "@/lib/site-language";
import { MY_BOND_COPY } from "@/lib/my-bond-language";
import { DISCOVER_COPY } from "@/lib/discover-language";
import type { Character } from "@/types/character";

export function CreatorPublicPage({
  username,
  characters: baseCharacters
}: {
  username: string;
  characters: Character[];
}) {
  const { language } = useSiteLanguage();
  const copy = MY_BOND_COPY[language] ?? MY_BOND_COPY.EN;
  const discoverCopy = DISCOVER_COPY[language] ?? DISCOVER_COPY.EN;
  const { characters, loading } = useLocalizedCharacters(baseCharacters);

  return (
    <main className="min-h-screen px-4 py-12 md:px-6">
      <section className="bond-container">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-[2rem] border border-bond-rose/40 bg-white/[0.035] p-7 text-center shadow-[0_0_42px_rgba(255,92,168,0.08)] md:p-10">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-bond-rose">
              {copy.creatorPublicCharacters}
            </p>
            <h1 className="mt-4 font-display text-4xl font-bold text-white md:text-6xl">
              @{username}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-bond-muted">
              {copy.creatorPublicCharactersDescription}
            </p>
          </div>

          {loading && characters.length === 0 ? (
            <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.025] p-10 text-center text-bond-muted">
              {discoverCopy.translatingCharacters}
            </div>
          ) : characters.length ? (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {characters.map((character, index) => (
                <CharacterCard
                  key={character.id}
                  character={character}
                  priority={index < 4}
                />
              ))}
            </div>
          ) : (
            <div className="mt-8 rounded-[2rem] border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
              <p className="text-bond-muted">
                {copy.noPublicCharacters}
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
