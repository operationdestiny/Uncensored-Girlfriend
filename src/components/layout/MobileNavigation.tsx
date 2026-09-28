"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, Heart, Gift, PlusCircle, Compass, Coins, Home, Scale, Mail } from "lucide-react";

const links = [
  { href: "/", label: "Home", icon: Home },
  { href: "/characters", label: "Explore", icon: Compass },
  { href: "/create", label: "Create Your Girlfriend", icon: PlusCircle },
  { href: "/my-bond", label: "My Companions", icon: Heart },
  { href: "/shop", label: "Gift Shop", icon: Gift },
  { href: "/coins", label: "KissCoins", icon: Coins },
  { href: "/legal", label: "Legal", icon: Scale },
  { href: "/contact", label: "Contact", icon: Mail }
] as const;

export function MobileNavigation({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  useEffect(() => {
    if (!open) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = old; window.removeEventListener("keydown", esc); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="ug-drawer-backdrop" role="dialog" aria-modal="true" aria-label="Navigation">
      <button type="button" aria-label="Close navigation" className="ug-drawer-overlay" onClick={onClose} />
      <aside className="ug-drawer">
        <div className="ug-drawer-head">
          <Link href="/" onClick={onClose} className="ug-brand"><img src="/ug-lips-logo.svg" alt="" width="42" height="42" /><span>Uncensored <b>Girlfriend</b></span></Link>
          <button type="button" onClick={onClose} aria-label="Close menu" className="ug-icon-button"><X size={20}/></button>
        </div>
        <nav aria-label="Mobile navigation" className="ug-drawer-links">
          {links.map(({href,label,icon:Icon}) => (
            <Link key={href} href={href} onClick={onClose} className={pathname===href?"active":""}>
              <Icon size={19} />{label}
            </Link>
          ))}
        </nav>
        <div className="ug-drawer-note">Your companion. Your imagination.</div>
      </aside>
    </div>
  );
}
