"use client";

import Link from "next/link";
import { Gift, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { EverShopGift } from "@/lib/evershop/catalog";
import { EVERSHOP_COPY } from "@/lib/evershop-language";
import { localizeEverShopGift } from "@/lib/evershop/localization";
import { useSiteLanguage } from "@/lib/site-language";

type OwnedGift = EverShopGift & { quantity: number };

export function MyBondGiftInventorySection({
  session
}: {
  session: Session;
}) {
  const { language } = useSiteLanguage();
  const copy = EVERSHOP_COPY[language] ?? EVERSHOP_COPY.EN;
  const [items, setItems] = useState<OwnedGift[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

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
  }, [session.access_token]);

  return (
    <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.025] p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-bold text-bond-rose">
            {copy.inventoryTitle}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-bond-muted">
            {copy.inventoryDescription}
          </p>
        </div>
        <Link
          href="/shop"
          className="bond-pink-button inline-flex items-center gap-2 rounded-full bg-bond-rose px-5 py-3 text-sm font-bold text-white"
        >
          <ShoppingBag size={16} />
          {copy.visitEverShop}
        </Link>
      </div>

      {loading ? (
        <div className="mt-6 rounded-[1.5rem] border border-dashed border-white/10 p-8 text-center text-bond-muted">
          <span className="animate-pulse">...</span>
        </div>
      ) : items.length ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((gift) => {
            const localizedGift = localizeEverShopGift(
              gift,
              language
            );

            return (
              <article
                key={localizedGift.id}
                className="flex items-center gap-3 rounded-[1.25rem] border border-white/10 bg-black/25 p-3"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-black">
                  <img
                    src={localizedGift.image}
                    alt={localizedGift.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-2 text-sm font-bold leading-5 text-white">
                    {localizedGift.title}
                  </h3>
                  <p className="mt-1 text-xs font-semibold text-bond-rose">
                    {copy.quantity}: {localizedGift.quantity}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-[1.5rem] border border-dashed border-white/10 p-8 text-center">
          <Gift className="mx-auto text-bond-rose" size={28} />
          <p className="mt-3 text-bond-muted">
            {copy.inventoryEmpty}
          </p>
        </div>
      )}
    </section>
  );
}
