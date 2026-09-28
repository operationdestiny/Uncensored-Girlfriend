"use client";

import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSiteLanguage } from "@/lib/site-language";
import { CHARACTER_TOOLS_COPY } from "@/lib/character-tools-language";

type FavoriteButtonProps = {
  characterId: string;
  characterName: string;
  characterImage: string;
  className?: string;
  iconSize?: number;
};

let cachedToken = "";
let cachedFavoriteIds = new Set<string>();
let favoriteLoadPromise: Promise<Set<string>> | null = null;

async function loadFavoriteIds(
  accessToken: string
) {
  if (cachedToken !== accessToken) {
    cachedToken = accessToken;
    cachedFavoriteIds = new Set<string>();
    favoriteLoadPromise = null;
  }

  if (favoriteLoadPromise) {
    return favoriteLoadPromise;
  }

  favoriteLoadPromise = fetch("/api/favorites", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  })
    .then(async (response) => {
      const payload =
        await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "FAVORITE_LOOKUP_FAILED"
        );
      }

      cachedFavoriteIds = new Set(
        Array.isArray(payload.characterIds)
          ? payload.characterIds.map(String)
          : []
      );

      return cachedFavoriteIds;
    })
    .catch((error) => {
      favoriteLoadPromise = null;
      throw error;
    });

  return favoriteLoadPromise;
}

function updateFavoriteCache(
  accessToken: string,
  characterId: string,
  saved: boolean
) {
  if (cachedToken !== accessToken) {
    cachedToken = accessToken;
    cachedFavoriteIds = new Set<string>();
  }

  if (saved) {
    cachedFavoriteIds.add(characterId);
  } else {
    cachedFavoriteIds.delete(characterId);
  }
}

export function FavoriteButton({
  characterId,
  characterName,
  characterImage,
  className = "",
  iconSize = 20
}: FavoriteButtonProps) {
  const { language } = useSiteLanguage();
  const copy =
    CHARACTER_TOOLS_COPY[language] ??
    CHARACTER_TOOLS_COPY.EN;
  const {
    session,
    authReady,
    openCharacterAuthModal
  } = useAuth();

  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const pendingStorageKey =
    `everbond_pending_favorite_${characterId}`;
  const pendingAfterAuth = useRef(false);

  async function requestFavorite(
    method: "POST" | "DELETE"
  ) {
    if (!session?.access_token || loading) return;

    setLoading(true);

    try {
      const response = await fetch("/api/favorites", {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ characterId })
      });

      const payload =
        await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : copy.favoriteFailed
        );
      }

      const nextSaved = Boolean(payload.saved);
      setSaved(nextSaved);
      updateFavoriteCache(
        session.access_token,
        characterId,
        nextSaved
      );

      window.dispatchEvent(
        new CustomEvent(
          "everbond:favorites-changed"
        )
      );
    } catch (error) {
      console.error(copy.favoriteFailed, error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authReady || !session?.access_token) {
      setSaved(false);
      return;
    }

    let cancelled = false;

    void loadFavoriteIds(
      session.access_token
    )
      .then((favoriteIds) => {
        if (!cancelled) {
          setSaved(
            favoriteIds.has(characterId)
          );
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error(
            copy.favoriteFailed,
            error
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    authReady,
    characterId,
    copy.favoriteFailed,
    session?.access_token
  ]);

  useEffect(() => {
    if (!session?.access_token || loading) {
      return;
    }

    const storedPending =
      typeof window !== "undefined" &&
      window.sessionStorage.getItem(
        pendingStorageKey
      ) === "1";

    if (
      !pendingAfterAuth.current &&
      !storedPending
    ) {
      return;
    }

    pendingAfterAuth.current = false;
    window.sessionStorage.removeItem(
      pendingStorageKey
    );
    void requestFavorite("POST");
    // requestFavorite intentionally uses the latest session and state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  function handleClick(
    event: React.MouseEvent<HTMLButtonElement>
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (!authReady || loading) return;

    if (!session) {
      pendingAfterAuth.current = true;
      window.sessionStorage.setItem(
        pendingStorageKey,
        "1"
      );
      openCharacterAuthModal({
        name: characterName,
        image: characterImage
      });
      return;
    }

    void requestFavorite(
      saved ? "DELETE" : "POST"
    );
  }

  const label = saved
    ? copy.removeFavorite
    : copy.saveFavorite;

  return (
    <button
      type="button"
      data-favorite-managed="true"
      onClick={handleClick}
      disabled={loading}
      aria-label={label}
      title={label}
      className={`${className} ${
        saved
          ? "text-bond-gold"
          : "text-white hover:text-bond-rose"
      } disabled:cursor-wait disabled:opacity-60`}
    >
      <Star
        size={iconSize}
        className={
          saved ? "fill-current" : ""
        }
      />
    </button>
  );
}
