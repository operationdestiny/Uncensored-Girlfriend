"use client";

import { useEffect, useRef, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ChatShell } from "@/components/chat/ChatShell";
import { isLocalizedCharacterContent } from "@/components/character/useLocalizedCharacter";
import { useSiteLanguage } from "@/lib/site-language";
import { MY_BOND_COPY } from "@/lib/my-bond-language";
import { FINAL_LOCALIZATION_COPY } from "@/lib/final-localization-language";
import type { Character } from "@/types/character";

export function PrivateChatLoader({
  slug
}: {
  slug: string;
}) {
  const { language } = useSiteLanguage();
  const copy = MY_BOND_COPY[language] ?? MY_BOND_COPY.EN;
  const finalCopy =
    FINAL_LOCALIZATION_COPY[language] ?? FINAL_LOCALIZATION_COPY.EN;
  const {
    session,
    authReady,
    openAuthModal
  } = useAuth();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const userId = session?.user?.id ?? null;

  const [character, setCharacter] =
    useState<Character | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!authReady || !userId) {
      setCharacter(null);
      setUnavailable(false);
      return;
    }

    const accessToken = sessionRef.current?.access_token;
    if (!accessToken) {
      setCharacter(null);
      setUnavailable(false);
      return;
    }

    const controller = new AbortController();
    setCharacter(null);
    setUnavailable(false);

    async function loadCharacter() {
      try {
        const authorization = {
          Authorization: `Bearer ${accessToken}`
        };
        const targetUrl =
          `/api/characters/${encodeURIComponent(slug)}` +
          `?language=${encodeURIComponent(language)}`;
        const targetRequest = fetch(targetUrl, {
          headers: authorization,
          cache: "no-store",
          signal: controller.signal
        });
        const baseRequest =
          language === "EN"
            ? null
            : fetch(
                `/api/characters/${encodeURIComponent(slug)}?language=EN`,
                {
                  headers: authorization,
                  cache: "no-store",
                  signal: controller.signal
                }
              );

        const [targetResponse, baseResponse] = await Promise.all([
          targetRequest,
          baseRequest
        ]);
        const targetPayload = await targetResponse.json().catch(() => ({}));
        const basePayload = baseResponse
          ? await baseResponse.json().catch(() => ({}))
          : null;

        if (!targetResponse.ok || !targetPayload?.character) {
          setUnavailable(true);
          return;
        }

        const targetCharacter = targetPayload.character as Character;

        if (language !== "EN") {
          if (!baseResponse?.ok || !basePayload?.character) {
            setUnavailable(true);
            return;
          }

          const baseCharacter = basePayload.character as Character;
          if (!isLocalizedCharacterContent(baseCharacter, targetCharacter)) {
            setUnavailable(true);
            return;
          }
        }

        setCharacter(targetCharacter);
        setUnavailable(false);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setUnavailable(true);
      }
    }

    void loadCharacter();
    return () => controller.abort();
  }, [authReady, language, slug, userId]);

  if (character) {
    return (
      <ChatShell
        key={`${character.id}:${language}`}
        character={character}
      />
    );
  }

  if (!authReady || (session && !unavailable)) {
    return (
      <main className="min-h-screen px-4 py-16 md:px-6">
        <section className="bond-container">
          <div className="mx-auto max-w-2xl rounded-[2rem] border border-bond-rose/40 bg-white/[0.035] p-8 text-center shadow-[0_0_44px_rgba(255,92,168,0.10)]">
            <p className="animate-pulse text-bond-muted">
              {language === "EN"
                ? copy.privateCompanionLoading
                : finalCopy.translatingCharacter}
            </p>
          </div>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen px-4 py-16 md:px-6">
        <section className="bond-container">
          <div className="mx-auto max-w-2xl rounded-[2rem] border border-bond-rose/40 bg-white/[0.035] p-8 text-center shadow-[0_0_44px_rgba(255,92,168,0.10)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-bond-rose/15 text-bond-rose">
              <LockKeyhole size={30} />
            </div>
            <h1 className="mt-6 font-display text-4xl font-bold text-white">
              {copy.privateCompanionLoginRequired}
            </h1>
            <button
              type="button"
              onClick={openAuthModal}
              className="mt-7 rounded-full bg-bond-rose px-7 py-3 text-sm font-bold text-white"
            >
              {copy.loginSignup}
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-16 md:px-6">
      <section className="bond-container">
        <div className="mx-auto max-w-2xl rounded-[2rem] border border-bond-rose/40 bg-white/[0.035] p-8 text-center shadow-[0_0_44px_rgba(255,92,168,0.10)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-bond-rose/15 text-bond-rose">
            <LockKeyhole size={30} />
          </div>
          <h1 className="mt-6 font-display text-4xl font-bold text-white">
            {language === "EN"
              ? copy.privateCompanionUnavailable
              : finalCopy.translationUnavailable}
          </h1>
        </div>
      </section>
    </main>
  );
}
