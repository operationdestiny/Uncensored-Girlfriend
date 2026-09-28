"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSiteLanguage } from "@/lib/site-language";
import { CHARACTER_TOOLS_COPY } from "@/lib/character-tools-language";
import type { Character } from "@/types/character";

const PENDING_CHAT_FAVORITE_KEY =
  "everbond_pending_chat_favorite";

function getChatSlug(pathname: string) {
  const match = pathname.match(
    /^\/chat\/([^/?#]+)\/?$/
  );

  return match
    ? decodeURIComponent(match[1])
    : "";
}

function findChatFavoriteButton() {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      "button:not([data-favorite-managed])"
    )
  );

  return (
    buttons.find((button) =>
      Boolean(
        button.querySelector(
          "svg.lucide-star"
        )
      )
    ) ?? null
  );
}

function paintButton(
  button: HTMLButtonElement | null,
  saved: boolean
) {
  if (!button) return;

  const star =
    button.querySelector<SVGElement>(
      "svg.lucide-star"
    );

  if (saved) {
    button.style.color = "#f6c453";
    button.style.borderColor =
      "rgba(246,196,83,0.9)";
    button.style.backgroundColor =
      "rgba(246,196,83,0.18)";

    if (star) {
      star.style.fill = "currentColor";
    }
  } else {
    button.style.removeProperty("color");
    button.style.removeProperty(
      "border-color"
    );
    button.style.removeProperty(
      "background-color"
    );

    if (star) {
      star.style.removeProperty("fill");
    }
  }
}

export function ChatFavoriteBridge() {
  const pathname = usePathname();
  const { language } = useSiteLanguage();
  const copy =
    CHARACTER_TOOLS_COPY[language] ??
    CHARACTER_TOOLS_COPY.EN;
  const {
    session,
    authReady,
    openCharacterAuthModal
  } = useAuth();

  const savedRef = useRef(false);
  const slug = getChatSlug(pathname);

  async function loadCharacter() {
    if (!slug) return null;

    const response = await fetch(
      `/api/characters/${encodeURIComponent(
        slug
      )}`,
      {
        headers: session?.access_token
          ? {
              Authorization: `Bearer ${session.access_token}`
            }
          : undefined,
        cache: "no-store"
      }
    );

    const payload =
      await response.json().catch(() => ({}));

    return response.ok &&
      payload?.character
      ? (payload.character as Character)
      : null;
  }

  async function loadSavedState() {
    if (!slug || !session?.access_token) {
      savedRef.current = false;
      paintButton(
        findChatFavoriteButton(),
        false
      );
      return;
    }

    const response = await fetch(
      `/api/favorites?characterSlug=${encodeURIComponent(
        slug
      )}`,
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        },
        cache: "no-store"
      }
    );

    const payload =
      await response.json().catch(() => ({}));

    if (!response.ok) return;

    savedRef.current = Boolean(payload.saved);
    paintButton(
      findChatFavoriteButton(),
      savedRef.current
    );
  }

  useEffect(() => {
    if (!slug) return;

    const observer = new MutationObserver(() => {
      paintButton(
        findChatFavoriteButton(),
        savedRef.current
      );
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    const timer = window.setTimeout(() => {
      void loadSavedState();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, session?.access_token]);

  useEffect(() => {
    if (
      !authReady ||
      !session?.access_token ||
      !slug
    ) {
      return;
    }

    const pending =
      window.sessionStorage.getItem(
        PENDING_CHAT_FAVORITE_KEY
      );

    if (pending !== slug) return;

    window.sessionStorage.removeItem(
      PENDING_CHAT_FAVORITE_KEY
    );

    void fetch("/api/favorites", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        characterSlug: slug
      })
    }).then(async (response) => {
      const payload =
        await response.json().catch(() => ({}));

      if (response.ok) {
        savedRef.current =
          Boolean(payload.saved);
        paintButton(
          findChatFavoriteButton(),
          savedRef.current
        );
        window.dispatchEvent(
          new CustomEvent(
            "everbond:favorites-changed"
          )
        );
      }
    });
  }, [
    authReady,
    session?.access_token,
    slug
  ]);

  useEffect(() => {
    if (!slug) return;

    const handleClick = (
      event: MouseEvent
    ) => {
      const target =
        event.target instanceof Element
          ? event.target
          : null;
      const button =
        target?.closest<HTMLButtonElement>(
          "button"
        );

      if (
        !button ||
        button.dataset.favoriteManaged ===
          "true" ||
        !button.querySelector(
          "svg.lucide-star"
        )
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (!authReady) return;

      if (!session?.access_token) {
        window.sessionStorage.setItem(
          PENDING_CHAT_FAVORITE_KEY,
          slug
        );

        void loadCharacter().then(
          (character) => {
            if (!character) return;

            openCharacterAuthModal({
              name: character.name,
              image: character.image
            });
          }
        );

        return;
      }

      void fetch("/api/favorites", {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          characterSlug: slug,
          toggle: true
        })
      }).then(async (response) => {
        const payload =
          await response.json().catch(
            () => ({})
          );

        if (!response.ok) {
          console.error(
            copy.favoriteFailed
          );
          return;
        }

        savedRef.current =
          Boolean(payload.saved);
        paintButton(
          button,
          savedRef.current
        );

        window.dispatchEvent(
          new CustomEvent(
            "everbond:favorites-changed"
          )
        );
      });
    };

    document.addEventListener(
      "click",
      handleClick,
      true
    );

    return () => {
      document.removeEventListener(
        "click",
        handleClick,
        true
      );
    };
  }, [
    authReady,
    copy.favoriteFailed,
    openCharacterAuthModal,
    session?.access_token,
    slug
  ]);

  return null;
}
