"use client";

import type { LanguageCode } from "@/lib/site-language";

const COPY: Record<
  LanguageCode,
  { title: string; body: string; create: string; keep: string }
> = {
  EN: {
    title: "Want to keep this connection?",
    body: "Create a free account to protect this chat and Ever Memory, use it on any device, and access EverCoin.",
    create: "Create account",
    keep: "Keep chatting"
  },
  ES: {
    title: "¿Quieres conservar esta conexión?",
    body: "Crea una cuenta gratis para proteger este chat y Ever Memory, usarlo en cualquier dispositivo y acceder a EverCoin.",
    create: "Crear cuenta",
    keep: "Seguir chateando"
  },
  FR: {
    title: "Vous voulez garder cette connexion ?",
    body: "Créez un compte gratuit pour protéger ce chat et Ever Memory, y accéder sur tous vos appareils et utiliser EverCoin.",
    create: "Créer un compte",
    keep: "Continuer à discuter"
  },
  DE: {
    title: "Möchtest du diese Verbindung behalten?",
    body: "Erstelle ein kostenloses Konto, um diesen Chat und Ever Memory zu sichern, geräteübergreifend zu nutzen und EverCoin zu verwenden.",
    create: "Konto erstellen",
    keep: "Weiter chatten"
  },
  JA: {
    title: "このつながりを残しますか？",
    body: "無料アカウントを作成すると、このチャットとEver Memoryを保護し、他の端末でも使え、EverCoinも利用できます。",
    create: "アカウント作成",
    keep: "チャットを続ける"
  },
  KO: {
    title: "이 관계를 계속 간직할까요?",
    body: "무료 계정을 만들면 이 채팅과 Ever Memory를 보호하고 다른 기기에서도 이용하며 EverCoin을 사용할 수 있습니다.",
    create: "계정 만들기",
    keep: "계속 채팅하기"
  }
};

export function SignupSystemCard({
  language,
  onCreateAccount,
  onDismiss
}: {
  language: LanguageCode;
  onCreateAccount: () => void;
  onDismiss: () => void;
}) {
  const copy = COPY[language] ?? COPY.EN;

  return (
    <div className="flex w-full justify-center py-1">
      <div className="w-full max-w-[720px] rounded-[1.3rem] border border-bond-rose/35 bg-bond-rose/[0.07] px-4 py-3.5 text-center shadow-[0_0_22px_rgba(255,92,168,0.08)]">
        <p className="font-display text-lg font-bold text-white">{copy.title}</p>
        <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-bond-muted">
          {copy.body}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={onCreateAccount}
            className="bond-pink-button rounded-full bg-bond-rose px-4 py-2 text-xs font-bold text-white"
          >
            {copy.create}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-xs font-bold text-bond-muted hover:text-white"
          >
            {copy.keep}
          </button>
        </div>
      </div>
    </div>
  );
}
