import type { LanguageCode } from "@/lib/site-language";

export const EVERCOIN_PAYMENT_COPY: Record<
  LanguageCode,
  {
    paid: string;
    pending: string;
    expired: string;
    unavailable: string;
  }
> = {
  EN: {
    paid: "Payment confirmed. Your EverCoin has been added.",
    pending: "Your payment is still processing. You can safely check again in a moment.",
    expired: "That payment was not completed. Please start a new one.",
    unavailable: "Secure checkout is not available yet."
  },
  ES: {
    paid: "Pago confirmado. Tus EverCoin se han añadido.",
    pending: "Tu pago aún se está procesando. Puedes volver a comprobarlo en un momento.",
    expired: "Ese pago no se completó. Inicia uno nuevo.",
    unavailable: "El pago seguro aún no está disponible."
  },
  FR: {
    paid: "Paiement confirmé. Vos EverCoin ont été ajoutés.",
    pending: "Votre paiement est toujours en cours. Vous pouvez revérifier dans un instant.",
    expired: "Ce paiement n’a pas été effectué. Veuillez en démarrer un nouveau.",
    unavailable: "Le paiement sécurisé n’est pas encore disponible."
  },
  DE: {
    paid: "Zahlung bestätigt. Deine EverCoin wurden hinzugefügt.",
    pending: "Deine Zahlung wird noch verarbeitet. Du kannst gleich erneut prüfen.",
    expired: "Diese Zahlung wurde nicht abgeschlossen. Bitte starte eine neue.",
    unavailable: "Die sichere Zahlung ist noch nicht verfügbar."
  },
  JA: {
    paid: "お支払いを確認しました。EverCoinを追加しました。",
    pending: "お支払いは処理中です。少し待ってから再確認できます。",
    expired: "お支払いは完了しませんでした。新しい支払いを開始してください。",
    unavailable: "安全な決済はまだ利用できません。"
  },
  KO: {
    paid: "결제가 확인되었습니다. EverCoin이 추가되었습니다.",
    pending: "결제가 아직 처리 중입니다. 잠시 후 다시 확인할 수 있습니다.",
    expired: "결제가 완료되지 않았습니다. 새 결제를 시작해 주세요.",
    unavailable: "안전한 결제를 아직 사용할 수 없습니다."
  }
};
