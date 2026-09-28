"use client";

import Link from "next/link";
import {
  Heart,
  HelpCircle,
  Menu,
  Scale,
  ShoppingBag,
  Sparkles,
  UserRound,
  WalletCards,
  UserCircle
} from "lucide-react";
import { useSiteLanguage } from "@/lib/site-language";
import { EVERSHOP_COPY } from "@/lib/evershop-language";

const topLinks = [
  { href: "/", labelKey: "discover", icon: Sparkles, active: true },
  { href: "/create", labelKey: "createCharacter", icon: UserRound },
  { href: "/coins", labelKey: "buyEverCoin", icon: WalletCards },
  { href: "/shop", customLabel: "evershop", icon: ShoppingBag },
  { href: "/my-bond", labelKey: "myBond", icon: UserCircle }
] as const;

const infoLinks = [
  { href: "/why-everbond", labelKey: "whyEverBond", icon: Heart },
  { href: "/legal", labelKey: "legal", icon: Scale },
  { href: "/contact", labelKey: "helpCenter", icon: HelpCircle }
] as const;

const socialLinks = [
  {
    label: "Pinterest",
    href: "https://www.pinterest.com/EverBondAIOfficial/",
    path: "M12.017 0C5.396 0 .002 5.394.002 12.017c0 4.99 3.055 9.263 7.402 11.063-.102-.846-.195-2.146.041-3.071.212-.834 1.394-5.899 1.394-5.899s-.356-.712-.356-1.767c0-1.655.959-2.891 2.153-2.891 1.015 0 1.504.762 1.504 1.676 0 1.021-.65 2.547-.985 3.963-.281 1.187.596 2.155 1.765 2.155 2.118 0 3.743-2.234 3.743-5.46 0-2.855-2.052-4.85-4.982-4.85-3.394 0-5.385 2.545-5.385 5.177 0 1.025.394 2.125.888 2.724a.357.357 0 0 1 .083.343c-.091.378-.293 1.187-.333 1.353-.053.218-.174.264-.402.159-1.499-.698-2.436-2.888-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.608 7.464-6.227 7.464-1.216 0-2.357-.631-2.748-1.378 0 0-.601 2.288-.746 2.849-.27 1.04-1.002 2.344-1.492 3.138 1.124.347 2.317.535 3.554.535 6.624 0 12-5.376 12-12S18.641.001 12.017.001Z"
  },
  {
    label: "Tumblr",
    href: "https://www.tumblr.com/everbondaiofficial",
    path: "M14.563 24c-5.093 0-7.031-3.756-7.031-6.411v-7.146H5.116V7.37c3.63-1.313 4.512-4.436 4.719-6.22h3.099v5.716h4.831v3.577h-4.831v6.215c0 1.822.91 2.451 2.36 2.451.581 0 1.353-.257 1.765-.438l.882 3.272c-.918.468-2.508 1.057-4.378 1.057Z"
  },
  {
    label: "DeviantArt",
    href: "https://www.deviantart.com/everbondaiofficial",
    path: "M19.207 4.794l.23-.43V0H15.07l-.436.44-2.058 3.925-.646.436H4.58v5.993h4.04l.36.436-4.175 7.98-.24.43V24H8.93l.436-.44 2.07-3.925.644-.436h7.35v-5.993h-4.05l-.36-.438 4.186-7.977z"
  },
  {
    label: "TikTok",
    href: "https://www.tiktok.com/@everbondofficial",
    path: "M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.9 2.9 0 0 1-5.2 1.74 2.9 2.9 0 0 1 2.31-4.64c.3 0 .59.04.86.13V9.4a6.33 6.33 0 0 0-.86-.06A6.35 6.35 0 0 0 5 20.18a6.35 6.35 0 0 0 10.86-4.5V8.75a8.23 8.23 0 0 0 4.81 1.54V6.86c-.36 0-.72-.06-1.08-.17Z"
  },
] as const;

function BrandName({ className = "" }: { className?: string }) {
  return (
    <span className={`v51-brand-name ${className}`}>
      <span className="v21-brand-ever">Ever</span>
      <span className="v21-brand-bond">Bond</span>
    </span>
  );
}

function LinkRow({
  href,
  label,
  icon: Icon,
  active,
  collapsed
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  active?: boolean;
  collapsed?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`v18-sidebar-row ${
        collapsed ? "!h-[55px]" : "!h-[52px]"
      } ${active ? "active" : ""}`}
      title={label}
    >
      <span className="flex items-center gap-3">
        <Icon size={18} />
        <span className="v51-sidebar-label">{label}</span>
      </span>
    </Link>
  );
}

export function DashboardSidebar({
  collapsed,
  onToggle
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { t, language } = useSiteLanguage();
  const shopCopy = EVERSHOP_COPY[language] ?? EVERSHOP_COPY.EN;

  return (
    <aside className="v18-sidebar !overflow-y-hidden">
      <div className="v51-sidebar-brand-row !mb-2 !min-h-[44px]">
        <Link href="/" className="v51-sidebar-brand">
          <span className="v18-infinity h-10 w-10 text-[43px]" />
          <BrandName className="font-display text-2xl font-bold" />
        </Link>

        <button
          type="button"
          onClick={onToggle}
          className="v51-sidebar-toggle"
          aria-label={
            collapsed ? t("expandSidebar") : t("collapseSidebar")
          }
        >
          <Menu size={22} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <nav
          className={
            collapsed
              ? "space-y-1"
              : "flex min-h-0 flex-[5] flex-col justify-evenly"
          }
        >
          {topLinks.map((item) => (
            <LinkRow
              key={item.href}
              href={item.href}
              icon={item.icon}
              active={"active" in item ? item.active : undefined}
              collapsed={collapsed}
              label={
                "customLabel" in item
                  ? shopCopy.sidebarLabel
                  : t(item.labelKey)
              }
            />
          ))}
        </nav>

        <div
          className={`h-px bg-white/10 ${
            collapsed ? "my-6" : "my-1"
          }`}
        />

        <nav
          className={
            collapsed
              ? "space-y-1"
              : "flex min-h-0 flex-[3] flex-col justify-evenly"
          }
        >
          {infoLinks.map((item) => (
            <LinkRow
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={t(item.labelKey)}
              collapsed={collapsed}
            />
          ))}
        </nav>

        <div
          className={
            collapsed
              ? "hidden"
              : "v51-sidebar-footer pt-3"
          }
        >
          <div className="mx-auto flex max-w-[152px] flex-wrap justify-center gap-2 text-bond-muted">
            {socialLinks.map((item) => (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`EverBond on ${item.label}`}
              title={`EverBond on ${item.label}`}
              className="v21-social-circle !h-8 !w-8 transition duration-200 hover:border-bond-rose/70 hover:bg-bond-rose/15 hover:text-bond-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bond-rose/70"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="!h-[17px] !w-[17px]"
                fill="currentColor"
              >
                <path d={item.path} />
              </svg>
            </a>
            ))}
          </div>

          <p className="mt-4 text-center text-xs leading-5 text-bond-muted">
            {t("copyright")}
            <br />
            {t("allRightsReserved")}
          </p>
        </div>
      </div>
    </aside>
  );
}
