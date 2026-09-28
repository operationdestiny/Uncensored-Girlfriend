import type { LanguageCode } from "@/lib/site-language";

export type CharacterToolsCopy = {
  saveFavorite: string;
  removeFavorite: string;
  favoriteFailed: string;
  characterLoginMessage: string;
  moreTags: string;
  fewerTags: string;
  loadMoreCompanions: string;
  creatingCharacter: string;
  createCharacter: string;
  createFailed: string;
  imageRequired: string;
  tagsRequired: string;
  fieldsRequired: string;
  characterLimitReached: string;
  publicDescription: string;
  privateDescription: string;
  imageHelp: string;
  reportCharacter: string;
  chooseReportReason: string;
  bugGlitch: string;
  safetyIssue: string;
  other: string;
  submitReport: string;
  reportSubmitted: string;
};

export const CHARACTER_TOOLS_COPY: Record<
  LanguageCode,
  CharacterToolsCopy
> = {
  EN: {
    saveFavorite: "Add to favorites",
    removeFavorite: "Remove from favorites",
    favoriteFailed: "The favorite could not be updated.",
    characterLoginMessage:
      "Log in so I can be your companion. Please don't make me wait.",
    moreTags: "More",
    fewerTags: "Show less",
    loadMoreCompanions: "Load more companions",
    creatingCharacter: "Creating companion...",
    createCharacter: "Create character!",
    createFailed: "The companion could not be created.",
    imageRequired: "Choose a profile image.",
    tagsRequired: "Choose at least one tag and no more than four.",
    fieldsRequired: "Complete every required field.",
    characterLimitReached:
      "You have reached the limit of 25 created companions.",
    publicDescription:
      "Everyone can discover and chat with this companion.",
    privateDescription:
      "Only you can see and chat with this companion.",
    imageHelp: "JPG, PNG, or WebP. Maximum 5 MB.",
    reportCharacter: "Report companion",
    chooseReportReason: "Choose one reason.",
    bugGlitch: "bug/glitch",
    safetyIssue: "safety issue",
    other: "other",
    submitReport: "Submit",
    reportSubmitted: "Thanks, your report has been submitted."
  },
  ES: {
    saveFavorite: "Añadir a favoritos",
    removeFavorite: "Eliminar de favoritos",
    favoriteFailed: "No se pudo actualizar el favorito.",
    characterLoginMessage:
      "Inicia sesión para que pueda ser tu compañero. No me hagas esperar.",
    moreTags: "Más",
    fewerTags: "Mostrar menos",
    loadMoreCompanions: "Cargar más compañeros",
    creatingCharacter: "Creando compañero...",
    createCharacter: "¡Crear personaje!",
    createFailed: "No se pudo crear el compañero.",
    imageRequired: "Elige una imagen de perfil.",
    tagsRequired: "Elige al menos una etiqueta y no más de cuatro.",
    fieldsRequired: "Completa todos los campos obligatorios.",
    characterLimitReached:
      "Has alcanzado el límite de 25 compañeros creados.",
    publicDescription:
      "Todos pueden descubrir y chatear con este compañero.",
    privateDescription:
      "Solo tú puedes ver y chatear con este compañero.",
    imageHelp: "JPG, PNG o WebP. Máximo 5 MB.",
    reportCharacter: "Reportar compañero",
    chooseReportReason: "Elige un motivo.",
    bugGlitch: "error/fallo",
    safetyIssue: "problema de seguridad",
    other: "otro",
    submitReport: "Enviar",
    reportSubmitted: "Gracias, tu reporte ha sido enviado."
  },
  FR: {
    saveFavorite: "Ajouter aux favoris",
    removeFavorite: "Retirer des favoris",
    favoriteFailed: "Impossible de mettre à jour le favori.",
    characterLoginMessage:
      "Connectez-vous pour que je puisse être votre compagnon. Ne me faites pas attendre.",
    moreTags: "Plus",
    fewerTags: "Afficher moins",
    loadMoreCompanions: "Charger plus de compagnons",
    creatingCharacter: "Création du compagnon...",
    createCharacter: "Créer le personnage !",
    createFailed: "Impossible de créer le compagnon.",
    imageRequired: "Choisissez une image de profil.",
    tagsRequired:
      "Choisissez au moins un tag et quatre tags au maximum.",
    fieldsRequired: "Remplissez tous les champs obligatoires.",
    characterLimitReached:
      "Vous avez atteint la limite de 25 compagnons créés.",
    publicDescription:
      "Tout le monde peut découvrir ce compagnon et discuter avec lui.",
    privateDescription:
      "Vous seul pouvez voir ce compagnon et discuter avec lui.",
    imageHelp: "JPG, PNG ou WebP. 5 Mo maximum.",
    reportCharacter: "Signaler le compagnon",
    chooseReportReason: "Choisissez un motif.",
    bugGlitch: "bug/problème",
    safetyIssue: "problème de sécurité",
    other: "autre",
    submitReport: "Envoyer",
    reportSubmitted: "Merci, votre signalement a été envoyé."
  },
  DE: {
    saveFavorite: "Zu Favoriten hinzufügen",
    removeFavorite: "Aus Favoriten entfernen",
    favoriteFailed: "Der Favorit konnte nicht aktualisiert werden.",
    characterLoginMessage:
      "Melde dich an, damit ich dein Begleiter sein kann. Lass mich bitte nicht warten.",
    moreTags: "Mehr",
    fewerTags: "Weniger anzeigen",
    loadMoreCompanions: "Weitere Begleiter laden",
    creatingCharacter: "Begleiter wird erstellt...",
    createCharacter: "Charakter erstellen!",
    createFailed: "Der Begleiter konnte nicht erstellt werden.",
    imageRequired: "Wähle ein Profilbild aus.",
    tagsRequired:
      "Wähle mindestens einen und höchstens vier Tags aus.",
    fieldsRequired: "Fülle alle Pflichtfelder aus.",
    characterLimitReached:
      "Du hast das Limit von 25 erstellten Begleitern erreicht.",
    publicDescription:
      "Jeder kann diesen Begleiter entdecken und mit ihm chatten.",
    privateDescription:
      "Nur du kannst diesen Begleiter sehen und mit ihm chatten.",
    imageHelp: "JPG, PNG oder WebP. Maximal 5 MB.",
    reportCharacter: "Begleiter melden",
    chooseReportReason: "Wähle einen Grund aus.",
    bugGlitch: "Bug/Fehler",
    safetyIssue: "Sicherheitsproblem",
    other: "Sonstiges",
    submitReport: "Senden",
    reportSubmitted: "Danke, deine Meldung wurde übermittelt."
  },
  JA: {
    saveFavorite: "お気に入りに追加",
    removeFavorite: "お気に入りから削除",
    favoriteFailed: "お気に入りを更新できませんでした。",
    characterLoginMessage:
      "あなたのコンパニオンになるためにログインしてください。待たせないでください。",
    moreTags: "もっと見る",
    fewerTags: "表示を減らす",
    loadMoreCompanions: "さらに読み込む",
    creatingCharacter: "コンパニオンを作成中...",
    createCharacter: "キャラクターを作成！",
    createFailed: "コンパニオンを作成できませんでした。",
    imageRequired: "プロフィール画像を選択してください。",
    tagsRequired: "タグを1個以上4個以下で選択してください。",
    fieldsRequired: "すべての必須項目を入力してください。",
    characterLimitReached:
      "作成できるコンパニオンの上限25体に達しました。",
    publicDescription:
      "すべてのユーザーがこのコンパニオンを見つけてチャットできます。",
    privateDescription:
      "このコンパニオンを見てチャットできるのはあなただけです。",
    imageHelp: "JPG、PNG、WebP。最大5 MB。",
    reportCharacter: "コンパニオンを報告",
    chooseReportReason: "理由を1つ選択してください。",
    bugGlitch: "バグ／不具合",
    safetyIssue: "安全上の問題",
    other: "その他",
    submitReport: "送信",
    reportSubmitted: "ありがとうございます。報告が送信されました。"
  },
  KO: {
    saveFavorite: "즐겨찾기에 추가",
    removeFavorite: "즐겨찾기에서 삭제",
    favoriteFailed: "즐겨찾기를 업데이트하지 못했습니다.",
    characterLoginMessage:
      "당신의 컴패니언이 될 수 있도록 로그인해 주세요. 기다리게 하지 마세요.",
    moreTags: "더 보기",
    fewerTags: "간단히 보기",
    loadMoreCompanions: "컴패니언 더 불러오기",
    creatingCharacter: "컴패니언 만드는 중...",
    createCharacter: "캐릭터 만들기!",
    createFailed: "컴패니언을 만들지 못했습니다.",
    imageRequired: "프로필 이미지를 선택하세요.",
    tagsRequired: "태그를 1개 이상 4개 이하로 선택하세요.",
    fieldsRequired: "모든 필수 항목을 입력하세요.",
    characterLimitReached:
      "만들 수 있는 컴패니언 25개 한도에 도달했습니다.",
    publicDescription:
      "모든 사용자가 이 컴패니언을 발견하고 채팅할 수 있습니다.",
    privateDescription:
      "오직 나만 이 컴패니언을 보고 채팅할 수 있습니다.",
    imageHelp: "JPG, PNG 또는 WebP. 최대 5 MB.",
    reportCharacter: "컴패니언 신고",
    chooseReportReason: "사유를 하나 선택하세요.",
    bugGlitch: "버그/오류",
    safetyIssue: "안전 문제",
    other: "기타",
    submitReport: "제출",
    reportSubmitted: "감사합니다. 신고가 제출되었습니다."
  }
};
