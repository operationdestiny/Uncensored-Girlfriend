"use client";

import Link from "next/link";
import { Gift, ShoppingBag, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { EverShopGift } from "@/lib/evershop/catalog";
import { EVERSHOP_COPY } from "@/lib/evershop-language";
import { localizeEverShopGift } from "@/lib/evershop/localization";
import { useSiteLanguage } from "@/lib/site-language";

export type OwnedGift = EverShopGift & { quantity: number };

export function ChatGiftPicker({
  open,
  session,
  characterName,
  sendingGiftId,
  onClose,
  onSend
}: {
  open: boolean;
  session: Session | null;
  characterName: string;
  sendingGiftId: number | null;
  onClose: () => void;
  onSend: (gift: OwnedGift) => void;
}) {
  const { language } = useSiteLanguage();
  const copy = EVERSHOP_COPY[language] ?? EVERSHOP_COPY.EN;
  const [items, setItems] = useState<OwnedGift[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !session?.access_token) {
      if (!session) setItems([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void fetch("/api/evershop/inventory", {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      },
      cache: "no-store"
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) {
          setItems(Array.isArray(payload?.items) ? payload.items : []);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, session?.access_token]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="relative max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-[2rem] border border-bond-rose/55 bg-bond-card shadow-[0_0_44px_rgba(255,92,168,0.24)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-black/45 p-2 text-white"
          aria-label={copy.close}
        >
          <X size={18} />
        </button>

        <header className="border-b border-white/10 p-6 md:p-8">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-bond-rose">
            {copy.giftPickerTitle}
          </p>
          <h2 className="mt-2 pr-10 font-display text-3xl font-bold text-white">
            {copy.giftPickerTitle} — {characterName}
          </h2>
          <p className="mt-3 text-sm leading-6 text-bond-muted">
            {copy.giftPickerDescription}
          </p>
        </header>

        <div className="no-scrollbar max-h-[58vh] overflow-y-auto p-5 md:p-6">
          {loading ? (
            <div className="rounded-[1.5rem] border border-dashed border-white/10 p-10 text-center text-bond-muted">
              <span className="animate-pulse">...</span>
            </div>
          ) : items.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((gift) => {
                const localizedGift = localizeEverShopGift(
                  gift,
                  language
                );
                const sending =
                  sendingGiftId === localizedGift.id;

                return (
                  <article
                    key={localizedGift.id}
                    className="flex items-center gap-3 rounded-[1.25rem] border border-white/10 bg-black/25 p-3"
                  >
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-black">
                      <img
                        src={localizedGift.image}
                        alt={localizedGift.title}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-sm font-bold leading-5 text-white">
                        {localizedGift.title}
                      </h3>
                      <p className="mt-1 text-xs font-semibold text-bond-rose">
                        {copy.quantity}: {localizedGift.quantity}
                      </p>
                      <button
                        type="button"
                        onClick={() => onSend(localizedGift)}
                        disabled={sendingGiftId !== null}
                        className="bond-pink-button mt-2 inline-flex items-center gap-1.5 rounded-full bg-bond-rose px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Gift size={13} />
                        {sending ? copy.sendingGift : copy.sendGift}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-white/10 p-10 text-center">
              <Gift className="mx-auto text-bond-rose" size={30} />
              <p className="mt-4 text-bond-muted">{copy.noGiftsToSend}</p>
              <Link
                href={`/shop?for=${encodeURIComponent(characterName)}`}
                className="bond-pink-button mt-5 inline-flex items-center gap-2 rounded-full bg-bond-rose px-5 py-2.5 text-sm font-bold text-white"
              >
                <ShoppingBag size={15} />
                {copy.visitEverShop}
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
