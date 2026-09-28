import type { LanguageCode } from "@/lib/site-language";

export const DISCOVER_COPY: Record<
  LanguageCode,
  {
    loading: string;
    bannerLabel: string;
    translatingCharacters: string;
  }
> = {
  EN: {
    loading: "Loading…",
    bannerLabel: "Uncensored Girlfriend Discover banner",
    translatingCharacters: "Translating companions…"
  },
  ES: {
    loading: "Cargando…",
    bannerLabel: "Banner Descubrir de Uncensored Girlfriend",
    translatingCharacters: "Traduciendo compañeros…"
  },
  FR: {
    loading: "Chargement…",
    bannerLabel: "Bannière Découvrir d’Uncensored Girlfriend",
    translatingCharacters: "Traduction des compagnons…"
  },
  DE: {
    loading: "Wird geladen…",
    bannerLabel: "Uncensored Girlfriend-Entdecken-Banner",
    translatingCharacters: "Begleiter werden übersetzt…"
  },
  JA: {
    loading: "読み込み中…",
    bannerLabel: "Uncensored Girlfriendのディスカバリーバナー",
    translatingCharacters: "コンパニオンを翻訳中…"
  },
  KO: {
    loading: "불러오는 중…",
    bannerLabel: "Uncensored Girlfriend 둘러보기 배너",
    translatingCharacters: "컴패니언 번역 중…"
  }
};
