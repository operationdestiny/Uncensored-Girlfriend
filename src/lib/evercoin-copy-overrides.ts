import { MY_BOND_COPY } from "@/lib/my-bond-language";

const overrides = {
  EN: {
    balance: "KissCoins",
    buy: "Buy KissCoins",
    purchases: "Your KissCoins purchases will appear here after checkout."
  },
  ES: {
    balance: "KissCoins",
    buy: "Comprar KissCoins",
    purchases: "Tus compras de KissCoins aparecerán aquí después del pago."
  },
  FR: {
    balance: "KissCoins",
    buy: "Acheter des KissCoins",
    purchases: "Vos achats d’KissCoins apparaîtront ici après le paiement."
  },
  DE: {
    balance: "KissCoins",
    buy: "KissCoins kaufen",
    purchases: "Deine KissCoins-Käufe werden hier nach dem Bezahlen angezeigt."
  },
  JA: {
    balance: "KissCoins",
    buy: "KissCoinsを購入",
    purchases: "KissCoinsの購入履歴は決済後にここに表示されます。"
  },
  KO: {
    balance: "KissCoins",
    buy: "KissCoins 구매",
    purchases: "KissCoins 구매 내역은 결제 후 여기에 표시됩니다."
  }
} as const;

for (const language of Object.keys(overrides) as Array<keyof typeof overrides>) {
  MY_BOND_COPY[language].messagesLeft = overrides[language].balance;
  MY_BOND_COPY[language].buyMessages = overrides[language].buy;
  MY_BOND_COPY[language].purchasesWillAppear = overrides[language].purchases;
}
