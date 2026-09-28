"use client";

import Link from "next/link";
import { LogOut, Menu } from "lucide-react";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { navigationCopy } from "@/components/layout/nav-copy";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSiteLanguage } from "@/lib/site-language";

export function NavBar({
  onOpenMobileMenu,
  mobileMenuOpen
}: {
  onOpenMobileMenu: () => void;
  mobileMenuOpen: boolean;
}) {
  const { language } = useSiteLanguage();
  const copy = navigationCopy[language];
  const { authReady, session, openAuthModal, signOut } = useAuth();

  return (
    <header className="ug-nav">
      <div className="ug-nav-inner">
        <div className="ug-nav-left">
          <button
            type="button"
            className="ug-menu-trigger"
            onClick={onOpenMobileMenu}
            aria-label={copy.openMenu}
            aria-controls="ug-site-drawer"
            aria-expanded={mobileMenuOpen}
          >
            <Menu size={23} strokeWidth={2} aria-hidden="true" />
          </button>
          <Link href="/" className="ug-brand" aria-label="Uncensored Girlfriend home">
            <img src="/ug-lips-logo.svg" width="43" height="43" alt="" />
            <span>Uncensored <b>Girlfriend</b></span>
          </Link>
        </div>
        <div className="ug-nav-actions">
          <LanguageSelector />
          <button
            type="button"
            className="ug-account-button"
            disabled={!authReady}
            onClick={() => {
              if (session) void signOut();
              else openAuthModal();
            }}
          >
            {session && <LogOut size={16} aria-hidden="true" />}
            {session ? copy.logOut : copy.account}
          </button>
        </div>
      </div>
    </header>
  );
}
