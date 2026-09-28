"use client";

import Link from "next/link";
import { Coins, X } from "lucide-react";
import { useSiteLanguage } from "@/lib/site-language";
import { MEDIA_COPY } from "@/lib/media-language";
import { FINAL_LOCALIZATION_COPY } from "@/lib/final-localization-language";

export function InsufficientEverCoinModal({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { language } = useSiteLanguage();
  const copy = MEDIA_COPY[language] ?? MEDIA_COPY.EN;
  const finalCopy =
    FINAL_LOCALIZATION_COPY[language] ?? FINAL_LOCALIZATION_COPY.EN;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="evercoin-modal-title"
    >
      <div className="relative w-full max-w-md rounded-[2rem] border border-bond-rose/65 bg-bond-card p-8 text-center shadow-[0_0_48px_rgba(255,92,168,0.22)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full bg-white/[0.05] p-2 text-bond-muted hover:text-white"
          aria-label={finalCopy.close}
        >
          <X size={18} />
        </button>

        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-bond-rose/15 text-bond-rose shadow-[0_0_28px_rgba(255,92,168,0.18)]">
          <Coins size={30} />
        </div>

        <p
          id="evercoin-modal-title"
          className="mt-6 font-display text-2xl font-bold text-white"
        >
          {copy.insufficientCoins}
        </p>

        <Link
          href="/coins"
          className="bond-pink-button mt-7 inline-flex rounded-full bg-bond-rose px-7 py-3 text-sm font-bold text-white"
        >
          {copy.buyEverCoin}
        </Link>
      </div>
    </div>
  );
}
