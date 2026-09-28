import type { LanguageCode } from "@/lib/site-language";

export type EverShopCopy = {
  sidebarLabel: string;
  pageEyebrow: string;
  pageTitle: string;
  pageDescription: string;
  shoppingFor: string;
  balance: string;
  buyEverCoin: string;
  all: string;
  romance: string;
  clothingJewelry: string;
  luxury: string;
  foodTreats: string;
  magical: string;
  common: string;
  standard: string;
  premium: string;
  everCoin: string;
  typicalReaction: string;
  buyGift: string;
  buying: string;
  owned: string;
  signInToBuy: string;
  purchaseComplete: string;
  insufficientEverCoin: string;
  walletDebt: string;
  purchaseFailed: string;
  inventoryTitle: string;
  inventoryDescription: string;
  inventoryEmpty: string;
  quantity: string;
  shopFor: string;
  giftButton: string;
  giftPickerTitle: string;
  giftPickerDescription: string;
  sendGift: string;
  sendingGift: string;
  noGiftsToSend: string;
  visitEverShop: string;
  close: string;
};

export const EVERSHOP_COPY: Record<LanguageCode, EverShopCopy> = {
  EN: {
    sidebarLabel: "Gift Shop",
    pageEyebrow: "COMPANION GIFTS",
    pageTitle: "Gift Shop",
    pageDescription:
      "Choose a gift, buy it with KissCoins, and keep it in My Companions until the perfect moment.",
    shoppingFor: "Shopping for",
    balance: "KissCoins balance",
    buyEverCoin: "Buy KissCoins",
    all: "All",
    romance: "Romance",
    clothingJewelry: "Clothing & Jewelry",
    luxury: "Luxury",
    foodTreats: "Food & Treats",
    magical: "Magical",
    common: "Common",
    standard: "Standard",
    premium: "Premium",
    everCoin: "KissCoins",
    typicalReaction: "Typical reaction",
    buyGift: "Buy gift",
    buying: "Buying...",
    owned: "Owned",
    signInToBuy: "Log in or sign up to buy gifts.",
    purchaseComplete: "Gift added to My Companions.",
    insufficientEverCoin: "You do not have enough KissCoins for this gift.",
    walletDebt: "Your KissCoins wallet must be settled before buying gifts.",
    purchaseFailed: "The gift could not be purchased.",
    inventoryTitle: "My Gifts",
    inventoryDescription:
      "Gifts you own are stored here until you send one to a companion.",
    inventoryEmpty: "You do not own any gifts yet.",
    quantity: "Quantity",
    shopFor: "Shop for",
    giftButton: "Choose a gift",
    giftPickerTitle: "Send a Gift",
    giftPickerDescription:
      "Choose one gift from My Companions. Your typed message is optional.",
    sendGift: "Send gift",
    sendingGift: "Sending...",
    noGiftsToSend: "You do not have a gift available to send.",
    visitEverShop: "Visit Gift Shop",
    close: "Close"
  },
  ES: {
    sidebarLabel: "Gift Shop",
    pageEyebrow: "REGALOS EVERBOND",
    pageTitle: "Gift Shop",
    pageDescription:
      "Elige un regalo, cómpralo con KissCoins y guárdalo en Mi vínculo hasta el momento perfecto.",
    shoppingFor: "Comprando para",
    balance: "Saldo de KissCoins",
    buyEverCoin: "Comprar KissCoins",
    all: "Todo",
    romance: "Romance",
    clothingJewelry: "Ropa y joyería",
    luxury: "Lujo",
    foodTreats: "Comida y dulces",
    magical: "Mágicos",
    common: "Común",
    standard: "Estándar",
    premium: "Premium",
    everCoin: "KissCoins",
    typicalReaction: "Reacción típica",
    buyGift: "Comprar regalo",
    buying: "Comprando...",
    owned: "En propiedad",
    signInToBuy: "Inicia sesión o regístrate para comprar regalos.",
    purchaseComplete: "Regalo añadido a Mi vínculo.",
    insufficientEverCoin: "No tienes suficiente KissCoins para este regalo.",
    walletDebt: "Debes saldar tu monedero KissCoins antes de comprar regalos.",
    purchaseFailed: "No se pudo comprar el regalo.",
    inventoryTitle: "Mis regalos",
    inventoryDescription:
      "Los regalos que posees se guardan aquí hasta que envíes uno a un compañero.",
    inventoryEmpty: "Aún no tienes ningún regalo.",
    quantity: "Cantidad",
    shopFor: "Comprar para",
    giftButton: "Elegir un regalo",
    giftPickerTitle: "Enviar un regalo",
    giftPickerDescription:
      "Elige un regalo de Mi vínculo. El mensaje escrito es opcional.",
    sendGift: "Enviar regalo",
    sendingGift: "Enviando...",
    noGiftsToSend: "No tienes ningún regalo disponible para enviar.",
    visitEverShop: "Visitar Gift Shop",
    close: "Cerrar"
  },
  FR: {
    sidebarLabel: "Gift Shop",
    pageEyebrow: "CADEAUX EVERBOND",
    pageTitle: "Gift Shop",
    pageDescription:
      "Choisissez un cadeau, achetez-le avec des KissCoins et gardez-le dans Mon lien jusqu'au moment parfait.",
    shoppingFor: "Achats pour",
    balance: "Solde KissCoins",
    buyEverCoin: "Acheter des KissCoins",
    all: "Tout",
    romance: "Romance",
    clothingJewelry: "Vêtements et bijoux",
    luxury: "Luxe",
    foodTreats: "Gourmandises",
    magical: "Magiques",
    common: "Commun",
    standard: "Standard",
    premium: "Premium",
    everCoin: "KissCoins",
    typicalReaction: "Réaction typique",
    buyGift: "Acheter le cadeau",
    buying: "Achat...",
    owned: "Possédé",
    signInToBuy: "Connectez-vous ou inscrivez-vous pour acheter des cadeaux.",
    purchaseComplete: "Cadeau ajouté à Mon lien.",
    insufficientEverCoin: "Vous n'avez pas assez d'KissCoins pour ce cadeau.",
    walletDebt: "Votre portefeuille KissCoins doit être régularisé avant tout achat.",
    purchaseFailed: "Le cadeau n'a pas pu être acheté.",
    inventoryTitle: "Mes cadeaux",
    inventoryDescription:
      "Vos cadeaux sont conservés ici jusqu'à ce que vous en envoyiez un à un compagnon.",
    inventoryEmpty: "Vous ne possédez encore aucun cadeau.",
    quantity: "Quantité",
    shopFor: "Acheter pour",
    giftButton: "Choisir un cadeau",
    giftPickerTitle: "Envoyer un cadeau",
    giftPickerDescription:
      "Choisissez un cadeau dans Mon lien. Le message écrit est facultatif.",
    sendGift: "Envoyer le cadeau",
    sendingGift: "Envoi...",
    noGiftsToSend: "Vous n'avez aucun cadeau disponible à envoyer.",
    visitEverShop: "Visiter Gift Shop",
    close: "Fermer"
  },
  DE: {
    sidebarLabel: "Gift Shop",
    pageEyebrow: "EVERBOND-GESCHENKE",
    pageTitle: "Gift Shop",
    pageDescription:
      "Wähle ein Geschenk, kaufe es mit KissCoins und bewahre es in Meine Bindung bis zum perfekten Moment auf.",
    shoppingFor: "Einkaufen für",
    balance: "KissCoins-Guthaben",
    buyEverCoin: "KissCoins kaufen",
    all: "Alle",
    romance: "Romantik",
    clothingJewelry: "Kleidung & Schmuck",
    luxury: "Luxus",
    foodTreats: "Essen & Süßes",
    magical: "Magisch",
    common: "Gewöhnlich",
    standard: "Standard",
    premium: "Premium",
    everCoin: "KissCoins",
    typicalReaction: "Typische Reaktion",
    buyGift: "Geschenk kaufen",
    buying: "Wird gekauft...",
    owned: "Im Besitz",
    signInToBuy: "Melde dich an oder registriere dich, um Geschenke zu kaufen.",
    purchaseComplete: "Geschenk wurde Meine Bindung hinzugefügt.",
    insufficientEverCoin: "Du hast nicht genug KissCoins für dieses Geschenk.",
    walletDebt: "Dein KissCoins-Wallet muss vor dem Kauf ausgeglichen werden.",
    purchaseFailed: "Das Geschenk konnte nicht gekauft werden.",
    inventoryTitle: "Meine Geschenke",
    inventoryDescription:
      "Deine Geschenke bleiben hier, bis du eines an einen Begleiter sendest.",
    inventoryEmpty: "Du besitzt noch keine Geschenke.",
    quantity: "Anzahl",
    shopFor: "Einkaufen für",
    giftButton: "Geschenk auswählen",
    giftPickerTitle: "Geschenk senden",
    giftPickerDescription:
      "Wähle ein Geschenk aus Meine Bindung. Eine Textnachricht ist optional.",
    sendGift: "Geschenk senden",
    sendingGift: "Wird gesendet...",
    noGiftsToSend: "Du hast kein verfügbares Geschenk zum Senden.",
    visitEverShop: "Gift Shop besuchen",
    close: "Schließen"
  },
  JA: {
    sidebarLabel: "Gift Shop",
    pageEyebrow: "EVERBOND ギフト",
    pageTitle: "Gift Shop",
    pageDescription:
      "KissCoinsでギフトを購入し、贈る瞬間まで「マイボンド」に保管できます。",
    shoppingFor: "お買い物の相手",
    balance: "KissCoins残高",
    buyEverCoin: "KissCoinsを購入",
    all: "すべて",
    romance: "ロマンス",
    clothingJewelry: "服とジュエリー",
    luxury: "ラグジュアリー",
    foodTreats: "フード＆スイーツ",
    magical: "マジカル",
    common: "コモン",
    standard: "スタンダード",
    premium: "プレミアム",
    everCoin: "KissCoins",
    typicalReaction: "反応の例",
    buyGift: "ギフトを購入",
    buying: "購入中...",
    owned: "所持中",
    signInToBuy: "ギフトを購入するにはログインまたは登録してください。",
    purchaseComplete: "ギフトをマイボンドに追加しました。",
    insufficientEverCoin: "このギフトを購入するKissCoinsが足りません。",
    walletDebt: "ギフト購入前にKissCoinsウォレットを精算してください。",
    purchaseFailed: "ギフトを購入できませんでした。",
    inventoryTitle: "マイギフト",
    inventoryDescription:
      "所持しているギフトは、コンパニオンに贈るまでここに保管されます。",
    inventoryEmpty: "まだギフトを所持していません。",
    quantity: "数量",
    shopFor: "お買い物",
    giftButton: "ギフトを選ぶ",
    giftPickerTitle: "ギフトを贈る",
    giftPickerDescription:
      "マイボンドからギフトを1つ選んでください。文章は任意です。",
    sendGift: "ギフトを贈る",
    sendingGift: "送信中...",
    noGiftsToSend: "贈れるギフトがありません。",
    visitEverShop: "Gift Shopへ",
    close: "閉じる"
  },
  KO: {
    sidebarLabel: "Gift Shop",
    pageEyebrow: "EVERBOND 선물",
    pageTitle: "Gift Shop",
    pageDescription:
      "KissCoins으로 선물을 구매하고 완벽한 순간까지 마이 본드에 보관하세요.",
    shoppingFor: "쇼핑 대상",
    balance: "KissCoins 잔액",
    buyEverCoin: "KissCoins 구매",
    all: "전체",
    romance: "로맨스",
    clothingJewelry: "의류 & 주얼리",
    luxury: "럭셔리",
    foodTreats: "음식 & 간식",
    magical: "마법",
    common: "일반",
    standard: "스탠다드",
    premium: "프리미엄",
    everCoin: "KissCoins",
    typicalReaction: "일반적인 반응",
    buyGift: "선물 구매",
    buying: "구매 중...",
    owned: "보유",
    signInToBuy: "선물을 구매하려면 로그인하거나 가입하세요.",
    purchaseComplete: "선물이 마이 본드에 추가되었습니다.",
    insufficientEverCoin: "이 선물을 구매할 KissCoins이 부족합니다.",
    walletDebt: "선물을 구매하기 전에 KissCoins 지갑을 정산해야 합니다.",
    purchaseFailed: "선물을 구매하지 못했습니다.",
    inventoryTitle: "내 선물",
    inventoryDescription:
      "보유한 선물은 컴패니언에게 보낼 때까지 여기에 저장됩니다.",
    inventoryEmpty: "아직 보유한 선물이 없습니다.",
    quantity: "수량",
    shopFor: "쇼핑하기",
    giftButton: "선물 선택",
    giftPickerTitle: "선물 보내기",
    giftPickerDescription:
      "마이 본드에서 선물 하나를 선택하세요. 입력 메시지는 선택 사항입니다.",
    sendGift: "선물 보내기",
    sendingGift: "전송 중...",
    noGiftsToSend: "보낼 수 있는 선물이 없습니다.",
    visitEverShop: "Gift Shop 방문",
    close: "닫기"
  }
};
