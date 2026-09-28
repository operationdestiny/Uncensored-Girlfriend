"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Character } from "@/types/character";
import { CharacterGrid } from "@/components/character/CharacterGrid";
import { useLocalizedCharacters } from "@/components/character/useLocalizedCharacters";
import { useSiteLanguage } from "@/lib/site-language";
import { DISCOVER_COPY } from "@/lib/discover-language";

const filters = [
  "Romance",
  "Fantasy",
  "Gothic",
  "Comfort",
  "Rival",
  "Mystery",
  "Campus",
  "Protective",
  "Adventure",
  "Slice of Life"
] as const;

const filterKeyMap: Record<(typeof filters)[number], string> = {
  Romance: "romance",
  Fantasy: "fantasy",
  Gothic: "gothic",
  Comfort: "comfort",
  Rival: "rival",
  Mystery: "mystery",
  Campus: "campus",
  Protective: "protective",
  Adventure: "adventure",
  "Slice of Life": "sliceOfLife"
};

export function CharacterSearchGrid({
  characters: baseCharacters
}: {
  characters: Character[];
}) {
  const { t, language } = useSiteLanguage();
  const copy = DISCOVER_COPY[language] ?? DISCOVER_COPY.EN;
  const { characters, loading } = useLocalizedCharacters(baseCharacters);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const localizedById = new Map(
      characters.map((character) => [character.id, character])
    );
    const q = query.trim().toLocaleLowerCase();

    return baseCharacters
      .filter((baseCharacter) => {
        if (!active) return true;

        const canonicalText = [
          baseCharacter.archetype,
          baseCharacter.tagline,
          baseCharacter.description,
          ...baseCharacter.tags
        ]
          .join(" ")
          .toLocaleLowerCase();

        return canonicalText.includes(active.toLocaleLowerCase());
      })
      .map(
        (baseCharacter) => localizedById.get(baseCharacter.id) ?? baseCharacter
      )
      .filter((character) => {
        if (!q) return true;

        return [
          character.name,
          character.archetype,
          character.tagline,
          character.description,
          ...character.tags
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(q);
      });
  }, [active, baseCharacters, characters, query]);

  return (
    <div>
      <div className="mx-auto mb-6 max-w-3xl">
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3">
          <Search size={18} className="text-bond-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchCharactersBy")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-bond-muted"
          />
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setActive(active === filter ? null : filter)}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                active === filter
                  ? "border-bond-rose bg-bond-rose text-white"
                  : "border-bond-rose/45 bg-white/[0.03] text-bond-muted hover:border-bond-rose/70 hover:text-white"
              }`}
            >
              {t(filterKeyMap[filter])}
            </button>
          ))}
        </div>
      </div>

      {loading && characters.length === 0 ? (
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.025] px-6 py-12 text-center text-bond-muted">
          {copy.translatingCharacters}
        </div>
      ) : (
        <CharacterGrid characters={filtered} compact />
      )}

      {!loading && filtered.length === 0 && (
        <div className="bond-card mx-auto mt-10 max-w-lg rounded-[2rem] p-8 text-center">
          <p className="font-display text-2xl font-bold">
            {t("noCharactersFound")}
          </p>
          <p className="mt-3 text-sm text-bond-muted">
            {t("tryDifferentName")}
          </p>
        </div>
      )}
    </div>
  );
}
