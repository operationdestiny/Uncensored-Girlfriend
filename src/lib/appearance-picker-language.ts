import type { LanguageCode } from "@/lib/site-language";

export type AppearancePickerCopy = {
  chooseAppearance: string;
  changeAppearance: string;
  selectedAppearance: string;
  noAppearanceSelected: string;
  required: string;
  helper: string;
  createHelper: string;
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  all: string;
  girls: string;
  fantasy: string;
  guys: string;
  more: string;
  close: string;
  loading: string;
  loadMore: string;
  noResults: string;
  loadFailed: string;
  countLabel: string;
};

export const APPEARANCE_PICKER_COPY: Record<
  LanguageCode,
  AppearancePickerCopy
> = {
  EN: {
    chooseAppearance: "Choose an appearance",
    changeAppearance: "Choose a different appearance",
    selectedAppearance: "Selected appearance",
    noAppearanceSelected: "No appearance selected",
    required: "Please choose an appearance.",
    helper:
      "Choose from Uncensored Girlfriend-provided synthetic AI appearances. External photo uploads are disabled.",
    createHelper: "Choose from Uncensored Girlfriend-provided synthetic AI appearances.",
    title: "Choose an appearance",
    subtitle:
      "Select from Uncensored Girlfriend's approved synthetic appearance library.",
    searchPlaceholder: "Search appearances...",
    all: "All",
    girls: "Uncensored Girlfriend Girls",
    fantasy: "Anime & Fantasy",
    guys: "Uncensored Girlfriend Guys",
    more: "More",
    close: "Close",
    loading: "Loading appearances...",
    loadMore: "Load more",
    noResults: "No appearances match this search.",
    loadFailed: "The appearance gallery could not be loaded.",
    countLabel: "approved appearances"
  },
  ES: {
    chooseAppearance: "Elegir apariencia",
    changeAppearance: "Elegir otra apariencia",
    selectedAppearance: "Apariencia seleccionada",
    noAppearanceSelected: "Ninguna apariencia seleccionada",
    required: "Elige una apariencia.",
    helper:
      "Elige entre apariencias sintéticas de IA proporcionadas por Uncensored Girlfriend. Las cargas de fotos externas están desactivadas.",
    createHelper: "Elige entre apariencias sintéticas de IA proporcionadas por Uncensored Girlfriend.",
    title: "Elegir apariencia",
    subtitle:
      "Selecciona una apariencia de la biblioteca sintética aprobada de Uncensored Girlfriend.",
    searchPlaceholder: "Buscar apariencias...",
    all: "Todas",
    girls: "Chicas Uncensored Girlfriend",
    fantasy: "Anime y fantasía",
    guys: "Chicos Uncensored Girlfriend",
    more: "Más",
    close: "Cerrar",
    loading: "Cargando apariencias...",
    loadMore: "Cargar más",
    noResults: "Ninguna apariencia coincide con la búsqueda.",
    loadFailed: "No se pudo cargar la galería de apariencias.",
    countLabel: "apariencias aprobadas"
  },
  FR: {
    chooseAppearance: "Choisir une apparence",
    changeAppearance: "Choisir une autre apparence",
    selectedAppearance: "Apparence sélectionnée",
    noAppearanceSelected: "Aucune apparence sélectionnée",
    required: "Choisissez une apparence.",
    helper:
      "Choisissez parmi les apparences IA synthétiques fournies par Uncensored Girlfriend. Les téléchargements de photos externes sont désactivés.",
    createHelper: "Choisissez parmi les apparences IA synthétiques fournies par Uncensored Girlfriend.",
    title: "Choisir une apparence",
    subtitle:
      "Sélectionnez une apparence dans la bibliothèque synthétique approuvée d’Uncensored Girlfriend.",
    searchPlaceholder: "Rechercher des apparences...",
    all: "Toutes",
    girls: "Filles Uncensored Girlfriend",
    fantasy: "Anime et fantasy",
    guys: "Garçons Uncensored Girlfriend",
    more: "Plus",
    close: "Fermer",
    loading: "Chargement des apparences...",
    loadMore: "Afficher plus",
    noResults: "Aucune apparence ne correspond à cette recherche.",
    loadFailed: "La galerie d’apparences n’a pas pu être chargée.",
    countLabel: "apparences approuvées"
  },
  DE: {
    chooseAppearance: "Aussehen auswählen",
    changeAppearance: "Anderes Aussehen auswählen",
    selectedAppearance: "Ausgewähltes Aussehen",
    noAppearanceSelected: "Kein Aussehen ausgewählt",
    required: "Bitte wähle ein Aussehen aus.",
    helper:
      "Wähle aus von Uncensored Girlfriend bereitgestellten synthetischen KI-Erscheinungsbildern. Externe Foto-Uploads sind deaktiviert.",
    createHelper: "Wähle aus von Uncensored Girlfriend bereitgestellten synthetischen KI-Erscheinungsbildern.",
    title: "Aussehen auswählen",
    subtitle:
      "Wähle aus Uncensored Girlfriends freigegebener synthetischer Aussehensbibliothek.",
    searchPlaceholder: "Aussehen suchen...",
    all: "Alle",
    girls: "Uncensored Girlfriend Girls",
    fantasy: "Anime & Fantasy",
    guys: "Uncensored Girlfriend Guys",
    more: "Mehr",
    close: "Schließen",
    loading: "Aussehen werden geladen...",
    loadMore: "Mehr laden",
    noResults: "Keine passenden Erscheinungsbilder gefunden.",
    loadFailed: "Die Aussehensgalerie konnte nicht geladen werden.",
    countLabel: "freigegebene Erscheinungsbilder"
  },
  JA: {
    chooseAppearance: "外見を選ぶ",
    changeAppearance: "別の外見を選ぶ",
    selectedAppearance: "選択した外見",
    noAppearanceSelected: "外見が選択されていません",
    required: "外見を選択してください。",
    helper:
      "Uncensored Girlfriendが提供する合成AI外見から選択できます。外部写真のアップロードは無効です。",
    createHelper: "Uncensored Girlfriendが提供する合成AI外見から選択できます。",
    title: "外見を選ぶ",
    subtitle: "Uncensored Girlfriendが承認した合成外見ライブラリから選択してください。",
    searchPlaceholder: "外見を検索...",
    all: "すべて",
    girls: "Uncensored Girlfriend Girls",
    fantasy: "アニメ＆ファンタジー",
    guys: "Uncensored Girlfriend Guys",
    more: "その他",
    close: "閉じる",
    loading: "外見を読み込み中...",
    loadMore: "さらに表示",
    noResults: "検索に一致する外見がありません。",
    loadFailed: "外見ギャラリーを読み込めませんでした。",
    countLabel: "承認済みの外見"
  },
  KO: {
    chooseAppearance: "외모 선택",
    changeAppearance: "다른 외모 선택",
    selectedAppearance: "선택한 외모",
    noAppearanceSelected: "선택한 외모 없음",
    required: "외모를 선택해 주세요.",
    helper:
      "Uncensored Girlfriend가 제공하는 합성 AI 외모 중에서 선택할 수 있습니다. 외부 사진 업로드는 비활성화되어 있습니다.",
    createHelper: "Uncensored Girlfriend가 제공하는 합성 AI 외모 중에서 선택할 수 있습니다.",
    title: "외모 선택",
    subtitle: "Uncensored Girlfriend가 승인한 합성 외모 라이브러리에서 선택하세요.",
    searchPlaceholder: "외모 검색...",
    all: "전체",
    girls: "Uncensored Girlfriend Girls",
    fantasy: "애니메이션 & 판타지",
    guys: "Uncensored Girlfriend Guys",
    more: "더보기",
    close: "닫기",
    loading: "외모 불러오는 중...",
    loadMore: "더 불러오기",
    noResults: "검색과 일치하는 외모가 없습니다.",
    loadFailed: "외모 갤러리를 불러오지 못했습니다.",
    countLabel: "승인된 외모"
  }
};
