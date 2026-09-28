import { getSupabaseServiceClient } from "@/lib/supabase/server";

const APPROVED_CATEGORIES = [
  "everbond-girls",
  "anime-fantasy",
  "everbond-guys",
  "public-creations"
] as const;

export type ApprovedAppearanceCategory =
  (typeof APPROVED_CATEGORIES)[number];

type AppearanceRow = {
  id: string;
  name: string;
  title: string | null;
  category: string;
  image_file: string;
  image_storage_bucket: string;
  image_storage_path: string;
  image_url: string;
  display_order: number | null;
};

export type ApprovedAppearance = {
  id: string;
  name: string;
  title: string;
  category: string;
  imageFile: string;
  imageStorageBucket: string;
  imageStoragePath: string;
  imageUrl: string;
};

export type ApprovedAppearancePage = {
  appearances: ApprovedAppearance[];
  total: number;
  hasMore: boolean;
  nextOffset: number | null;
};

const SELECT_FIELDS =
  "id,name,title,category,image_file,image_storage_bucket,image_storage_path,image_url,display_order";

function toAppearance(row: AppearanceRow): ApprovedAppearance {
  const fallbackPath = row.image_storage_path
    ? `/character-assets/${row.image_storage_path}`
    : `/character-assets/${row.category}/${row.image_file}`;

  return {
    id: row.id,
    name: row.name,
    title: row.title ?? "",
    category: row.category,
    imageFile: row.image_file,
    imageStorageBucket: row.image_storage_bucket || "character-assets",
    imageStoragePath:
      row.image_storage_path || `${row.category}/${row.image_file}`,
    imageUrl: row.image_url?.trim() || fallbackPath
  };
}

function sanitizeSearch(value?: string | null) {
  return String(value ?? "")
    .trim()
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function isApprovedCategory(
  value?: string | null
): value is ApprovedAppearanceCategory {
  return APPROVED_CATEGORIES.includes(
    String(value ?? "") as ApprovedAppearanceCategory
  );
}

function approvedBaseQuery(count: "exact" | undefined = undefined) {
  return getSupabaseServiceClient()
    .from("characters")
    .select(SELECT_FIELDS, count ? { count } : undefined)
    .eq("official", true)
    .eq("is_active", true)
    .eq("is_public", true)
    .eq("visibility", "public")
    .in("category", [...APPROVED_CATEGORIES]);
}

export async function getApprovedAppearanceById(
  appearanceId: string
): Promise<ApprovedAppearance | null> {
  const id = appearanceId.trim();
  if (!id || id.length > 160) return null;

  const { data, error } = await approvedBaseQuery()
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? toAppearance(data as AppearanceRow) : null;
}

export async function listApprovedAppearancesPage(input?: {
  limit?: number;
  offset?: number;
  category?: string | null;
  query?: string | null;
}): Promise<ApprovedAppearancePage> {
  const limit = Math.min(Math.max(Math.trunc(input?.limit ?? 72), 24), 120);
  const offset = Math.max(Math.trunc(input?.offset ?? 0), 0);
  const category = String(input?.category ?? "all");
  const query = sanitizeSearch(input?.query);

  let request = approvedBaseQuery("exact");

  if (category !== "all" && isApprovedCategory(category)) {
    request = request.eq("category", category);
  }

  if (query) {
    request = request.or(
      `name.ilike.%${query}%,title.ilike.%${query}%`
    );
  }

  const { data, error, count } = await request
    .order("display_order", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const appearances = ((data ?? []) as AppearanceRow[]).map(toAppearance);
  const total =
    typeof count === "number" ? count : offset + appearances.length;
  const nextOffset = offset + appearances.length;
  const hasMore =
    appearances.length === limit &&
    (typeof count !== "number" || nextOffset < count);

  return {
    appearances,
    total,
    hasMore,
    nextOffset: hasMore ? nextOffset : null
  };
}
