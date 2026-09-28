"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Clapperboard,
  Gift,
  ImageIcon,
  LoaderCircle,
  MessageCircleMore,
  PhoneCall,
  Coins
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/components/auth/AuthProvider";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useSiteLanguage } from "@/lib/site-language";
import { EVERCOIN_PAGE_COPY } from "@/lib/evercoin-page-language";
import { EVERCOIN_PAYMENT_COPY } from "@/lib/evercoin-payment-language";
import { DROPP_PAYMENT_COPY } from "@/lib/dropp-payment-language";
import { localizedErrorMessage } from "@/lib/final-localization-language";

const PENDING_PAYMENT_KEY = "everbond-pending-evercoin-payment";

type BundleCode = "ec500" | "ec1000" | "ec5000";

type Bundle = {
  code: BundleCode;
  coins: number;
  amountMinor: number;
};

const BUNDLE_UI: Record<BundleCode, { name: string }> = {
  ec500: { name: "500 KissCoins" },
  ec1000: { name: "1,000 KissCoins" },
  ec5000: { name: "5,000 KissCoins" }
};

export default function CoinsPage() {
  return (
    <AppShell>
      <CoinsPageContent />
    </AppShell>
  );
}

function CoinsPageContent() {
  const { language } = useSiteLanguage();
  const pageCopy = EVERCOIN_PAGE_COPY[language] ?? EVERCOIN_PAGE_COPY.EN;
  const paymentCopy =
    EVERCOIN_PAYMENT_COPY[language] ?? EVERCOIN_PAYMENT_COPY.EN;
  const droppCopy = DROPP_PAYMENT_COPY[language] ?? DROPP_PAYMENT_COPY.EN;
  const { session, authReady, openAuthModal } = useAuth();

  const [busyCode, setBusyCode] = useState<BundleCode | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [callCost, setCallCost] = useState(69);
  const [imageCost, setImageCost] = useState(20);
  const [videoCost, setVideoCost] = useState(90);
  const [paymentReady, setPaymentReady] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState("");
  const [bundles, setBundles] = useState<Bundle[]>([]);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      fetch("/api/evercoin/pricing", { cache: "no-store" })
        .then((response) => response.json().catch(() => ({})))
        .catch(() => ({})),
      fetch("/api/evercoin/checkout", { cache: "no-store" })
        .then((response) => response.json().catch(() => ({})))
        .catch(() => ({}))
    ]).then(([pricing, checkout]) => {
      if (cancelled) return;

      const nextCallCost = Number(pricing?.callCostPerMinute);
      const nextImageCost = Number(pricing?.imageCost);
      const nextVideoCost = Number(pricing?.videoCost);

      if (Number.isFinite(nextCallCost) && nextCallCost > 0) {
        setCallCost(Math.trunc(nextCallCost));
      }
      if (Number.isFinite(nextImageCost) && nextImageCost > 0) {
        setImageCost(Math.trunc(nextImageCost));
      }
      if (Number.isFinite(nextVideoCost) && nextVideoCost > 0) {
        setVideoCost(Math.trunc(nextVideoCost));
      }

      const nextBundles: Bundle[] = Array.isArray(checkout?.bundles)
        ? checkout.bundles.filter(
            (bundle: unknown): bundle is Bundle => {
              if (!bundle || typeof bundle !== "object") return false;
              const value = bundle as Record<string, unknown>;
              return (
                ["ec500", "ec1000", "ec5000"].includes(String(value.code)) &&
                Number.isSafeInteger(Number(value.coins)) &&
                Number.isSafeInteger(Number(value.amountMinor))
              );
            }
          )
        : [];

      setBundles(nextBundles);
      setPaymentReady(checkout?.dropp === true && nextBundles.length === 3);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token || typeof window === "undefined") return;
    const storedOrderId =
      window.localStorage.getItem(PENDING_PAYMENT_KEY) || "";
    if (storedOrderId) setPendingOrderId(storedOrderId);
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token || !pendingOrderId) return;

    let cancelled = false;
    let attempts = 0;

    async function checkPending() {
      if (cancelled) return;
      attempts += 1;

      try {
        const response = await fetch(
          `/api/evercoin/checkout/status?orderId=${encodeURIComponent(
            pendingOrderId
          )}`,
          {
            headers: {
              Authorization: `Bearer ${session!.access_token}`
            },
            cache: "no-store"
          }
        );
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (payload?.status === "paid") {
          window.localStorage.removeItem(PENDING_PAYMENT_KEY);
          setPendingOrderId("");
          setNotice(paymentCopy.paid);
          setBusyCode(null);
          return;
        }

        if (
          response.status === 404 &&
          payload?.error === "PAYMENT_ORDER_NOT_FOUND"
        ) {
          window.localStorage.removeItem(PENDING_PAYMENT_KEY);
          setPendingOrderId("");
          setBusyCode(null);
          return;
        }

        if (
          payload?.status === "expired" ||
          payload?.status === "failed" ||
          payload?.status === "cancelled" ||
          payload?.status === "refunded"
        ) {
          window.localStorage.removeItem(PENDING_PAYMENT_KEY);
          setPendingOrderId("");
          setNotice(paymentCopy.expired);
          setBusyCode(null);
          return;
        }

        if (response.ok && attempts < 180) {
          window.setTimeout(checkPending, 2000);
        } else if (response.ok) {
          setNotice(paymentCopy.pending);
          setBusyCode(null);
        }
      } catch {
        if (!cancelled && attempts < 180) {
          window.setTimeout(checkPending, 2500);
        } else if (!cancelled) {
          setNotice(paymentCopy.pending);
          setBusyCode(null);
        }
      }
    }

    void checkPending();
    return () => {
      cancelled = true;
    };
  }, [
    pendingOrderId,
    session?.access_token,
    paymentCopy.expired,
    paymentCopy.paid,
    paymentCopy.pending
  ]);

  const items = useMemo(
    () => [
      {
        icon: MessageCircleMore,
        title: pageCopy.messagesTitle,
        body: pageCopy.messagesBody,
        rate: pageCopy.messageRate
      },
      {
        icon: Gift,
        title: pageCopy.giftsTitle,
        body: pageCopy.giftsBody,
        rate: pageCopy.giftRate
      },
      {
        icon: ImageIcon,
        title: pageCopy.imagesTitle,
        body: pageCopy.imagesBody,
        rate: `${imageCost} KissCoins / ${pageCopy.imageUnit}`
      },
      {
        icon: Clapperboard,
        title: pageCopy.videosTitle,
        body: pageCopy.videosBody,
        rate: `${videoCost} KissCoins / ${pageCopy.videoUnit}`
      },
      {
        icon: PhoneCall,
        title: pageCopy.voiceCallsTitle,
        body: pageCopy.voiceCallsBody,
        rate: `${callCost} KissCoins / ${pageCopy.minuteUnit}`
      }
    ],
    [callCost, imageCost, pageCopy, videoCost]
  );

  async function startDroppPayment(bundle: Bundle) {
    if (!authReady || busyCode) return;

    if (!session?.access_token) {
      openAuthModal();
      return;
    }

    const checkoutWindow = window.open("about:blank", "_blank");
    if (checkoutWindow) {
      try {
        checkoutWindow.opener = null;
        checkoutWindow.document.title = "Uncensored Girlfriend Secure Checkout";
        checkoutWindow.document.body.innerHTML =
          '<p style="font-family:sans-serif;padding:24px">Opening secure checkout…</p>';
      } catch {
        // Navigation below is still safe if the temporary window is opaque.
      }
    }

    setBusyCode(bundle.code);
    setError("");
    setNotice(droppCopy.opening);

    try {
      const response = await fetch("/api/evercoin/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ bundleCode: bundle.code })
      });

      const payload = await response.json().catch(() => ({}));
      if (
        !response.ok ||
        payload?.mode !== "redirect" ||
        payload?.provider !== "dropp" ||
        typeof payload?.url !== "string" ||
        typeof payload?.orderId !== "string"
      ) {
        if (payload?.error === "PAYMENT_RAIL_NOT_CONFIGURED") {
          throw new Error(paymentCopy.unavailable);
        }

        throw new Error(
          localizedErrorMessage(
            payload?.message ?? payload?.error,
            language,
            pageCopy.checkoutFailed,
            "checkout"
          )
        );
      }

      window.localStorage.setItem(PENDING_PAYMENT_KEY, payload.orderId);
      setPendingOrderId(payload.orderId);

      // Clear the temporary opening notice. No persistent "checkout opened"
      // message is shown on the Buy EverCoin page.
      setNotice("");

      setBusyCode(null);

      if (checkoutWindow && !checkoutWindow.closed) {
        checkoutWindow.location.replace(payload.url);
      } else {
        window.location.assign(payload.url);
      }
    } catch (checkoutError) {
      if (checkoutWindow && !checkoutWindow.closed) checkoutWindow.close();
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : pageCopy.checkoutFailed
      );
      setNotice("");
      setBusyCode(null);
    }
  }

  return (
    <main className="px-4 py-10 md:px-6">
      <SectionHeader
        eyebrow="KissCoins"
        title={pageCopy.title}
        description={pageCopy.description}
      />

      <section className="mx-auto mb-12 max-w-6xl">
        <div className="grid gap-6 md:grid-cols-3">
          {bundles.map((bundle) => {
            const ui = BUNDLE_UI[bundle.code];
            const busy = busyCode === bundle.code;

            return (
              <article
                key={bundle.code}
                className="eb-neon-card flex h-full flex-col overflow-hidden rounded-[2rem] border border-bond-rose/25 bg-white/[0.035] p-4 transition hover:-translate-y-1 hover:border-bond-rose/55"
              >
                <div className="ug-coins-visual" aria-label={`${bundle.coins.toLocaleString()} KissCoins`}>
                  <div className="ug-coin-icon"><Coins size={68} strokeWidth={1.45}/></div>
                  <strong>{bundle.coins.toLocaleString()}</strong><span>KISSCOINS</span>
                </div>

                <div className="flex flex-1 flex-col px-2 pb-2 pt-5 text-center">
                  <h3 className="font-display text-2xl font-bold text-white">
                    {ui.name}
                  </h3>

                  <p className="mt-3 font-display text-4xl font-bold text-bond-rose">
                    ${(bundle.amountMinor / 100).toFixed(2)}
                  </p>

                  <button
                    type="button"
                    onClick={() => void startDroppPayment(bundle)}
                    disabled={!authReady || Boolean(busyCode) || !paymentReady}
                    className="bond-pink-button mt-auto flex w-full items-center justify-center gap-2 rounded-xl px-5 py-4 text-base font-bold disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {busy && <LoaderCircle size={18} className="animate-spin" />}
                    {paymentReady ? droppCopy.buy : paymentCopy.unavailable}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mx-auto mt-6 max-w-2xl text-center">
          <p className="text-lg font-semibold text-white/90">
            {droppCopy.secureNote}
          </p>

          {notice && (
            <p className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white">
              {notice}
            </p>
          )}

          {error && (
            <p className="mt-4 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-bond-rose/15 text-bond-rose">
                <Icon size={20} />
              </div>
              <h3 className="font-display text-lg font-bold leading-tight">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-5 text-bond-muted">
                {item.body}
              </p>
              <p className="mt-4 inline-flex rounded-full border border-bond-rose/35 bg-bond-rose/10 px-2.5 py-1.5 text-xs font-bold text-bond-rose">
                {item.rate}
              </p>
            </div>
          );
        })}
      </div>
    </main>
  );
}
