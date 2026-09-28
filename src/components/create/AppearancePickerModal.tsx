"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useSiteLanguage } from "@/lib/site-language";
import { APPEARANCE_PICKER_COPY } from "@/lib/appearance-picker-language";

export type AppearanceOption = {
  id: string;
  name: string;
  title: string;
  category: string;
  imageFile: string;
  imageStorageBucket: string;
  imageStoragePath: string;
  imageUrl: string;
};

type Props = {
  open: boolean;
  selectedId?: string;
  onClose: () => void;
  onSelect: (appearance: AppearanceOption) => void;
};

const CATEGORY_VALUES = [
  "all",
  "everbond-girls",
  "anime-fantasy",
  "everbond-guys",
  "public-creations"
] as const;

type CategoryValue = (typeof CATEGORY_VALUES)[number];

type AppearancePage = {
  appearances?: AppearanceOption[];
  total?: number;
  hasMore?: boolean;
  nextOffset?: number | null;
  message?: string;
};

const PAGE_SIZE = 72;

async function getAppearancePage(input: {
  category: CategoryValue;
  query: string;
  offset: number;
  signal?: AbortSignal;
}) {
  const params = new URLSearchParams({
    category: input.category,
    q: input.query,
    offset: String(input.offset),
    limit: String(PAGE_SIZE)
  });

  const response = await fetch(`/api/character-appearances?${params}`, {
    method: "GET",
    cache: input.query ? "no-store" : "default",
    signal: input.signal
  });

  const payload = (await response.json().catch(() => ({}))) as AppearancePage;

  if (!response.ok || !Array.isArray(payload.appearances)) {
    throw new Error(payload.message || "Appearance gallery failed.");
  }

  return {
    appearances: payload.appearances,
    total:
      typeof payload.total === "number"
        ? payload.total
        : payload.appearances.length,
    hasMore: payload.hasMore === true,
    nextOffset:
      typeof payload.nextOffset === "number"
        ? payload.nextOffset
        : null
  };
}

export function AppearancePickerModal({
  open,
  selectedId,
  onClose,
  onSelect
}: Props) {
  const { language } = useSiteLanguage();
  const copy =
    APPEARANCE_PICKER_COPY[language] ?? APPEARANCE_PICKER_COPY.EN;

  const [mounted, setMounted] = useState(false);
  const [appearances, setAppearances] = useState<AppearanceOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<CategoryValue>("all");
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);


  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    setLoading(true);
    setError("");
    setAppearances([]);
    setHasMore(false);
    setNextOffset(null);

    void getAppearancePage({
      category,
      query: "",
      offset: 0,
      signal: controller.signal
    })
      .then((page) => {
        if (controller.signal.aborted) return;
        setAppearances(page.appearances);
        setHasMore(page.hasMore);
        setNextOffset(page.nextOffset);
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        console.error("Appearance gallery failed to load", requestError);
        setError(copy.loadFailed);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open, category, reloadNonce, copy.loadFailed]);

  const loadMore = useCallback(async () => {
    if (
      loadingMoreRef.current ||
      loading ||
      !hasMore ||
      nextOffset === null
    ) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const page = await getAppearancePage({
        category,
        query: "",
        offset: nextOffset
      });

      setAppearances((current) => {
        const existing = new Set(current.map((item) => item.id));
        const additions = page.appearances.filter(
          (item) => !existing.has(item.id)
        );
        return [...current, ...additions];
      });
      setHasMore(page.hasMore);
      setNextOffset(page.nextOffset);
    } catch (requestError) {
      console.error("Appearance gallery failed to load more", requestError);
      setError(copy.loadFailed);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [
    category,
    hasMore,
    loading,
    nextOffset,
    copy.loadFailed
  ]);

  if (!mounted || !open) return null;

  const categoryLabels: Record<CategoryValue, string> = {
    all: copy.all,
    "everbond-girls": copy.girls,
    "anime-fantasy": copy.fantasy,
    "everbond-guys": copy.guys,
    "public-creations": copy.more
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] h-[100dvh] w-screen overflow-hidden bg-[#07050a]"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
    >
      <div className="mx-auto box-border flex h-[100dvh] w-full max-w-[1600px] flex-col overflow-hidden px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 sm:pb-5 lg:px-7">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 pb-3 sm:gap-5 sm:pb-4">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-bold leading-tight text-bond-rose sm:text-3xl md:text-4xl">
              {copy.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] p-2.5 text-white transition hover:border-bond-rose/50 hover:bg-bond-rose/10"
            aria-label={copy.close}
          >
            <X size={20} />
          </button>
        </div>

        <div className="shrink-0 py-3 sm:py-4">
          <div className="flex w-full gap-2 overflow-x-auto pb-1">
            {CATEGORY_VALUES.map((value) => (
              <button
                type="button"
                key={value}
                onClick={() => setCategory(value)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition ${
                  category === value
                    ? "border-bond-rose bg-bond-rose/20 text-white"
                    : "border-white/10 bg-white/[0.03] text-bond-muted hover:border-bond-rose/35 hover:text-white"
                }`}
              >
                {categoryLabels[value]}
              </button>
            ))}
          </div>
        </div>

        <div
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain rounded-[1.35rem] border border-white/10 bg-black/20 p-2.5 sm:p-4"
          onScroll={(event) => {
            const target = event.currentTarget;
            const remaining =
              target.scrollHeight - target.scrollTop - target.clientHeight;

            if (remaining < 1000) {
              void loadMore();
            }
          }}
        >
          {loading ? (
            <div className="grid min-h-full place-items-center py-16 text-bond-muted">
              <div className="text-center">
                <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-bond-rose" />
                <p>{copy.loading}</p>
              </div>
            </div>
          ) : error && appearances.length === 0 ? (
            <div className="grid min-h-full place-items-center py-16 text-center text-red-200">
              <div>
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => setReloadNonce((value) => value + 1)}
                  className="mt-4 rounded-full border border-bond-rose/60 bg-bond-rose/10 px-5 py-2.5 text-sm font-bold text-white"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : appearances.length === 0 ? (
            <div className="grid min-h-full place-items-center py-16 text-center text-bond-muted">
              {copy.noResults}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
                {appearances.map((appearance) => {
                  const selected = appearance.id === selectedId;

                  return (
                    <button
                      type="button"
                      key={appearance.id}
                      onClick={() => onSelect(appearance)}
                      className={`group min-w-0 overflow-hidden rounded-2xl border bg-white/[0.025] transition ${
                        selected
                          ? "border-bond-rose ring-2 ring-bond-rose/30"
                          : "border-white/10 hover:border-bond-rose/55"
                      }`}
                      aria-pressed={selected}
                    >
                      <img
                        src={appearance.imageUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="aspect-[3/4] w-full bg-black object-cover transition duration-200 group-hover:scale-[1.02]"
                      />
                    </button>
                  );
                })}
              </div>

              {(loadingMore || hasMore) && (
                <div className="flex justify-center py-6">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                    className="rounded-full border border-bond-rose/60 bg-bond-rose/10 px-6 py-3 text-sm font-bold text-white transition hover:bg-bond-rose/20 disabled:cursor-wait disabled:opacity-60"
                  >
                    {loadingMore ? copy.loading : copy.loadMore}
                  </button>
                </div>
              )}

              {error && (
                <p className="pb-5 text-center text-sm text-red-200">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
