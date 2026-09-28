import type { LanguageCode } from "@/lib/site-language";

type MutableMyBondCopy = Record<
  LanguageCode,
  {
    public: string;
  }
>;

export type CharacterSharingCopy = {
  moreForYou: string;
  private: string;
  shareByLink: string;
  privateDescription: string;
  shareByLinkDescription: string;
  shareLinkHelp: string;
  copyLink: string;
  linkCopied: string;
  copyFailed: string;
};

export const CHARACTER_SHARING_COPY: Record<
  LanguageCode,
  CharacterSharingCopy
> = {
  EN: {
    moreForYou: "More for You",
    private: "Private",
    shareByLink: "Share by link",
    privateDescription: "Only you can access and chat with this character.",
    shareByLinkDescription:
      "Private unless you choose to share with others by link.",
    shareLinkHelp:
      "Anyone with the link can access and chat with this character. It will never appear in Discover.",
    copyLink: "Copy link",
    linkCopied: "Link copied.",
    copyFailed: "The link could not be copied."
  },
  ES: {
    moreForYou: "Más para ti",
    private: "Privado",
    shareByLink: "Compartir por enlace",
    privateDescription:
      "Solo tú puedes acceder y chatear con este personaje.",
    shareByLinkDescription:
      "Es privado a menos que elijas compartirlo con otras personas mediante un enlace.",
    shareLinkHelp:
      "Cualquiera que tenga el enlace puede acceder y chatear con este personaje. Nunca aparecerá en Descubrir.",
    copyLink: "Copiar enlace",
    linkCopied: "Enlace copiado.",
    copyFailed: "No se pudo copiar el enlace."
  },
  FR: {
    moreForYou: "Plus pour vous",
    private: "Privé",
    shareByLink: "Partager par lien",
    privateDescription:
      "Vous seul pouvez accéder à ce personnage et discuter avec lui.",
    shareByLinkDescription:
      "Il reste privé sauf si vous choisissez de le partager avec d’autres par lien.",
    shareLinkHelp:
      "Toute personne disposant du lien peut accéder à ce personnage et discuter avec lui. Il n’apparaîtra jamais dans Découvrir.",
    copyLink: "Copier le lien",
    linkCopied: "Lien copié.",
    copyFailed: "Impossible de copier le lien."
  },
  DE: {
    moreForYou: "Mehr für dich",
    private: "Privat",
    shareByLink: "Per Link teilen",
    privateDescription:
      "Nur du kannst auf diesen Charakter zugreifen und mit ihm chatten.",
    shareByLinkDescription:
      "Er bleibt privat, solange du ihn nicht per Link mit anderen teilst.",
    shareLinkHelp:
      "Jeder mit dem Link kann auf diesen Charakter zugreifen und mit ihm chatten. Er erscheint niemals unter Entdecken.",
    copyLink: "Link kopieren",
    linkCopied: "Link kopiert.",
    copyFailed: "Der Link konnte nicht kopiert werden."
  },
  JA: {
    moreForYou: "あなたへのおすすめ",
    private: "非公開",
    shareByLink: "リンクで共有",
    privateDescription:
      "このキャラクターにアクセスしてチャットできるのはあなただけです。",
    shareByLinkDescription:
      "リンクで他の人と共有することを選ばない限り非公開です。",
    shareLinkHelp:
      "リンクを知っている人はこのキャラクターにアクセスしてチャットできます。Discoverには表示されません。",
    copyLink: "リンクをコピー",
    linkCopied: "リンクをコピーしました。",
    copyFailed: "リンクをコピーできませんでした。"
  },
  KO: {
    moreForYou: "당신을 위한 추천",
    private: "비공개",
    shareByLink: "링크로 공유",
    privateDescription:
      "이 캐릭터는 나만 열고 대화할 수 있습니다.",
    shareByLinkDescription:
      "링크로 다른 사람과 공유하도록 선택하지 않는 한 비공개입니다.",
    shareLinkHelp:
      "링크가 있는 사람은 누구나 이 캐릭터를 열고 대화할 수 있습니다. 둘러보기에는 절대 표시되지 않습니다.",
    copyLink: "링크 복사",
    linkCopied: "링크를 복사했습니다.",
    copyFailed: "링크를 복사하지 못했습니다."
  }
};

/**
 * My Bond historically names its second filter `public`. User-created
 * characters are no longer public; the value is now only a UI alias for the
 * database's `unlisted` visibility. Updating this shared copy object keeps the
 * existing dashboard layout intact while removing every public-facing label.
 */
export function applyMyBondShareLinkLabels(copy: MutableMyBondCopy) {
  (Object.keys(CHARACTER_SHARING_COPY) as LanguageCode[]).forEach(
    (language) => {
      copy[language].public =
        CHARACTER_SHARING_COPY[language].shareByLink;
    }
  );
}
