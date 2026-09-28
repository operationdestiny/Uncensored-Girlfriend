import type { LanguageCode } from "@/lib/site-language";

type DroppPaymentCopy = {
  bundleTitle: string;
  bundlePrompt: string;
  buy: string;
  opening: string;
  secureNote: string;
};

export const DROPP_PAYMENT_COPY: Record<LanguageCode, DroppPaymentCopy> = {
  EN: {
    bundleTitle: "Buy KissCoins",
    bundlePrompt: "Choose your KissCoins bundle.",
    buy: "Buy KissCoins",
    opening: "Opening secure checkout...",
    secureNote: "One-time payment. No subscription."
  },
  ES: {
    bundleTitle: "Comprar KissCoins",
    bundlePrompt: "Elige tu paquete de KissCoins.",
    buy: "Comprar KissCoins",
    opening: "Abriendo el pago seguro...",
    secureNote: "Pago único. Sin suscripción."
  },
  FR: {
    bundleTitle: "Acheter des KissCoins",
    bundlePrompt: "Choisissez votre lot d’KissCoins.",
    buy: "Acheter des KissCoins",
    opening: "Ouverture du paiement sécurisé...",
    secureNote: "Paiement unique. Aucun abonnement."
  },
  DE: {
    bundleTitle: "KissCoins kaufen",
    bundlePrompt: "Wähle dein KissCoins-Paket.",
    buy: "KissCoins kaufen",
    opening: "Sichere Zahlung wird geöffnet...",
    secureNote: "Einmalige Zahlung. Kein Abonnement."
  },
  JA: {
    bundleTitle: "KissCoinsを購入",
    bundlePrompt: "KissCoinsパックを選択してください。",
    buy: "KissCoinsを購入",
    opening: "安全な決済を開いています...",
    secureNote: "1回限りの支払いです。サブスクリプションではありません。"
  },
  KO: {
    bundleTitle: "KissCoins 구매",
    bundlePrompt: "KissCoins 번들을 선택하세요.",
    buy: "KissCoins 구매",
    opening: "안전한 결제를 여는 중...",
    secureNote: "일회성 결제입니다. 구독이 아닙니다."
  }
};
