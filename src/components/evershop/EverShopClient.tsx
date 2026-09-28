"use client";

import { Coins, Gift } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { InsufficientEverCoinModal } from "@/components/media/InsufficientEverCoinModal";
import {
  EVERSHOP_CATEGORIES,
  EVERSHOP_GIFTS,
  type EverShopCategory,
  type EverShopGift
} from "@/lib/evershop/catalog";
import { EVERSHOP_COPY } from "@/lib/evershop-language";
import { localizeEverShopGift } from "@/lib/evershop/localization";
import {
  useSiteLanguage
} from "@/lib/site-language";

type InventoryResponse = {
  items?: Array<EverShopGift & { quantity: number }>;
};

const categoryCopyKey: Record<
  EverShopCategory,
  keyof typeof EVERSHOP_COPY.EN
> = {
  all: "all",
  romance: "romance",
  "clothing-jewelry": "clothingJewelry",
  luxury: "luxury",
  "food-treats": "foodTreats",
  magical: "magical"
};

export function EverShopClient({
  shoppingFor
}: {
  shoppingFor: string;
}) {
  const { language } = useSiteLanguage();
  const copy = EVERSHOP_COPY[language] ?? EVERSHOP_COPY.EN;
  const { session, authReady, openAuthModal } = useAuth();

  const [category, setCategory] =
    useState<EverShopCategory>("all");
  const [owned, setOwned] = useState<Record<number, number>>({});
  const [buyingId, setBuyingId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [coinModalOpen, setCoinModalOpen] = useState(false);

  const visibleGifts = useMemo(() => {
    const gifts =
      category === "all"
        ? EVERSHOP_GIFTS
        : EVERSHOP_GIFTS.filter(
            (gift) => gift.category === category
          );

    return gifts.map((gift) =>
      localizeEverShopGift(gift, language)
    );
  }, [category, language]);

  async function loadInventory() {
    if (!session?.access_token) {
      setOwned({});
      return;
    }

    const response = await fetch("/api/evershop/inventory", {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      },
      cache: "no-store"
    });

    const payload = (await response
      .json()
      .catch(() => ({}))) as InventoryResponse;

    if (!response.ok) return;

    const nextOwned: Record<number, number> = {};

    for (const item of payload.items ?? []) {
      nextOwned[item.id] = item.quantity;
    }

    setOwned(nextOwned);
  }

  useEffect(() => {
    if (!authReady) return;
    void loadInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, session?.access_token]);

  async function purchaseGift(gift: EverShopGift) {
    if (!session?.access_token) {
      setError(copy.signInToBuy);
      setNotice("");
      openAuthModal();
      return;
    }

    setBuyingId(gift.id);
    setError("");
    setNotice("");
    setCoinModalOpen(false);

    try {
      const response = await fetch("/api/evershop/purchase", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          giftId: gift.id
        })
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (payload?.error === "INSUFFICIENT_EVERCOIN") {
          setCoinModalOpen(true);
          return;
        }

        if (payload?.error === "EVERCOIN_DEBT") {
          throw new Error(copy.walletDebt);
        }

        throw new Error(copy.purchaseFailed);
      }

      setOwned((current) => ({
        ...current,
        [gift.id]: Number(
          payload.quantity ?? (current[gift.id] ?? 0) + 1
        )
      }));
      setNotice(`${gift.title}: ${copy.purchaseComplete}`);
    } catch (purchaseError) {
      setError(
        purchaseError instanceof Error
          ? purchaseError.message
          : copy.purchaseFailed
      );
    } finally {
      setBuyingId(null);
    }
  }

  return (
    <>
      <main className="min-h-screen px-4 pb-10 pt-2 md:px-6 md:pb-12 md:pt-3">
        <section className="bond-container">
          <div className="mx-auto max-w-[1500px]">
            <section className="ug-shop-hero">
              <p className="ug-kicker">A LITTLE SOMETHING SPECIAL</p>
              <h1>Gift <em>Shop</em></h1>
              <p>Find the perfect surprise for your favorite companion — thoughtful gifts, unforgettable moments.</p>
              <div className="ug-shop-hero-icon" aria-hidden="true"><Gift size={76} strokeWidth={1.4}/></div>
            </section>

            {shoppingFor && (
              <div className="mt-3 flex justify-center">
                <p className="inline-flex rounded-full border border-bond-rose/45 bg-black/25 px-4 py-2 text-sm font-bold text-white">
                  {copy.shoppingFor}: {shoppingFor}
                </p>
              </div>
            )}

            {(notice || error) && (
              <div
                className={`mt-4 rounded-2xl border px-5 py-4 text-sm ${
                  error
                    ? "border-red-400/25 bg-red-500/10 text-red-100"
                    : "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                }`}
              >
                {error || notice}
              </div>
            )}

            <div className="mt-4 flex flex-wrap justify-center gap-2.5">
              {EVERSHOP_CATEGORIES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className={`rounded-full border px-5 py-2.5 text-sm font-bold transition ${
                    category === item
                      ? "border-bond-rose bg-bond-rose text-white"
                      : "border-bond-rose/40 bg-white/[0.025] text-bond-muted hover:border-bond-rose/70 hover:text-white"
                  }`}
                >
                  {String(copy[categoryCopyKey[item]])}
                </button>
              ))}
            </div>

            <section className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {visibleGifts.map((gift) => {
                const quantity = owned[gift.id] ?? 0;
                const buying = buyingId === gift.id;

                return (
                  <article
                    key={gift.id}
                    className="flex overflow-hidden rounded-[1.15rem] border border-white/10 bg-white/[0.03] shadow-[0_0_26px_rgba(255,92,168,0.04)] sm:rounded-[1.6rem]"
                  >
                    <div className="flex w-full flex-col">
                      <div className="relative aspect-square overflow-hidden bg-black/30">
                        <img
                          src={gift.image}
                          alt={gift.title}
                          loading="lazy"
                          className="h-full w-full object-cover transition duration-500 hover:scale-105"
                        />

                        {quantity > 0 && (
                          <span className="absolute right-2 top-2 rounded-full bg-bond-rose px-2 py-1 text-[9px] font-bold text-white shadow-glow sm:right-3 sm:top-3 sm:px-3 sm:text-[11px]">
                            {copy.owned} × {quantity}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col p-2.5 sm:p-4">
                        <h2 className="font-display text-sm font-bold leading-tight text-white sm:text-lg">
                          {gift.title}
                        </h2>
                        <p className="mt-2 text-[11px] leading-4 text-bond-muted sm:mt-3 sm:text-sm sm:leading-6">
                          {gift.description}
                        </p>

                        <div className="mt-auto flex min-w-0 items-center justify-between gap-1.5 pt-3 sm:gap-3 sm:pt-5">
                          <div
                            className="flex min-w-0 items-center gap-1 font-display text-base font-bold text-white sm:gap-1.5 sm:text-xl"
                            aria-label={`${gift.price} ${copy.everCoin}`}
                          >
                            <Coins
                              size={18}
                              className="shrink-0 text-bond-rose"
                            />
                            {gift.price}
                          </div>

                          <button
                            type="button"
                            onClick={() => void purchaseGift(gift)}
                            disabled={buyingId !== null}
                            className="bond-pink-button inline-flex shrink-0 items-center gap-1 rounded-full bg-bond-rose px-2 py-2 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
                          >
                            <Gift size={15} />
                            {buying ? copy.buying : copy.buyGift}
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          </div>
        </section>
      </main>

      <InsufficientEverCoinModal
        open={coinModalOpen}
        onClose={() => setCoinModalOpen(false)}
      />
    </>
  );
}
