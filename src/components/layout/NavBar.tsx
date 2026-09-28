"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, LogOut, Coins } from "lucide-react";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { useAuth } from "@/components/auth/AuthProvider";

const links = [
  { href: "/", text: "Home" },
  { href: "/characters", text: "Explore" },
  { href: "/create", text: "Create" },
  { href: "/my-bond", text: "My Companions" },
  { href: "/shop", text: "Gift Shop" },
  { href: "/coins", text: "Pricing" }
] as const;

export function NavBar({ onOpenMobileMenu, mobileMenuOpen }: {
  onOpenMobileMenu: () => void;
  mobileMenuOpen: boolean;
}) {
  const pathname = usePathname();
  const { authReady, session, openAuthModal, signOut } = useAuth();
  return (
    <header className="ug-nav">
      <div className="ug-nav-inner">
        <Link href="/" className="ug-brand" aria-label="Uncensored Girlfriend home">
          <img src="/ug-lips-logo.svg" width="43" height="43" alt="" />
          <span>Uncensored <b>Girlfriend</b></span>
        </Link>
        <nav className="ug-nav-links" aria-label="Main navigation">
          {links.map((link) => {
            const active = link.href === "/" ? pathname === "/" :
              pathname === link.href || pathname.startsWith(`${link.href}/`);
            return <Link key={link.href} href={link.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>{link.text}</Link>;
          })}
        </nav>
        <div className="ug-nav-actions">
          <Link href="/characters" className="ug-icon-button ug-search-shortcut" aria-label="Search companions"><Search size={19} /></Link>
          <div className="ug-language"><LanguageSelector /></div>
          {authReady && session ? (
            <>
              <Link href="/coins" className="ug-nav-coins"><Coins size={16} /> KissCoins</Link>
              <button type="button" className="ug-nav-login" onClick={() => void signOut()}><LogOut size={15} /> Sign out</button>
            </>
          ) : (
            <>
              <button type="button" className="ug-nav-login" onClick={openAuthModal}>Log in</button>
              <button type="button" className="ug-nav-signup" onClick={openAuthModal}>Sign up</button>
            </>
          )}
          <button type="button" className="ug-mobile-menu" onClick={onOpenMobileMenu} aria-label="Open navigation" aria-expanded={mobileMenuOpen}><Menu size={23} /></button>
        </div>
      </div>
    </header>
  );
}
