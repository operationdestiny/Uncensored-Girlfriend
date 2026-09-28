"use client";

import Link from "next/link";
import { ImageIcon, Phone, ShoppingBag } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Character } from "@/types/character";
import { useAuth } from "@/components/auth/AuthProvider";
import { VoiceCallModal } from "@/components/media/VoiceCallModal";
import { useSiteLanguage } from "@/lib/site-language";
import { MEDIA_COPY } from "@/lib/media-language";
import { MEDIA_GALLERY_COPY } from "@/lib/media-gallery-language";
import { EVERSHOP_COPY } from "@/lib/evershop-language";

function chatSlug(pathname: string | null) {
  if (!pathname) return "";

  const match = pathname.match(/^\/chat\/([^/?#]+)\/?$/);
  if (!match) return "";

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

type GalleryPayload = {
  images?: Array<{ id: string; url: string }>;
  selectedImageId?: string | null;
};

export function ChatMediaBridge() {
  const pathname = usePathname();
  const slug = chatSlug(pathname);
  const { language } = useSiteLanguage();
  const copy = MEDIA_COPY[language] ?? MEDIA_COPY.EN;
  const galleryCopy = MEDIA_GALLERY_COPY[language] ?? MEDIA_GALLERY_COPY.EN;
  const shopCopy = EVERSHOP_COPY[language] ?? EVERSHOP_COPY.EN;
  const { session, authReady, openCharacterAuthModal } = useAuth();

  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [displayImage, setDisplayImage] = useState("");
  const [callOpen, setCallOpen] = useState(false);

  useEffect(() => {
    if (!slug) {
      setMountNode(null);
      return;
    }

    let cancelled = false;

    function attachToolbar() {
      if (cancelled) return;

      try {
        const input = document.querySelector<HTMLElement>(".bond-chat-input");
        const footer = input?.parentElement;

        if (!input || !footer || !footer.contains(input)) return;

        let mount = footer.querySelector<HTMLElement>(
          '[data-everbond-media-toolbar="true"]'
        );

        if (!mount) {
          mount = document.createElement("div");
          mount.dataset.everbondMediaToolbar = "true";
          mount.className =
            "no-scrollbar mx-auto mb-2 flex max-w-4xl flex-nowrap items-center gap-2 overflow-x-auto";
          footer.insertBefore(mount, input);
        }

        setMountNode((current) => (current === mount ? current : mount));
      } catch (error) {
        console.warn("EVERBOND_CHAT_MEDIA_TOOLBAR_ATTACH_FAILED", error);
      }
    }

    attachToolbar();
    const interval = window.setInterval(attachToolbar, 500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      setMountNode(null);

      try {
        document
          .querySelector<HTMLElement>(
            '[data-everbond-media-toolbar="true"]'
          )
          ?.remove();
      } catch {
        // Optional toolbar cleanup must never take down the chat page.
      }
    };
  }, [slug]);

  useEffect(() => {
    if (!slug || !authReady) return;

    let cancelled = false;

    void fetch(`/api/characters/${encodeURIComponent(slug)}`, {
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined,
      cache: "no-store"
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));

        if (!cancelled && response.ok && payload?.character) {
          const nextCharacter = payload.character as Character;
          setCharacter(nextCharacter);
          setDisplayImage(nextCharacter.image || "");
        }
      })
      .catch((error) => {
        console.warn("EVERBOND_CHAT_MEDIA_CHARACTER_LOAD_FAILED", error);
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, session?.access_token, slug]);

  const loadSelectedImage = useCallback(async () => {
    if (!slug || !session?.access_token || !character) return;

    try {
      const response = await fetch(
        `/api/character-gallery/${encodeURIComponent(slug)}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          },
          cache: "no-store"
        }
      );

      if (!response.ok) return;

      const payload = (await response.json()) as GalleryPayload;
      const selected = Array.isArray(payload.images)
        ? payload.images.find(
            (image) => image.id === payload.selectedImageId
          )
        : null;

      setDisplayImage(selected?.url || character.image || "");
    } catch (error) {
      console.warn("EVERBOND_CHAT_SELECTED_IMAGE_LOAD_FAILED", error);
      setDisplayImage(character.image || "");
    }
  }, [character, session?.access_token, slug]);

  useEffect(() => {
    void loadSelectedImage();

    if (!slug || !session?.access_token || !character) return;

    const interval = window.setInterval(() => {
      void loadSelectedImage();
    }, 45 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, [character, loadSelectedImage, session?.access_token, slug]);

  useEffect(() => {
    function refreshSelectedImage(event: Event) {
      const custom = event as CustomEvent<{
        characterSlug?: string;
      }>;

      if (custom.detail?.characterSlug !== slug) return;
      void loadSelectedImage();
    }

    window.addEventListener(
      "everbond:chat-image-changed",
      refreshSelectedImage
    );

    return () => {
      window.removeEventListener(
        "everbond:chat-image-changed",
        refreshSelectedImage
      );
    };
  }, [loadSelectedImage, slug]);

  useEffect(() => {
    if (!slug || !displayImage || !character?.name) return;

    let resolvedDisplayImage = displayImage;

    try {
      resolvedDisplayImage = new URL(
        displayImage,
        window.location.href
      ).href;
    } catch {
      // A malformed optional image URL should never crash the chat page.
    }

    const updateImages = () => {
      try {
        const candidates = Array.from(
          document.querySelectorAll<HTMLImageElement>(".v18-main img")
        ).filter((image) => image.alt === character.name);

        candidates.forEach((image) => {
          const belongsToChatPortrait =
            image.closest("aside") ||
            image.closest(".lg\\:hidden") ||
            image.closest('[role="dialog"]');

          if (
            belongsToChatPortrait &&
            image.src !== resolvedDisplayImage
          ) {
            image.src = displayImage;
          }
        });
      } catch (error) {
        console.warn("EVERBOND_CHAT_PORTRAIT_SYNC_FAILED", error);
      }
    };

    updateImages();

    const observer = new MutationObserver(updateImages);

    try {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src"]
      });
    } catch (error) {
      console.warn("EVERBOND_CHAT_PORTRAIT_OBSERVER_FAILED", error);
    }

    return () => observer.disconnect();
  }, [character?.name, displayImage, slug]);

  if (
    !slug ||
    !character ||
    !mountNode ||
    !mountNode.isConnected
  ) {
    return null;
  }

  function requireSession(action: () => void) {
    if (!authReady || !character) return;

    if (!session) {
      openCharacterAuthModal({
        name: character.name,
        image: displayImage || character.image
      });
      return;
    }

    action();
  }

  const toolbar = (
    <>
      <button
        type="button"
        onClick={() => requireSession(() => setCallOpen(true))}
        className="bond-pink-button inline-flex shrink-0 items-center gap-2 rounded-full border border-bond-rose/60 bg-bond-rose/10 px-5 py-2.5 text-sm font-bold text-white"
      >
        <Phone size={16} />
        {copy.callCharacter(character.name)}
      </button>

      <Link
        href={session ? `/character/${character.slug}/gallery` : "#"}
        onClick={(event) => {
          if (!session) {
            event.preventDefault();
            requireSession(() => undefined);
          }
        }}
        className="bond-pink-button inline-flex shrink-0 items-center gap-2 rounded-full border border-bond-rose/60 bg-bond-rose/10 px-5 py-2.5 text-sm font-bold text-white"
      >
        <ImageIcon size={16} />
        {galleryCopy.toolbarLabel(character.name)}
      </Link>

      <Link
        href={`/shop?for=${encodeURIComponent(character.name)}`}
        className="bond-pink-button inline-flex shrink-0 items-center gap-2 rounded-full border border-bond-rose/60 bg-bond-rose/10 px-5 py-2.5 text-sm font-bold text-white"
      >
        <ShoppingBag size={16} />
        {shopCopy.shopFor} {character.name}
      </Link>
    </>
  );

  try {
    return (
      <>
        {createPortal(toolbar, mountNode)}
        {session && (
          <VoiceCallModal
            open={callOpen}
            character={character}
            displayImage={displayImage || character.image}
            session={session}
            language={language}
            onClose={() => setCallOpen(false)}
          />
        )}
      </>
    );
  } catch (error) {
    console.warn("EVERBOND_CHAT_MEDIA_PORTAL_FAILED", error);
    return null;
  }
}
