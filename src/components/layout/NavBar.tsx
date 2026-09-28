"use client";

import Link from "next/link";
import { Menu, LogOut } from "lucide-react";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSiteLanguage, type LanguageCode } from "@/lib/site-language";

const authText: Record<LanguageCode, { signIn: string; signOut: string; menu: string }> = {
  EN: { signIn: "Log in / Sign up", signOut: "Log out", menu: "Open navigation menu" },
  ES: { signIn: "Entrar / Registrarse", signOut: "Cerrar sesión", menu: "Abrir menú" },
  FR: { signIn: "Connexion / Inscription", signOut: "Déconnexion", menu: "Ouvrir le menu" },
  DE: { signIn: "Anmelden / Registrieren", signOut: "Abmelden", menu: "Menü öffnen" },
  JA: { signIn: "ログイン / 登録", signOut: "ログアウト", menu: "メニューを開く" },
  KO: { signIn: "로그인 / 가입", signOut: "로그아웃", menu: "메뉴 열기" }
};

export function NavBar({
  onOpenMobileMenu,
  mobileMenuOpen
}: {
  onOpenMobileMenu: () => void;
  mobileMenuOpen: boolean;
}) {
  const { authReady, session, openAuthModal, signOut } = useAuth();
  const { language } = useSiteLanguage();
  const labels = authText[language];

  return (
    <header className="ug-nav">
      <div className="ug-nav-inner">
        <div className="ug-nav-left">
          <button
            type="button"
            className="ug-mobile-menu"
            onClick={onOpenMobileMenu}
            aria-label={labels.menu}
            aria-controls="ug-navigation-drawer"
            aria-expanded={mobileMenuOpen}
          >
            <Menu size={23} />
          </button>
          <Link href="/" className="ug-brand" aria-label="Uncensored Girlfriend home">
            <img src="/ug-lips-logo.svg" width="43" height="43" alt="" />
            <span>Uncensored <b>Girlfriend</b></span>
          </Link>
        </div>
        <div className="ug-nav-actions">
          <div className="ug-language"><LanguageSelector /></div>
          {authReady && session ? (
            <button type="button" className="ug-nav-auth" onClick={() => void signOut()}>
              <LogOut size={16} /> <span>{labels.signOut}</span>
            </button>
          ) : (
            <button type="button" className="ug-nav-auth" onClick={openAuthModal}>
              {labels.signIn}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
