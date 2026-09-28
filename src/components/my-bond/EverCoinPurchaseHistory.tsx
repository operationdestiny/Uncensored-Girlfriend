"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LoaderCircle, ReceiptText } from "lucide-react";
import { useSiteLanguage } from "@/lib/site-language";

type Purchase = {
  id: string;
  packCode: string;
  coinsGranted: number;
  coinsReversed: number;
  totalMinor: number | null;
  currencyCode: string;
  status: string;
  createdAt: string;
};

const LOCALES = {
  EN: "en-US",
  ES: "es-ES",
  FR: "fr-FR",
  DE: "de-DE",
  JA: "ja-JP",
  KO: "ko-KR"
} as const;

const COPY = {
  EN: {
    title: "Purchase History",
    loading: "Loading purchases...",
    empty: "No KissCoins purchases yet.",
    emptyDetail: "Completed KissCoins purchases will appear here automatically.",
    completed: "Completed",
    partial: "Partially refunded",
    refunded: "Refunded",
    reversed: "reversed",
    loadFailed: "Purchase history could not be loaded."
  },
  ES: {
    title: "Historial de compras",
    loading: "Cargando compras...",
    empty: "Aún no hay compras de KissCoins.",
    emptyDetail: "Las compras completadas de KissCoins aparecerán aquí automáticamente.",
    completed: "Completada",
    partial: "Reembolso parcial",
    refunded: "Reembolsada",
    reversed: "revertidos",
    loadFailed: "No se pudo cargar el historial de compras."
  },
  FR: {
    title: "Historique des achats",
    loading: "Chargement des achats...",
    empty: "Aucun achat KissCoins pour le moment.",
    emptyDetail: "Les achats KissCoins terminés apparaîtront ici automatiquement.",
    completed: "Terminé",
    partial: "Partiellement remboursé",
    refunded: "Remboursé",
    reversed: "annulés",
    loadFailed: "Impossible de charger l’historique des achats."
  },
  DE: {
    title: "Kaufverlauf",
    loading: "Käufe werden geladen...",
    empty: "Noch keine KissCoins-Käufe.",
    emptyDetail: "Abgeschlossene KissCoins-Käufe erscheinen hier automatisch.",
    completed: "Abgeschlossen",
    partial: "Teilweise erstattet",
    refunded: "Erstattet",
    reversed: "zurückgebucht",
    loadFailed: "Der Kaufverlauf konnte nicht geladen werden."
  },
  JA: {
    title: "購入履歴",
    loading: "購入履歴を読み込み中...",
    empty: "KissCoinsの購入履歴はまだありません。",
    emptyDetail: "完了したKissCoins購入はここに自動的に表示されます。",
    completed: "完了",
    partial: "一部返金",
    refunded: "返金済み",
    reversed: "返金済み",
    loadFailed: "購入履歴を読み込めませんでした。"
  },
  KO: {
    title: "구매 내역",
    loading: "구매 내역 불러오는 중...",
    empty: "아직 KissCoins 구매 내역이 없습니다.",
    emptyDetail: "완료된 KissCoins 구매가 여기에 자동으로 표시됩니다.",
    completed: "완료",
    partial: "부분 환불",
    refunded: "환불됨",
    reversed: "회수됨",
    loadFailed: "구매 내역을 불러오지 못했습니다."
  }
} as const;

function safeCurrency(
  totalMinor: number | null,
  currencyCode: string,
  locale: string
) {
  if (totalMinor === null || !Number.isFinite(totalMinor)) {
    return "—";
  }

  const currency = /^[A-Z]{3}$/.test(currencyCode)
    ? currencyCode
    : "USD";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency
    }).format(totalMinor / 100);
  } catch {
    return `$${(totalMinor / 100).toFixed(2)}`;
  }
}

function safeDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

export function EverCoinPurchaseHistory({
  session
}: {
  session: Session;
}) {
  const { language } = useSiteLanguage();
  const copy = COPY[language] ?? COPY.EN;
  const locale = LOCALES[language] ?? LOCALES.EN;
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/evercoin/purchases", {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          },
          cache: "no-store"
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(copy.loadFailed);
        }

        if (!cancelled) {
          setPurchases(
            Array.isArray(payload?.purchases)
              ? payload.purchases
              : []
          );
        }
      } catch {
        if (!cancelled) setError(copy.loadFailed);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [session.access_token, copy.loadFailed]);

  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.025] p-6 md:p-8">
      <p className="text-sm font-bold uppercase tracking-[0.22em] text-bond-rose">
        {copy.title}
      </p>

      {loading ? (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-[1.5rem] border border-dashed border-white/10 p-6 text-sm text-bond-muted">
          <LoaderCircle size={16} className="animate-spin" />
          {copy.loading}
        </div>
      ) : error ? (
        <div className="mt-6 rounded-[1.5rem] border border-red-400/20 bg-red-500/[0.06] p-6 text-center text-sm text-red-100">
          {error}
        </div>
      ) : purchases.length === 0 ? (
        <div className="mt-6 rounded-[1.5rem] border border-dashed border-white/10 p-6 text-center">
          <p className="font-semibold text-white">{copy.empty}</p>
          <p className="mt-2 text-sm leading-6 text-bond-muted">
            {copy.emptyDetail}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {purchases.map((purchase) => {
            const reversed = Math.min(
              Math.max(Math.trunc(purchase.coinsReversed), 0),
              Math.max(Math.trunc(purchase.coinsGranted), 0)
            );
            const status =
              purchase.status === "reversed"
                ? copy.refunded
                : purchase.status === "partially_reversed" || reversed > 0
                  ? copy.partial
                  : copy.completed;

            return (
              <article
                key={purchase.id}
                className="flex items-center gap-4 rounded-[1.35rem] border border-white/10 bg-black/20 p-4"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bond-rose/15 text-bond-rose">
                  <ReceiptText size={19} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-display text-lg font-bold text-white">
                      {purchase.coinsGranted.toLocaleString(locale)} KissCoins
                    </p>
                    <p className="font-bold text-white">
                      {safeCurrency(
                        purchase.totalMinor,
                        purchase.currencyCode,
                        locale
                      )}
                    </p>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-bond-muted">
                    <span>{safeDate(purchase.createdAt, locale)}</span>
                    <span className="font-semibold text-bond-rose">
                      {status}
                    </span>
                  </div>

                  {reversed > 0 && (
                    <p className="mt-2 text-xs text-bond-muted">
                      {reversed.toLocaleString(locale)} KissCoins {copy.reversed}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
