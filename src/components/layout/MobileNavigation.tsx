"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, Heart, Gift, PlusCircle, Compass, Coins, Home, Scale, Mail } from "lucide-react";
import { useSiteLanguage } from "@/lib/site-language";
import { navigationCopy } from "@/components/layout/nav-copy";

const links = [
  { href: "/", key: "home", icon: Home },
  { href: "/characters", key: "explore", icon: Compass },
  { href: "/create", key: "create", icon: PlusCircle },
  { href: "/my-bond", key: "myCompanions", icon: Heart },
  { href: "/shop", key: "giftShop", icon: Gift },
  { href: "/coins", key: "pricing", icon: Coins }
] as const;

const secondaryLinks = [
  { href: "/legal", key: "legal", icon: Scale },
  { href: "/contact", key: "contact", icon: Mail }
] as const;

export function MobileNavigation({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { language } = useSiteLanguage();
  const copy = navigationCopy[language];
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  function active(href: string) {
    return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div className="ug-drawer-backdrop" role="dialog" aria-modal="true" aria-label={copy.openMenu}>
      <button
        type="button"
        aria-label={copy.closeMenu}
        className="ug-drawer-overlay"
        onClick={onClose}
      />
      <aside className="ug-drawer" id="ug-site-drawer">
        <div className="ug-drawer-head">
          <Link href="/" onClick={onClose} className="ug-brand">
            <img src="/ug-lips-logo.svg" alt="" width="42" height="42" />
            <span>Uncensored <b>Girlfriend</b></span>
          </Link>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label={copy.closeMenu}
            className="ug-icon-button"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <nav aria-label={copy.openMenu} className="ug-drawer-links">
          {links.map(({ href, key, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={active(href) ? "active" : ""}
              aria-current={active(href) ? "page" : undefined}
            >
              <Icon size={19} aria-hidden="true" />
              {copy[key]}
            </Link>
          ))}
        </nav>
        <nav aria-label="Information" className="ug-drawer-links ug-drawer-links-secondary">
          {secondaryLinks.map(({ href, key, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={active(href) ? "active" : ""}
              aria-current={active(href) ? "page" : undefined}
            >
              <Icon size={19} aria-hidden="true" />
              {copy[key]}
            </Link>
          ))}
        </nav>
      </aside>
    </div>
  );
}
