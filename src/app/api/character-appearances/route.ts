import { NextRequest, NextResponse } from "next/server";
import { listApprovedAppearancesPage } from "@/lib/appearance-gallery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_CATEGORIES = new Set([
  "all",
  "everbond-girls",
  "anime-fantasy",
  "everbond-guys",
  "public-creations"
]);

function integerParam(
  value: string | null,
  fallback: number,
  min: number,
  max: number
) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const requestedCategory =
      url.searchParams.get("category")?.trim() || "all";
    const category = ALLOWED_CATEGORIES.has(requestedCategory)
      ? requestedCategory
      : "all";
    const query = url.searchParams.get("q")?.trim().slice(0, 80) || "";
    const offset = integerParam(
      url.searchParams.get("offset"),
      0,
      0,
      100_000
    );
    const limit = integerParam(
      url.searchParams.get("limit"),
      72,
      24,
      120
    );

    const page = await listApprovedAppearancesPage({
      category,
      query,
      offset,
      limit
    });

    return NextResponse.json(page, {
      headers: {
        "Cache-Control": query
          ? "private, no-store"
          : "public, s-maxage=120, stale-while-revalidate=600"
      }
    });
  } catch (error) {
    console.error("Appearance gallery request failed", error);

    return NextResponse.json(
      {
        error: "APPEARANCE_GALLERY_FAILED",
        message: "The appearance gallery could not be loaded."
      },
      { status: 500 }
    );
  }
}
