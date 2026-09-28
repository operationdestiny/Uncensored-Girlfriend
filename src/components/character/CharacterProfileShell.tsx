"use client";

import Link from "next/link";
import { useState } from "react";
import { Flag, RefreshCcw, Share2, X } from "lucide-react";
import { FavoriteButton } from "@/components/character/FavoriteButton";
import { Character } from "@/types/character";
import { useSiteLanguage } from "@/lib/site-language";
import { CHARACTER_TOOLS_COPY } from "@/lib/character-tools-language";

type ReportReason = "bug" | "safety" | "other";

export function CharacterProfileShell({ character }: { character: Character }) {
  const { t, language } = useSiteLanguage();
  const copy =
    CHARACTER_TOOLS_COPY[language] ?? CHARACTER_TOOLS_COPY.EN;
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason | null>(null);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  function shareCompanion() {
    if (typeof window === "undefined") return;

    const url = window.location.href;

    if (navigator.share) {
      navigator
        .share({
          title: `${character.name} on Uncensored Girlfriend`,
          text: character.description,
          url
        })
        .catch(() => undefined);
    } else {
      navigator.clipboard?.writeText(url);
    }
  }

  function closeReport() {
    setReportOpen(false);
    setReportReason(null);
    setReportSubmitted(false);
  }

  const displayTags = character.tags
    .filter((tag) => tag !== "Memory")
    .slice(0, 4);
  const similarTag =
    character.tags.find((item) => item !== "Memory") ?? "Romance";
  const similarHref = `/characters?tag=${encodeURIComponent(similarTag)}`;

  const reportOptions: Array<{ value: ReportReason; label: string }> = [
    { value: "bug", label: copy.bugGlitch },
    { value: "safety", label: copy.safetyIssue },
    { value: "other", label: copy.other }
  ];

  return (
    <>
      <main className="min-h-[calc(100vh-64px)] px-4 py-10 md:px-6">
        <section className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[420px_1fr]">
          <div>
            <div className="overflow-hidden rounded-[2rem] border border-bond-rose/25 bg-white/[0.035] shadow-[0_0_34px_rgba(255,92,168,0.08)]">
              <img
                src={character.image}
                alt={character.name}
                className="aspect-[4/5] w-full object-cover"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {displayTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-bond-rose/55 bg-black/30 px-3 py-1.5 text-xs text-bond-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col justify-center">
            <div className="rounded-[2rem] border border-bond-rose/35 bg-white/[0.035] p-6 shadow-[0_0_34px_rgba(255,92,168,0.08)] md:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="rounded-full border border-bond-rose/70 bg-black/35 px-6 py-3 text-center font-display text-3xl font-bold leading-tight text-white shadow-[0_0_18px_rgba(255,92,168,0.10)] md:text-4xl">
                  {character.name}
                </h1>

                <div className="flex items-center gap-2">
                  <FavoriteButton
                    characterId={character.id}
                    characterName={character.name}
                    characterImage={character.image}
                    className="bond-pink-button flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/[0.035]"
                    iconSize={17}
                  />
                  <button
                    type="button"
                    onClick={shareCompanion}
                    className="bond-pink-button flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/[0.035] text-white"
                    aria-label={t("share")}
                  >
                    <Share2 size={17} />
                  </button>
                  <Link
                    href={`/chat/${character.slug}`}
                    className="bond-pink-button flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/[0.035] text-white"
                    aria-label={t("refresh")}
                  >
                    <RefreshCcw size={17} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setReportReason(null);
                      setReportSubmitted(false);
                      setReportOpen(true);
                    }}
                    className="bond-pink-button flex h-10 w-10 items-center justify-center rounded-full border border-bond-rose/70 bg-bond-rose/10 text-white"
                    aria-label={t("report")}
                  >
                    <Flag size={17} />
                  </button>
                </div>
              </div>

              <p className="mt-6 text-base leading-8 text-bond-muted">
                {character.description}
              </p>

              <div className="mt-6 rounded-[1.5rem] border border-bond-rose/55 bg-black/25 p-5 text-sm leading-7 text-bond-text">
                {character.openingMessage}
              </div>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href={`/chat/${character.slug}`}
                  className="bond-pink-button inline-flex rounded-full bg-bond-rose px-7 py-3 text-sm font-bold text-white shadow-[0_0_18px_rgba(255,92,168,0.18)]"
                >
                  {t("startChatting")}
                </Link>
                <Link
                  href={similarHref}
                  className="bond-pink-button inline-flex rounded-full border border-bond-rose/70 bg-black/35 px-7 py-3 text-sm font-bold text-white shadow-[0_0_14px_rgba(255,92,168,0.08)] transition hover:bg-bond-rose/10"
                >
                  {t("similarCompanions")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {reportOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeReport();
          }}
        >
          <div className="relative w-full max-w-md rounded-[2rem] border border-bond-rose/60 bg-bond-card p-6 shadow-[0_0_38px_rgba(255,92,168,0.24)] md:p-8">
            <button
              type="button"
              onClick={closeReport}
              className="absolute right-4 top-4 rounded-full bg-black/45 p-2 text-bond-muted transition hover:text-white"
              aria-label={t("close")}
            >
              <X size={18} />
            </button>

            {!reportSubmitted ? (
              <>
                <h2 className="pr-10 font-display text-3xl font-bold text-bond-rose">
                  {copy.reportCharacter}
                </h2>
                <p className="mt-3 text-sm text-bond-muted">
                  {copy.chooseReportReason}
                </p>

                <div className="mt-6 space-y-3">
                  {reportOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setReportReason(option.value)}
                      className={`w-full rounded-2xl border px-5 py-4 text-left text-sm font-bold transition ${
                        reportReason === option.value
                          ? "border-bond-rose bg-bond-rose/15 text-white"
                          : "border-white/10 bg-white/[0.03] text-bond-muted hover:border-bond-rose/45 hover:text-white"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={!reportReason}
                  onClick={() => setReportSubmitted(true)}
                  className="mt-6 w-full rounded-full bg-bond-rose px-6 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {copy.submitReport}
                </button>
              </>
            ) : (
              <div className="py-8 text-center">
                <p className="font-display text-3xl font-bold text-bond-rose">
                  {copy.reportSubmitted}
                </p>
                <button
                  type="button"
                  onClick={closeReport}
                  className="mt-7 rounded-full bg-bond-rose px-7 py-3 text-sm font-bold text-white"
                >
                  {t("close")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
