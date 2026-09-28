"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Character, CharacterCategory } from "@/types/character";
import { CharacterGrid } from "@/components/character/CharacterGrid";
import { characterCategories } from "@/lib/characters";
import { useSiteLanguage } from "@/lib/site-language";

const filters = [
  "Romance",
  "Fantasy",
  "Gothic",
  "Comfort",
  "Rival",
  "Mystery",
  "Campus",
  "Mean",
  "Submissive",
  "Protective",
  "Adventure",
  "Slice of Life",
  "Sarcastic"
] as const;

const filterKeyMap: Record<(typeof filters)[number], string> = {
  Romance: "romance",
  Fantasy: "fantasy",
  Gothic: "gothic",
  Comfort: "comfort",
  Rival: "rival",
  Mystery: "mystery",
  Campus: "campus",
  Mean: "mean",
  Submissive: "submissive",
  Protective: "protective",
  Adventure: "adventure",
  "Slice of Life": "sliceOfLife",
  Sarcastic: "sarcastic"
};

const categoryKeyMap: Record<CharacterCategory, string> = {
  "everbond-girls": "everbondGirls",
  "anime-fantasy": "animeFantasy",
  "everbond-guys": "everbondGuys",
  "public-creations": "publicCreations"
};

export function CharacterTabsGrid({ characters }: { characters: Character[] }) {
  const { t } = useSiteLanguage();
  const [category, setCategory] = useState<CharacterCategory>("everbond-girls");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [publicMode, setPublicMode] = useState<"new-today" | "oldest">("new-today");
  const [showPublic, setShowPublic] = useState(true);
  const [visibleCount, setVisibleCount] = useState(100);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return characters
      .filter((companion) => companion.category === category)
      .filter((companion) => category !== "public-creations" || showPublic)
      .filter((companion) => {
        if (category !== "public-creations") return true;
        return publicMode === "new-today" ? companion.createdAt === "today" : companion.createdAt !== "today";
      })
      .filter((companion) => {
        const text = [
          companion.name,
          companion.archetype,
          companion.tagline,
          companion.description,
          ...companion.tags
        ].join(" ").toLowerCase();

        return (!q || text.includes(q)) && (!active || text.includes(active.toLowerCase()));
      });
  }, [characters, query, active, category, publicMode, showPublic]);

  useEffect(() => {
    setVisibleCount(100);
  }, [category, query, active, publicMode, showPublic]);

  const visibleCharacters = filtered.slice(0, visibleCount);
  const canLoadMore = filtered.length > visibleCharacters.length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap justify-center gap-2">
        {characterCategories.map((item) => (
          <button
            key={item.id}
            onClick={() => setCategory(item.id)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
              category === item.id
                ? "border-bond-rose bg-bond-rose text-white"
                : "border-bond-rose/45 bg-white/[0.03] text-bond-muted hover:border-bond-rose/70 hover:text-white"
            }`}
          >
            {t(categoryKeyMap[item.id])}
          </button>
        ))}
      </div>

      {category === "public-creations" && (
        <div className="mx-auto mb-5 flex max-w-xl flex-wrap items-center justify-center gap-3 rounded-full border border-white/10 bg-white/[0.03] p-2">
          <button
            onClick={() => setPublicMode("new-today")}
            className={`rounded-full border px-4 py-2 text-sm ${publicMode === "new-today" ? "border-bond-rose bg-bond-rose text-white" : "border-bond-rose/45 text-bond-muted"}`}
          >
            {t("newToday")}
          </button>
          <button
            onClick={() => setPublicMode("oldest")}
            className={`rounded-full border px-4 py-2 text-sm ${publicMode === "oldest" ? "border-bond-rose bg-bond-rose text-white" : "border-bond-rose/45 text-bond-muted"}`}
          >
            {t("oldest")}
          </button>
          <button
            onClick={() => setShowPublic(!showPublic)}
            className={`rounded-full border px-4 py-2 text-sm ${showPublic ? "border-bond-rose bg-bond-rose text-white" : "border-bond-rose/45 bg-white/5 text-bond-muted"}`}
          >
            {showPublic ? t("on") : t("off")}
          </button>
        </div>
      )}

      <div className="mx-auto mb-6 max-w-4xl">
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3">
          <Search size={18} className="text-bond-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchCompanions")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-bond-muted"
          />
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {filters.map((filter) => (
            <button
              key={filter}
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

      <CharacterGrid characters={visibleCharacters} />

      {canLoadMore && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + 100)}
            className="bond-pink-button rounded-full border border-bond-rose/70 bg-black/35 px-7 py-3 text-sm font-bold text-white shadow-[0_0_14px_rgba(255,92,168,0.08)] transition hover:bg-bond-rose/10"
          >
            {t("more")}
          </button>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="bond-card mx-auto mt-10 max-w-lg rounded-[2rem] p-8 text-center">
          <p className="font-display text-2xl font-bold">{t("noCompanionsFound")}</p>
          <p className="mt-3 text-sm text-bond-muted">{t("tryDifferentTab")}</p>
        </div>
      )}
    </div>
  );
}
