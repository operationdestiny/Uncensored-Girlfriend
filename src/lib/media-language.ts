import type { LanguageCode } from "@/lib/site-language";

export type MediaCopy = {
  callCharacter: (name: string) => string;
  imageGallery: (name: string) => string;
  insufficientCoins: string;
  buyEverCoin: string;
  privateGallery: string;
  galleryTitle: (name: string) => string;
  gallerySubtitle: string;
  privateOnly: string;
  imageLimit: string;
  describeImage: string;
  generateImage: string;
  generating: string;
  backToChat: string;
  emptyGallery: string;
  setAsChatImage: string;
  activeChatImage: string;
  deleteImage: string;
  galleryLimitReached: string;
  liveCall: string;
  connecting: string;
  tapToSpeak: string;
  stopSpeaking: string;
  listening: string;
  thinking: string;
  speaking: string;
  hangUp: string;
  microphoneDenied: string;
  voiceNotConfigured: string;
  callBillingFailed: string;
  minute: string;
  callLimitReached: string;
  callIdleEnded: string;
  callRateLimited: string;
  mediaError: string;
};

export const MEDIA_COPY: Record<LanguageCode, MediaCopy> = {
  EN: {
    callCharacter: (name) => `Call ${name}`,
    imageGallery: (name) => `${name} Image Gallery`,
    insufficientCoins: "You do not have enough KissCoins for this request",
    buyEverCoin: "Buy KissCoins",
    privateGallery: "Private Gallery",
    galleryTitle: (name) => `${name} Image Gallery`,
    gallerySubtitle:
      "Create private images of your companion. Only you can see them, select to make them your companion's main image, or delete them and make others.",
    privateOnly: "Private to your account",
    imageLimit: "images",
    describeImage:
      "Describe exactly how you want the character, outfit, pose, setting, lighting, and mood to look...",
    generateImage: "Generate Image",
    generating: "Creating Image...",
    backToChat: "Back to Chat",
    emptyGallery: "Your private gallery is empty. Describe an image above to create the first one.",
    setAsChatImage: "Use as My Chat Image",
    activeChatImage: "My Active Chat Image",
    deleteImage: "Delete Image",
    galleryLimitReached: "Delete an image before creating another one.",
    liveCall: "Live Uncensored Girlfriend Call",
    connecting: "Connecting...",
    tapToSpeak: "Tap to speak",
    stopSpeaking: "Tap to stop",
    listening: "Listening...",
    thinking: "Thinking...",
    speaking: "Speaking...",
    hangUp: "Hang up",
    microphoneDenied: "Microphone permission is required for voice calls.",
    voiceNotConfigured: "This companion’s voice has not been assigned yet.",
    callBillingFailed: "The call ended because the next minute could not be charged.",
    minute: "minute",
    callLimitReached: "The maximum call length has been reached.",
    callIdleEnded: "The call ended after being idle.",
    callRateLimited: "Please wait a moment before speaking again.",
    mediaError: "The request could not be completed."
  },
  ES: {
    callCharacter: (name) => `Llamar a ${name}`,
    imageGallery: (name) => `Galería de imágenes de ${name}`,
    insufficientCoins: "No tienes suficiente KissCoins para esta solicitud",
    buyEverCoin: "Comprar KissCoins",
    privateGallery: "Galería privada",
    galleryTitle: (name) => `Galería de imágenes de ${name}`,
    gallerySubtitle:
      "Crea imágenes privadas de tu compañero. Solo tú puedes verlas, seleccionarlas para convertirlas en la imagen principal de tu compañero o eliminarlas y crear otras.",
    privateOnly: "Privado para tu cuenta",
    imageLimit: "imágenes",
    describeImage:
      "Describe exactamente cómo quieres que se vean el personaje, la ropa, la pose, el entorno, la iluminación y el ambiente...",
    generateImage: "Crear imagen",
    generating: "Creando imagen...",
    backToChat: "Volver al chat",
    emptyGallery: "Tu galería privada está vacía. Describe una imagen arriba para crear la primera.",
    setAsChatImage: "Usar como mi imagen de chat",
    activeChatImage: "Mi imagen de chat activa",
    deleteImage: "Eliminar imagen",
    galleryLimitReached: "Elimina una imagen antes de crear otra.",
    liveCall: "Llamada en vivo de Uncensored Girlfriend",
    connecting: "Conectando...",
    tapToSpeak: "Toca para hablar",
    stopSpeaking: "Toca para terminar",
    listening: "Escuchando...",
    thinking: "Pensando...",
    speaking: "Hablando...",
    hangUp: "Colgar",
    microphoneDenied: "Se necesita permiso para usar el micrófono en las llamadas de voz.",
    voiceNotConfigured: "La voz de este compañero todavía no ha sido asignada.",
    callBillingFailed: "La llamada terminó porque no se pudo cobrar el siguiente minuto.",
    minute: "minuto",
    callLimitReached: "Se alcanzó la duración máxima de la llamada.",
    callIdleEnded: "La llamada terminó por inactividad.",
    callRateLimited: "Espera un momento antes de volver a hablar.",
    mediaError: "No se pudo completar la solicitud."
  },
  FR: {
    callCharacter: (name) => `Appeler ${name}`,
    imageGallery: (name) => `Galerie d’images de ${name}`,
    insufficientCoins: "Vous n’avez pas assez d’KissCoins pour cette demande",
    buyEverCoin: "Acheter des KissCoins",
    privateGallery: "Galerie privée",
    galleryTitle: (name) => `Galerie d’images de ${name}`,
    gallerySubtitle:
      "Créez des images privées de votre compagnon. Vous seul pouvez les voir, en sélectionner une comme image principale de votre compagnon, ou les supprimer et en créer d’autres.",
    privateOnly: "Privé sur votre compte",
    imageLimit: "images",
    describeImage:
      "Décrivez exactement l’apparence souhaitée du personnage, sa tenue, sa pose, le décor, l’éclairage et l’ambiance...",
    generateImage: "Créer l’image",
    generating: "Création de l’image...",
    backToChat: "Retour au chat",
    emptyGallery: "Votre galerie privée est vide. Décrivez une image ci-dessus pour créer la première.",
    setAsChatImage: "Utiliser comme image de chat",
    activeChatImage: "Mon image de chat active",
    deleteImage: "Supprimer l’image",
    galleryLimitReached: "Supprimez une image avant d’en créer une autre.",
    liveCall: "Appel Uncensored Girlfriend en direct",
    connecting: "Connexion...",
    tapToSpeak: "Touchez pour parler",
    stopSpeaking: "Touchez pour arrêter",
    listening: "Écoute...",
    thinking: "Réflexion...",
    speaking: "Parle...",
    hangUp: "Raccrocher",
    microphoneDenied: "L’autorisation du microphone est nécessaire pour les appels vocaux.",
    voiceNotConfigured: "La voix de ce compagnon n’a pas encore été attribuée.",
    callBillingFailed: "L’appel a pris fin, car la minute suivante n’a pas pu être débitée.",
    minute: "minute",
    callLimitReached: "La durée maximale de l’appel a été atteinte.",
    callIdleEnded: "L’appel s’est terminé après une période d’inactivité.",
    callRateLimited: "Veuillez patienter avant de reparler.",
    mediaError: "La demande n’a pas pu être effectuée."
  },
  DE: {
    callCharacter: (name) => `${name} anrufen`,
    imageGallery: (name) => `${name} Bildergalerie`,
    insufficientCoins: "Du hast nicht genug KissCoins für diese Anfrage",
    buyEverCoin: "KissCoins kaufen",
    privateGallery: "Private Galerie",
    galleryTitle: (name) => `${name} Bildergalerie`,
    gallerySubtitle:
      "Erstelle private Bilder deines Begleiters. Nur du kannst sie sehen, eines als Hauptbild deines Begleiters auswählen oder sie löschen und neue erstellen.",
    privateOnly: "Privat für dein Konto",
    imageLimit: "Bilder",
    describeImage:
      "Beschreibe genau, wie Figur, Kleidung, Pose, Umgebung, Beleuchtung und Stimmung aussehen sollen...",
    generateImage: "Bild erstellen",
    generating: "Bild wird erstellt...",
    backToChat: "Zurück zum Chat",
    emptyGallery: "Deine private Galerie ist leer. Beschreibe oben ein Bild, um das erste zu erstellen.",
    setAsChatImage: "Als mein Chatbild verwenden",
    activeChatImage: "Mein aktives Chatbild",
    deleteImage: "Bild löschen",
    galleryLimitReached: "Lösche ein Bild, bevor du ein weiteres erstellst.",
    liveCall: "Live-Uncensored Girlfriend-Anruf",
    connecting: "Verbindung wird hergestellt...",
    tapToSpeak: "Zum Sprechen tippen",
    stopSpeaking: "Zum Stoppen tippen",
    listening: "Hört zu...",
    thinking: "Denkt nach...",
    speaking: "Spricht...",
    hangUp: "Auflegen",
    microphoneDenied: "Für Sprachanrufe ist die Mikrofonberechtigung erforderlich.",
    voiceNotConfigured: "Diesem Begleiter wurde noch keine Stimme zugewiesen.",
    callBillingFailed: "Der Anruf wurde beendet, weil die nächste Minute nicht abgerechnet werden konnte.",
    minute: "Minute",
    callLimitReached: "Die maximale Anrufdauer wurde erreicht.",
    callIdleEnded: "Der Anruf wurde wegen Inaktivität beendet.",
    callRateLimited: "Bitte warte einen Moment, bevor du erneut sprichst.",
    mediaError: "Die Anfrage konnte nicht abgeschlossen werden."
  },
  JA: {
    callCharacter: (name) => `${name}に電話`,
    imageGallery: (name) => `${name}の画像ギャラリー`,
    insufficientCoins: "このリクエストに必要なKissCoinsが足りません",
    buyEverCoin: "KissCoinsを購入",
    privateGallery: "プライベートギャラリー",
    galleryTitle: (name) => `${name}の画像ギャラリー`,
    gallerySubtitle:
      "コンパニオンのプライベート画像を作成できます。閲覧できるのはあなただけで、コンパニオンのメイン画像として選択したり、削除して新しい画像を作成したりできます。",
    privateOnly: "あなたのアカウントだけに非公開",
    imageLimit: "画像",
    describeImage:
      "キャラクターの見た目、衣装、ポーズ、背景、照明、雰囲気を具体的に説明してください...",
    generateImage: "画像を生成",
    generating: "画像を生成中...",
    backToChat: "チャットに戻る",
    emptyGallery: "プライベートギャラリーは空です。上で説明して最初の画像を作成してください。",
    setAsChatImage: "自分のチャット画像に設定",
    activeChatImage: "現在のチャット画像",
    deleteImage: "画像を削除",
    galleryLimitReached: "新しい画像を作る前に1枚削除してください。",
    liveCall: "Uncensored Girlfriendライブ通話",
    connecting: "接続中...",
    tapToSpeak: "タップして話す",
    stopSpeaking: "タップして停止",
    listening: "聞いています...",
    thinking: "考えています...",
    speaking: "話しています...",
    hangUp: "通話を終了",
    microphoneDenied: "音声通話にはマイクの許可が必要です。",
    voiceNotConfigured: "このコンパニオンにはまだ音声が設定されていません。",
    callBillingFailed: "次の1分を請求できなかったため、通話を終了しました。",
    minute: "分",
    callLimitReached: "通話時間の上限に達しました。",
    callIdleEnded: "一定時間操作がなかったため通話を終了しました。",
    callRateLimited: "少し待ってからもう一度話してください。",
    mediaError: "リクエストを完了できませんでした。"
  },
  KO: {
    callCharacter: (name) => `${name}에게 전화`,
    imageGallery: (name) => `${name} 이미지 갤러리`,
    insufficientCoins: "이 요청에 필요한 KissCoins이 부족합니다",
    buyEverCoin: "KissCoins 구매",
    privateGallery: "비공개 갤러리",
    galleryTitle: (name) => `${name} 이미지 갤러리`,
    gallerySubtitle:
      "컴패니언의 비공개 이미지를 만들어 보세요. 본인만 볼 수 있으며, 컴패니언의 대표 이미지로 선택하거나 삭제한 뒤 새 이미지를 만들 수 있습니다.",
    privateOnly: "내 계정 전용",
    imageLimit: "이미지",
    describeImage:
      "캐릭터의 모습, 의상, 포즈, 배경, 조명, 분위기를 원하는 대로 자세히 설명하세요...",
    generateImage: "이미지 생성",
    generating: "이미지 생성 중...",
    backToChat: "채팅으로 돌아가기",
    emptyGallery: "비공개 갤러리가 비어 있습니다. 위에서 이미지를 설명해 첫 이미지를 만드세요.",
    setAsChatImage: "내 채팅 이미지로 사용",
    activeChatImage: "현재 채팅 이미지",
    deleteImage: "이미지 삭제",
    galleryLimitReached: "새 이미지를 만들기 전에 기존 이미지를 삭제하세요.",
    liveCall: "Uncensored Girlfriend 라이브 통화",
    connecting: "연결 중...",
    tapToSpeak: "탭하여 말하기",
    stopSpeaking: "탭하여 멈추기",
    listening: "듣는 중...",
    thinking: "생각 중...",
    speaking: "말하는 중...",
    hangUp: "통화 종료",
    microphoneDenied: "음성 통화에는 마이크 권한이 필요합니다.",
    voiceNotConfigured: "이 컴패니언의 음성이 아직 지정되지 않았습니다.",
    callBillingFailed: "다음 1분을 결제할 수 없어 통화가 종료되었습니다.",
    minute: "분",
    callLimitReached: "최대 통화 시간에 도달했습니다.",
    callIdleEnded: "한동안 활동이 없어 통화가 종료되었습니다.",
    callRateLimited: "잠시 기다린 후 다시 말해 주세요.",
    mediaError: "요청을 완료하지 못했습니다."
  }
};
