import type { LanguageCode } from "@/lib/site-language";

type NavigationCopy = {
  home: string;
  explore: string;
  create: string;
  myCompanions: string;
  giftShop: string;
  pricing: string;
  legal: string;
  contact: string;
  openMenu: string;
  closeMenu: string;
  account: string;
  logOut: string;
};

export const navigationCopy: Record<LanguageCode, NavigationCopy> = {
  EN: {
    home: "Home", explore: "Explore", create: "Create Your Girlfriend",
    myCompanions: "My Companions", giftShop: "Gift Shop", pricing: "Pricing",
    legal: "Legal", contact: "Contact", openMenu: "Open menu",
    closeMenu: "Close menu", account: "Log in / Sign up", logOut: "Log out"
  },
  ES: {
    home: "Inicio", explore: "Explorar", create: "Crea tu novia",
    myCompanions: "Mis compañeros", giftShop: "Tienda de regalos", pricing: "Precios",
    legal: "Información legal", contact: "Contacto", openMenu: "Abrir menú",
    closeMenu: "Cerrar menú", account: "Entrar / Registrarse", logOut: "Cerrar sesión"
  },
  FR: {
    home: "Accueil", explore: "Explorer", create: "Créer votre petite amie",
    myCompanions: "Mes compagnons", giftShop: "Boutique cadeaux", pricing: "Tarifs",
    legal: "Mentions légales", contact: "Contact", openMenu: "Ouvrir le menu",
    closeMenu: "Fermer le menu", account: "Connexion / Inscription", logOut: "Déconnexion"
  },
  DE: {
    home: "Startseite", explore: "Entdecken", create: "Freundin erstellen",
    myCompanions: "Meine Begleiter", giftShop: "Geschenkeladen", pricing: "Preise",
    legal: "Rechtliches", contact: "Kontakt", openMenu: "Menü öffnen",
    closeMenu: "Menü schließen", account: "Login / Registrieren", logOut: "Abmelden"
  },
  JA: {
    home: "ホーム", explore: "見つける", create: "彼女を作成",
    myCompanions: "マイコンパニオン", giftShop: "ギフトショップ", pricing: "料金",
    legal: "法的情報", contact: "お問い合わせ", openMenu: "メニューを開く",
    closeMenu: "メニューを閉じる", account: "ログイン / 新規登録", logOut: "ログアウト"
  },
  KO: {
    home: "홈", explore: "둘러보기", create: "여자친구 만들기",
    myCompanions: "내 동반자", giftShop: "선물 상점", pricing: "요금",
    legal: "법적 고지", contact: "문의", openMenu: "메뉴 열기",
    closeMenu: "메뉴 닫기", account: "로그인 / 회원가입", logOut: "로그아웃"
  }
};

export const heroTagline: Record<LanguageCode, string> = {
  EN: "Your companion. Your imagination.",
  ES: "Tu compañía. Tu imaginación.",
  FR: "Votre compagnon. Votre imagination.",
  DE: "Dein Begleiter. Deine Fantasie.",
  JA: "あなたのパートナー。あなたの想像力。",
  KO: "나만의 동반자. 나만의 상상력."
};
