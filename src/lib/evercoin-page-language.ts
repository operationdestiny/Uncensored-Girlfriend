import type { LanguageCode } from "@/lib/site-language";

type EverCoinPageCopy = {
  title: string;
  description: string;
  messagesTitle: string;
  messagesBody: string;
  messageUnit: string;
  messageRate: string;
  giftsTitle: string;
  giftsBody: string;
  giftRate: string;
  imagesTitle: string;
  imagesBody: string;
  imageUnit: string;
  videosTitle: string;
  videosBody: string;
  videoUnit: string;
  voiceCallsTitle: string;
  voiceCallsBody: string;
  minuteUnit: string;
  about: string;
  buyButton: string;
  checkoutFailed: string;
};

export const EVERCOIN_PAGE_COPY: Record<
  LanguageCode,
  EverCoinPageCopy
> = {
  EN: {
    title: "One currency for your favorite experiences.",
    description:
      "Use KissCoins for uncensored live calls, gifts, companion images, companion videos, chat and more.",
    messagesTitle: "Chat",
    messagesBody:
      "Unlock uncensored private chat with 1000s of premium companions.",
    messageUnit: "message",
    messageRate: "≈ 15 EC / 100 messages",
    giftsTitle: "Gifts",
    giftsBody:
      "Unlock romantic, cute, and thoughtful gifts your companion will love.",
    giftRate: "KissCoins vary / gift",
    imagesTitle: "Uncensored Companion Images",
    imagesBody: "Create private images of your companion.",
    imageUnit: "image",
    videosTitle: "Uncensored Companion Videos",
    videosBody: "Create premium private videos of your companion.",
    videoUnit: "video",
    voiceCallsTitle: "Uncensored Live Calls",
    voiceCallsBody:
      "Calls are 69 KissCoins per minute, prorated to the actual call time, so short calls only cost their share of a minute.",
    minuteUnit: "minute",
    about: "Around",
    buyButton: "Buy KissCoins",
    checkoutFailed: "Checkout failed"
  },
  ES: {
    title: "Una moneda para las funciones premium de EverBond AI.",
    description:
      "Tus primeros 20 mensajes de texto son gratis. Después, el chat de texto usa bloques de mensajes con EverCoin. EverCoin también se usa para llamadas en directo, regalos, imágenes, vídeos y otros extras premium.",
    messagesTitle: "Chat de texto",
    messagesBody:
      "Tus primeros 20 mensajes son gratis. Después, 3 EC desbloquean automáticamente 19 mensajes cuando los necesites. Los mensajes no usados se conservan.",
    messageUnit: "mensaje",
    messageRate: "≈ 15 EC / 100 mensajes",
    giftsTitle: "Regalos",
    giftsBody:
      "Desbloquea regalos románticos, tiernos y atentos que le encantarán a tu compañero.",
    giftRate: "EverCoin varía / regalo",
    imagesTitle: "Imágenes sin censura del compañero",
    imagesBody: "Crea imágenes privadas de tu compañero.",
    imageUnit: "imagen",
    videosTitle: "Vídeos sin censura del compañero",
    videosBody: "Crea vídeos privados prémium de tu compañero.",
    videoUnit: "vídeo",
    voiceCallsTitle: "Llamadas en directo sin censura",
    voiceCallsBody:
      "Las llamadas cuestan 69 EverCoin por minuto y se prorratean según el tiempo real de la llamada, por lo que las llamadas cortas solo cuestan su parte del minuto.",
    minuteUnit: "minuto",
    about: "Alrededor de",
    buyButton: "Comprar EverCoin",
    checkoutFailed: "No se pudo abrir el pago"
  },
  FR: {
    title: "Une monnaie pour les fonctions premium d’EverBond AI.",
    description:
      "Vos 20 premiers messages texte sont gratuits. Ensuite, le chat texte utilise des blocs de messages en EverCoin. EverCoin sert aussi aux appels en direct, aux cadeaux, aux images, aux vidéos et aux autres fonctions premium.",
    messagesTitle: "Chat texte",
    messagesBody:
      "Vos 20 premiers messages sont gratuits. Ensuite, 3 EC débloquent automatiquement 19 messages au besoin. Les messages inutilisés sont conservés.",
    messageUnit: "message",
    messageRate: "≈ 15 EC / 100 messages",
    giftsTitle: "Cadeaux",
    giftsBody:
      "Débloquez des cadeaux romantiques, adorables et attentionnés que votre compagnon aimera.",
    giftRate: "EverCoin variable / cadeau",
    imagesTitle: "Images de compagnon non censurées",
    imagesBody: "Créez des images privées de votre compagnon.",
    imageUnit: "image",
    videosTitle: "Vidéos de compagnon non censurées",
    videosBody:
      "Créez des vidéos privées premium de votre compagnon.",
    videoUnit: "vidéo",
    voiceCallsTitle: "Appels en direct non censurés",
    voiceCallsBody:
      "Les appels coûtent 69 EverCoin par minute et sont facturés au prorata de la durée réelle de l’appel, de sorte qu’un appel court ne coûte que sa part de minute.",
    minuteUnit: "minute",
    about: "Environ",
    buyButton: "Acheter des EverCoin",
    checkoutFailed: "Impossible d’ouvrir le paiement"
  },
  DE: {
    title: "Eine Währung für Premium-Funktionen auf EverBond AI.",
    description:
      "Die ersten 20 Textnachrichten sind kostenlos. Danach nutzt der Text-Chat EverCoin-Nachrichtenblöcke. EverCoin wird außerdem für Live-Anrufe, Geschenke, Bilder, Videos und weitere Premium-Extras verwendet.",
    messagesTitle: "Text-Chat",
    messagesBody:
      "Die ersten 20 Nachrichten sind kostenlos. Danach schalten 3 EC bei Bedarf automatisch 19 Nachrichten frei. Ungenutzte Nachrichten bleiben erhalten.",
    messageUnit: "Nachricht",
    messageRate: "≈ 15 EC / 100 Nachrichten",
    giftsTitle: "Geschenke",
    giftsBody:
      "Schalte romantische, süße und aufmerksame Geschenke frei, die dein Begleiter lieben wird.",
    giftRate: "EverCoin variiert / Geschenk",
    imagesTitle: "Unzensierte Begleiterbilder",
    imagesBody: "Erstelle private Bilder deines Begleiters.",
    imageUnit: "Bild",
    videosTitle: "Unzensierte Begleitervideos",
    videosBody: "Erstelle private Premium-Videos deines Begleiters.",
    videoUnit: "Video",
    voiceCallsTitle: "Unzensierte Live-Anrufe",
    voiceCallsBody:
      "Anrufe kosten 69 EverCoin pro Minute und werden nach der tatsächlichen Anrufdauer anteilig berechnet, sodass kurze Anrufe nur ihren Minutenanteil kosten.",
    minuteUnit: "Minute",
    about: "Etwa",
    buyButton: "EverCoin kaufen",
    checkoutFailed: "Bezahlvorgang konnte nicht geöffnet werden"
  },
  JA: {
    title: "EverBond AIのプレミアム機能に使えるひとつの通貨。",
    description:
      "最初の20件のテキストメッセージは無料です。その後のテキストチャットはEverCoinのメッセージブロックを使用します。EverCoinはライブ通話、ギフト、画像、動画、その他のプレミアム機能にも使えます。",
    messagesTitle: "テキストチャット",
    messagesBody:
      "最初の20メッセージは無料です。その後は必要に応じて3 ECで19メッセージが自動的に追加されます。未使用分は繰り越されます。",
    messageUnit: "メッセージ",
    messageRate: "≈ 15 EC / 100メッセージ",
    giftsTitle: "ギフト",
    giftsBody:
      "コンパニオンが喜ぶ、ロマンチックで可愛く心のこもったギフトを利用できます。",
    giftRate: "EverCoin変動 / ギフト",
    imagesTitle: "無検閲のコンパニオン画像",
    imagesBody: "コンパニオンの非公開画像を作成できます。",
    imageUnit: "画像",
    videosTitle: "無検閲のコンパニオン動画",
    videosBody:
      "コンパニオンのプレミアムな非公開動画を作成できます。",
    videoUnit: "動画",
    voiceCallsTitle: "無検閲ライブ通話",
    voiceCallsBody:
      "通話は1分あたり69 EverCoinで、実際の通話時間に応じて按分されるため、短い通話は利用した時間分だけ課金されます。",
    minuteUnit: "分",
    about: "約",
    buyButton: "EverCoinを購入",
    checkoutFailed: "決済を開けませんでした"
  },
  KO: {
    title: "EverBond AI 프리미엄 기능을 위한 하나의 화폐.",
    description:
      "처음 20개의 텍스트 메시지는 무료입니다. 이후 텍스트 채팅은 EverCoin 메시지 블록을 사용합니다. EverCoin은 실시간 통화, 선물, 이미지, 동영상 및 기타 프리미엄 기능에도 사용됩니다.",
    messagesTitle: "텍스트 채팅",
    messagesBody:
      "처음 20개 메시지는 무료입니다. 이후 필요할 때 3 EC로 메시지 19개가 자동 충전됩니다. 사용하지 않은 메시지는 유지됩니다.",
    messageUnit: "메시지",
    messageRate: "≈ 15 EC / 메시지 100개",
    giftsTitle: "선물",
    giftsBody:
      "컴패니언이 좋아할 로맨틱하고 귀엽고 정성스러운 선물을 이용하세요.",
    giftRate: "EverCoin 변동 / 선물",
    imagesTitle: "무검열 컴패니언 이미지",
    imagesBody: "컴패니언의 비공개 이미지를 만드세요.",
    imageUnit: "이미지",
    videosTitle: "무검열 컴패니언 동영상",
    videosBody: "컴패니언의 프리미엄 비공개 동영상을 만드세요.",
    videoUnit: "동영상",
    voiceCallsTitle: "무검열 실시간 통화",
    voiceCallsBody:
      "통화는 분당 69 EverCoin이며 실제 통화 시간에 따라 비례 청구되므로 짧은 통화는 사용한 시간만큼만 청구됩니다.",
    minuteUnit: "분",
    about: "약",
    buyButton: "EverCoin 구매",
    checkoutFailed: "결제를 열지 못했습니다"
  }
};
