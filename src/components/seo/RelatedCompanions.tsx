import Link from "next/link";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { Character } from "@/types/character";

type RelatedRow = {
  id: string;
  slug: string;
  name: string;
  title: string;
  role: string;
  category: string;
  tags: string[] | null;
  image_file: string;
  image_storage_path: string | null;
  image_url: string;
  display_order: number | null;
};

type RelatedCompanion = {
  id: string;
  slug: string;
  name: string;
  title: string;
  image: string;
  score: number;
  displayOrder: number;
};

const IGNORED_TAGS = new Set(["ever memory™"]);

function normalizedTags(tags: string[] | undefined | null) {
  return (tags ?? [])
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag && !IGNORED_TAGS.has(tag));
}

function relatedImage(row: RelatedRow) {
  if (row.image_url?.trim()) return row.image_url;

  if (row.image_storage_path?.trim()) {
    return `/character-assets/${row.image_storage_path}`;
  }

  return `/character-assets/${row.category}/${row.image_file}`;
}

async function getRelatedCompanions(
  character: Character
): Promise<RelatedCompanion[]> {
  if (!character.category) return [];

  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("characters")
      .select(
        "id,slug,name,title,role,category,tags,image_file,image_storage_path,image_url,display_order"
      )
      .eq("is_public", true)
      .eq("is_active", true)
      .eq("visibility", "public")
      .eq("category", character.category)
      .neq("id", character.id)
      .order("display_order", { ascending: true })
      .order("id", { ascending: true })
      .limit(60);

    if (error) {
      console.error("EverBond related companion load failed:", error);
      return [];
    }

    const seedTags = new Set(normalizedTags(character.tags));
    const seedRole = (character.role || character.archetype || "")
      .trim()
      .toLowerCase();

    return ((data ?? []) as RelatedRow[])
      .map((row) => {
        const overlap = normalizedTags(row.tags).reduce(
          (total, tag) => total + (seedTags.has(tag) ? 1 : 0),
          0
        );
        const sameRole =
          seedRole && row.role?.trim().toLowerCase() === seedRole ? 1 : 0;

        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          title: row.title,
          image: relatedImage(row),
          score: overlap * 100 + sameRole * 10,
          displayOrder:
            typeof row.display_order === "number"
              ? row.display_order
              : Number.MAX_SAFE_INTEGER
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.displayOrder - b.displayOrder ||
          a.name.localeCompare(b.name)
      )
      .slice(0, 6);
  } catch (error) {
    console.error("EverBond related companion load failed:", error);
    return [];
  }
}

export async function RelatedCompanions({
  character
}: {
  character: Character;
}) {
  const related = await getRelatedCompanions(character);

  if (related.length === 0) return null;

  return (
    <section
      aria-labelledby="related-companions-heading"
      className="border-t border-white/10 px-4 py-8 md:px-6"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="related-companions-heading"
              className="font-display text-xl font-bold text-white md:text-2xl"
            >
              Featured companions
            </h2>
            <p className="mt-1 text-sm text-bond-muted">
              Explore related EverBond companions.
            </p>
          </div>

        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {related.map((companion) => (
            <Link
              key={companion.id}
              href={`/chat/${companion.slug}`}
              className="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition hover:border-bond-rose/60 hover:bg-white/[0.05]"
            >
              <div className="aspect-[4/5] overflow-hidden bg-[#0b0b0e]">
                <img
                  src={companion.image}
                  alt={companion.name}
                  loading="lazy"
                  className="h-full w-full object-cover object-[center_18%] transition duration-300 group-hover:scale-[1.03]"
                />
              </div>

              <div className="p-3">
                <h3 className="truncate font-display text-sm font-bold text-white">
                  {companion.name}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs leading-4 text-bond-muted">
                  {companion.title}
                </p>
              </div>
            </Link>
          ))}
        </div>

        <nav
          aria-label="More EverBond pages"
          className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm"
        >
          <Link href="/" className="text-bond-muted hover:text-bond-rose">
            EverBond home
          </Link>
          <Link
            href="/characters"
            className="text-bond-muted hover:text-bond-rose"
          >
            Discover companions
          </Link>
          <Link href="/create" className="text-bond-muted hover:text-bond-rose">
            Create your own companion
          </Link>
        </nav>
      </div>
    </section>
  );
}
