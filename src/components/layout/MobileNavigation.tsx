"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, Heart, Gift, PlusCircle, Compass, Coins, Home, Scale, Mail, Search } from "lucide-react";
import { useSiteLanguage, type LanguageCode } from "@/lib/site-language";

const labels: Record<LanguageCode, {
  menu: string; close: string; home: string; explore: string; create: string;
  companions: string; shop: string; coins: string; search: string; legal: string; contact: string;
  tagline: string;
}> = {
  EN: { menu: "Navigation", close: "Close menu", home: "Home", explore: "Explore", create: "Create Your Girlfriend", companions: "My Companions", shop: "Gift Shop", coins: "KissCoins", search: "Search companions", legal: "Legal", contact: "Contact", tagline: "Your companion. Your imagination." },
  ES: { menu: "Navegación", close: "Cerrar menú", home: "Inicio", explore: "Explorar", create: "Crea tu novia", companions: "Mis compañeros", shop: "Tienda de regalos", coins: "KissCoins", search: "Buscar compañeros", legal: "Legal", contact: "Contacto", tagline: "Tu compañía. Tu imaginación." },
  FR: { menu: "Navigation", close: "Fermer le menu", home: "Accueil", explore: "Explorer", create: "Créez votre petite amie", companions: "Mes compagnons", shop: "Boutique de cadeaux", coins: "KissCoins", search: "Rechercher", legal: "Mentions légales", contact: "Contact", tagline: "Votre compagnon. Votre imagination." },
  DE: { menu: "Navigation", close: "Menü schließen", home: "Startseite", explore: "Entdecken", create: "Erstelle deine Freundin", companions: "Meine Begleiter", shop: "Geschenkeladen", coins: "KissCoins", search: "Begleiter suchen", legal: "Rechtliches", contact: "Kontakt", tagline: "Dein Begleiter. Deine Fantasie." },
  JA: { menu: "ナビゲーション", close: "メニューを閉じる", home: "ホーム", explore: "探索", create: "彼女を作成", companions: "マイコンパニオン", shop: "ギフトショップ", coins: "KissCoins", search: "コンパニオンを検索", legal: "利用規約", contact: "お問い合わせ", tagline: "あなたのコンパニオン。あなたの想像力。" },
  KO: { menu: "탐색", close: "메뉴 닫기", home: "홈", explore: "둘러보기", create: "나만의 여자친구 만들기", companions: "내 컴패니언", shop: "선물 가게", coins: "KissCoins", search: "컴패니언 검색", legal: "법적 고지", contact: "문의", tagline: "당신의 컴패니언. 당신의 상상력." }
};

export function MobileNavigation({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { language } = useSiteLanguage();
  const t = labels[language];

  useEffect(() => {
    if (!open) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = old;
      window.removeEventListener("keydown", esc);
    };
  }, [open, onClose]);

  if (!open) return null;

  const links = [
    { href: "/", label: t.home, icon: Home },
    { href: "/characters", label: t.explore, icon: Compass },
    { href: "/create", label: t.create, icon: PlusCircle },
    { href: "/my-bond", label: t.companions, icon: Heart },
    { href: "/shop", label: t.shop, icon: Gift },
    { href: "/coins", label: t.coins, icon: Coins },
    { href: "/characters#discover", label: t.search, icon: Search },
    { href: "/legal", label: t.legal, icon: Scale },
    { href: "/contact", label: t.contact, icon: Mail }
  ] as const;

  return (
    <div id="ug-navigation-drawer" className="ug-drawer-backdrop" role="dialog" aria-modal="true" aria-label={t.menu}>
      <button type="button" aria-label={t.close} className="ug-drawer-overlay" onClick={onClose} />
      <aside className="ug-drawer">
        <div className="ug-drawer-head">
          <Link href="/" onClick={onClose} className="ug-brand">
            <img src="/ug-lips-logo.svg" alt="" width="42" height="42" />
            <span>Uncensored <b>Girlfriend</b></span>
          </Link>
          <button type="button" onClick={onClose} aria-label={t.close} className="ug-icon-button"><X size={20} /></button>
        </div>
        <nav aria-label={t.menu} className="ug-drawer-links">
          {links.map(({href,label,icon:Icon}) => (
            <Link key={href} href={href} onClick={onClose} className={pathname===href?"active":""}>
              <Icon size={19} />{label}
            </Link>
          ))}
        </nav>
        <div className="ug-drawer-note">{t.tagline}</div>
      </aside>
    </div>
  );
}
